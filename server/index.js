const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { GameState } = require('./game/GameState');
const { GAME_PHASES } = require('./utils/constants');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 游戏房间管理
const rooms = new Map();
const playerRooms = new Map(); // socket.id -> roomCode
const gameStates = new Map();  // roomCode -> GameState
const playerSessions = new Map(); // playerName+roomCode -> { playerId, roomCode, lastSocketId } 用于断线重连

// 生成6位房间号
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Socket.IO 连接处理
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // 创建房间
  socket.on('room:create', ({ playerName }, callback) => {
    const roomCode = generateRoomCode();
    const room = {
      code: roomCode,
      players: [{
        id: socket.id,
        name: playerName,
        isHost: true,
        isReady: false,
        isOnline: true
      }],
      status: 'waiting', // waiting, playing, ended
      maxPlayers: 5,
      minPlayers: 3
    };

    rooms.set(roomCode, room);
    playerRooms.set(socket.id, roomCode);
    socket.join(roomCode);

    // 创建session记录
    const sessionKey = `${playerName}_${roomCode}`;
    playerSessions.set(sessionKey, {
      playerId: socket.id,
      roomCode: roomCode,
      lastSocketId: socket.id
    });

    console.log(`Room ${roomCode} created by ${playerName}`);
    callback({ success: true, roomCode, room: getRoomForClient(room) });
  });

  // 加入房间
  socket.on('room:join', ({ roomCode, playerName }, callback) => {
    const room = rooms.get(roomCode.toUpperCase());

    if (!room) {
      callback({ success: false, error: '房间不存在' });
      return;
    }

    // 检查是否是断线重连
    const sessionKey = `${playerName}_${roomCode.toUpperCase()}`;
    const existingSession = playerSessions.get(sessionKey);

    if (existingSession && room.status === 'playing') {
      // 断线重连逻辑
      const existingPlayer = room.players.find(p => p.name === playerName);

      if (existingPlayer) {
        // 更新玩家的socket ID
        const oldSocketId = existingPlayer.id;
        existingPlayer.id = socket.id;
        existingPlayer.isOnline = true;

        // 更新映射
        playerRooms.set(socket.id, roomCode.toUpperCase());
        playerRooms.delete(oldSocketId);

        // 更新游戏状态中的玩家ID
        const gameState = gameStates.get(roomCode.toUpperCase());
        if (gameState) {
          const gamePlayer = gameState.players.find(p => p.name === playerName);
          if (gamePlayer) {
            gamePlayer.id = socket.id;
          }

        // 更新roundState中的playedCards映射
        if (gameState.roundState.playedCards.has(oldSocketId)) {
          const card = gameState.roundState.playedCards.get(oldSocketId);
          gameState.roundState.playedCards.delete(oldSocketId);
          gameState.roundState.playedCards.set(socket.id, card);
        }

        // 同步更新所有与playerId相关的状态映射
        replacePlayerIdInGameState(gameState, oldSocketId, socket.id);
      }

        // 更新session
        existingSession.lastSocketId = socket.id;

        socket.join(roomCode.toUpperCase());

        // 通知房间内其他玩家
        socket.to(roomCode.toUpperCase()).emit('room:player_reconnected', {
          player: { id: socket.id, name: playerName, isHost: existingPlayer.isHost, isReady: existingPlayer.isReady }
        });

        console.log(`${playerName} reconnected to room ${roomCode.toUpperCase()}`);

        // 返回完整的游戏状态
        callback({
          success: true,
          reconnected: true,
          room: getRoomForClient(room),
          gameState: gameState ? gameState.getPublicState() : null,
          privateState: gameState ? gameState.getPrivateState(socket.id) : null
        });
        return;
      }
    }

    if (room.status !== 'waiting') {
      callback({ success: false, error: '游戏已开始' });
      return;
    }

    if (room.players.length >= room.maxPlayers) {
      callback({ success: false, error: '房间已满' });
      return;
    }

    // 检查是否已有相同名字的玩家
    if (room.players.some(p => p.name === playerName)) {
      callback({ success: false, error: '该昵称已被使用' });
      return;
    }

    room.players.push({
      id: socket.id,
      name: playerName,
      isHost: false,
      isReady: false,
      isOnline: true
    });

    playerRooms.set(socket.id, roomCode.toUpperCase());
    socket.join(roomCode.toUpperCase());

    // 创建session记录
    playerSessions.set(sessionKey, {
      playerId: socket.id,
      roomCode: roomCode.toUpperCase(),
      lastSocketId: socket.id
    });

    // 通知房间内其他玩家
    socket.to(roomCode.toUpperCase()).emit('room:player_joined', {
      player: { id: socket.id, name: playerName, isHost: false, isReady: false }
    });

    console.log(`${playerName} joined room ${roomCode.toUpperCase()}`);
    callback({ success: true, room: getRoomForClient(room) });
  });

  // 玩家准备状态切换
  socket.on('room:toggle_ready', (data, callback) => {
    const ctx = getRoomContext(socket);
    if (ctx.error) return;

    const { roomCode, room, player } = ctx;
    if (!player) return;
    player.isReady = !player.isReady;
    io.to(roomCode).emit('room:updated', { room: getRoomForClient(room) });
    if (typeof callback === 'function') {
      callback({ success: true, isReady: player.isReady });
    }
  });

  // 开始游戏（仅房主）
  socket.on('room:start_game', (data, callback) => {
    const ctx = getRoomContext(socket, {
      requireHost: true,
      hostError: '只有房主可以开始游戏'
    });
    if (ctx.error) {
      replyError(callback, ctx.error);
      return;
    }

    const { roomCode, room, player } = ctx;

    if (room.players.length < room.minPlayers) {
      replyError(callback, `至少需要 ${room.minPlayers} 名玩家`);
      return;
    }

    if (!room.players.every(p => p.isReady || p.isHost)) {
      replyError(callback, '所有玩家必须准备就绪');
      return;
    }

    room.status = 'playing';

    // 初始化游戏状态
    const gameState = new GameState(roomCode, room.players);
    gameStates.set(roomCode, gameState);

    // 开始游戏
    gameState.startGame();
    // 立即执行掷骰子
    gameState.rollDiceAndPlaceFruits();

    // 发送游戏状态给所有玩家
    broadcastGameState(roomCode);

    io.to(roomCode).emit('game:started', {
      room: getRoomForClient(room),
      gameState: gameState.getPublicState()
    });
    if (typeof callback === 'function') callback({ success: true });
  });

  // ========== 游戏相关事件 ==========

  // 房主掷骰子
  socket.on('game:roll_dice', (data, callback) => {
    const ctx = getRoomContext(socket, { requireGame: true });
    if (ctx.error) {
      replyError(callback, ctx.error);
      return;
    }

    const { roomCode, gameState, room } = ctx;

    // 检查是否是房主
    const isHost = room.players[0].id === socket.id;
    if (!isHost) {
      replyError(callback, '只有房主可以掷骰子');
      return;
    }

    // 检查是否在掷骰子阶段
    if (gameState.currentPhase !== GAME_PHASES.ROLL_DICE) {
      replyError(callback, '不在掷骰子阶段');
      return;
    }

    // 执行掷骰子
    gameState.rollDiceAndPlaceFruits();
    broadcastGameState(roomCode);

    if (typeof callback === 'function') callback({ success: true });
  });

  // 玩家出牌
  socket.on('game:play_card', (data, callback) => {
    const { cardId } = data || {};
    const ctx = getRoomContext(socket, { requireGame: true });
    if (ctx.error) {
      replyError(callback, ctx.error);
      return;
    }

    const { roomCode, gameState } = ctx;

    const result = gameState.playCard(socket.id, cardId);

    if (result.success) {
      // 广播公共状态
      broadcastGameState(roomCode);

      // 发送私有状态给该玩家
      socket.emit('game:private_state', { privateState: gameState.getPrivateState(socket.id) });
    }

    if (typeof callback === 'function') callback(result);
  });

  // Watcher额外出牌
  socket.on('game:watcher_play', ({ cardId }, callback) => {
    const ctx = getRoomContext(socket, { requireGame: true });
    if (ctx.error) {
      replyError(callback, ctx.error);
      return;
    }

    const { roomCode, gameState } = ctx;

    const result = gameState.watcherPlayCard(socket.id, cardId);

    if (result.success) {
      broadcastGameState(roomCode);
      socket.emit('game:private_state', { privateState: gameState.getPrivateState(socket.id) });
    }

    callback(result);
  });

  // Healer选择回收的牌
  socket.on('game:healer_recycle', ({ cardIds }, callback) => {
    const ctx = getRoomContext(socket, { requireGame: true });
    if (ctx.error) {
      replyError(callback, ctx.error);
      return;
    }

    const { roomCode, gameState } = ctx;

    const result = gameState.healerSelectRecycle(socket.id, cardIds);

    if (result.success) {
      broadcastGameState(roomCode);

      // 发送更新后的私有状态给所有玩家
      emitPrivateStateToAll(gameState);

      // 通知所有玩家该玩家已完成选择
      io.to(roomCode).emit('game:healer_completed', {
        playerId: socket.id,
        recycledCount: result.recycledCount
      });

      // 如果所有治疗玩家都完成了选择，继续结算
      if (gameState.allHealersCompleted() && gameState.currentPhase === GAME_PHASES.RESOLVE) {
        const pendingLog = gameState.roundState && gameState.roundState.pendingResolutionLog
          ? gameState.roundState.pendingResolutionLog
          : [];
        const resolveResult = gameState.continueResolve(pendingLog);
        if (resolveResult.success) {
          broadcastGameState(roomCode);

          // 发送结算日志
          const logWithNames = buildResolutionLogWithNames(resolveResult.log, gameState.players);

          io.to(roomCode).emit('game:resolution_log', { log: logWithNames });

          // 检查游戏是否结束
          if (gameState.winner) {
            const winner = gameState.players.find(p => p.id === gameState.winner);
            io.to(roomCode).emit('game:ended', {
              winner: winner ? { id: winner.id, name: winner.name } : null,
              finalState: gameState.getPublicState()
            });
          }
        }
      }
    }

    callback(result);
  });

  // 结算回合（房主）
  socket.on('game:resolve_round', (data, callback) => {
    const ctx = getRoomContext(socket, {
      requireGame: true,
      requireHost: true,
      hostError: '只有房主可以结算回合'
    });
    if (ctx.error) {
      replyError(callback, ctx.error);
      return;
    }

    const { roomCode, room, gameState } = ctx;

    const result = gameState.resolveRound();

    if (result.success) {
      broadcastGameState(roomCode);

      // 如果有治疗玩家需要选择回收，发送私有状态更新
      if (result.waitingForHealer) {
        emitPrivateStateToAll(gameState);
      }

      // 替换日志中的 playerId 为 playerName
      const logWithNames = buildResolutionLogWithNames(result.log, gameState.players, { stripIds: true });

      // 发送转换后的结算日志
      io.to(roomCode).emit('game:resolution_log', { log: logWithNames });

      // 如果是游戏结束
      if (gameState.winner) {
        const winner = gameState.players.find(p => p.id === gameState.winner);
        io.to(roomCode).emit('game:ended', {
          winner: winner ? { id: winner.id, name: winner.name } : null,
          finalState: gameState.getPublicState()
        });
      }
    }

    if (typeof callback === 'function') callback(result);
  });

  // 结束回合，准备下一轮
  socket.on('game:end_round', (data, callback) => {
    const ctx = getRoomContext(socket, {
      requireGame: true,
      requireHost: true,
      hostError: '只有房主可以结束回合'
    });
    if (ctx.error) {
      replyError(callback, ctx.error);
      return;
    }

    const { roomCode, gameState } = ctx;

    const result = gameState.endRound();

    if (result.success) {
      // 自动执行掷骰子
      gameState.rollDiceAndPlaceFruits();
      broadcastGameState(roomCode);
    }

    if (typeof callback === 'function') callback(result);
  });

  // 获取私有状态（手牌等）
  socket.on('game:get_private_state', (data, callback) => {
    const ctx = getRoomContext(socket, { requireGame: true });
    if (ctx.error) {
      replyError(callback, ctx.error);
      return;
    }

    const { gameState } = ctx;

    const privateState = gameState.getPrivateState(socket.id);
    if (typeof callback === 'function') callback({ success: true, privateState });
  });

  // 离开房间
  socket.on('room:leave', () => {
    handlePlayerLeave(socket);
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    const roomCode = playerRooms.get(socket.id);
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    // 如果游戏进行中，标记玩家为离线但不移除
    if (room.status === 'playing') {
      player.isOnline = false;
      console.log(`${player.name} went offline in room ${roomCode}`);

      // 通知其他玩家
      socket.to(roomCode).emit('room:player_offline', {
        playerId: socket.id,
        playerName: player.name
      });
    } else {
      // 游戏未开始，直接移除玩家
      handlePlayerLeave(socket);
    }
  });
});

