import { useState, useCallback, useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import { NameEntry } from './components/NameEntry';
import { Lobby } from './components/Lobby';
import { GameBoard } from './components/GameBoard';
import { GameOver } from './components/GameOver';

function App() {
  const { socket, isConnected, error: socketError, emit } = useSocket();
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('snowtime.playerName') || '');
  const [storedRoomCode, setStoredRoomCode] = useState(() => localStorage.getItem('snowtime.roomCode') || '');
  const [gameState, setGameState] = useState(null);
  const [privateState, setPrivateState] = useState(null);
  const [inGame, setInGame] = useState(false);
  const [roomState, setRoomState] = useState(null);
  const [gameOver, setGameOver] = useState(null);

  const handleNameSubmit = useCallback((name) => {
    setPlayerName(name);
    localStorage.setItem('snowtime.playerName', name);
  }, []);

  const handleGameStart = useCallback((initialGameState, initialPrivateState = null) => {
    setGameState(initialGameState);
    setInGame(true);

    // 如果提供了初始私有状态（重连时），直接使用
    if (initialPrivateState) {
      setPrivateState(initialPrivateState);
    } else {
      // 否则获取私有状态（手牌）
      if (socket) {
        socket.emit('game:get_private_state', null, (response) => {
          if (response.success) {
            setPrivateState(response.privateState);
          }
        });
      }
    }
  }, [socket]);

  const handleLeaveGame = useCallback(() => {
    setGameState(null);
    setPrivateState(null);
    setInGame(false);
    setGameOver(null);
    setRoomState(null);
    setPlayerName('');
    setStoredRoomCode('');
    localStorage.removeItem('snowtime.playerName');
    localStorage.removeItem('snowtime.roomCode');
  }, []);

  // 监听游戏状态更新
  useEffect(() => {
    if (!socket) return;

    const handleStateUpdated = ({ gameState: newState }) => {
      setGameState(prev => prev ? { ...prev, ...newState } : newState);
    };

    const handlePrivateState = ({ privateState: newPrivateState }) => {
      setPrivateState(newPrivateState);
    };

    const handleGameEnded = ({ winner, finalState }) => {
      setGameState(finalState);
      setGameOver({ winner, finalState });
    };

    socket.on('game:state_updated', handleStateUpdated);
    socket.on('game:private_state', handlePrivateState);
    socket.on('game:ended', handleGameEnded);

    return () => {
      socket.off('game:state_updated', handleStateUpdated);
      socket.off('game:private_state', handlePrivateState);
      socket.off('game:ended', handleGameEnded);
    };
  }, [socket]);

  // 连接中
  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 game-backdrop">
        <div className="text-center panel-frost rounded-2xl px-8 py-6">
          <div className="w-16 h-16 border-4 border-snow-ice border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white/60">连接服务器...</p>
          {socketError && (
            <p className="text-red-400 mt-2">{socketError}</p>
          )}
        </div>
      </div>
    );
  }

  // 游戏结束
  if (gameOver) {
    return (
      <GameOver
        winner={gameOver.winner}
        players={gameOver.finalState?.players || []}
        onReturn={handleLeaveGame}
      />
    );
  }

  // 游戏中
  if (inGame) {
    return (
      <GameBoard
        gameState={gameState}
        privateState={privateState}
        playerName={playerName}
        room={roomState}
        socket={socket}
        onLeave={handleLeaveGame}
      />
    );
  }

  // 未输入昵称
  if (!playerName) {
    return <NameEntry onSubmit={handleNameSubmit} />;
  }

  // 大厅
  return (
    <Lobby
      playerName={playerName}
      socket={socket}
      emit={emit}
      onGameStart={handleGameStart}
      onRoomUpdate={setRoomState}
      initialRoomCode={storedRoomCode}
      onLeave={() => {
        setPlayerName('');
        setStoredRoomCode('');
        localStorage.removeItem('snowtime.playerName');
        localStorage.removeItem('snowtime.roomCode');
      }}
    />
  );
}

export default App;
