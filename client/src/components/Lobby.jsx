import { useState, useEffect, useCallback, useRef } from 'react';

export function Lobby({
  playerName,
  socket,
  emit,
  onGameStart,
  onRoomUpdate,
  initialRoomCode,
  onLeave
}) {
  const [view, setView] = useState('menu'); // menu, create, join, room
  const [roomCode, setRoomCode] = useState('');
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const autoJoinAttempted = useRef(false);

  // 监听房间更新
  useEffect(() => {
    onRoomUpdate?.(room);
  }, [room, onRoomUpdate]);

  useEffect(() => {
    if (!socket || !emit) return;
    if (autoJoinAttempted.current) return;
    if (!initialRoomCode || !playerName || view !== 'menu') return;

    autoJoinAttempted.current = true;
    setRoomCode(initialRoomCode);
    setLoading(true);
    setError('');

    emit('room:join', {
      roomCode: initialRoomCode.trim().toUpperCase(),
      playerName
    }).then((response) => {
      if (response.success) {
        setRoom(response.room);
        setView('room');

        if (response.reconnected && response.gameState) {
          onGameStart(response.gameState, response.privateState);
        }
      } else {
        setError(response.error || '自动加入房间失败');
      }
      setLoading(false);
    });
  }, [socket, emit, initialRoomCode, playerName, view, onGameStart]);

  useEffect(() => {
    if (!socket) return;

    const handleRoomUpdated = ({ room }) => {
      setRoom(room);
    };

    const handlePlayerJoined = ({ player }) => {
      console.log('Player joined:', player.name);
      setRoom(prev => {
        if (!prev) return prev;
        if (prev.players.some(p => p.id === player.id)) return prev;
        return { ...prev, players: [...prev.players, player] };
      });
    };

    const handlePlayerLeft = ({ playerId, room: updatedRoom }) => {
      console.log('Player left:', playerId);
      setRoom(updatedRoom);
    };

    const handlePlayerReconnected = ({ player }) => {
      console.log('Player reconnected:', player.name);
      setRoom(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map(p => p.name === player.name ? { ...p, ...player, isOnline: true } : p)
        };
      });
    };

    const handlePlayerOffline = ({ playerId, playerName }) => {
      console.log('Player went offline:', playerName);
      setRoom(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map(p => p.id === playerId ? { ...p, isOnline: false } : p)
        };
      });
    };

    const handleGameStarted = ({ room: updatedRoom, gameState }) => {
      setRoom(updatedRoom);
      onGameStart(gameState);
    };

    socket.on('room:updated', handleRoomUpdated);
    socket.on('room:player_joined', handlePlayerJoined);
    socket.on('room:player_left', handlePlayerLeft);
    socket.on('room:player_reconnected', handlePlayerReconnected);
    socket.on('room:player_offline', handlePlayerOffline);
    socket.on('game:started', handleGameStarted);

    return () => {
      socket.off('room:updated', handleRoomUpdated);
      socket.off('room:player_joined', handlePlayerJoined);
      socket.off('room:player_left', handlePlayerLeft);
      socket.off('room:player_reconnected', handlePlayerReconnected);
      socket.off('room:player_offline', handlePlayerOffline);
      socket.off('game:started', handleGameStarted);
    };
  }, [socket, onGameStart]);

  // 创建房间
  const handleCreateRoom = async () => {
    setView('create');
    setLoading(true);
    setError('');
    try {
      const response = await emit('room:create', { playerName });

      if (response.success) {
        setRoomCode(response.roomCode);
        setRoom(response.room);
        setView('room');
        localStorage.setItem('snowtime.roomCode', response.roomCode);
      } else {
        setError(response.error || '创建房间失败');
      }
    } catch (err) {
      setError('网络错误，请重试');
    }
    setLoading(false);
  };

  // 加入房间
  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!roomCode.trim()) {
      setError('请输入房间号');
      return;
    }

    setLoading(true);
    setError('');
    const response = await emit('room:join', {
      roomCode: roomCode.trim().toUpperCase(),
      playerName
    });

    if (response.success) {
      setRoom(response.room);
      setView('room');
      localStorage.setItem('snowtime.roomCode', roomCode.trim().toUpperCase());

      // 如果是重连到游戏中的房间
      if (response.reconnected && response.gameState) {
        onGameStart(response.gameState, response.privateState);
      }
    } else {
      setError(response.error || '加入房间失败');
    }
    setLoading(false);
  };

  // 切换准备状态
  const handleToggleReady = async () => {
    const response = await emit('room:toggle_ready');
    if (response.success) {
      // 状态会通过 room:updated 事件更新
    }
  };

  // 开始游戏
  const handleStartGame = async () => {
    setLoading(true);
    const response = await emit('room:start_game');
    if (!response.success) {
      setError(response.error);
    }
    setLoading(false);
  };

  // 离开房间
  const handleLeaveRoom = () => {
    emit('room:leave');
    setRoom(null);
    setRoomCode('');
    setView('menu');
    localStorage.removeItem('snowtime.roomCode');
    onLeave?.();
  };

  // 主菜单
  if (view === 'menu') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 game-backdrop">
        <div className="w-full max-w-md animate-fade-in">
          <div className="text-center mb-8">
            <h1 className="font-game text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-snow-ice to-blue-300 mb-2">
              SnowTime
            </h1>
            <p className="text-white/60 text-lg">欢迎，{playerName}</p>
          </div>

          <div className="panel-frost rounded-2xl p-8 shadow-2xl space-y-4 reveal-item" style={{ '--reveal-delay': '80ms' }}>
            <button
              onClick={handleCreateRoom}
              className="btn-primary w-full text-lg"
            >
              创建房间
            </button>
            <button
              onClick={() => setView('join')}
              className="btn-secondary w-full text-lg"
            >
              加入房间
            </button>
            <button
              onClick={onLeave}
              className="w-full py-3 text-white/60 hover:text-white transition-colors"
            >
              更换昵称
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-center">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 加入房间表单
  if (view === 'join') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 game-backdrop">
        <div className="w-full max-w-md animate-fade-in">
          <div className="panel-frost rounded-2xl p-8 shadow-2xl reveal-item" style={{ '--reveal-delay': '80ms' }}>
            <h2 className="text-2xl font-semibold text-center mb-6">加入房间</h2>

            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  房间号
                </label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => {
                    setRoomCode(e.target.value.toUpperCase());
                    setError('');
                  }}
                  placeholder="输入6位房间号"
                  maxLength={6}
                  className="w-full text-center text-2xl tracking-widest"
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
              )}

              <button
                type="submit"
                className="btn-primary w-full"
                disabled={roomCode.length !== 6 || loading}
              >
                {loading ? '加入中...' : '加入房间'}
              </button>

              <button
                type="button"
                onClick={() => setView('menu')}
                className="w-full py-3 text-white/60 hover:text-white transition-colors"
              >
                返回
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // 创建房间加载中
  if (view === 'create') {
    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 game-backdrop">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white/60">创建房间中...</p>
          </div>
        </div>
      );
    }
    // 如果不在loading但view还是create，返回菜单
    return (
      <div className="min-h-screen flex items-center justify-center p-4 game-backdrop">
        <div className="w-full max-w-md animate-fade-in">
          <div className="panel-frost rounded-2xl p-8 shadow-2xl text-center reveal-item" style={{ '--reveal-delay': '80ms' }}>
            <p className="text-white/60 mb-4">创建房间失败，请重试</p>
            {error && (
              <p className="text-red-400 text-sm mb-4">{error}</p>
            )}
            <button
              onClick={() => setView('menu')}
              className="btn-primary w-full"
            >
              返回菜单
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 房间界面
  if (view === 'room' && room) {
    const currentPlayer = room.players.find(p => p.id === socket?.id);
    const isHost = currentPlayer?.isHost;
    const allReady = room.players.every(p => p.isReady || p.isHost);
    const canStart = isHost && room.players.length >= room.minPlayers && allReady;

    return (
      <div className="min-h-screen flex items-center justify-center p-4 game-backdrop">
        <div className="w-full max-w-lg animate-fade-in">
          <div className="panel-frost rounded-2xl p-6 shadow-2xl reveal-item" style={{ '--reveal-delay': '80ms' }}>
            <div className="text-center mb-6">
              <p className="text-white/60 text-sm mb-1">房间号</p>
              <h2 className="text-4xl font-bold font-mono tracking-widest text-snow-ice">
                {room.code}
              </h2>
              <p className="text-white/40 text-sm mt-2">
                {room.players.length} / {room.maxPlayers} 玩家
              </p>
            </div>

            {/* 玩家列表 */}
            <div className="space-y-2 mb-6">
              {room.players.map((player, index) => (
                <div
                  key={player.id}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    player.id === currentPlayer?.id
                      ? 'bg-blue-500/20 border border-blue-500/50'
                      : 'bg-white/5 border border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">
                      {index + 1}
                    </span>
                    <span className="font-medium">{player.name}</span>
                    {player.isHost && (
                      <span className="text-xs bg-yellow-500/30 text-yellow-300 px-2 py-0.5 rounded">
                        房主
                      </span>
                    )}
                    {player.isOnline === false && (
                      <span className="text-xs bg-red-500/30 text-red-300 px-2 py-0.5 rounded">
                        离线
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {player.isReady && !player.isHost && (
                      <span className="text-green-400 text-sm">✓ 准备</span>
                    )}
                  </div>
                </div>
              ))}

              {/* 空位占位 */}
              {Array.from({ length: room.maxPlayers - room.players.length }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="p-3 rounded-lg bg-white/5 border border-white/10 border-dashed"
                >
                  <span className="text-white/30">等待玩家...</span>
                </div>
              ))}
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-center text-sm">
                {error}
              </div>
            )}

            {/* 操作按钮 */}
            <div className="space-y-3">
              {!isHost ? (
                <button
                  onClick={handleToggleReady}
                  className={`w-full py-3 rounded-lg font-semibold transition-all ${
                    currentPlayer?.isReady
                      ? 'bg-green-500/30 text-green-300 border border-green-500/50 hover:bg-green-500/40'
                      : 'btn-primary'
                  }`}
                >
                  {currentPlayer?.isReady ? '取消准备' : '准备就绪'}
                </button>
              ) : (
                <button
                  onClick={handleStartGame}
                  disabled={!canStart || loading}
                  className="btn-gold w-full disabled:opacity-50"
                >
                  {loading ? '开始中...' : '开始游戏'}
                </button>
              )}

              {isHost && room.players.length < room.minPlayers && (
                <p className="text-center text-white/50 text-sm">
                  需要至少 {room.minPlayers} 名玩家才能开始
                </p>
              )}

              <button
                onClick={handleLeaveRoom}
                className="w-full py-3 text-white/60 hover:text-red-400 transition-colors"
              >
                离开房间
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