// 辅助函数：根据ID获取玩家名称
function getPlayerNameById(players, playerId) {
  const player = players.find(p => p.id === playerId);
  return player ? player.name : '未知玩家';
}

function replyError(callback, error) {
  if (typeof callback === 'function') callback({ success: false, error });
}

function getRoomContext(socket, options = {}) {
  const {
    requireGame = false,
    requireHost = false,
    roomError = '不在房间中',
    gameError = '游戏未开始',
    hostError = '只有房主可以执行此操作',
  } = options;

  const roomCode = playerRooms.get(socket.id);
  if (!roomCode) return { error: roomError };

  const room = rooms.get(roomCode);
  if (!room) return { error: '房间不存在' };

  const player = room.players.find(p => p.id === socket.id);

  if (requireHost && (!player || !player.isHost)) {
    return { error: hostError };
  }

  const gameState = requireGame ? gameStates.get(roomCode) : null;
  if (requireGame && !gameState) return { error: gameError };

  return { roomCode, room, player, gameState };
}

function emitPrivateStateToAll(gameState) {
  gameState.players.forEach(player => {
    const playerSocket = io.sockets.sockets.get(player.id);
    if (playerSocket) {
      playerSocket.emit('game:private_state', {
        privateState: gameState.getPrivateState(player.id)
      });
    }
  });
}

