/**
 * Unit Tests for Pathfinding
 *
 * Tests the A* pathfinding algorithm and line-of-sight calculations:
 * - Path finding between two points
 * - Respecting wall boundaries
 * - Handling unreachable destinations
 * - Line of sight calculations
 * - Manhattan distance calculations
 */

import { GameFunctions } from '../mocks/gameExtractor.js';

describe('A* Pathfinding', () => {
  describe('findPath', () => {
    // Create a simple 5x5 test grid with known layout
    let simpleGrid;

    beforeEach(() => {
      // Simple grid with a corridor from (0,0) to (4,4)
      // Layout:
      // [S]→[ ]→[ ]→[ ]→[ ]
      //  ↓                ↓
      // [ ]  [X]  [X]  [X][ ]
      //  ↓                ↓
      // [ ]→[ ]→[ ]→[ ]→[E]
      simpleGrid = [];
      for (let y = 0; y < 5; y++) {
        simpleGrid[y] = [];
        for (let x = 0; x < 5; x++) {
          simpleGrid[y][x] = {
            walls: { top: true, right: true, bottom: true, left: true },
            minion: null,
            trap: null
          };
        }
      }

      // Open horizontal corridor at top
      for (let x = 0; x < 4; x++) {
        simpleGrid[0][x].walls.right = false;
        simpleGrid[0][x + 1].walls.left = false;
      }

      // Open vertical corridor on left
      for (let y = 0; y < 2; y++) {
        simpleGrid[y][0].walls.bottom = false;
        simpleGrid[y + 1][0].walls.top = false;
      }

      // Open horizontal corridor at y=2
      for (let x = 0; x < 4; x++) {
        simpleGrid[2][x].walls.right = false;
        simpleGrid[2][x + 1].walls.left = false;
      }

      // Open vertical corridor on right
      for (let y = 0; y < 2; y++) {
        simpleGrid[y][4].walls.bottom = false;
        simpleGrid[y + 1][4].walls.top = false;
      }
    });

    test('returns empty array when start equals goal', () => {
      const path = GameFunctions.findPath(0, 0, 0, 0, simpleGrid, 5);
      expect(path).toEqual([]);
    });

    test('finds path to adjacent cell', () => {
      const path = GameFunctions.findPath(0, 0, 1, 0, simpleGrid, 5);
      expect(path).not.toBeNull();
      expect(path.length).toBe(1);
      expect(path[0]).toEqual({ x: 1, y: 0 });
    });

    test('finds optimal path through corridor', () => {
      const path = GameFunctions.findPath(0, 0, 4, 0, simpleGrid, 5);
      expect(path).not.toBeNull();
      expect(path.length).toBe(4); // 4 steps from (0,0) to (4,0)
    });

    test('returns null when path is blocked', () => {
      // Create an isolated cell
      const isolatedGrid = [];
      for (let y = 0; y < 3; y++) {
        isolatedGrid[y] = [];
        for (let x = 0; x < 3; x++) {
          isolatedGrid[y][x] = {
            walls: { top: true, right: true, bottom: true, left: true },
            minion: null,
            trap: null
          };
        }
      }
      // Only open one path
      isolatedGrid[0][0].walls.right = false;
      isolatedGrid[0][1].walls.left = false;

      const path = GameFunctions.findPath(0, 0, 2, 2, isolatedGrid, 3);
      expect(path).toBeNull();
    });

    test('respects maxSteps limit', () => {
      // Long path in a larger grid
      const largeGrid = GameFunctions.generateMaze(20);
      const path = GameFunctions.findPath(0, 0, 19, 19, largeGrid, 20, 5);
      // Should return null or a short path due to step limit
      if (path !== null) {
        expect(path.length).toBeLessThanOrEqual(5);
      }
    });

    test('path respects wall boundaries', () => {
      const path = GameFunctions.findPath(0, 0, 4, 2, simpleGrid, 5);
      expect(path).not.toBeNull();

      // Verify each step in path is valid (no wall crossing)
      let currentX = 0, currentY = 0;
      for (const step of path) {
        const cell = simpleGrid[currentY][currentX];
        const dx = step.x - currentX;
        const dy = step.y - currentY;

        // Verify we're moving by exactly 1 cell
        expect(Math.abs(dx) + Math.abs(dy)).toBe(1);

        // Verify no wall blocks this move
        if (dx === 1) expect(cell.walls.right).toBe(false);
        if (dx === -1) expect(cell.walls.left).toBe(false);
        if (dy === 1) expect(cell.walls.bottom).toBe(false);
        if (dy === -1) expect(cell.walls.top).toBe(false);

        currentX = step.x;
        currentY = step.y;
      }
    });

    test('generates path in randomly generated maze', () => {
      const maze = GameFunctions.generateMaze(10);
      const path = GameFunctions.findPath(0, 0, 9, 9, maze, 10);

      // Maze generation guarantees connectivity, so path should exist
      expect(path).not.toBeNull();
      expect(path.length).toBeGreaterThan(0);

      // Verify path ends at goal
      const lastStep = path[path.length - 1];
      expect(lastStep).toEqual({ x: 9, y: 9 });
    });
  });

  describe('getValidMinionMoves', () => {
    test('returns empty array for cell with all walls', () => {
      const grid = [
        [{ walls: { top: true, right: true, bottom: true, left: true } }]
      ];
      const moves = GameFunctions.getValidMinionMoves(0, 0, grid, 1);
      expect(moves).toEqual([]);
    });

    test('returns correct moves based on open walls', () => {
      const grid = [
        [
          { walls: { top: true, right: false, bottom: true, left: true } },
          { walls: { top: true, right: true, bottom: true, left: false } }
        ]
      ];
      const moves = GameFunctions.getValidMinionMoves(0, 0, grid, 2);
      expect(moves).toEqual([{ x: 1, y: 0 }]);
    });

    test('respects grid boundaries', () => {
      const grid = [
        [{ walls: { top: false, right: false, bottom: false, left: false } }]
      ];
      // Even with all walls open, can't move outside grid
      const moves = GameFunctions.getValidMinionMoves(0, 0, grid, 1);
      expect(moves).toEqual([]);
    });

    test('returns all four directions when available', () => {
      const grid = [
        [
          { walls: { top: true, right: false, bottom: false, left: true } },
          { walls: { top: true, right: true, bottom: false, left: false } }
        ],
        [
          { walls: { top: false, right: false, bottom: true, left: true } },
          { walls: { top: false, right: true, bottom: true, left: false } }
        ]
      ];

      // Cell at (0,1) can move up and left
      const moves = GameFunctions.getValidMinionMoves(1, 1, grid, 2);
      expect(moves).toContainEqual({ x: 0, y: 1 });
      expect(moves).toContainEqual({ x: 1, y: 0 });
    });

    test('returns empty for invalid position', () => {
      const grid = [[{ walls: { top: true, right: true, bottom: true, left: true } }]];
      const moves = GameFunctions.getValidMinionMoves(5, 5, grid, 1);
      expect(moves).toEqual([]);
    });
  });
});

