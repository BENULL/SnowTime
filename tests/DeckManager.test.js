const { DeckManager } = require('../server/game/DeckManager');
const { CARD_TYPES } = require('../server/utils/constants');

describe('DeckManager', () => {
  let deckManager;

  beforeEach(() => {
    deckManager = new DeckManager();
  });

  describe('Constructor and Reset', () => {
    test('should initialize with empty discard piles', () => {
      expect(deckManager.discardPiles).toBeInstanceOf(Map);
      expect(deckManager.discardPiles.size).toBe(0);
    });

    test('should reset discard piles', () => {
      deckManager.discardPiles.set('player1', [{ id: 'test' }]);
      deckManager.reset();
      expect(deckManager.discardPiles.size).toBe(0);
    });
  });

  describe('Player Deck Creation', () => {
    test('should create complete deck with 10 cards for player', () => {
      const playerId = 'player1';
      const colorIndex = 0;
      const deck = deckManager.createPlayerDeck(playerId, colorIndex);

      expect(deck).toHaveLength(10);
      expect(deckManager.discardPiles.has(playerId)).toBe(true);
      expect(deckManager.discardPiles.get(playerId)).toEqual([]);
    });

    test('should create 7 character cards with values 1-7', () => {
      const deck = deckManager.createPlayerDeck('player1', 0);
      const characterCards = deck.filter(card => card.type === CARD_TYPES.CHARACTER);

      expect(characterCards).toHaveLength(7);

      for (let i = 1; i <= 7; i++) {
        const card = characterCards.find(c => c.value === i);
        expect(card).toBeDefined();
        expect(card.type).toBe(CARD_TYPES.CHARACTER);
        expect(card.ownerId).toBe('player1');
        expect(card.color).toBe('#FF6B6B'); // First color
      }
    });

    test('should create exactly 3 special cards', () => {
      const deck = deckManager.createPlayerDeck('player1', 0);

      const healerCards = deck.filter(card => card.type === CARD_TYPES.HEALER);
      const watcherCards = deck.filter(card => card.type === CARD_TYPES.WATCHER);
      const blizzardCards = deck.filter(card => card.type === CARD_TYPES.BLIZZARD);

      expect(healerCards).toHaveLength(1);
      expect(watcherCards).toHaveLength(1);
      expect(blizzardCards).toHaveLength(1);

      // Verify special cards have correct properties
      expect(healerCards[0].ownerId).toBe('player1');
      expect(watcherCards[0].ownerId).toBe('player1');
      expect(blizzardCards[0].ownerId).toBe('player1');
    });

    test('should assign unique card IDs', () => {
      const deck = deckManager.createPlayerDeck('player1', 0);
      const cardIds = deck.map(card => card.id);
      const uniqueIds = new Set(cardIds);

      expect(uniqueIds.size).toBe(cardIds.length);
    });

    test('should assign correct colors based on color index', () => {
      const colors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#F38181'];

      for (let i = 0; i < colors.length; i++) {
        const deck = deckManager.createPlayerDeck(`player${i}`, i);
        deck.forEach(card => {
          expect(card.color).toBe(colors[i]);
        });
      }
    });

    test('should cycle colors when index exceeds available colors', () => {
      const deck = deckManager.createPlayerDeck('player6', 5);
      deck.forEach(card => {
        expect(card.color).toBe('#FF6B6B'); // Should wrap to first color
      });
    });
  });

  describe('Player Color Assignment', () => {
    test('should return correct color for valid indices', () => {
      expect(deckManager.getPlayerColor(0)).toBe('#FF6B6B');
      expect(deckManager.getPlayerColor(1)).toBe('#4ECDC4');
      expect(deckManager.getPlayerColor(2)).toBe('#FFE66D');
      expect(deckManager.getPlayerColor(3)).toBe('#95E1D3');
      expect(deckManager.getPlayerColor(4)).toBe('#F38181');
    });

    test('should cycle colors for indices beyond array length', () => {
      expect(deckManager.getPlayerColor(5)).toBe('#FF6B6B');
      expect(deckManager.getPlayerColor(6)).toBe('#4ECDC4');
      expect(deckManager.getPlayerColor(10)).toBe('#FF6B6B');
    });
  });

  describe('Discard Functionality', () => {
    beforeEach(() => {
      deckManager.createPlayerDeck('player1', 0);
    });

    test('should add cards to player discard pile', () => {
      const cards = [
        { id: 'card1', type: CARD_TYPES.CHARACTER, value: 1 },
        { id: 'card2', type: CARD_TYPES.CHARACTER, value: 2 }
      ];

      deckManager.discard('player1', cards);
      const discardPile = deckManager.getDiscardPile('player1');

      expect(discardPile).toHaveLength(2);
      expect(discardPile).toContain(cards[0]);
      expect(discardPile).toContain(cards[1]);
    });

    test('should handle multiple discard operations', () => {
      const cards1 = [{ id: 'card1', type: CARD_TYPES.CHARACTER, value: 1 }];
      const cards2 = [{ id: 'card2', type: CARD_TYPES.CHARACTER, value: 2 }];

      deckManager.discard('player1', cards1);
      deckManager.discard('player1', cards2);

      const discardPile = deckManager.getDiscardPile('player1');
      expect(discardPile).toHaveLength(2);
    });

    test('should create discard pile for new player if not exists', () => {
      const cards = [{ id: 'card1', type: CARD_TYPES.CHARACTER, value: 1 }];

      deckManager.discard('newPlayer', cards);
      const discardPile = deckManager.getDiscardPile('newPlayer');

      expect(discardPile).toHaveLength(1);
      expect(discardPile[0]).toBe(cards[0]);
    });
  });

  describe('Recycle from Discard - Count Based', () => {
    beforeEach(() => {
      deckManager.createPlayerDeck('player1', 0);
      // Add some cards to discard pile
      const cards = [
        { id: 'card1', type: CARD_TYPES.CHARACTER, value: 1 },
        { id: 'card2', type: CARD_TYPES.CHARACTER, value: 2 },
        { id: 'card3', type: CARD_TYPES.CHARACTER, value: 3 },
        { id: 'card4', type: CARD_TYPES.CHARACTER, value: 4 }
      ];
      deckManager.discard('player1', cards);
    });

    test('should recycle last 2 cards by default', () => {
      const recycled = deckManager.recycleFromDiscard('player1');
      const remaining = deckManager.getDiscardPile('player1');

      expect(recycled).toHaveLength(2);
      expect(remaining).toHaveLength(2);
      expect(recycled[0].id).toBe('card3');
      expect(recycled[1].id).toBe('card4');
    });

    test('should recycle specified number of cards', () => {
      const recycled = deckManager.recycleFromDiscard('player1', 3);
      const remaining = deckManager.getDiscardPile('player1');

      expect(recycled).toHaveLength(3);
      expect(remaining).toHaveLength(1);
      expect(recycled[0].id).toBe('card2');
      expect(recycled[1].id).toBe('card3');
      expect(recycled[2].id).toBe('card4');
    });

    test('should handle recycling more cards than available', () => {
      const recycled = deckManager.recycleFromDiscard('player1', 10);
      const remaining = deckManager.getDiscardPile('player1');

      expect(recycled).toHaveLength(4);
      expect(remaining).toHaveLength(0);
    });

    test('should return empty array for empty discard pile', () => {
      const recycled = deckManager.recycleFromDiscard('emptyPlayer');
      expect(recycled).toEqual([]);
    });
  });

  describe('Recycle Specific Cards', () => {
    beforeEach(() => {
      deckManager.createPlayerDeck('player1', 0);
      const cards = [
        { id: 'card1', type: CARD_TYPES.CHARACTER, value: 1 },
        { id: 'card2', type: CARD_TYPES.HEALER },
        { id: 'card3', type: CARD_TYPES.CHARACTER, value: 3 }
      ];
      deckManager.discard('player1', cards);
    });

    test('should recycle specific cards by ID', () => {
      const recycled = deckManager.recycleSpecificCards('player1', ['card1', 'card3']);
      const remaining = deckManager.getDiscardPile('player1');

      expect(recycled).toHaveLength(2);
      expect(remaining).toHaveLength(1);
      expect(recycled.find(c => c.id === 'card1')).toBeDefined();
      expect(recycled.find(c => c.id === 'card3')).toBeDefined();
      expect(remaining[0].id).toBe('card2');
    });

    test('should handle non-existent card IDs gracefully', () => {
      const recycled = deckManager.recycleSpecificCards('player1', ['card1', 'nonexistent']);
      const remaining = deckManager.getDiscardPile('player1');

      expect(recycled).toHaveLength(1);
      expect(remaining).toHaveLength(2);
      expect(recycled[0].id).toBe('card1');
    });

    test('should return empty array for empty card ID list', () => {
      const recycled = deckManager.recycleSpecificCards('player1', []);
      const remaining = deckManager.getDiscardPile('player1');

      expect(recycled).toEqual([]);
      expect(remaining).toHaveLength(3);
    });
  });

  describe('Recycle All from Discard', () => {
    beforeEach(() => {
      deckManager.createPlayerDeck('player1', 0);
      const cards = [
        { id: 'card1', type: CARD_TYPES.CHARACTER, value: 1 },
        { id: 'card2', type: CARD_TYPES.HEALER },
        { id: 'card3', type: CARD_TYPES.CHARACTER, value: 3 }
      ];
      deckManager.discard('player1', cards);
    });

    test('should recycle all cards from discard pile', () => {
      const recycled = deckManager.recycleAllFromDiscard('player1');
      const remaining = deckManager.getDiscardPile('player1');

      expect(recycled).toHaveLength(3);
      expect(remaining).toHaveLength(0);
      expect(recycled.find(c => c.id === 'card1')).toBeDefined();
      expect(recycled.find(c => c.id === 'card2')).toBeDefined();
      expect(recycled.find(c => c.id === 'card3')).toBeDefined();
    });

    test('should return empty array for empty discard pile', () => {
      const recycled = deckManager.recycleAllFromDiscard('emptyPlayer');
      expect(recycled).toEqual([]);
    });

    test('should preserve card order when recycling all', () => {
      const recycled = deckManager.recycleAllFromDiscard('player1');

      expect(recycled[0].id).toBe('card1');
      expect(recycled[1].id).toBe('card2');
      expect(recycled[2].id).toBe('card3');
    });
  });

  describe('Get Discard Pile', () => {
    test('should return empty array for non-existent player', () => {
      const discardPile = deckManager.getDiscardPile('nonexistent');
      expect(discardPile).toEqual([]);
    });

    test('should return correct discard pile for existing player', () => {
      deckManager.createPlayerDeck('player1', 0);
      const cards = [{ id: 'card1', type: CARD_TYPES.CHARACTER, value: 1 }];
      deckManager.discard('player1', cards);

      const discardPile = deckManager.getDiscardPile('player1');
      expect(discardPile).toEqual(cards);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle undefined or null player IDs gracefully', () => {
      expect(() => deckManager.createPlayerDeck(null, 0)).not.toThrow();
      expect(() => deckManager.discard(undefined, [])).not.toThrow();
      expect(deckManager.getDiscardPile(null)).toEqual([]);
    });

    test('should handle negative color indices', () => {
      const color = deckManager.getPlayerColor(-1);
      // JavaScript modulo with negative numbers returns NaN, colors[NaN] is undefined
      expect(color).toBeUndefined();
    });

    test('should handle empty cards array in discard', () => {
      deckManager.createPlayerDeck('player1', 0);
      deckManager.discard('player1', []);

      const discardPile = deckManager.getDiscardPile('player1');
      expect(discardPile).toEqual([]);
    });
  });
});