import { useState, useEffect } from 'react';

/**
 * 游戏主界面 - 基于设计图优化版本
 * 左：计分轨道 + 玩家列表
 * 中：神圣树（7层枯树）
 * 右：手牌 + 控制
 */
export function GameBoard({ gameState, privateState, playerName, room, socket, onLeave }) {
  const [resolutionLog, setResolutionLog] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [watcherMode, setWatcherMode] = useState(false); // Watcher额外出牌模式
  const [watcherSelectedCard, setWatcherSelectedCard] = useState(null); // 守望玩家选择的牌
  const [cardPlayError, setCardPlayError] = useState('');
  const [playedCardForDisplay, setPlayedCardForDisplay] = useState(null);
  const [healerRecycleCards, setHealerRecycleCards] = useState([]); // 选中要回收的牌
  const [isRolling, setIsRolling] = useState(false); // 掷骰子动画状态
  const [rollingDice, setRollingDice] = useState([1, 2]); // 动画中显示的骰子值

  // 获取卡牌类型名称
  const getCardTypeName = (type) => {
    switch (type) {
      case 'character': return '角色';
      case 'healer': return '治疗';
      case 'watcher': return '守望';
      case 'blizzard': return '暴雪';
      default: return '';
    }
  };

  // 获取卡牌图标
  const getCardIcon = (type) => {
    switch (type) {
      case 'healer': return '💚';
      case 'watcher': return '👁️';
      case 'blizzard': return '❄️';
      default: return null;
    }
  };

  // 渲染新式卡片
  const renderCard = (card, isSmall = false, playerColorIndex = null) => {
    const typeClass = card.type || 'character';
    const roleImage = card.roleImage;
    const showRoleImage = roleImage && card.type !== 'blizzard';
    const icon = getCardIcon(card.type);

    // 计算玩家颜色类
    const colorClass = playerColorIndex !== null ? `color-${playerColorIndex}` : '';

    return (
      <div
        className={`card-new ${typeClass} ${isSmall ? 'card-new-sm' : ''} ${colorClass}`}
        style={!showRoleImage && !colorClass ? { background: 'linear-gradient(135deg, #1a0a2e, #0a0612)' } : undefined}
      >
        {/* 左侧角色图 */}
        {showRoleImage && (
          <div
            className="card-new-left"
            style={{
              backgroundImage: `url(${roleImage})`,
            }}
          />
        )}

        {/* 右侧内容 */}
        <div className="card-new-right">
          {/* 类型标签 */}
          <span className="card-new-type">{getCardTypeName(card.type)}</span>
          
          {/* 宝石装饰 */}
          <div className="card-new-gem" />

          {/* 数字或图标 */}
          {card.type === 'character' ? (
            <span className="card-new-number">{card.value}</span>
          ) : (
            <span className="card-new-icon">{icon}</span>
          )}
          
          {/* 宝石装饰 */}
          <div className="card-new-gem" />
        </div>
      </div>
    );
  };

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 game-backdrop">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-snow-ice border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white/60">加载游戏中...</p>
        </div>
      </div>
    );
  }

  const currentPlayer = gameState.players.find(p => p.name === playerName);
  const isHost = room?.players?.find(p => p.name === playerName)?.isHost
    ?? currentPlayer?.id === gameState.players[0]?.id;

  // 监听结算日志
  useEffect(() => {
    if (!socket) return;

    const handleResolutionLog = ({ log }) => {
      setResolutionLog(log);
    };

    const handleHealerCompleted = ({ playerId }) => {
      const player = gameState?.players?.find(p => p.id === playerId);
      if (player) {
        setResolutionLog(prev => [
          ...prev,
          { type: 'healer_completed', playerName: player.name }
        ]);
      }
    };

    socket.on('game:resolution_log', handleResolutionLog);
    socket.on('game:healer_completed', handleHealerCompleted);
    return () => {
      socket.off('game:resolution_log', handleResolutionLog);
      socket.off('game:healer_completed', handleHealerCompleted);
    };
  }, [socket, gameState?.players]);

  // 当游戏状态更新时，检查当前玩家是否已出牌
  useEffect(() => {
    if (gameState?.currentPhase === 'play_cards' && currentPlayer?.id) {
      // 检查当前玩家是否已出牌
      const played = gameState.roundState?.playedCards?.find?.(
        p => p.playerId === currentPlayer.id
      );
      // 如果已出牌但还没有显示，根据服务器返回的牌类型重建显示
      if (played && !playedCardForDisplay) {
        // 重建卡牌对象用于显示
        const cardDisplay = {
          id: `played_${played.playerId}_${played.cardType}`,
          type: played.cardType,
          value: played.cardValue,
        };
        setPlayedCardForDisplay(cardDisplay);
      }
    }
  }, [gameState?.roundState?.playedCards, currentPlayer?.id]);

  // 监听掷骰子按钮点击，触发动画
  const handleRollDice = () => {
    // 立即开始动画
    setIsRolling(true);
    
    socket.emit('game:roll_dice', null, (response) => {
      if (!response || !response.success) {
        setCardPlayError(response?.error || '掷骰子失败');
        setIsRolling(false);
      }
      // 动画继续，等待自动停止
    });
  };
  
  // 监听游戏状态变化，自动处理动画
  useEffect(() => {
    // 当进入 roll_dice 阶段且 diceResult 有值时，开始动画
    if (gameState?.currentPhase === 'roll_dice' && gameState?.roundState?.diceResult?.length > 0) {
      // 如果之前没有在动画中，开始新动画
      if (!isRolling) {
        setIsRolling(true);
        // 800ms 后停止动画
        const timer = setTimeout(() => {
          setIsRolling(false);
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [gameState?.currentPhase, gameState?.roundState?.diceResult]);

  // 当阶段从 play_cards/watcher_play/resolve 变为其他阶段时，清除已出牌显示
  useEffect(() => {
    if (gameState?.currentPhase !== 'play_cards' &&
        gameState?.currentPhase !== 'watcher_play' &&
        gameState?.currentPhase !== 'resolve') {
      setPlayedCardForDisplay(null);
      setWatcherSelectedCard(null);
    }
  }, [gameState?.currentPhase]);

  // 出牌
  const handlePlayCard = (cardId) => {
    setCardPlayError(''); // Clear previous errors
    // 在出牌前找到卡牌信息（出牌后手牌会被更新）
    const cardToPlay = privateState?.hand?.find(card => card.id === cardId);

    socket.emit('game:play_card', { cardId }, (response) => {
      if (!response || !response.success) {
        setCardPlayError(response?.error || '出牌失败');
      } else {
        setSelectedCard(null);
        // 使用之前保存的卡牌信息来显示
        if (cardToPlay) {
          setPlayedCardForDisplay(cardToPlay);
        }
      }
    });
  };

  // 守望玩家额外出牌
  const handleWatcherPlayCard = (cardId) => {
    setCardPlayError('');
    const cardToPlay = privateState?.hand?.find(card => card.id === cardId);

    socket.emit('game:watcher_play', { cardId }, (response) => {
      if (!response || !response.success) {
        setCardPlayError(response?.error || '守望出牌失败');
      } else {
        setWatcherSelectedCard(null);
        // 更新显示的牌为守望玩家后出的牌
        if (cardToPlay) {
          setPlayedCardForDisplay(cardToPlay);
        }
      }
    });
  };

  // 结算回合
  const handleResolveRound = () => {
    socket.emit('game:resolve_round', null, (response) => {
      if (!response || !response.success) {
        setCardPlayError(response?.error || '结算失败');
      }
    });
  };

  // 结束回合
  const handleEndRound = () => {
    socket.emit('game:end_round', null, (response) => {
      if (!response || !response.success) {
        setCardPlayError(response?.error || '结束回合失败');
      } else {
        setResolutionLog([]);
        setPlayedCardForDisplay(null); // 清除已出的牌显示
        setHealerRecycleCards([]); // 清除选择的回收牌
        setWatcherSelectedCard(null); // 清除守望选择的牌
      }
    });
  };

  // Healer选择回收牌
  const handleHealerRecycle = () => {
    if (healerRecycleCards.length === 0) {
      setCardPlayError('请至少选择一张牌回收');
      return;
    }

    socket.emit('game:healer_recycle', { cardIds: healerRecycleCards }, (response) => {
      if (!response || !response.success) {
        setCardPlayError(response?.error || '回收失败');
      } else {
        setHealerRecycleCards([]);
        setCardPlayError('');
      }
    });
  };

  // 切换选择回收的牌
  const toggleHealerRecycleCard = (cardId) => {
    setHealerRecycleCards(prev => {
      if (prev.includes(cardId)) {
        return prev.filter(id => id !== cardId);
      } else if (prev.length < 2) {
        return [...prev, cardId];
      }
      return prev;
    });
  };

  // 获取阶段名称
  const getPhaseName = (phase) => {
    const phaseNames = {
      'setup': '准备中',
      'roll_dice': '掷骰子阶段',
      'play_cards': '出牌阶段',
      'watcher_play': '守望补牌阶段',
      'healer_recycle': '治疗回收阶段',
      'resolve': '结算阶段',
      'collect': '收集阶段',
      'game_over': '游戏结束',
    };
    return phaseNames[phase] || phase;
  };

  // 奖励格图标
  const getBonusIcon = (type) => {
    switch (type) {
      case 'fruit':
        return <span className="fruit-token" />;
      case 'fight':
        return <span className="text-red-300">???</span>;
      case 'mana':
        return <span className="text-cyan-300">??</span>;
      default:
        return null;
    }
  };

  const getCardTypeClass = (type) => {
    switch (type) {
      case 'character':
        return 'card-type-character';
      case 'healer':
        return 'card-type-healer';
      case 'watcher':
        return 'card-type-watcher';
      default:
        return 'card-type-blizzard';
    }
  };

  // 获取玩家颜色
  const getPlayerColor = (playerId) => {
    const player = gameState.players.find(p => p.id === playerId);
    return player?.color || '#888';
  };

  // 获取当前阶段提示信息
  const getPhaseHint = () => {
    switch (gameState.currentPhase) {
      case 'roll_dice':
        return { text: '🎲 等待房主掷骰子...', color: 'text-blue-300' };
      case 'play_cards':
        const hasPlayed = gameState.roundState?.playedPlayerIds?.includes(currentPlayer?.id);
        if (hasPlayed) {
          return { text: '⏳ 等待其他玩家出牌...', color: 'text-yellow-300' };
        }
        return { text: '🎴 请选择一张卡牌打出', color: 'text-green-300' };
      case 'watcher_play':
        const isWatcherPlayer = gameState.roundState?.watcherPlayers?.includes(currentPlayer?.id);
        const hasWatcherPlayed = gameState.roundState?.watcherPlayedCount === gameState.roundState?.watcherPlayers?.length;
        if (isWatcherPlayer && !hasWatcherPlayed) {
          return { text: '👁️ 守望者：请选择额外出牌', color: 'text-purple-300' };
        }
        return { text: '👁️ 等待守望玩家额外出牌...', color: 'text-purple-300' };
      case 'healer_recycle':
        return { text: '💉 等待治疗玩家回收卡牌...', color: 'text-green-300' };
      case 'resolve':
        return { text: '⚔️ 结算中...', color: 'text-red-300' };
      case 'collect':
        return { text: '🍎 收集阶段 - 等待房主结束回合', color: 'text-purple-300' };
      default:
        return { text: '', color: '' };
    }
  };

  const phaseHint = getPhaseHint();
  const playerMap = new Map(gameState.players.map(p => [p.id, p]));
  const revealedPlayedCards =
    gameState.currentPhase === 'watcher_play' || gameState.currentPhase === 'resolve'
      ? (gameState.roundState?.playedCards || [])
      : [];
  const pendingTreeCharactersByLevel = new Map();
  if (gameState.currentPhase === 'watcher_play' || gameState.currentPhase === 'resolve') {
    (gameState.roundState?.playedCards || []).forEach((played) => {
      if (played.cardType !== 'character') return;
      const level = Number(played.cardValue);
      if (!Number.isInteger(level) || level < 1 || level > 7) return;
      const player = playerMap.get(played.playerId);
      const list = pendingTreeCharactersByLevel.get(level) || [];
      list.push({
        playerId: played.playerId,
        cardType: 'character',
        cardValue: level,
        color: player?.color || '#888',
      });
      pendingTreeCharactersByLevel.set(level, list);
    });
  }

  // 检查当前玩家是否需要选择回收牌
  const needsHealerRecycle = privateState?.healerRecycleChoice?.needsChoice || false;
  const healerDiscardPile = privateState?.healerRecycleChoice?.discardPile || [];

  return (
    <div className="min-h-screen p-2 lg:p-4 game-backdrop">
      {/* Healer回收选择弹窗 */}
      {needsHealerRecycle && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="panel-frost rounded-2xl p-6 border border-green-500/40 max-w-md w-full shadow-2xl">
            <h2 className="text-2xl font-bold text-green-300 mb-2 flex items-center gap-2">
              <span>💚</span> 治疗者回收
            </h2>
            <p className="text-white/80 text-sm mb-4">
              从弃牌堆中选择最多2张牌回收到手牌
            </p>

            {cardPlayError && (
              <p className="text-red-400 text-sm text-center mb-3 bg-red-500/20 p-2 rounded">{cardPlayError}</p>
            )}

            {/* 弃牌堆 */}
            <div className="mb-4">
              <p className="text-white/60 text-xs mb-2">弃牌堆 ({healerDiscardPile.length}张):</p>
              <div className="grid grid-cols-4 gap-2 max-h-60 overflow-y-auto p-2 bg-black/20 rounded-lg">
                {healerDiscardPile.map((card) => {
                  return (
                    <button
                      key={card.id}
                      onClick={() => toggleHealerRecycleCard(card.id)}
                      className={`transition-all ${
                        healerRecycleCards.includes(card.id)
                          ? 'ring-2 ring-green-400 scale-105 shadow-lg shadow-green-400/30'
                          : ''
                      } hover:scale-105 cursor-pointer active:scale-95`}
                    >
                      <div className="w-full aspect-[2/3]">
                        {renderCard(card)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 已选择的牌 */}
            <div className="mb-4 text-center">
              <p className="text-white/60 text-xs mb-1">
                已选择: {healerRecycleCards.length} / 2
              </p>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-3">
              <button
                onClick={handleHealerRecycle}
                disabled={healerRecycleCards.length === 0}
                className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-all"
              >
                确认回收
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 顶部信息栏 */}
      <header className="panel-frost rounded-xl p-3 lg:p-4 mb-3 lg:mb-4">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div>
            <h1 className="font-game text-xl lg:text-2xl font-bold text-snow-ice">SnowTime</h1>
            <p className="text-white/60 text-xs lg:text-sm">
              第 {gameState.currentRound} 回合 - {getPhaseName(gameState.currentPhase)}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* 掷骰子结果显示 */}
            {gameState.roundState?.diceResult?.length > 0 && (
              <div className="flex gap-2">
                {gameState.roundState.diceResult.map((die, i) => (
                  <div
                    key={i}
                    className={`w-10 h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-xl flex items-center justify-center text-xl lg:text-2xl font-bold shadow-lg ${
                      isRolling ? 'dice-rolling dice-glow' : ''
                    }`}
                  >
                    {isRolling ? Math.floor(Math.random() * 6) + 1 : die}
                  </div>
                ))}
              </div>
            )}
            <div className="text-right text-xs lg:text-sm">
              <p className="text-white/60 flex items-center justify-end gap-2">
                <span className="fruit-token lg" />
                <span className="text-snow-fruit font-bold text-lg">{gameState.remainingFruits}</span>
              </p>
              <p className="text-white/40">{gameState.roomCode}</p>
            </div>
          </div>
        </div>
      </header>

      {/* 操作提示条 */}
      <div className="mb-3 flex items-center justify-between bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10">
        <div className={`text-sm font-medium ${phaseHint.color}`}>
          {phaseHint.text}
        </div>
        <button
          onClick={() => setShowRules(!showRules)}
          className="text-xs text-white/50 hover:text-white/80 underline"
        >
          {showRules ? '隐藏规则' : '查看规则'}
        </button>
      </div>

      {/* 规则说明面板 */}
      {showRules && (
        <div className="mb-3 panel-frost rounded-xl p-4 text-sm">
          <h3 className="font-semibold text-snow-gold mb-2">游戏规则</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-white/70">
            <div>
              <p className="mb-1"><span className="text-snow-ice">1. 掷骰子:</span> 掷2个骰子，在对应层级放置果实</p>
              <p className="mb-1"><span className="text-snow-ice">2. 出牌:</span> 选择角色牌(1-7)或特殊牌打出</p>
              <p className="mb-1"><span className="text-snow-ice">3. 结算:</span> 从上到下(L7→L1)依次结算</p>
            </div>
            <div>
              <p className="mb-1"><span className="text-red-400">同层冲突:</span> 多人在同层则全部击败</p>
              <p className="mb-1"><span className="text-red-400">上下击落:</span> 孤独上层击败紧邻下层</p>
              <p className="mb-1"><span className="text-green-400">收集:</span> 结算后孤独角色收集所在层果实</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-white/10 text-xs">
            <p className="text-white/50">特殊牌：</p>
            <p className="text-white/70">💚 Healer - 回收2张弃牌 | 👁️ Watcher - 观看后额外出牌 | ❄️ Blizzard - 丢弃所有角色牌，获得分数</p>
          </div>
        </div>
      )}

      {/* 主游戏区 - 三列布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4">

        {/* 左侧：计分轨道和玩家列表 */}
        <div className="lg:col-span-3 space-y-3 reveal-item" style={{ '--reveal-delay': '60ms' }}>
          {/* 玩家列表 */}
          <div className="panel-frost rounded-xl p-3">
            <h2 className="font-semibold mb-2 text-snow-gold text-sm">玩家</h2>
            <div className="space-y-1.5">
              {gameState.players.map((player, index) => (
                <div
                  key={player.id}
                  className={`flex items-center justify-between p-2 rounded-lg text-sm ${
                    player.name === playerName ? 'bg-blue-500/30 border border-blue-400/50' : 'bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: player.color }}
                    />
                    <span className="text-xs lg:text-sm truncate max-w-[80px]">{player.name}</span>
                    {index === 0 && <span className="text-[10px] text-yellow-400">房主</span>}
                    {player.isOnline === false && <span className="text-[10px] text-red-400">离线</span>}
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    {gameState.currentPhase === 'play_cards' && gameState.roundState?.playedPlayerIds?.includes(player.id) && (
                      <span className="text-green-400 text-[10px] mr-1">✓</span>
                    )}
                    <span className="text-snow-gold font-bold">{player.position}</span>
                    {player.fightPoints > 0 && <span className="text-red-400">⚔️{player.fightPoints}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 计分轨道 - 垂直30格 */}
          <div className="panel-frost rounded-xl p-3">
            <h2 className="font-semibold mb-2 text-snow-gold text-sm">计分轨道</h2>
            <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
              {gameState.track.slice().reverse().map((space, index) => {
                const actualIndex = gameState.track.length - 1 - index;
                const playersHere = gameState.players.filter(p => p.position === actualIndex);

                return (
                  <div
                    key={actualIndex}
                    className={`flex items-center gap-2 p-1.5 rounded ${
                      space.bonus ? 'bg-yellow-500/20 border border-yellow-500/40' : 'bg-white/5'
                    }`}
                  >
                    <span className="w-6 text-center text-xs text-white/60 font-mono">
                      {actualIndex}
                    </span>
                    {space.bonus && (
                      <span
                        className="text-xs flex items-center gap-1"
                        title={`${space.bonus} +${space.bonusMove || 1}`}
                      >
                        {getBonusIcon(space.bonus)}
                        <span className="text-[10px] text-white/60">+{space.bonusMove || 1}</span>
                      </span>
                    )}
                    <div className="flex-1 flex gap-1 justify-end">
                      {playersHere.map(p => (
                        <div
                          key={p.id}
                          className="w-3 h-3 rounded-sm"
                          style={{ backgroundColor: p.color }}
                          title={p.name}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 中间：神圣树 - 7层枯树 */}
        <div className="lg:col-span-5 lg:pb-0 pb-[45vh] reveal-item" style={{ '--reveal-delay': '140ms' }}>
          <div className="panel-board rounded-xl p-3 lg:p-4 h-full max-h-[60vh] lg:max-h-none overflow-y-auto">
            <h2 className="font-semibold mb-3 text-snow-gold text-sm flex items-center justify-between">
              <span>神圣树</span>
              <span className="text-xs text-white/40">Level 7 → 1</span>
            </h2>

            {/* 玩家弃牌堆区域（顶部） */}
            <div className="mb-4 p-3 bg-black/20 rounded-lg border border-white/10">
              <p className="text-xs text-white/40 mb-2">玩家弃牌堆</p>
              <div className="space-y-2">
                {gameState.players.map(player => (
                  <div key={player.id} className="p-2 bg-white/5 rounded">
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: player.color }}
                      />
                      <span className="text-[10px] text-white/60 truncate max-w-[60px]">{player.name}</span>
                      <span className="text-[10px] text-white/40">{player.discardPile?.length || 0}张</span>
                    </div>
                    {player.discardPile?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {player.discardPile.map((card, i) => (
                          <div key={card.id || i} className="w-6">
                            {renderCard(card, true)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 7层树 */}
            <div className="space-y-2 relative">
              {/* 树层级连接线效果 */}
              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-transparent via-white/20 to-transparent -translate-x-1/2"></div>

              {gameState.treeLevels.slice().reverse().map((level) => {
                const pendingChars = pendingTreeCharactersByLevel.get(level.level) || [];
                const displayChars = level.characters.length > 0 ? level.characters : pendingChars;
                return (
                <div
                  key={level.level}
                  className={`relative flex items-center gap-3 p-3 rounded-lg border ${
                    level.level === 7
                      ? 'bg-red-900/20 border-red-500/30'
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  {/* 层级标识 */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                    level.level === 7
                      ? 'bg-red-500/30 text-red-300 border border-red-500/50'
                      : 'bg-snow-ice/20 text-snow-ice border border-snow-ice/30'
                  }`}>
                    L{level.level}
                  </div>

                  {/* 果实区域 */}
                  <div className="flex-1 flex items-center gap-2 min-h-[40px] flex-wrap py-1">
                    {Array.from({ length: level.fruits }).map((_, i) => (
                      <span key={i} className="fruit-token fruit-animate" />
                    ))}
                    {level.fruits === 0 && level.level !== 7 && (
                      <span className="text-white/20 text-xs">无果实</span>
                    )}
                  </div>

                  {/* 角色区域 */}
                  <div className="flex items-center gap-1">
                    {displayChars.map((char, i) => {
                      // 获取角色的roleImage，优先从char本身获取，否则从playerMap获取
                      const player = playerMap.get(char.playerId);
                      const roleImage = char.roleImage || player?.roleImage;
                      return (
                        <div
                          key={i}
                          className="w-10 h-10 rounded-lg flex flex-col items-center justify-center text-sm font-bold shadow-lg border-2 relative overflow-hidden"
                          style={{
                            backgroundColor: `${char.color}dd`,
                            borderColor: char.color,
                            boxShadow: `0 0 10px ${char.color}66`
                          }}
                        >
                          {/* 角色背景图 */}
                          {roleImage && (
                            <div
                              className="absolute inset-0"
                              style={{
                                backgroundImage: `url(${roleImage})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                opacity: 0.5,
                              }}
                            />
                          )}
                          <span className="text-xs opacity-80 relative z-10">{char.cardValue}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
              })}
            </div>
          </div>
        </div>

        {/* 右侧：手牌和控制 */}
        <div className="lg:col-span-4 space-y-3 reveal-item" style={{ '--reveal-delay': '220ms' }}>
          {/* 手牌 - 移动端固定底部显示 */}
          <div className="panel-frost rounded-xl p-3 lg:static fixed bottom-0 left-0 right-0 lg:mb-0 mb-0 z-50 lg:z-auto max-h-[40vh] lg:max-h-none overflow-y-auto" style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-snow-gold text-sm">
                手牌 ({privateState?.hand?.length || 0})
              </h2>
              {/* 出牌状态 */}
              {gameState.currentPhase === 'play_cards' && (
                <div className="flex items-center gap-2">
                  {gameState.roundState?.playedPlayerIds?.includes(currentPlayer?.id) ? (
                    <span className="text-xs text-green-400 flex items-center gap-1">
                      <span>✓</span> 已出牌
                    </span>
                  ) : (
                    <span className="text-xs text-yellow-400 animate-pulse">等待出牌...</span>
                  )}
                </div>
              )}
              {/* 守望出牌状态 */}
              {gameState.currentPhase === 'watcher_play' && (
                <div className="flex items-center gap-2">
                  {gameState.roundState?.watcherPlayers?.includes(currentPlayer?.id) ? (
                    <span className="text-xs text-purple-400 animate-pulse">👁️ 守望额外出牌</span>
                  ) : (
                    <span className="text-xs text-purple-300">👁️ 等待守望玩家...</span>
                  )}
                </div>
              )}
            </div>
            {cardPlayError && (
              <p className="text-red-400 text-sm text-center mb-2">{cardPlayError}</p>
            )}
            {/* 已出的牌显示 */}
            {playedCardForDisplay && (gameState.currentPhase === 'play_cards' || gameState.currentPhase === 'watcher_play' || gameState.currentPhase === 'resolve') && (
              <div className="flex flex-col items-center mb-3 p-2 bg-white/5 rounded-lg border border-white/10">
                <p className="text-white/60 text-xs mb-1">已出牌:</p>
                <div className="w-16">
                  {renderCard(playedCardForDisplay)}
                </div>
              </div>
            )}
            {revealedPlayedCards.length > 0 && (
              <div className="mb-3 p-2 bg-white/5 rounded-lg border border-white/10">
                <p className="text-white/60 text-xs mb-2">公开牌</p>
                <div className="grid grid-cols-2 gap-2">
                  {revealedPlayedCards.map((played) => {
                    const player = playerMap.get(played.playerId);
                    // 使用 played.cardType 和 played.cardValue 构造卡片对象
                    const cardData = {
                      type: played.cardType,
                      value: played.cardValue,
                      roleImage: played.roleImage || player?.roleImage,
                    };
                    return (
                      <div key={played.playerId} className="flex items-center gap-2 bg-black/20 rounded p-2">
                        <div
                          className="w-2.5 h-2.5 rounded"
                          style={{ backgroundColor: player?.color || '#888' }}
                        />
                        <span className="text-[10px] text-white/70 truncate max-w-[70px]">
                          {player?.name || '玩家'}
                        </span>
                        <div className="ml-auto w-8">
                          {renderCard(cardData, true)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {privateState?.hand ? (
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                {privateState.hand.map((card) => {
                  const isWatcherPhase = gameState.currentPhase === 'watcher_play';
                  const isWatcherPlayer = gameState.roundState?.watcherPlayers?.includes(currentPlayer?.id);
                  const canPlayCard = gameState.currentPhase === 'play_cards' && !playedCardForDisplay;
                  const canWatcherPlay = isWatcherPhase && isWatcherPlayer;
                  const isClickable = canPlayCard || canWatcherPlay;
                  
                  // 获取当前玩家的颜色索引
                  const playerColorIndex = gameState.players.findIndex(p => p.id === currentPlayer?.id);

                  return (
                    <button
                      key={card.id}
                      onClick={() => {
                        if (canPlayCard) {
                          setSelectedCard(card.id);
                        } else if (canWatcherPlay) {
                          setWatcherSelectedCard(card.id);
                        }
                      }}
                      onTouchStart={() => {
                        if (canPlayCard) {
                          setSelectedCard(card.id);
                        } else if (canWatcherPlay) {
                          setWatcherSelectedCard(card.id);
                        }
                      }}
                      disabled={!isClickable}
                      className={`transition-all ${
                        selectedCard === card.id || watcherSelectedCard === card.id
                          ? 'ring-2 ring-snow-gold scale-105 shadow-lg shadow-snow-gold/30'
                          : ''
                      } ${
                        isClickable
                          ? 'hover:scale-105 cursor-pointer active:scale-95'
                          : 'opacity-50 cursor-not-allowed'
                      }`}
                    >
                      {renderCard(card, false, playerColorIndex)}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-white/40 text-center py-8">加载中...</p>
            )}

            {/* 出牌确认按钮 */}
            {selectedCard && gameState.currentPhase === 'play_cards' && !playedCardForDisplay && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handlePlayCard(selectedCard)}
                  className="flex-1 btn-primary py-2 text-sm"
                >
                  确认出牌
                </button>
                <button
                  onClick={() => setSelectedCard(null)}
                  className="px-4 py-2 bg-white/10 rounded-lg text-sm hover:bg-white/20"
                >
                  取消
                </button>
              </div>
            )}
            {/* 守望玩家出牌确认按钮 */}
            {watcherSelectedCard && gameState.currentPhase === 'watcher_play' && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleWatcherPlayCard(watcherSelectedCard)}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 rounded-lg text-sm transition-all"
                >
                  👁️ 守望出牌
                </button>
                <button
                  onClick={() => setWatcherSelectedCard(null)}
                  className="px-4 py-2 bg-white/10 rounded-lg text-sm hover:bg-white/20"
                >
                  取消
                </button>
              </div>
            )}
            {/* 已出牌后显示等待 */}
            {playedCardForDisplay && gameState.currentPhase === 'play_cards' && (
              <div className="mt-3 p-3 text-center text-white/60 bg-white/5 rounded-lg border border-white/10">
                等待其他玩家出牌...
              </div>
            )}
            {/* 守望出牌后显示等待 */}
            {playedCardForDisplay && gameState.currentPhase === 'watcher_play' && (
              <div className="mt-3 p-3 text-center text-purple-300 bg-purple-500/10 rounded-lg border border-purple-500/30">
                👁️ 守望出牌完成，等待其他守望玩家...
              </div>
            )}
          </div>

          {/* 房主控制 */}
          {isHost && (
            <div className="panel-frost rounded-xl p-3 border border-yellow-500/30">
              <h2 className="font-semibold mb-3 text-snow-gold text-sm flex items-center gap-2">
                <span>👑</span> 房主控制
              </h2>
              <div className="space-y-2">
                {gameState.currentPhase === 'roll_dice' && (
                  <button
                    onClick={handleRollDice}
                    disabled={isRolling}
                    className="btn-gold w-full text-sm animate-pulse-glow disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    🎲 {isRolling ? '掷骰子中...' : '掷骰子'}
                  </button>
                )}
                {gameState.currentPhase === 'play_cards' && (
                  <div className="bg-white/5 rounded-lg p-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-white/60">已出牌</span>
                      <span className="text-snow-gold font-bold">
                        {gameState.roundState?.playedCardsCount || 0} / {gameState.players.length}
                      </span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-2">
                      <div
                        className="bg-snow-gold h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${((gameState.roundState?.playedCardsCount || 0) / gameState.players.length) * 100}%`
                        }}
                      />
                    </div>
                  </div>
                )}
                {gameState.currentPhase === 'watcher_play' && (
                  <div className="bg-purple-500/10 rounded-lg p-2 border border-purple-500/30">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-purple-300">👁️ 守望出牌</span>
                      <span className="text-purple-400 font-bold">
                        {gameState.roundState?.watcherPlayedCount || 0} / {gameState.roundState?.watcherPlayers?.length || 0}
                      </span>
                    </div>
                    <div className="w-full bg-purple-900/30 rounded-full h-2">
                      <div
                        className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${gameState.roundState?.watcherPlayers?.length > 0 ? ((gameState.roundState?.watcherPlayedCount || 0) / gameState.roundState.watcherPlayers.length) * 100 : 0}%`
                        }}
                      />
                    </div>
                  </div>
                )}
                {gameState.currentPhase === 'resolve' && (
                  <button
                    onClick={handleResolveRound}
                    className="btn-gold w-full text-sm animate-pulse-glow"
                  >
                    ⚔️ 结算回合
                  </button>
                )}
                {gameState.currentPhase === 'collect' && (
                  <button
                    onClick={handleEndRound}
                    className="btn-secondary w-full text-sm"
                  >
                    🔄 结束回合
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 结算日志 */}
          {resolutionLog.length > 0 && (
            <div className="panel-frost rounded-xl p-3 max-h-40 overflow-y-auto">
              <h2 className="font-semibold mb-2 text-snow-gold text-sm">结算日志</h2>
              <div className="space-y-1 text-xs">
                {resolutionLog.map((log, i) => (
                  <div key={i} className="text-white/70 p-1.5 bg-white/5 rounded">
                    {log.type === 'conflict' && log.playerNames && `⚔️ L${log.level} 同层冲突，玩家 ${log.playerNames.join(', ')} 获得 ${log.pointsPerPlayer} 战斗分`}
                    {log.type === 'push_down' && `💥 ${log.winnerName} 击落下层角色，获得 ${log.pointsGained} 分`}
                    {log.type === 'collect_fruit' && `🍎 ${log.playerName} 收集 ${log.count} 个果实，获得 ${log.pointsGained} 分`}
                    {log.type === 'mana_point' && `✨ ${log.playerName} 获得法力积分`}
                    {log.type === 'blizzard' && `❄️ ${log.blizzardPlayerName} 暴风雪生效，丢弃 ${log.discardedCount} 张角色牌，获得 ${log.pointsGained} 分`}
                    {log.type === 'healer' && `💚 ${log.playerName} 治疗者回收 ${log.recycledCount} 张牌`}
                    {log.type === 'healer_pending' && `💚 ${log.playerName || '玩家'} 需要选择回收的牌`}
                    {log.type === 'bonus_space' && `🎁 ${log.playerName} 奖励格触发，额外前进 ${log.bonusMove} 格`}
                    {log.type === 'healer_completed' && `?? ${log.playerName} ???????`}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 底部返回按钮 */}
      <div className="mt-4 text-center lg:pb-0 pb-[45vh]">
        <button
          onClick={() => {
            if (socket) socket.emit('room:leave');
            onLeave();
          }}
          className="px-4 py-2 text-white/60 hover:text-red-400 transition-colors text-sm"
        >
          退出游戏
        </button>
      </div>
    </div>
  );
}