function buildResolutionLogWithNames(log, players, options = {}) {
  const { stripIds = false } = options;

  return log.map(entry => {
    const newEntry = { ...entry };
    if (newEntry.playerId) {
      newEntry.playerName = getPlayerNameById(players, newEntry.playerId);
      if (stripIds) delete newEntry.playerId;
    }
    if (newEntry.winnerId) {
      newEntry.winnerName = getPlayerNameById(players, newEntry.winnerId);
      if (stripIds) delete newEntry.winnerId;
    }
    if (newEntry.players) {
      newEntry.playerNames = newEntry.players.map(id => getPlayerNameById(players, id));
      if (stripIds) delete newEntry.players;
    }
    if (newEntry.defeatedIds) {
      newEntry.defeatedNames = newEntry.defeatedIds.map(id => getPlayerNameById(players, id));
      if (stripIds) delete newEntry.defeatedIds;
    }
    if (newEntry.type === 'watcher' && newEntry.players) {
      newEntry.playerNames = newEntry.players.map(id => getPlayerNameById(players, id));
      if (stripIds) delete newEntry.players;
    }
    if (newEntry.blizzardPlayer) {
      newEntry.blizzardPlayerName = getPlayerNameById(players, newEntry.blizzardPlayer);
      if (stripIds) delete newEntry.blizzardPlayer;
    }
    if (newEntry.type === 'blizzard' && !newEntry.blizzardPlayerName && newEntry.playerName) {
      newEntry.blizzardPlayerName = newEntry.playerName;
    }
    if (newEntry.manaPlayer) {
      newEntry.manaPlayerName = getPlayerNameById(players, newEntry.manaPlayer);
      if (stripIds) delete newEntry.manaPlayer;
    }

    return newEntry;
  });
}

