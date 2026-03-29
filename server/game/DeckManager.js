const { CARD_TYPES } = require('../utils/constants');

// 牌组管理器 - 负责生成和管理玩家手牌
class DeckManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.discardPiles = new Map(); // playerId -> cards[]
  }

  // 为玩家生成初始手牌
  createPlayerDeck(playerId, colorIndex) {
    const hand = [];
    const color = this.getPlayerColor(colorIndex);
    const roleImage = this.getRoleImage(colorIndex);

    // 7张角色牌 (数字1-7)
    for (let i = 1; i <= 7; i++) {
      hand.push({
        id: `${playerId}_char_${i}`,
        type: CARD_TYPES.CHARACTER,
        value: i,
        ownerId: playerId,
        color: color,
        roleImage: roleImage,
      });
    }

    // 3张特殊牌
    hand.push({
      id: `${playerId}_healer`,
      type: CARD_TYPES.HEALER,
      ownerId: playerId,
      color: color,
      roleImage: roleImage,
    });

    hand.push({
      id: `${playerId}_watcher`,
      type: CARD_TYPES.WATCHER,
      ownerId: playerId,
      color: color,
      roleImage: roleImage,
    });

    hand.push({
      id: `${playerId}_blizzard`,
      type: CARD_TYPES.BLIZZARD,
      ownerId: playerId,
      color: color,
      roleImage: roleImage,
    });

    // 初始化该玩家的弃牌堆
    this.discardPiles.set(playerId, []);

    return hand;
  }

  // 获取玩家颜色
  getPlayerColor(index) {
    const colors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#F38181'];
    return colors[index % colors.length];
  }

  // 获取玩家角色图片路径
  getRoleImage(index) {
    const roleCount = 5;
    const roleIndex = (index % roleCount) + 1;
    return `/assets/role${roleIndex}.png`;
  }

  // 弃牌
  discard(playerId, cards) {
    const discardPile = this.discardPiles.get(playerId) || [];
    discardPile.push(...cards);
    this.discardPiles.set(playerId, discardPile);
  }

  // 从弃牌堆回收卡牌到手中（Healer效果）
  recycleFromDiscard(playerId, count = 2) {
    const discardPile = this.discardPiles.get(playerId) || [];
    const recycled = discardPile.splice(-count, count);
    this.discardPiles.set(playerId, discardPile);
    return recycled;
  }

  // 从弃牌堆回收指定的卡牌（Healer效果 - 玩家选择）
  recycleSpecificCards(playerId, cardIds) {
    const discardPile = this.discardPiles.get(playerId) || [];
    const recycled = [];

    // 从弃牌堆中移除指定的卡牌
    cardIds.forEach(cardId => {
      const index = discardPile.findIndex(card => card.id === cardId);
      if (index !== -1) {
        recycled.push(discardPile.splice(index, 1)[0]);
      }
    });

    this.discardPiles.set(playerId, discardPile);
    return recycled;
  }

  // 从弃牌堆回收所有卡牌（Healer特殊效果：当玩家只有Healer时）
  recycleAllFromDiscard(playerId) {
    const discardPile = this.discardPiles.get(playerId) || [];
    const allCards = [...discardPile];
    this.discardPiles.set(playerId, []);
    return allCards;
  }

  // 获取玩家弃牌堆
  getDiscardPile(playerId) {
    return this.discardPiles.get(playerId) || [];
  }
}

module.exports = { DeckManager };
