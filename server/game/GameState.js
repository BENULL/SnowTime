const {
  GAME_CONFIG,
  GAME_PHASES,
  BONUS_TYPES,
  CARD_TYPES,
  DEFAULT_BONUS_SPACES,
} = require('../utils/constants');
const { DeckManager } = require('./DeckManager');

/**
 * 游戏状态管理类 - 核心状态机
 * 后端作为单点数据源 (Single Source of Truth)
 */
class GameState {
  constructor(roomCode, players) {
    this.roomCode = roomCode;
    this.deckManager = new DeckManager();

    // 初始化玩家
    this.players = players.map((p, index) => ({
      id: p.id,
      name: p.name,
      color: this.deckManager.getPlayerColor(index),
      roleImage: this.deckManager.getRoleImage(index),
      hand: this.deckManager.createPlayerDeck(p.id, index),
      discardPile: [],
      score: 0,       // 当前分数（在计分轨道上的位置）
      position: 0,    // 计分轨道位置 (0-29)
      fightPoints: 0, // 战斗分累计
      fruitPoints: 0, // 果实分累计
      manaPoints: 0,  // 法力分累计
    }));

    // 游戏状态
    this.currentPhase = GAME_PHASES.SETUP;
    this.currentRound = 0;
    this.currentTurn = 0; // 当前玩家索引（轮流先手）

    // 树状态 (7层，索引0=Level1，索引6=Level7)
    // 每层: { fruits: 果实数量, characters: [{playerId, card, isAlone}] }
    this.treeLevels = Array(GAME_CONFIG.TREE_LEVELS).fill(null).map(() => ({
      fruits: 0,
      characters: [],
    }));

    // 剩余果实
    this.remainingFruits = GAME_CONFIG.TOTAL_FRUITS;

    // 计分轨道 (30格)
    this.track = this.generateTrack();

    // 当前回合临时状态
    this.roundState = {
      playedCards: new Map(),      // playerId -> card
      diceResult: [],              // 骰子结果
      watcherPlayers: [],          // 出Watcher的玩家
      watcherPlayedCards: new Map(), // 守望玩家后出的牌 playerId -> card
      blizzardPlayers: [],         // 出Blizzard的玩家
      healerPlayers: [],           // 出Healer的玩家
      healerRecycleChoices: new Map(), // playerId -> { needsChoice: boolean, selectedCards: [] }
      resolvedLevels: [],          // 已结算的层级
      collectedFruits: new Map(),  // playerId -> count
      manaPlayer: null,            // 获得法力的玩家
      pendingResolutionLog: null,  // 等待治疗选择时保存结算日志
    };

    // 游戏结束标记
    this.winner = null;
  }

  /**
   * 生成计分轨道
   */
  generateTrack() {
    const track = Array(GAME_CONFIG.TRACK_LENGTH).fill(null).map((_, index) => ({
      position: index,
      bonus: null,
    }));

    // 放置奖励格
    DEFAULT_BONUS_SPACES.forEach(({ position, type, bonusMove }) => {
      if (position < track.length) {
        track[position].bonus = type;
        track[position].bonusMove = bonusMove || 1;
      }
    });

    return track;
  }

  /**
   * 开始新游戏
   */
  startGame() {
    this.currentPhase = GAME_PHASES.ROLL_DICE;
    this.currentRound = 1;
    this.currentTurn = 0;
    return this.getPublicState();
  }

  /**
   * 阶段1: 掷骰子放置果实
   */
  rollDiceAndPlaceFruits() {
    if (this.remainingFruits <= 0) {
      // 没有果实了，跳过此阶段
      this.currentPhase = GAME_PHASES.PLAY_CARDS;
      return this.getPublicState();
    }

    // 确定掷几个骰子
    const diceCount = this.remainingFruits >= 2 ? 2 : 1;

    // 掷骰子 (1-6)
    const dice1 = Math.floor(Math.random() * 6) + 1;
    const dice2 = diceCount === 2 ? Math.floor(Math.random() * 6) + 1 : null;

    this.roundState.diceResult = diceCount === 2 ? [dice1, dice2] : [dice1];

    // 在对应层级放置果实
    // 注意: dice结果是1-6，对应Level1-Level6，Level7永远不会有果实
    const levelsToPlace = diceCount === 2 && dice1 === dice2
      ? [dice1, dice1]  // 双倍，在同一层放2个
      : diceCount === 2
        ? [dice1, dice2]
        : [dice1];

    let placedCount = 0;
    levelsToPlace.forEach(level => {
      // level是1-6，对应索引0-5
      const levelIndex = level - 1;
      if (levelIndex >= 0 && levelIndex < 6 && this.remainingFruits > 0) {
        this.treeLevels[levelIndex].fruits++;
        this.remainingFruits--;
        placedCount++;
      }
    });

    this.currentPhase = GAME_PHASES.PLAY_CARDS;
    return this.getPublicState();
  }

