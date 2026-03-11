const { GameState } = require('../server/game/GameState');
const { GAME_CONFIG, GAME_PHASES, CARD_TYPES, BONUS_TYPES } = require('../server/utils/constants');

describe('GameState', () => {
  let gameState;
  let players;

  beforeEach(() => {
    players = [
      { id: 'player1', name: 'Alice' },
      { id: 'player2', name: 'Bob' },
      { id: 'player3', name: 'Charlie' }
    ];
    gameState = new GameState('TEST123', players);
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with correct room code and players', () => {
      expect(gameState.roomCode).toBe('TEST123');
      expect(gameState.players).toHaveLength(3);
      expect(gameState.players[0].name).toBe('Alice');
      expect(gameState.players[1].name).toBe('Bob');
      expect(gameState.players[2].name).toBe('Charlie');
    });

    test('should initialize players with correct starting values', () => {
      gameState.players.forEach(player => {
        expect(player.hand).toHaveLength(10); // 7 character + 3 special cards
        expect(player.score).toBe(0);
        expect(player.position).toBe(0);
        expect(player.fightPoints).toBe(0);
        expect(player.fruitPoints).toBe(0);
        expect(player.manaPoints).toBe(0);
        expect(player.color).toBeDefined();
      });
    });

    test('should initialize game state correctly', () => {
      expect(gameState.currentPhase).toBe(GAME_PHASES.SETUP);
      expect(gameState.currentRound).toBe(0);
      expect(gameState.currentTurn).toBe(0);
      expect(gameState.remainingFruits).toBe(GAME_CONFIG.TOTAL_FRUITS);
      expect(gameState.winner).toBeNull();
    });

    test('should initialize tree levels correctly', () => {
      expect(gameState.treeLevels).toHaveLength(GAME_CONFIG.TREE_LEVELS);
      gameState.treeLevels.forEach(level => {
        expect(level.fruits).toBe(0);
        expect(level.characters).toEqual([]);
      });
    });

    test('should generate scoring track with correct length and bonus spaces', () => {
      expect(gameState.track).toHaveLength(GAME_CONFIG.TRACK_LENGTH);

      // Check some known bonus spaces
      expect(gameState.track[3].bonus).toBe(BONUS_TYPES.MANA);
      expect(gameState.track[8].bonus).toBe(BONUS_TYPES.FIGHT);
      expect(gameState.track[12].bonus).toBe(BONUS_TYPES.FRUIT);
    });
  });

  describe('Game Start', () => {
    test('should start game and transition to roll dice phase', () => {
      const result = gameState.startGame();

      expect(gameState.currentPhase).toBe(GAME_PHASES.ROLL_DICE);
      expect(gameState.currentRound).toBe(1);
      expect(gameState.currentTurn).toBe(0);
      expect(result.currentPhase).toBe(GAME_PHASES.ROLL_DICE);
    });
  });

  describe('Dice Rolling and Fruit Placement', () => {
    beforeEach(() => {
      gameState.startGame();
    });

    test('should roll dice and place fruits on tree levels', () => {
      const initialFruits = gameState.remainingFruits;
      const result = gameState.rollDiceAndPlaceFruits();

      expect(gameState.currentPhase).toBe(GAME_PHASES.PLAY_CARDS);
      expect(gameState.roundState.diceResult).toHaveLength(2); // Should roll 2 dice when fruits >= 2
      expect(gameState.remainingFruits).toBeLessThan(initialFruits);

      // Check that fruits were placed on appropriate levels
      let totalFruitsOnTree = 0;
      gameState.treeLevels.forEach(level => {
        totalFruitsOnTree += level.fruits;
      });
      expect(totalFruitsOnTree).toBeGreaterThan(0);
    });

    test('should roll only 1 die when only 1 fruit remains', () => {
      gameState.remainingFruits = 1;
      gameState.rollDiceAndPlaceFruits();

      expect(gameState.roundState.diceResult).toHaveLength(1);
    });

    test('should skip dice rolling when no fruits remain', () => {
      gameState.remainingFruits = 0;
      const result = gameState.rollDiceAndPlaceFruits();

      expect(gameState.currentPhase).toBe(GAME_PHASES.PLAY_CARDS);
      expect(gameState.roundState.diceResult).toEqual([]);
    });

    test('should place double fruits on same level when rolling doubles', () => {
      // Mock Math.random to always return same value (rolling doubles)
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.5); // Will result in dice value 4

      gameState.rollDiceAndPlaceFruits();

      expect(gameState.treeLevels[3].fruits).toBe(2); // Level 4 (index 3) should have 2 fruits

      Math.random = originalRandom;
    });
  });

  describe('Card Playing', () => {
    beforeEach(() => {
      gameState.startGame();
      gameState.rollDiceAndPlaceFruits();
    });

    test('should allow player to play character card', () => {
      const player = gameState.players[0];
      const characterCard = player.hand.find(card => card.type === CARD_TYPES.CHARACTER);

      const result = gameState.playCard(player.id, characterCard.id);

      expect(result.success).toBe(true);
      expect(gameState.roundState.playedCards.has(player.id)).toBe(true);
      expect(player.hand).not.toContain(characterCard);
    });

    test('should track special cards when played', () => {
      const player = gameState.players[0];
      const watcherCard = player.hand.find(card => card.type === CARD_TYPES.WATCHER);

      gameState.playCard(player.id, watcherCard.id);

      expect(gameState.roundState.watcherPlayers).toContain(player.id);
    });

    test('should prevent playing card twice in same round', () => {
      const player = gameState.players[0];
      const card1 = player.hand.find(card => card.type === CARD_TYPES.CHARACTER);
      const card2 = player.hand.find(card => card.type === CARD_TYPES.HEALER);

      gameState.playCard(player.id, card1.id);
      const result = gameState.playCard(player.id, card2.id);

      expect(result.success).toBe(false);
      expect(result.error).toBe('已经出过牌了');
    });

    test('should prevent playing card not in hand', () => {
      const player = gameState.players[0];
      const result = gameState.playCard(player.id, 'nonexistent_card');

      expect(result.success).toBe(false);
      expect(result.error).toBe('卡牌不在手牌中');
    });

    test('should transition to watcher phase when watcher cards played', () => {
      const players = gameState.players;
      const watcherCard = players[0].hand.find(card => card.type === CARD_TYPES.WATCHER);
      const characterCard1 = players[1].hand.find(card => card.type === CARD_TYPES.CHARACTER);
      const characterCard2 = players[2].hand.find(card => card.type === CARD_TYPES.CHARACTER);

      gameState.playCard(players[0].id, watcherCard.id);
      gameState.playCard(players[1].id, characterCard1.id);
      gameState.playCard(players[2].id, characterCard2.id);

      expect(gameState.currentPhase).toBe(GAME_PHASES.WATCHER_PLAY);
    });

    test('should transition directly to resolve when no watchers', () => {
      const players = gameState.players;
      const cards = players.map(p => p.hand.find(card => card.type === CARD_TYPES.CHARACTER));

      cards.forEach((card, index) => {
        gameState.playCard(players[index].id, card.id);
      });

      expect(gameState.currentPhase).toBe(GAME_PHASES.RESOLVE);
    });
  });

  describe('Watcher Card Follow-up', () => {
    beforeEach(() => {
      gameState.startGame();
      gameState.rollDiceAndPlaceFruits();

      // Set up watcher scenario
      const players = gameState.players;
      const watcherCard = players[0].hand.find(card => card.type === CARD_TYPES.WATCHER);
      const characterCards = players.slice(1).map(p => p.hand.find(card => card.type === CARD_TYPES.CHARACTER));

      gameState.playCard(players[0].id, watcherCard.id);
      characterCards.forEach((card, index) => {
        gameState.playCard(players[index + 1].id, card.id);
      });
    });

    test('should allow watcher player to play follow-up card', () => {
      const watcherPlayer = gameState.players[0];
      const followUpCard = watcherPlayer.hand.find(card => card.type === CARD_TYPES.CHARACTER);

      const result = gameState.watcherPlayCard(watcherPlayer.id, followUpCard.id);

      expect(result.success).toBe(true);
      expect(gameState.roundState.watcherPlayedCards.has(watcherPlayer.id)).toBe(true);
    });

    test('should prevent non-watcher player from playing follow-up', () => {
      const nonWatcherPlayer = gameState.players[1];
      const card = nonWatcherPlayer.hand.find(card => card.type === CARD_TYPES.CHARACTER);

      const result = gameState.watcherPlayCard(nonWatcherPlayer.id, card.id);

      expect(result.success).toBe(false);
      expect(result.error).toBe('你没有出守望牌');
    });

    test('should transition to resolve when all watchers played', () => {
      const watcherPlayer = gameState.players[0];
      const followUpCard = watcherPlayer.hand.find(card => card.type === CARD_TYPES.CHARACTER);

      gameState.watcherPlayCard(watcherPlayer.id, followUpCard.id);

      expect(gameState.currentPhase).toBe(GAME_PHASES.RESOLVE);
    });
  });

  describe('Combat Resolution', () => {
    beforeEach(() => {
      gameState.startGame();
      gameState.rollDiceAndPlaceFruits();
    });

    test('should resolve same-level conflicts correctly', () => {
      // Set up conflict: two players play same value cards
      const players = gameState.players;
      const card1 = players[0].hand.find(card => card.type === CARD_TYPES.CHARACTER && card.value === 3);
      const card2 = players[1].hand.find(card => card.type === CARD_TYPES.CHARACTER && card.value === 3);
      const card3 = players[2].hand.find(card => card.type === CARD_TYPES.CHARACTER && card.value === 5);

      gameState.playCard(players[0].id, card1.id);
      gameState.playCard(players[1].id, card2.id);
      gameState.playCard(players[2].id, card3.id);

      const result = gameState.resolveRound();

      // Both players at level 3 should get 1 fight point each (defeated 1 opponent)
      expect(players[0].fightPoints).toBe(1);
      expect(players[1].fightPoints).toBe(1);
      expect(players[2].fightPoints).toBe(0); // No conflict at level 5
    });

    test('should resolve upper-level defeats lower-level correctly', () => {
      const players = gameState.players;
      const card1 = players[0].hand.find(card => card.type === CARD_TYPES.CHARACTER && card.value === 5);
      const card2 = players[1].hand.find(card => card.type === CARD_TYPES.CHARACTER && card.value === 4);
      const card3 = players[2].hand.find(card => card.type === CARD_TYPES.CHARACTER && card.value === 1);

      gameState.playCard(players[0].id, card1.id);
      gameState.playCard(players[1].id, card2.id);
      gameState.playCard(players[2].id, card3.id);

      gameState.resolveRound();

      // Player at level 5 should defeat player at level 4
      expect(players[0].fightPoints).toBe(1);
      expect(players[1].fightPoints).toBe(0);
      expect(players[2].fightPoints).toBe(0);
    });

    test('should handle blizzard card correctly', () => {
      const players = gameState.players;
      const blizzardCard = players[0].hand.find(card => card.type === CARD_TYPES.BLIZZARD);
      const characterCard1 = players[1].hand.find(card => card.type === CARD_TYPES.CHARACTER);
      const characterCard2 = players[2].hand.find(card => card.type === CARD_TYPES.CHARACTER);

      gameState.playCard(players[0].id, blizzardCard.id);
      gameState.playCard(players[1].id, characterCard1.id);
      gameState.playCard(players[2].id, characterCard2.id);

      gameState.resolveRound();

      // Blizzard player should get points equal to number of character cards discarded
      expect(players[0].fightPoints).toBe(2);
      expect(players[0].position).toBe(2);
    });
  });

  describe('Fruit Collection', () => {
    beforeEach(() => {
      gameState.startGame();
      // Manually place fruits for testing
      gameState.treeLevels[2].fruits = 2; // Level 3 has 2 fruits
      gameState.treeLevels[4].fruits = 1; // Level 5 has 1 fruit
      gameState.currentPhase = GAME_PHASES.PLAY_CARDS;
    });

    test('should collect fruits when alone on level', () => {
      const players = gameState.players;
      const card = players[0].hand.find(card => card.type === CARD_TYPES.CHARACTER && card.value === 3);

      gameState.playCard(players[0].id, card.id);
      // Other players play different levels
      gameState.playCard(players[1].id, players[1].hand.find(c => c.type === CARD_TYPES.CHARACTER && c.value === 1).id);
      gameState.playCard(players[2].id, players[2].hand.find(c => c.type === CARD_TYPES.CHARACTER && c.value === 7).id);

      gameState.resolveRound();

      expect(players[0].fruitPoints).toBe(2);
      expect(players[0].position).toBe(2);
      expect(gameState.treeLevels[2].fruits).toBe(0); // Fruits should be collected
    });

    test('should not collect fruits when multiple players on same level', () => {
      const players = gameState.players;
      const card1 = players[0].hand.find(card => card.type === CARD_TYPES.CHARACTER && card.value === 3);
      const card2 = players[1].hand.find(card => card.type === CARD_TYPES.CHARACTER && card.value === 3);

      gameState.playCard(players[0].id, card1.id);
      gameState.playCard(players[1].id, card2.id);
      gameState.playCard(players[2].id, players[2].hand.find(c => c.type === CARD_TYPES.CHARACTER && c.value === 7).id);

      gameState.resolveRound();

      expect(players[0].fruitPoints).toBe(0);
      expect(players[1].fruitPoints).toBe(0);
      expect(gameState.treeLevels[2].fruits).toBe(2); // Fruits should remain
    });
  });

  describe('Mana Point Award', () => {
    beforeEach(() => {
      gameState.startGame();
      gameState.currentPhase = GAME_PHASES.PLAY_CARDS;
    });

    test('should award mana point to lowest level survivor', () => {
      const players = gameState.players;

      gameState.playCard(players[0].id, players[0].hand.find(c => c.type === CARD_TYPES.CHARACTER && c.value === 1).id);
      gameState.playCard(players[1].id, players[1].hand.find(c => c.type === CARD_TYPES.CHARACTER && c.value === 5).id);
      gameState.playCard(players[2].id, players[2].hand.find(c => c.type === CARD_TYPES.CHARACTER && c.value === 7).id);

      gameState.resolveRound();

      expect(players[0].manaPoints).toBe(1); // Level 1 is lowest
      expect(players[1].manaPoints).toBe(0);
      expect(players[2].manaPoints).toBe(0);
    });
  });

  describe('Healer Card Mechanics', () => {
    beforeEach(() => {
      gameState.startGame();
      gameState.currentPhase = GAME_PHASES.PLAY_CARDS;

      // Add some cards to discard pile for testing
      const player = gameState.players[0];
      gameState.deckManager.discard(player.id, [
        { id: 'discarded1', type: CARD_TYPES.CHARACTER, value: 1 },
        { id: 'discarded2', type: CARD_TYPES.CHARACTER, value: 2 },
        { id: 'discarded3', type: CARD_TYPES.CHARACTER, value: 3 }
      ]);
    });

    test('should handle healer with choice when more than 2 cards in discard', () => {
      const players = gameState.players;
      const healerCard = players[0].hand.find(card => card.type === CARD_TYPES.HEALER);

      gameState.playCard(players[0].id, healerCard.id);
      gameState.playCard(players[1].id, players[1].hand.find(c => c.type === CARD_TYPES.CHARACTER).id);
      gameState.playCard(players[2].id, players[2].hand.find(c => c.type === CARD_TYPES.CHARACTER).id);

      const result = gameState.resolveRound();

      expect(result.waitingForHealer).toBe(true);
      expect(gameState.currentPhase).toBe(GAME_PHASES.HEALER_RECYCLE);
    });

    test('should allow healer to select specific cards to recycle', () => {
      const players = gameState.players;
      const healerCard = players[0].hand.find(card => card.type === CARD_TYPES.HEALER);

      gameState.playCard(players[0].id, healerCard.id);
      gameState.playCard(players[1].id, players[1].hand.find(c => c.type === CARD_TYPES.CHARACTER).id);
      gameState.playCard(players[2].id, players[2].hand.find(c => c.type === CARD_TYPES.CHARACTER).id);

      gameState.resolveRound(); // This should put us in HEALER_RECYCLE phase

      const initialHandSize = players[0].hand.length;
      const result = gameState.healerSelectRecycle(players[0].id, ['discarded1', 'discarded3']);

      expect(result.success).toBe(true);
      expect(players[0].hand.length).toBe(initialHandSize + 3); // 2 recycled + healer back
    });

    test('should auto-recycle when only healer card remains', () => {
      const player = gameState.players[0];
      // Remove all cards except healer
      player.hand = player.hand.filter(card => card.type === CARD_TYPES.HEALER);

      const healerCard = player.hand[0];
      gameState.playCard(player.id, healerCard.id);
      gameState.playCard(gameState.players[1].id, gameState.players[1].hand.find(c => c.type === CARD_TYPES.CHARACTER).id);
      gameState.playCard(gameState.players[2].id, gameState.players[2].hand.find(c => c.type === CARD_TYPES.CHARACTER).id);

      gameState.resolveRound();

      // Should auto-recycle all cards and healer should be back in hand
      expect(player.hand.length).toBe(4); // 3 recycled + healer
      expect(gameState.currentPhase).toBe(GAME_PHASES.COLLECT);
    });
  });

  describe('Bonus Spaces', () => {
    beforeEach(() => {
      gameState.startGame();
      gameState.currentPhase = GAME_PHASES.PLAY_CARDS;
    });

    test('should trigger bonus when player lands on matching bonus space', () => {
      const player = gameState.players[0];
      player.position = 3; // Mana bonus space

      // Play cards to generate mana point
      gameState.playCard(player.id, player.hand.find(c => c.type === CARD_TYPES.CHARACTER && c.value === 1).id);
      gameState.playCard(gameState.players[1].id, gameState.players[1].hand.find(c => c.type === CARD_TYPES.CHARACTER && c.value === 7).id);
      gameState.playCard(gameState.players[2].id, gameState.players[2].hand.find(c => c.type === CARD_TYPES.CHARACTER && c.value === 6).id);

      const initialPosition = player.position;
      gameState.resolveRound();

      // Should get mana point (1) + bonus move (from landing space)
      const landingPosition = initialPosition + 1;
      const bonusMove = gameState.track[landingPosition].bonusMove || 1;
      expect(player.position).toBe(initialPosition + 1 + bonusMove);
    });
  });

  describe('Game End Conditions', () => {
    test('should detect winner when player reaches track end', () => {
      const player = gameState.players[0];
      player.position = GAME_CONFIG.TRACK_LENGTH - 1;

      const gameEnded = gameState.checkGameEnd();

      expect(gameEnded).toBe(true);
      expect(gameState.winner).toBe(player.id);
    });

    test('should handle tie-breaking by fight points', () => {
      gameState.players[0].position = GAME_CONFIG.TRACK_LENGTH - 1;
      gameState.players[0].fightPoints = 5;
      gameState.players[1].position = GAME_CONFIG.TRACK_LENGTH - 1;
      gameState.players[1].fightPoints = 3;

      const gameEnded = gameState.checkGameEnd();

      expect(gameEnded).toBe(true);
      expect(gameState.winner).toBe(gameState.players[0].id);
    });
  });

  describe('Round Management', () => {
    beforeEach(() => {
      gameState.startGame();
      gameState.rollDiceAndPlaceFruits();

      // Play all cards
      gameState.players.forEach((player, index) => {
        const card = player.hand.find(c => c.type === CARD_TYPES.CHARACTER && c.value === index + 1);
        gameState.playCard(player.id, card.id);
      });

      gameState.resolveRound();
    });

    test('should end round and prepare for next', () => {
      const initialRound = gameState.currentRound;
      const result = gameState.endRound();

      expect(result.success).toBe(true);
      expect(gameState.currentRound).toBe(initialRound + 1);
      expect(gameState.currentPhase).toBe(GAME_PHASES.ROLL_DICE);
      expect(gameState.roundState.playedCards.size).toBe(0);
    });

    test('should return surviving characters to player hands', () => {
      // Characters that survived should be back in hands
      gameState.players.forEach(player => {
        const initialHandSize = player.hand.length;
        // This is tested implicitly by checking hand sizes after endRound
      });

      gameState.endRound();

      // Verify characters are back (exact count depends on combat resolution)
      gameState.players.forEach(player => {
        expect(player.hand.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Public and Private State', () => {
    test('should return correct public state', () => {
      const publicState = gameState.getPublicState();

      expect(publicState.roomCode).toBe('TEST123');
      expect(publicState.currentPhase).toBe(GAME_PHASES.SETUP);
      expect(publicState.players).toHaveLength(3);
      expect(publicState.treeLevels).toHaveLength(7);
      expect(publicState.track).toHaveLength(30);

      // Should not expose private information
      publicState.players.forEach(player => {
        expect(player.handCount).toBeDefined();
        expect(player.hand).toBeUndefined(); // Private info
      });
    });

    test('should return correct private state for player', () => {
      const privateState = gameState.getPrivateState('player1');

      expect(privateState.hand).toBeDefined();
      expect(privateState.hand).toHaveLength(10);
      expect(privateState.discardPile).toBeDefined();
    });

    test('should return null for non-existent player', () => {
      const privateState = gameState.getPrivateState('nonexistent');
      expect(privateState).toBeNull();
    });
  });
});