function replacePlayerIdInGameState(gameState, oldId, newId) {
  if (!gameState || !oldId || !newId) return;

  const deckManager = gameState.deckManager;
  if (deckManager && deckManager.discardPiles) {
    const pile = deckManager.discardPiles.get(oldId);
    if (pile) {
      deckManager.discardPiles.set(newId, pile);
      deckManager.discardPiles.delete(oldId);
    }
  }

  const roundState = gameState.roundState;
  if (!roundState) return;

  const replaceInArray = (arr) => {
    if (!Array.isArray(arr)) return;
    const idx = arr.indexOf(oldId);
    if (idx !== -1) arr[idx] = newId;
  };

  const migrateMapKey = (map) => {
    if (!map || !map.has) return;
    if (map.has(oldId)) {
      const value = map.get(oldId);
      map.delete(oldId);
      map.set(newId, value);
    }
  };

  replaceInArray(roundState.watcherPlayers);
  replaceInArray(roundState.healerPlayers);
    replaceInArray(roundState.blizzardPlayers);
  if (roundState.manaPlayer === oldId) roundState.manaPlayer = newId;

  migrateMapKey(roundState.playedCards);
  migrateMapKey(roundState.watcherPlayedCards);
  migrateMapKey(roundState.healerRecycleChoices);
  migrateMapKey(roundState.collectedFruits);
}

