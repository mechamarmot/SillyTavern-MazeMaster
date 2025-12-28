/**
 * Jest Setup File
 * Configures the test environment with SillyTavern mocks
 */

import { jest } from '@jest/globals';
import { mockSillyTavernAPI, resetMocks } from './mocks/sillyTavernAPI.js';

// Make jest available globally for mock files
globalThis.jest = jest;

// Set up global mocks before each test
beforeEach(() => {
  resetMocks();
  mockSillyTavernAPI();
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global test utilities
global.testUtils = {
  /**
   * Wait for a condition to be true
   */
  waitFor: async (condition, timeout = 5000) => {
    const start = Date.now();
    while (!condition()) {
      if (Date.now() - start > timeout) {
        throw new Error('waitFor timeout');
      }
      await new Promise(r => setTimeout(r, 50));
    }
  },

  /**
   * Create a mock maze state for testing
   */
  createMockMazeState: (overrides = {}) => ({
    isOpen: true,
    profile: { name: 'Test Profile', difficulty: 'Normal' },
    grid: [],
    size: 8,
    playerX: 1,
    playerY: 1,
    exitX: 6,
    exitY: 6,
    visited: new Set(),
    inventory: {},
    hp: 100,
    maxHp: 100,
    hpEnabled: true,
    equipment: { weapon: null, armor: null, accessory: null },
    visibility: { baseRadius: 3, tempBonus: 0, permBonus: 0 },
    currentFloor: 1,
    totalFloors: 1,
    floors: [],
    floorsData: [],
    movingMinions: [],
    portals: [],
    objectiveProgress: {},
    stats: {
      moves: 0,
      encountersTotal: 0,
      encountersWon: 0,
      chestsOpened: 0,
      trapsTriggered: 0,
      teleportsUsed: 0
    },
    messageLog: [],
    fairness: { consecutiveLootFails: 0, consecutiveCombatFails: 0 },
    quests: {},
    ...overrides
  }),

  /**
   * Create a mock grid cell
   */
  createMockCell: (type = 'floor', overrides = {}) => ({
    type,
    visible: false,
    explored: false,
    content: null,
    ...overrides
  }),

  /**
   * Generate a simple test grid
   */
  generateTestGrid: (size = 5) => {
    const grid = [];
    for (let y = 0; y < size; y++) {
      const row = [];
      for (let x = 0; x < size; x++) {
        // Walls on borders, floor inside
        const isWall = x === 0 || y === 0 || x === size - 1 || y === size - 1;
        row.push({
          type: isWall ? 'wall' : 'floor',
          visible: false,
          explored: false,
          content: null
        });
      }
      grid.push(row);
    }
    return grid;
  }
};