  /**
   * 阶段2: 玩家出牌
   */
  playCard(playerId, cardId) {
    if (this.currentPhase !== GAME_PHASES.PLAY_CARDS) {
      return { success: false, error: '不在出牌阶段' };
    }

    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, error: '玩家不存在' };
    }

    // 检查是否已出过牌
    if (this.roundState.playedCards.has(playerId)) {
      return { success: false, error: '已经出过牌了' };
    }

    // 找到卡牌
    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
      return { success: false, error: '卡牌不在手牌中' };
    }

    const card = player.hand[cardIndex];

    // 从手牌移除（暂时放到roundState）
    player.hand.splice(cardIndex, 1);
    this.roundState.playedCards.set(playerId, {
      ...card,
      originalIndex: cardIndex,
    });

    // 记录特殊牌
    if (card.type === CARD_TYPES.WATCHER) {
      this.roundState.watcherPlayers.push(playerId);
    } else if (card.type === CARD_TYPES.BLIZZARD) {
      this.roundState.blizzardPlayers.push(playerId);
    } else if (card.type === CARD_TYPES.HEALER) {
      this.roundState.healerPlayers.push(playerId);
    }

    // 检查是否所有玩家都出牌了
    if (this.roundState.playedCards.size === this.players.length) {
      // 检查是否有守望玩家
      if (this.roundState.watcherPlayers.length > 0) {
        // 进入守望玩家出牌阶段
        this.currentPhase = GAME_PHASES.WATCHER_PLAY;
      } else {
        // 直接进入结算阶段
        this.currentPhase = GAME_PHASES.RESOLVE;
      }
    }

    return { success: true, state: this.getPublicState() };
  }

  /**
   * 守望玩家后出牌
   */
  watcherPlayCard(playerId, cardId) {
    if (this.currentPhase !== GAME_PHASES.WATCHER_PLAY) {
      return { success: false, error: '不在守望出牌阶段' };
    }

    // 检查是否是守望玩家
    if (!this.roundState.watcherPlayers.includes(playerId)) {
      return { success: false, error: '你没有出守望牌' };
    }

    // 检查是否已经出过牌
    if (this.roundState.watcherPlayedCards.has(playerId)) {
      return { success: false, error: '已经出过牌了' };
    }

    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, error: '玩家不存在' };
    }

    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
      return { success: false, error: '卡牌不在手牌中' };
    }

    const card = player.hand[cardIndex];

    // 从手牌移除
    player.hand.splice(cardIndex, 1);

    // 记录守望玩家后出的牌
    this.roundState.watcherPlayedCards.set(playerId, card);

    // 更新playedCards，替换原来的守望牌
    this.roundState.playedCards.set(playerId, {
      ...card,
      watcherFollowUp: true,
    });
    // 记录后出牌的特殊牌效果
    if (card.type === CARD_TYPES.BLIZZARD) {
      this.roundState.blizzardPlayers.push(playerId);
    } else if (card.type === CARD_TYPES.HEALER) {
      this.roundState.healerPlayers.push(playerId);
    }

    // 检查是否所有守望玩家都出牌了
    if (this.roundState.watcherPlayedCards.size === this.roundState.watcherPlayers.length) {
      // 所有守望玩家都出牌了，进入结算阶段
      this.currentPhase = GAME_PHASES.RESOLVE;
    }

    return { success: true, state: this.getPublicState() };
  }

  /**
   * 检查是否所有守望玩家都出牌了
   */
  allWatchersPlayed() {
    return this.roundState.watcherPlayedCards.size === this.roundState.watcherPlayers.length;
  }

  /**
   * 将Healer牌放回手牌
   */
  returnHealerCardToHand(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return;

    const healerCard = this.roundState.playedCards.get(playerId);
    if (healerCard && healerCard.type === CARD_TYPES.HEALER) {
      player.hand.push(healerCard);
      this.roundState.playedCards.delete(playerId);
    }
  }

  /**
   * 治疗玩家选择要回收的牌
   */
  healerSelectRecycle(playerId, cardIds) {
    if (this.currentPhase !== GAME_PHASES.HEALER_RECYCLE) {
      return { success: false, error: '不在治疗回收阶段' };
    }

    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, error: '玩家不存在' };
    }

    const healerChoice = this.roundState.healerRecycleChoices.get(playerId);
    if (!healerChoice || !healerChoice.needsChoice) {
      return { success: false, error: '当前不需要选择回收' };
    }

    // 验证选择的牌数量
    if (cardIds.length > 2) {
      return { success: false, error: '最多只能选择2张牌' };
    }

    // 验证选择的牌是否在弃牌堆中
    const discardPile = this.deckManager.getDiscardPile(playerId);
    const validCards = cardIds.filter(cardId =>
      discardPile.some(card => card.id === cardId)
    );

    if (validCards.length !== cardIds.length) {
      return { success: false, error: '选择的牌不在弃牌堆中' };
    }

    // 回收选中的牌
    const recycled = this.deckManager.recycleSpecificCards(playerId, validCards);
    if (recycled.length > 0) {
      player.hand.push(...recycled);
    }

    // Healer卡回到手牌
    this.returnHealerCardToHand(playerId);

    // 标记已完成选择
    healerChoice.needsChoice = false;
    healerChoice.selectedCards = validCards;

    // 检查是否所有治疗玩家都完成了选择
    if (this.allHealersCompleted()) {
      // 继续结算流程
      this.currentPhase = GAME_PHASES.RESOLVE;
    }

    return {
      success: true,
      recycledCount: recycled.length,
      state: this.getPublicState()
    };
  }

  /**
   * 检查是否所有Healer玩家都完成了选择
   */
  allHealersCompleted() {
    for (const [playerId, choice] of this.roundState.healerRecycleChoices.entries()) {
      if (choice.needsChoice) {
        return false;
      }
    }
    return true;
  }

  /**
   * 阶段3: 结算 (核心逻辑)
   * 从上到下 (Level 7 -> Level 1) 依次结算
   */
  resolveRound() {
    if (this.currentPhase !== GAME_PHASES.RESOLVE) {
      return { success: false, error: '不在结算阶段' };
    }

    const resolutionLog = [];

    // 3A. 特殊牌结算
    const needsHealerChoice = this.resolveSpecialCards(resolutionLog);

    // 如果有治疗玩家需要选择回收，暂停结算
    if (needsHealerChoice) {
      this.roundState.pendingResolutionLog = resolutionLog;
      this.currentPhase = GAME_PHASES.HEALER_RECYCLE;
      return {
        success: true,
        state: this.getPublicState(),
        log: resolutionLog,
        waitingForHealer: true,
      };
    }

    // 继续结算
    return this.continueResolve(resolutionLog);
  }

  /**
   * 继续结算（治疗玩家选择完成后）
   */
  continueResolve(resolutionLog = []) {
    // 3B. 战斗结算 (从上到下)
    this.resolveCombat(resolutionLog);

    // 3C. 收集果实
    this.collectFruits(resolutionLog);

    // 3D. 法力积分
    this.awardManaPoint(resolutionLog);

    // 3E. 奖励格判定
    this.checkBonusSpaces(resolutionLog);

    // 检查游戏结束
    const gameEnded = this.checkGameEnd();

    if (gameEnded) {
      this.currentPhase = GAME_PHASES.GAME_OVER;
    } else {
      this.currentPhase = GAME_PHASES.COLLECT;
    }

    this.roundState.pendingResolutionLog = null;

    return {
      success: true,
      state: this.getPublicState(),
      log: resolutionLog,
    };
  }

  /**
   * 特殊牌结算
   * 返回是否需要等待治疗玩家选择
   */
  resolveSpecialCards(log) {
    let needsHealerChoice = false;

    // 1. Watcher: 守望玩家已经在WATCHER_PLAY阶段出牌了
    // 守望牌永久丢弃
    this.roundState.watcherPlayers.forEach(playerId => {
      const watcherCard = this.roundState.watcherPlayedCards.get(playerId);
      if (watcherCard) {
        // 守望牌永久丢弃（不进入弃牌堆，直接移除）
        log.push({
          type: 'watcher_discarded',
          playerId,
          message: 'Watcher card permanently discarded',
        });
      }
    });

    // 2. Blizzard: 丢弃所有角色牌，给打出者加分
    if (this.roundState.blizzardPlayers.length > 0) {
      let discardedCount = 0;

      this.roundState.playedCards.forEach((card, playerId) => {
        // 只丢弃角色牌（包括守望玩家后出的角色牌）
        if (card.type === CARD_TYPES.CHARACTER) {
          // 标记为被丢弃
          card.discardedByBlizzard = true;
          discardedCount++;

          // 将被丢弃的角色牌放入弃牌堆
          const player = this.players.find(p => p.id === playerId);
          if (player) {
            this.deckManager.discard(playerId, [card]);
          }
        }
      });

      if (discardedCount > 0) {
        // 每个Blizzard玩家都获得相同分数
        this.roundState.blizzardPlayers.forEach(playerId => {
          const blizzardPlayer = this.players.find(p => p.id === playerId);
          if (!blizzardPlayer) return;
          blizzardPlayer.fightPoints += discardedCount;
          blizzardPlayer.position += discardedCount;
          log.push({
            type: 'blizzard',
            playerId,
            discardedCount,
            pointsGained: discardedCount,
          });
        });
      }

      // Blizzard牌永久丢弃
      this.roundState.blizzardPlayers.forEach(playerId => {
        this.roundState.playedCards.delete(playerId);
      });
    }

    // 3. Healer: 标记需要回收的玩家
    this.roundState.healerPlayers.forEach(playerId => {
      const player = this.players.find(p => p.id === playerId);
      const discardPile = this.deckManager.getDiscardPile(playerId);

      // 判断玩家是否只有Healer这一张牌（打出后手牌为空）
      const isOnlyHealer = player.hand.length === 0;

      if (isOnlyHealer) {
        // 自动回收全部弃牌
        const recycled = this.deckManager.recycleAllFromDiscard(playerId);

        if (recycled.length > 0) {
          player.hand.push(...recycled);
        }

        // Healer卡回到手牌
        this.returnHealerCardToHand(playerId);

        log.push({
          type: 'healer',
          playerId,
          recycledCount: recycled.length,
          recycledAll: true,
        });
      } else if (discardPile.length === 0) {
        // 没有弃牌可回收，Healer卡直接回到手牌
        this.returnHealerCardToHand(playerId);

        log.push({
          type: 'healer',
          playerId,
          recycledCount: 0,
          recycledAll: false,
        });
      } else if (discardPile.length <= 2) {
        // 弃牌堆有1-2张牌，自动全部回收
        const recycled = this.deckManager.recycleFromDiscard(playerId, discardPile.length);

        if (recycled.length > 0) {
          player.hand.push(...recycled);
        }

        // Healer卡回到手牌
        this.returnHealerCardToHand(playerId);

        log.push({
          type: 'healer',
          playerId,
          recycledCount: recycled.length,
          recycledAll: true,
        });
      } else {
        // 弃牌堆有超过2张牌，需要玩家选择回收哪些牌
        this.roundState.healerRecycleChoices.set(playerId, {
          needsChoice: true,
          selectedCards: [],
          discardPile: discardPile.map(card => ({
            id: card.id,
            type: card.type,
            value: card.value,
            roleImage: card.roleImage || null,
          }))
        });

        needsHealerChoice = true;

        log.push({
          type: 'healer_pending',
          playerId,
          needsChoice: true,
          discardPileCount: discardPile.length,
        });
      }
    });

    return needsHealerChoice;
  }

  /**
   * 战斗结算 (从上到下 Level 7 -> Level 1)
   */
  resolveCombat(log) {
    // 首先，将所有打出的角色牌放置到对应的树层级
    this.roundState.playedCards.forEach((card, playerId) => {
      // 跳过被Blizzard丢弃的牌
      if (card.discardedByBlizzard) return;

      // 跳过特殊牌
      if (card.type !== CARD_TYPES.CHARACTER) return;

      // Level 7 - value = 7, Level 1 - value = 1
      // value 1 -> Level 1 (index 0), value 7 -> Level 7 (index 6)
      const levelIndex = card.value - 1; // 1->0, 2->1, ..., 7->6

      this.treeLevels[levelIndex].characters.push({
        playerId,
        card,
        isAlone: false,
      });
    });

    // 从上到下依次结算 (Level 7 -> Level 1)
    for (let level = GAME_CONFIG.TREE_LEVELS - 1; level >= 0; level--) {
      const levelData = this.treeLevels[level];
      const characters = levelData.characters;

      if (characters.length === 0) continue;

      // 标记是否为孤独角色（结算前）
      characters.forEach(char => {
        char.isAlone = characters.length === 1;
      });

      // 规则1: 同层冲突 - 如果多个角色在同一层，全部击败
      if (characters.length > 1) {
        const defeatedCount = characters.length - 1; // 击败其他人数

        characters.forEach(char => {
          const player = this.players.find(p => p.id === char.playerId);
          player.fightPoints += defeatedCount;
          player.position += defeatedCount;

          // 卡牌进入弃牌堆
          this.deckManager.discard(char.playerId, [char.card]);
        });

        // 清空该层（全部掉落）
        levelData.characters = [];

        log.push({
          type: 'conflict',
          level: level + 1,
          players: characters.map(c => c.playerId),
          pointsPerPlayer: defeatedCount,
        });
      }
      // 规则2: 上下层击落 - 孤独角色可以击败紧邻的下层角色
      else if (characters.length === 1 && level > 0) {
        const upperChar = characters[0];
        const lowerLevel = level - 1; // 下层的索引
        const lowerLevelData = this.treeLevels[lowerLevel];

        // 检查下层是否有角色（在之前的结算后）
        if (lowerLevelData.characters.length > 0) {
          // 击败下层所有角色（通常是1个，因为下层结算时会处理冲突）
          const defeatedCount = lowerLevelData.characters.length;

          // 先保存被击败的玩家ID（在清空之前）
          const defeatedIds = lowerLevelData.characters.map(c => c.playerId);

          const upperPlayer = this.players.find(p => p.id === upperChar.playerId);
          upperPlayer.fightPoints += defeatedCount;
          upperPlayer.position += defeatedCount;

          // 下层角色进入弃牌堆
          lowerLevelData.characters.forEach(lowerChar => {
            this.deckManager.discard(lowerChar.playerId, [lowerChar.card]);
          });

          // 清空下层
          lowerLevelData.characters = [];

          log.push({
            type: 'push_down',
            fromLevel: level + 1,
            toLevel: lowerLevel + 1,
            winnerId: upperChar.playerId,
            defeatedIds: defeatedIds,
            pointsGained: defeatedCount,
          });
        }
      }
    }
  }

  /**
   * 收集果实
   */
  collectFruits(log) {
    this.treeLevels.forEach((level, index) => {
      if (level.characters.length === 1 && level.fruits > 0) {
        const char = level.characters[0];
        const player = this.players.find(p => p.id === char.playerId);

        // 收集果实
        player.fruitPoints += level.fruits;
        player.position += level.fruits;

        // 果实返回储备
        this.remainingFruits += level.fruits;

        log.push({
          type: 'collect_fruit',
          playerId: char.playerId,
          level: index + 1,
          count: level.fruits,
          pointsGained: level.fruits,
        });

        // 清空该层果实
        level.fruits = 0;
      }
    });
  }

  /**
   * 法力积分 - 最低位置角色获得 (Level 1 是最低位置)
   */
  awardManaPoint(log) {
    // 找出本回合有角色在树上且位置最低的玩家
    // 最低位置 = Level 1 (index 0)，最高位置 = Level 7 (index 6)
    let lowestLevelIndex = GAME_CONFIG.TREE_LEVELS; // 初始化为最大值
    let manaPlayerId = null;

    this.treeLevels.forEach((level, index) => {
      if (level.characters.length === 1) {
        // index 0 = Level 1 (最低), index 6 = Level 7 (最高)
        // 我们要找最低位置，即最小的 index
        if (index < lowestLevelIndex) {
          lowestLevelIndex = index;
          manaPlayerId = level.characters[0].playerId;
        }
      }
    });

    if (manaPlayerId) {
      const player = this.players.find(p => p.id === manaPlayerId);
      player.manaPoints += 1;
      player.position += 1;
      this.roundState.manaPlayer = manaPlayerId;

      log.push({
        type: 'mana_point',
        playerId: manaPlayerId,
        level: lowestLevelIndex + 1,
        pointsGained: 1,
      });
    }
  }

  /**
   * 奖励格判定
   * 规则：当玩家停留在奖励格时，检查玩家是否在本回合获得了对应类型的分数
   * 如果获得了对应类型的分数，额外前进2格
   */
  checkBonusSpaces(resolutionLog) {
    // 根据结算日志统计每个玩家本回合获得的分数类型
    const pointsGained = {};
    this.players.forEach(p => {
      pointsGained[p.id] = { fruit: 0, fight: 0, mana: 0 };
    });

    // 统计resolutionLog中的分数
    resolutionLog.forEach(entry => {
      if (entry.type === 'collect_fruit' && entry.playerId) {
        pointsGained[entry.playerId].fruit += entry.count || 0;
      } else if (entry.type === 'conflict' && entry.players) {
        entry.players.forEach(pid => {
          pointsGained[pid].fight += entry.pointsPerPlayer || 0;
        });
      } else if (entry.type === 'push_down' && entry.winnerId) {
        pointsGained[entry.winnerId].fight += entry.pointsGained || 0;
      } else if (entry.type === 'blizzard' && entry.playerId) {
        pointsGained[entry.playerId].fight += entry.pointsGained || 0;
      } else if (entry.type === 'mana_point' && entry.playerId) {
        pointsGained[entry.playerId].mana += 1;
      }
    });

    this.players.forEach(player => {
      const trackSpace = this.track[player.position];
      if (trackSpace && trackSpace.bonus) {
        const gained = pointsGained[player.id][trackSpace.bonus] || 0;

        if (gained > 0) {
          // 额外前进格数由奖励格配置决定
          const bonusMove = trackSpace.bonusMove || 1;
          player.position += bonusMove;

          // 防止超出轨道
          if (player.position >= GAME_CONFIG.TRACK_LENGTH) {
            player.position = GAME_CONFIG.TRACK_LENGTH - 1;
          }

          resolutionLog.push({
            type: 'bonus_space',
            playerId: player.id,
            bonusType: trackSpace.bonus,
            bonusMove,
          });
        }
      }
    });
  }

  /**
   * 检查游戏结束
   * 规则：当玩家到达或超过轨道终点时触发游戏结束
   * 平局判定：如果多人在同一回合到达终点，位置最高（树上最高层）的玩家获胜
   */
  checkGameEnd() {
    // 找出所有到达或超过终点的玩家
    const finishers = this.players.filter(
      p => p.position >= GAME_CONFIG.TRACK_LENGTH - 1
    );

    if (finishers.length === 0) {
      return false;
    }

    if (finishers.length === 1) {
      this.winner = finishers[0].id;
      return true;
    }

    // 多人平局情况：检查树层级来确定谁位置最高（Level 7最高）
    // 由于结算顺序是自上而下，此时treeLevels应该已经被清空
    // 我们可以用分数组成来判断：战斗分更高说明在更高层战斗过
    let bestPlayer = finishers[0];
    for (const player of finishers) {
      // 优先比较战斗分（高处战斗得分更多）
      if (player.fightPoints > bestPlayer.fightPoints) {
        bestPlayer = player;
      } else if (player.fightPoints === bestPlayer.fightPoints) {
        // 战斗分相同，比较总位置
        if (player.position > bestPlayer.position) {
          bestPlayer = player;
        }
      }
    }

    this.winner = bestPlayer.id;
    return true;
  }

  /**
   * 阶段4: 回收卡牌，准备下一回合
   */
  endRound() {
    if (this.currentPhase !== GAME_PHASES.COLLECT) {
      return { success: false, error: '不在收集阶段' };
    }

    // 记录树上存活的角色卡ID，这些卡需要回收到手牌
    const survivingCardIds = new Set();

    // 回收树上角色到玩家手牌
    this.treeLevels.forEach(level => {
      level.characters.forEach(char => {
        const player = this.players.find(p => p.id === char.playerId);
        if (player) {
          player.hand.push(char.card);
          survivingCardIds.add(char.card.id);
        }
      });
      level.characters = [];
    });

    // 处理所有剩余的已出牌（只处理特殊牌和未被处理的牌）
    this.roundState.playedCards.forEach((card, playerId) => {
      // 跳过已经回收到手牌的存活角色卡
      if (survivingCardIds.has(card.id)) {
        return;
      }

      // 跳过被Blizzard丢弃的牌（已经在resolveSpecialCards中处理）
      if (card.discardedByBlizzard) {
        return;
      }

      const player = this.players.find(p => p.id === playerId);
      if (player) {
        // 治疗牌应该已经在healerSelectRecycle中回到手牌了
        // 这里只处理异常情况（理论上不应该执行到这里）
        if (card.type === CARD_TYPES.HEALER) {
          player.hand.push(card);
        }
        // 其他牌（角色牌）在战斗中已经进入弃牌堆，不需要再次处理
        // 只有守望玩家后出的角色牌可能还没处理
        else if (card.watcherFollowUp && card.type === CARD_TYPES.CHARACTER) {
          // 守望玩家后出的角色牌，如果没有在树上存活，应该已经在战斗中进入弃牌堆
          // 这里不需要额外处理
        }
      }
    });

    // 重置回合状态
    this.roundState = {
      playedCards: new Map(),
      diceResult: [],
      watcherPlayers: [],
      watcherPlayedCards: new Map(),
      blizzardPlayers: [],
      healerPlayers: [],
      healerRecycleChoices: new Map(),
      resolvedLevels: [],
      collectedFruits: new Map(),
      manaPlayer: null,
      pendingResolutionLog: null,
    };

    // 进入下一回合
    this.currentRound++;
    this.currentTurn = (this.currentTurn + 1) % this.players.length;
    this.currentPhase = GAME_PHASES.ROLL_DICE;

    return { success: true, state: this.getPublicState() };
  }

  /**
   * 获取公共游戏状态（发送给客户端）
   */
  getPublicState() {
    return {
      roomCode: this.roomCode,
      currentPhase: this.currentPhase,
      currentRound: this.currentRound,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        handCount: p.hand.length,
        discardCount: this.deckManager.getDiscardPile(p.id).length,
        discardPile: this.deckManager.getDiscardPile(p.id).map(card => ({
          id: card.id,
          type: card.type,
          value: card.value,
          roleImage: card.roleImage || null,
        })),
        position: p.position,
        score: p.score,
        fightPoints: p.fightPoints,
        fruitPoints: p.fruitPoints,
        manaPoints: p.manaPoints,
      })),
      treeLevels: this.treeLevels.map((level, index) => ({
        level: index + 1,
        fruits: level.fruits,
        characters: level.characters.map(char => ({
          playerId: char.playerId,
          cardType: char.card.type,
          cardValue: char.card.value,
          color: char.card.color,
          roleImage: char.card.roleImage || null,
        })),
      })),
      remainingFruits: this.remainingFruits,
      track: this.track,
      roundState: {
        playedCardsCount: this.roundState.playedCards.size,
        totalPlayers: this.players.length,
        diceResult: this.roundState.diceResult,
        playedPlayerIds: Array.from(this.roundState.playedCards.keys()),
        // 发送每位玩家已出的牌（隐藏具体牌面，只显示是否已出牌）
        playedCards: Array.from(this.roundState.playedCards.entries()).map(([playerId, card]) => ({
          playerId,
          cardType: card.type,
          // 角色牌显示层级信息，其他牌显示类型
          cardValue: card.value,
          roleImage: card.roleImage || null,
        })),
        // 守望玩家信息
        watcherPlayers: this.roundState.watcherPlayers,
        watcherPlayedCount: this.roundState.watcherPlayedCards.size,
        // Healer回收选择状态
        healerRecycleChoices: Array.from(this.roundState.healerRecycleChoices.entries()).map(([playerId, choice]) => ({
          playerId,
          needsChoice: choice.needsChoice,
        })),
      },
      winner: this.winner,
    };
  }

  /**
   * 获取玩家私有状态（仅发送给特定玩家）
   */
  getPrivateState(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return null;

    const healerChoice = this.roundState.healerRecycleChoices.get(playerId);

    return {
      hand: player.hand,
      discardPile: this.deckManager.getDiscardPile(playerId),
      healerRecycleChoice: healerChoice ? {
        needsChoice: healerChoice.needsChoice,
        discardPile: healerChoice.discardPile || []
      } : null,
    };
  }
}

module.exports = { GameState };
