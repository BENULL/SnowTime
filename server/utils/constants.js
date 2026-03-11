// 游戏常量配置

// 游戏配置
const GAME_CONFIG = {
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 5,
  TRACK_LENGTH: 30, // 计分轨道长度
  TOTAL_FRUITS: 15, // 果实总数
  TREE_LEVELS: 7,   // 树的层级数
  MAX_HAND_SIZE: 10, // 手牌上限
};

// 游戏阶段
const GAME_PHASES = {
  LOBBY: 'lobby',
  SETUP: 'setup',
  ROLL_DICE: 'roll_dice',      // 阶段1: 掷骰子放置果实
  PLAY_CARDS: 'play_cards',    // 阶段2: 出牌
  WATCHER_PLAY: 'watcher_play', // 阶段2.5: 守望者后出牌
  HEALER_RECYCLE: 'healer_recycle', // 阶段3.5: 治疗者选择回收
  RESOLVE: 'resolve',          // 阶段3: 结算
  COLLECT: 'collect',          // 阶段4: 收集与回收
  GAME_OVER: 'game_over',
};

// 奖励格类型
const BONUS_TYPES = {
  FRUIT: 'fruit',   // 水果奖励格
  FIGHT: 'fight',   // 战斗奖励格
  MANA: 'mana',     // 法力奖励格
};

// 卡牌类型
const CARD_TYPES = {
  CHARACTER: 'character',  // 角色牌 1-7
  HEALER: 'healer',        // 治疗者
  WATCHER: 'watcher',      // 观察者
  BLIZZARD: 'blizzard',    // 暴风雪
};

// 玩家颜色（用于区分不同玩家）
const PLAYER_COLORS = [
  '#FF6B6B', // 红色
  '#4ECDC4', // 青色
  '#FFE66D', // 黄色
  '#95E1D3', // 薄荷绿
  '#F38181', // 粉色
];

// 奖励格配置（基于设计图，30格轨道上的奖励格位置）
// 格式: { position: 格子位置(0-29), type: 奖励类型, bonusMove: 额外前进的格数 }
// 注意：position是0-based索引，文档中是1-based，需要-1
const DEFAULT_BONUS_SPACES = [
  // 法力格：4,5,6,17,18,19 (1-based) -> 3,4,5,16,17,18 (0-based)
  // 第5和18格+2，第19格+3，其余+1
  { position: 3, type: BONUS_TYPES.MANA, bonusMove: 1 },   // 4
  { position: 4, type: BONUS_TYPES.MANA, bonusMove: 2 },   // 5 (特殊)
  { position: 5, type: BONUS_TYPES.MANA, bonusMove: 1 },   // 6
  { position: 16, type: BONUS_TYPES.MANA, bonusMove: 1 },  // 17 (特殊)
  { position: 17, type: BONUS_TYPES.MANA, bonusMove: 2 },  // 18 (特殊)
  { position: 18, type: BONUS_TYPES.MANA, bonusMove: 3 },  // 19

  // 战斗格：9,10,23,24 (1-based) -> 8,9,22,23 (0-based)
  // 在10和23格+2，其余+1
  { position: 8, type: BONUS_TYPES.FIGHT, bonusMove: 1 },  // 9
  { position: 9, type: BONUS_TYPES.FIGHT, bonusMove: 2 },  // 10 (特殊)
  { position: 22, type: BONUS_TYPES.FIGHT, bonusMove: 2 }, // 23 (特殊)
  { position: 23, type: BONUS_TYPES.FIGHT, bonusMove: 1 }, // 24

  // 水果格：13,14,26,27 (1-based) -> 12,13,25,26 (0-based)
  // 在14和26格+2，其余+1
  { position: 12, type: BONUS_TYPES.FRUIT, bonusMove: 1 }, // 13
  { position: 13, type: BONUS_TYPES.FRUIT, bonusMove: 2 }, // 14 (特殊)
  { position: 25, type: BONUS_TYPES.FRUIT, bonusMove: 2 }, // 26 (特殊)
  { position: 26, type: BONUS_TYPES.FRUIT, bonusMove: 1 }, // 27
];

module.exports = {
  GAME_CONFIG,
  GAME_PHASES,
  BONUS_TYPES,
  CARD_TYPES,
  PLAYER_COLORS,
  DEFAULT_BONUS_SPACES,
};