describe('Line of Sight', () => {
  describe('hasLineOfSight', () => {
    let openGrid;
    let blockedGrid;

    beforeEach(() => {
      // Open 3x3 grid (no internal walls)
      openGrid = [];
      for (let y = 0; y < 3; y++) {
        openGrid[y] = [];
        for (let x = 0; x < 3; x++) {
          openGrid[y][x] = {
            walls: {
              top: y === 0,
              right: x === 2,
              bottom: y === 2,
              left: x === 0
            }
          };
        }
      }

      // Grid with wall blocking center
      blockedGrid = [];
      for (let y = 0; y < 3; y++) {
        blockedGrid[y] = [];
        for (let x = 0; x < 3; x++) {
          blockedGrid[y][x] = {
            walls: { top: true, right: true, bottom: true, left: true }
          };
        }
      }
      // Open path around but not through center
      blockedGrid[0][0].walls.right = false;
      blockedGrid[0][1].walls.left = false;
      blockedGrid[0][1].walls.right = false;
      blockedGrid[0][2].walls.left = false;
    });

    test('returns true for same position', () => {
      expect(GameFunctions.hasLineOfSight(0, 0, 0, 0, openGrid)).toBe(true);
    });

    test('returns true for adjacent visible cell', () => {
      expect(GameFunctions.hasLineOfSight(0, 0, 1, 0, openGrid)).toBe(true);
    });

    test('returns true across open grid', () => {
      expect(GameFunctions.hasLineOfSight(0, 0, 2, 2, openGrid)).toBe(true);
    });

    test('returns false when wall blocks view', () => {
      // In blocked grid, can't see from (0,0) to (2,0) through walls
      expect(GameFunctions.hasLineOfSight(0, 0, 0, 2, blockedGrid)).toBe(false);
    });
  });

  describe('manhattanDistance', () => {
    test('returns 0 for same position', () => {
      expect(GameFunctions.manhattanDistance(5, 5, 5, 5)).toBe(0);
    });

    test('calculates horizontal distance', () => {
      expect(GameFunctions.manhattanDistance(0, 0, 5, 0)).toBe(5);
    });

    test('calculates vertical distance', () => {
      expect(GameFunctions.manhattanDistance(0, 0, 0, 7)).toBe(7);
    });

    test('calculates diagonal distance', () => {
      expect(GameFunctions.manhattanDistance(0, 0, 3, 4)).toBe(7);
    });

    test('handles negative coordinates', () => {
      expect(GameFunctions.manhattanDistance(-2, -3, 2, 3)).toBe(10);
    });
  });
});

describe('Visibility System', () => {
  describe('getVisibilityRadius', () => {
    test('returns base radius with no bonuses', () => {
      const visibility = { baseRadius: 3, tempBonus: 0, permBonus: 0 };
      expect(GameFunctions.getVisibilityRadius(visibility)).toBe(3);
    });

    test('adds temporary bonus', () => {
      const visibility = { baseRadius: 3, tempBonus: 2, permBonus: 0 };
      expect(GameFunctions.getVisibilityRadius(visibility)).toBe(5);
    });

    test('adds permanent bonus', () => {
      const visibility = { baseRadius: 3, tempBonus: 0, permBonus: 1 };
      expect(GameFunctions.getVisibilityRadius(visibility)).toBe(4);
    });

    test('adds lantern bonus', () => {
      const visibility = { baseRadius: 3, tempBonus: 0, permBonus: 0 };
      expect(GameFunctions.getVisibilityRadius(visibility, { lantern: 1 })).toBe(5);
    });

    test('adds torch bonus', () => {
      const visibility = { baseRadius: 3, tempBonus: 0, permBonus: 0 };
      expect(GameFunctions.getVisibilityRadius(visibility, { torch: 1 })).toBe(4);
    });

    test('stacks all bonuses', () => {
      const visibility = { baseRadius: 3, tempBonus: 1, permBonus: 1 };
      expect(GameFunctions.getVisibilityRadius(visibility, { lantern: 1, torch: 1 })).toBe(8);
    });

    test('minimum radius is 1', () => {
      const visibility = { baseRadius: 0, tempBonus: 0, permBonus: 0 };
      expect(GameFunctions.getVisibilityRadius(visibility)).toBe(1);
    });
  });
});
