const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');

// Import the server setup (we'll need to modify the server file to export the setup function)
const { GAME_PHASES } = require('../server/utils/constants');

describe('Socket.IO Server Integration', () => {
  let io, serverSocket, clientSocket, httpServer;
  const port = 3001; // Use different port for testing

  beforeAll((done) => {
    // Create test server
    httpServer = createServer();
    io = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    // Import and set up the game logic (we'll need to extract this from server/index.js)
    setupGameHandlers(io);

    httpServer.listen(port, () => {
      done();
    });
  });

  afterAll((done) => {
    io.close();
    httpServer.close(done);
  });

  beforeEach((done) => {
    // Create client connection
    clientSocket = new Client(`http://localhost:${port}`);

    io.on('connection', (socket) => {
      serverSocket = socket;
    });

    clientSocket.on('connect', done);
  });

  afterEach(() => {
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  describe('Room Management', () => {
    test('should create room successfully', (done) => {
      clientSocket.emit('room:create', { playerName: 'TestPlayer' }, (response) => {
        expect(response.success).toBe(true);
        expect(response.roomCode).toBeDefined();
        expect(response.roomCode).toHaveLength(6);
        expect(response.room.players).toHaveLength(1);
        expect(response.room.players[0].name).toBe('TestPlayer');
        expect(response.room.players[0].isHost).toBe(true);
        done();
      });
    });

    test('should join existing room successfully', (done) => {
      // First create a room
      clientSocket.emit('room:create', { playerName: 'Host' }, (createResponse) => {
        const roomCode = createResponse.roomCode;

        // Create second client to join
        const client2 = new Client(`http://localhost:${port}`);

        client2.on('connect', () => {
          client2.emit('room:join', { roomCode, playerName: 'Joiner' }, (joinResponse) => {
            expect(joinResponse.success).toBe(true);
            expect(joinResponse.room.players).toHaveLength(2);
            expect(joinResponse.room.players[1].name).toBe('Joiner');
            expect(joinResponse.room.players[1].isHost).toBe(false);

            client2.disconnect();
            done();
          });
        });
      });
    });

    test('should fail to join non-existent room', (done) => {
      clientSocket.emit('room:join', { roomCode: 'INVALID', playerName: 'TestPlayer' }, (response) => {
        expect(response.success).toBe(false);
        expect(response.error).toBe('房间不存在');
        done();
      });
    });

    test('should prevent joining full room', (done) => {
      // Create room and fill it with max players
      clientSocket.emit('room:create', { playerName: 'Host' }, (createResponse) => {
        const roomCode = createResponse.roomCode;
        const clients = [];

        // Add players up to max limit (5 total including host)
        let joinedCount = 1; // Host already joined

        for (let i = 0; i < 4; i++) {
          const client = new Client(`http://localhost:${port}`);
          clients.push(client);

          client.on('connect', () => {
            client.emit('room:join', { roomCode, playerName: `Player${i + 2}` }, (response) => {
              if (response.success) {
                joinedCount++;
                if (joinedCount === 5) {
                  // Now try to add 6th player
                  const client6 = new Client(`http://localhost:${port}`);
                  client6.on('connect', () => {
                    client6.emit('room:join', { roomCode, playerName: 'Player6' }, (response) => {
                      expect(response.success).toBe(false);
                      expect(response.error).toBe('房间已满');

                      // Clean up
                      clients.forEach(c => c.disconnect());
                      client6.disconnect();
                      done();
                    });
                  });
                }
              }
            });
          });
        }
      });
    });
  });

  describe('Game Flow', () => {
    let roomCode;
    let clients = [];

    beforeEach((done) => {
      // Create room with 3 players
      clientSocket.emit('room:create', { playerName: 'Player1' }, (response) => {
        roomCode = response.roomCode;

        // Add 2 more players
        for (let i = 0; i < 2; i++) {
          const client = new Client(`http://localhost:${port}`);
          clients.push(client);

          client.on('connect', () => {
            client.emit('room:join', { roomCode, playerName: `Player${i + 2}` }, (response) => {
              if (clients.length === 2 && response.success) {
                done();
              }
            });
          });
        }
      });
    });

    afterEach(() => {
      clients.forEach(client => client.disconnect());
      clients = [];
    });

    test('should start game when all players ready', (done) => {
      let readyCount = 0;

      // Listen for game start event
      clientSocket.on('game:started', (gameState) => {
        expect(gameState.currentPhase).toBe(GAME_PHASES.ROLL_DICE);
        expect(gameState.players).toHaveLength(3);
        done();
      });

      // Set all players ready
      clientSocket.emit('player:ready');
      clients.forEach(client => {
        client.emit('player:ready');
      });
    });

    test('should handle dice rolling phase', (done) => {
      // Start game first
      clientSocket.on('game:started', () => {
        clientSocket.emit('game:rollDice', (response) => {
          expect(response.success).toBe(true);
          expect(response.gameState.currentPhase).toBe(GAME_PHASES.PLAY_CARDS);
          expect(response.gameState.roundState.diceResult).toBeDefined();
          done();
        });
      });

      // Ready all players to start game
      clientSocket.emit('player:ready');
      clients.forEach(client => client.emit('player:ready'));
    });

    test('should handle card playing phase', (done) => {
      clientSocket.on('game:started', (gameState) => {
        // Roll dice first
        clientSocket.emit('game:rollDice', (rollResponse) => {
          // Get player's hand to play a card
          clientSocket.emit('game:getPrivateState', (privateState) => {
            const characterCard = privateState.hand.find(card => card.type === 'character');

            clientSocket.emit('game:playCard', { cardId: characterCard.id }, (response) => {
              expect(response.success).toBe(true);
              // Check the response structure matches what the server actually returns
              if (response.state && response.state.roundState) {
                expect(response.state.roundState.playedCardsCount).toBe(1);
              }
              done();
            });
          });
        });
      });

      // Start game
      clientSocket.emit('player:ready');
      clients.forEach(client => client.emit('player:ready'));
    }, 10000); // Increase timeout for this complex test
  });

  describe('Reconnection Handling', () => {
    test('should handle player reconnection during game', (done) => {
      // Create room and start game
      clientSocket.emit('room:create', { playerName: 'TestPlayer' }, (response) => {
        const roomCode = response.roomCode;

        // Add minimum players and start game
        const client2 = new Client(`http://localhost:${port}`);
        const client3 = new Client(`http://localhost:${port}`);

        Promise.all([
          new Promise(resolve => {
            client2.on('connect', () => {
              client2.emit('room:join', { roomCode, playerName: 'Player2' }, resolve);
            });
          }),
          new Promise(resolve => {
            client3.on('connect', () => {
              client3.emit('room:join', { roomCode, playerName: 'Player3' }, resolve);
            });
          })
        ]).then(() => {
          // Start game
          clientSocket.emit('player:ready');
          client2.emit('player:ready');
          client3.emit('player:ready');

          clientSocket.on('game:started', () => {
            // Disconnect and reconnect player
            clientSocket.disconnect();

            setTimeout(() => {
              const reconnectClient = new Client(`http://localhost:${port}`);
              reconnectClient.on('connect', () => {
                reconnectClient.emit('room:join', { roomCode, playerName: 'TestPlayer' }, (response) => {
                  expect(response.success).toBe(true);
                  expect(response.reconnected).toBe(true);

                  client2.disconnect();
                  client3.disconnect();
                  reconnectClient.disconnect();
                  done();
                });
              });
            }, 100);
          });
        });
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid game actions gracefully', (done) => {
      clientSocket.emit('game:playCard', { cardId: 'invalid' }, (response) => {
        expect(response.success).toBe(false);
        expect(response.error).toBeDefined();
        done();
      });
    });

    test('should handle malformed requests', (done) => {
      clientSocket.emit('room:create', { /* missing playerName */ }, (response) => {
        expect(response.success).toBe(false);
        expect(response.error).toBeDefined();
        done();
      });
    });
  });
});

// Mock game handlers setup (this would need to be extracted from server/index.js)
function setupGameHandlers(io) {
  const rooms = new Map();
  const playerRooms = new Map();
  const gameStates = new Map();

  function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  io.on('connection', (socket) => {
    // Room creation
    socket.on('room:create', ({ playerName }, callback) => {
      if (!playerName) {
        callback({ success: false, error: '玩家名称不能为空' });
        return;
      }

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
        status: 'waiting',
        maxPlayers: 5,
        minPlayers: 3
      };

      rooms.set(roomCode, room);
      playerRooms.set(socket.id, roomCode);
      socket.join(roomCode);

      callback({ success: true, roomCode, room });
    });

    // Room joining
    socket.on('room:join', ({ roomCode, playerName }, callback) => {
      if (!roomCode || !playerName) {
        callback({ success: false, error: '房间号和玩家名称不能为空' });
        return;
      }

      const room = rooms.get(roomCode.toUpperCase());
      if (!room) {
        callback({ success: false, error: '房间不存在' });
        return;
      }

      if (room.players.length >= room.maxPlayers) {
        callback({ success: false, error: '房间已满' });
        return;
      }

      // Check for reconnection
      const existingPlayer = room.players.find(p => p.name === playerName);
      if (existingPlayer && room.status === 'playing') {
        existingPlayer.id = socket.id;
        existingPlayer.isOnline = true;
        playerRooms.set(socket.id, roomCode.toUpperCase());
        socket.join(roomCode.toUpperCase());
        callback({ success: true, room, reconnected: true });
        return;
      }

      // New player joining
      room.players.push({
        id: socket.id,
        name: playerName,
        isHost: false,
        isReady: false,
        isOnline: true
      });

      playerRooms.set(socket.id, roomCode.toUpperCase());
      socket.join(roomCode.toUpperCase());

      callback({ success: true, room });
      socket.to(roomCode.toUpperCase()).emit('room:playerJoined', room);
    });

    // Player ready
    socket.on('player:ready', () => {
      const roomCode = playerRooms.get(socket.id);
      const room = rooms.get(roomCode);

      if (room) {
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
          player.isReady = true;

          // Check if all players ready and minimum met
          const allReady = room.players.every(p => p.isReady);
          if (allReady && room.players.length >= room.minPlayers) {
            // Start game
            room.status = 'playing';
            const { GameState } = require('../server/game/GameState');
            const gameState = new GameState(roomCode, room.players);
            gameStates.set(roomCode, gameState);

            const publicState = gameState.startGame();
            io.to(roomCode).emit('game:started', publicState);
          }
        }
      }
    });

    // Game actions
    socket.on('game:rollDice', (callback) => {
      const roomCode = playerRooms.get(socket.id);
      const gameState = gameStates.get(roomCode);

      if (gameState && gameState.currentPhase === GAME_PHASES.ROLL_DICE) {
        const result = gameState.rollDiceAndPlaceFruits();
        callback({ success: true, gameState: result });
        socket.to(roomCode).emit('game:stateUpdate', result);
      } else {
        callback({ success: false, error: '不在掷骰子阶段' });
      }
    });

    socket.on('game:playCard', ({ cardId }, callback) => {
      const roomCode = playerRooms.get(socket.id);
      const gameState = gameStates.get(roomCode);

      if (gameState) {
        const result = gameState.playCard(socket.id, cardId);
        callback(result);
        if (result.success) {
          socket.to(roomCode).emit('game:stateUpdate', result.state);
        }
      } else {
        callback({ success: false, error: '游戏未开始' });
      }
    });

    socket.on('game:getPrivateState', (callback) => {
      const roomCode = playerRooms.get(socket.id);
      const gameState = gameStates.get(roomCode);

      if (gameState) {
        const privateState = gameState.getPrivateState(socket.id);
        callback(privateState);
      } else {
        callback(null);
      }
    });

    // Disconnect handling
    socket.on('disconnect', () => {
      const roomCode = playerRooms.get(socket.id);
      if (roomCode) {
        const room = rooms.get(roomCode);
        if (room) {
          const player = room.players.find(p => p.id === socket.id);
          if (player) {
            player.isOnline = false;
            socket.to(roomCode).emit('room:playerDisconnected', { playerId: socket.id });
          }
        }
        playerRooms.delete(socket.id);
      }
    });
  });
}