// 广播游戏状态给所有玩家
function broadcastGameState(roomCode) {
  const gameState = gameStates.get(roomCode);
  if (!gameState) return;

  const publicState = gameState.getPublicState();
  io.to(roomCode).emit('game:state_updated', { gameState: publicState });
}

// 处理玩家离开
function handlePlayerLeave(socket) {
  const roomCode = playerRooms.get(socket.id);
  if (!roomCode) return;

  const room = rooms.get(roomCode);
  if (!room) return;

  const playerIndex = room.players.findIndex(p => p.id === socket.id);
  if (playerIndex === -1) return;

  const player = room.players[playerIndex];
  room.players.splice(playerIndex, 1);
  playerRooms.delete(socket.id);
  socket.leave(roomCode);

  // 如果房间空了，删除房间和游戏状态
  if (room.players.length === 0) {
    rooms.delete(roomCode);
    gameStates.delete(roomCode);
    console.log(`Room ${roomCode} deleted (empty)`);
    return;
  }

  // 如果房主离开，转让房主
  if (player.isHost && room.players.length > 0) {
    room.players[0].isHost = true;
  }

  // 如果游戏进行中，标记玩家为离线（TODO: 实现断线重连）
  if (room.status === 'playing') {
    // TODO: 处理游戏中断线
  }

  io.to(roomCode).emit('room:player_left', {
    playerId: socket.id,
    room: getRoomForClient(room)
  });

  console.log(`${player.name} left room ${roomCode}`);
}

// 获取用于客户端的房间数据（去掉敏感信息）
function getRoomForClient(room) {
  return {
    code: room.code,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      isReady: p.isReady,
      isOnline: p.isOnline !== undefined ? p.isOnline : true
    })),
    status: room.status,
    maxPlayers: room.maxPlayers,
    minPlayers: room.minPlayers
  };
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`SnowTime server running on port ${PORT}`);
});
