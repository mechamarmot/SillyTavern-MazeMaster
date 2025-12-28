/**
 * Integration Tests for Maze Gameplay
 *
 * Tests the interaction between multiple game systems:
 * - Maze generation + pathfinding
 * - Player movement + visibility
 * - Combat + HP system
 * - Items + inventory
 * - Minion AI + encounters
 */

import { GameFunctions } from '../mocks/gameExtractor.js';

describe('Maze Gameplay Integration', () => {
  describe('Maze + Pathfinding', () => {
    test('generated maze always has path from start to exit', () => {
      // Test multiple maze sizes
      const sizes = [6, 8, 10, 12, 14, 16];

      for (const size of sizes) {
        const grid = GameFunctions.generateMaze(size);
        const path = GameFunctions.findPath(0, 0, size - 1, size - 1, grid, size);

        expect(path).not.toBeNull();
        expect(path.length).toBeGreaterThan(0);

        // Verify path reaches exit
        const lastStep = path[path.length - 1];
        expect(lastStep).toEqual({ x: size - 1, y: size - 1 });
      }
    });

    test('path length is reasonable for grid size', () => {
      const size = 10;
      const grid = GameFunctions.generateMaze(size);
      const path = GameFunctions.findPath(0, 0, size - 1, size - 1, grid, size);

      // Minimum path is diagonal: (size-1) * 2 = 18 for size 10
      // Maximum is visiting all cells: size * size - 1 = 99
      // Typical maze should be somewhere in between
      expect(path.length).toBeGreaterThanOrEqual((size - 1) * 2);
      expect(path.length).toBeLessThan(size * size);
    });

    test('minion can pathfind to any reachable cell', () => {
      const size = 8;
      const grid = GameFunctions.generateMaze(size);

      // Test pathfinding from corners
      const corners = [
        { from: { x: 0, y: 0 }, to: { x: 7, y: 7 } },
        { from: { x: 7, y: 0 }, to: { x: 0, y: 7 } },
        { from: { x: 0, y: 7 }, to: { x: 7, y: 0 } },
        { from: { x: 7, y: 7 }, to: { x: 0, y: 0 } }
      ];

      for (const { from, to } of corners) {
        const path = GameFunctions.findPath(from.x, from.y, to.x, to.y, grid, size);
        expect(path).not.toBeNull();
      }
    });
  });

  describe('Movement + Visibility', () => {
    test('player visibility updates correctly on move', () => {
      const visibility = { baseRadius: 3, tempBonus: 0, permBonus: 0 };
      const items = {};

      // Get initial visibility
      const radius1 = GameFunctions.getVisibilityRadius(visibility, items);
      expect(radius1).toBe(3);

      // Add torch
      items.torch = 1;
      const radius2 = GameFunctions.getVisibilityRadius(visibility, items);
      expect(radius2).toBe(4);

      // Add lantern
      items.lantern = 1;
      const radius3 = GameFunctions.getVisibilityRadius(visibility, items);
      expect(radius3).toBe(6);
    });

    test('valid moves respect maze walls', () => {
      const grid = GameFunctions.generateMaze(8);

      // Check that getValidMinionMoves only returns cells without blocking walls
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const moves = GameFunctions.getValidMinionMoves(x, y, grid, 8);

          for (const move of moves) {
            const dx = move.x - x;
            const dy = move.y - y;

            // Each move should be exactly 1 step
            expect(Math.abs(dx) + Math.abs(dy)).toBe(1);

            // The corresponding wall should be open
            const cell = grid[y][x];
            if (dx === 1) expect(cell.walls.right).toBe(false);
            if (dx === -1) expect(cell.walls.left).toBe(false);
            if (dy === 1) expect(cell.walls.bottom).toBe(false);
            if (dy === -1) expect(cell.walls.top).toBe(false);
          }
        }
      }
    });
  });

  describe('Combat + HP System', () => {
    test('damage reduces HP correctly', () => {
      let currentHp = 100;
      const maxHp = 100;

      // Take damage
      const damage = GameFunctions.calculateDamage(30);
      currentHp -= damage;
      expect(currentHp).toBe(70);

      // Take more damage with blocking
      const blockedDamage = GameFunctions.calculateDamage(40, { blocking: true });
      currentHp -= blockedDamage;
      expect(currentHp).toBe(50); // 70 - 20 (50% block)
    });

    test('healing respects max HP', () => {
      let currentHp = 60;
      const maxHp = 100;

      // Heal
      const healing = GameFunctions.calculateHealing(30, { maxHp, currentHp });
      currentHp += healing;
      expect(currentHp).toBe(90);

      // Try to overheal
      const healing2 = GameFunctions.calculateHealing(50, { maxHp, currentHp });
      currentHp += healing2;
      expect(currentHp).toBe(100); // Capped at max
    });

    test('combo system increases damage progressively', () => {
      const baseDamage = 100;
      const damages = [];

      for (let combo = 0; combo <= 12; combo++) {
        damages.push(GameFunctions.calculateDamage(baseDamage, { comboBonus: combo }));
      }

      // Each combo should increase damage (up to cap)
      for (let i = 1; i < 10; i++) {
        expect(damages[i]).toBeGreaterThan(damages[i - 1]);
      }

      // After cap (10 hits), damage should plateau
      expect(damages[10]).toBe(damages[11]);
      expect(damages[11]).toBe(damages[12]);
    });

    test('critical hit + blocking interaction', () => {
      const baseDamage = 100;

      // Critical hit alone
      const crit = GameFunctions.calculateDamage(baseDamage, { criticalHit: true });
      expect(crit).toBe(150);

      // Blocked critical
      const blockedCrit = GameFunctions.calculateDamage(baseDamage, {
        criticalHit: true,
        blocking: true
      });
      expect(blockedCrit).toBe(75); // 150 * 0.5
    });

    test('damage reduction stacks with blocking', () => {
      const baseDamage = 100;

      const result = GameFunctions.calculateDamage(baseDamage, {
        blocking: true,       // 50% reduction
        damageReduction: 0.2  // 20% reduction
      });

      // 100 * 0.5 (block) * 0.8 (reduction) = 40
      expect(result).toBe(40);
    });
  });

  describe('Battlebar Difficulty Scaling', () => {
    test('difficulty tiers match expected ranges', () => {
      // Tutorial tier (difficulty ~2)
      const tutorial = GameFunctions.getBattlebarDifficultySettings(2, 0.6);
      expect(tutorial.zoneWidth).toBeGreaterThan(0.4);

      // Normal tier (difficulty 5)
      const normal = GameFunctions.getBattlebarDifficultySettings(5, 1.0);
      expect(normal.zoneWidth).toBeGreaterThan(0.2);
      expect(normal.zoneWidth).toBeLessThan(0.35);

      // Nightmare tier (difficulty ~8)
      const nightmare = GameFunctions.getBattlebarDifficultySettings(8, 1.4);
      expect(nightmare.zoneWidth).toBeLessThan(0.15);
    });

    test('multiplier affects both zone and speed', () => {
      const base = GameFunctions.getBattlebarDifficultySettings(5, 1.0);
      const hard = GameFunctions.getBattlebarDifficultySettings(5, 1.5);
      const easy = GameFunctions.getBattlebarDifficultySettings(5, 0.5);

      // Hard should be faster and smaller zone
      expect(hard.traverseTime).toBeLessThan(base.traverseTime);
      expect(hard.zoneWidth).toBeLessThan(base.zoneWidth);

      // Easy should be slower and larger zone
      expect(easy.traverseTime).toBeGreaterThan(base.traverseTime);
      expect(easy.zoneWidth).toBeGreaterThan(base.zoneWidth);
    });
  });

  describe('Minion AI Integration', () => {
    test('minion can navigate maze to reach player', () => {
      const size = 8;
      const grid = GameFunctions.generateMaze(size);

      // Place minion at (0,0), player at (7,7)
      const minionPos = { x: 0, y: 0 };
      const playerPos = { x: 7, y: 7 };

      // Get path from minion to player
      const path = GameFunctions.findPath(
        minionPos.x, minionPos.y,
        playerPos.x, playerPos.y,
        grid, size
      );

      expect(path).not.toBeNull();
      expect(path.length).toBeGreaterThan(0);

      // Simulate minion following path
      let currentPos = { ...minionPos };
      for (const step of path) {
        // Verify step is a valid move
        const validMoves = GameFunctions.getValidMinionMoves(
          currentPos.x, currentPos.y, grid, size
        );
        const isValid = validMoves.some(m => m.x === step.x && m.y === step.y);
        expect(isValid).toBe(true);

        currentPos = step;
      }

      // Minion should reach player
      expect(currentPos).toEqual(playerPos);
    });

    test('minion cannot path through walls', () => {
      // Create a simple grid with a wall dividing it
      const size = 4;
      const grid = [];
      for (let y = 0; y < size; y++) {
        grid[y] = [];
        for (let x = 0; x < size; x++) {
          grid[y][x] = {
            walls: { top: true, right: true, bottom: true, left: true },
            minion: null
          };
        }
      }

      // Open horizontal path at y=0
      for (let x = 0; x < size - 1; x++) {
        grid[0][x].walls.right = false;
        grid[0][x + 1].walls.left = false;
      }

      // Open vertical path at x=3
      for (let y = 0; y < size - 1; y++) {
        grid[y][3].walls.bottom = false;
        grid[y + 1][3].walls.top = false;
      }

      // Cell (0,1) should not be reachable from (0,0) directly
      // Must go around via (3,0) -> (3,3)
      const path = GameFunctions.findPath(0, 0, 0, 3, grid, size);

      // Path exists but must go the long way
      if (path) {
        // Should go right first, not down
        expect(path[0].x).toBe(1);
        expect(path[0].y).toBe(0);
      }
    });
  });

  describe('Objective Progress Integration', () => {
    test('objectives initialize correctly for profile', () => {
      const profile = {
        objectives: [
          { id: 'keys', type: 'collect', target: 'key', count: 3 },
          { id: 'boss', type: 'defeat', target: 'dragon', count: 1 },
          { id: 'explore', type: 'explore', count: 75 }
        ]
      };

      const progress = GameFunctions.initObjectives(profile);

      expect(Object.keys(progress).length).toBe(3);
      expect(progress.keys.target).toBe(3);
      expect(progress.boss.target).toBe(1);
      expect(progress.explore.target).toBe(75);

      // All should start at 0 and incomplete
      for (const key of Object.keys(progress)) {
        expect(progress[key].current).toBe(0);
        expect(progress[key].completed).toBe(false);
      }
    });

    test('objectives handle edge cases', () => {
      // Empty objectives
      const emptyProgress = GameFunctions.initObjectives({ objectives: [] });
      expect(emptyProgress).toEqual({});

      // Missing count defaults to 1
      const defaultCount = GameFunctions.initObjectives({
        objectives: [{ id: 'test', type: 'defeat' }]
      });
      expect(defaultCount.test.target).toBe(1);
    });
  });

  describe('Full Game Flow Simulation', () => {
    test('simulates complete maze exploration', () => {
      const size = 6;
      const grid = GameFunctions.generateMaze(size);

      // Track visited cells
      const visited = new Set();
      let playerX = 0;
      let playerY = 0;
      visited.add(`${playerX},${playerY}`);

      // Simulate exploration using BFS
      const queue = [{ x: 0, y: 0 }];
      const explored = new Set(['0,0']);

      while (queue.length > 0) {
        const current = queue.shift();
        const moves = GameFunctions.getValidMinionMoves(current.x, current.y, grid, size);

        for (const move of moves) {
          const key = `${move.x},${move.y}`;
          if (!explored.has(key)) {
            explored.add(key);
            queue.push(move);
          }
        }
      }

      // All cells should be reachable
      expect(explored.size).toBe(size * size);
    });

    test('simulates combat encounter sequence', () => {
      let playerHp = 100;
      const maxHp = 100;

      // Simulate 3-round combat
      const combatRounds = [
        { playerDamage: 25, enemyDamage: 15, playerBlocking: false },
        { playerDamage: 30, enemyDamage: 20, playerBlocking: true },
        { playerDamage: 40, enemyDamage: 25, playerBlocking: false }
      ];

      let enemyHp = 80;
      let combo = 0;

      for (const round of combatRounds) {
        // Player attacks
        const playerDamage = GameFunctions.calculateDamage(round.playerDamage, {
          comboBonus: combo
        });
        enemyHp -= playerDamage;
        combo++;

        if (enemyHp <= 0) break;

        // Enemy attacks
        const enemyDamage = GameFunctions.calculateDamage(round.enemyDamage, {
          blocking: round.playerBlocking
        });
        playerHp -= enemyDamage;

        if (playerHp <= 0) break;
      }

      // Combat should have meaningful impact
      expect(playerHp).toBeLessThan(maxHp);
      expect(enemyHp).toBeLessThan(80);
    });

    test('simulates visibility and stealth gameplay', () => {
      const grid = GameFunctions.generateMaze(8);
      const visibility = { baseRadius: 3, tempBonus: 0, permBonus: 0 };

      // Player starts with base visibility
      let radius = GameFunctions.getVisibilityRadius(visibility, {});
      expect(radius).toBe(3);

      // Player finds torch
      const items = { torch: 1 };
      radius = GameFunctions.getVisibilityRadius(visibility, items);
      expect(radius).toBe(4);

      // Player uses sight potion (temp bonus)
      visibility.tempBonus = 2;
      radius = GameFunctions.getVisibilityRadius(visibility, items);
      expect(radius).toBe(6);

      // After potion wears off
      visibility.tempBonus = 0;
      radius = GameFunctions.getVisibilityRadius(visibility, items);
      expect(radius).toBe(4);

      // Player finds crystal ball (perm bonus)
      visibility.permBonus = 1;
      items.lantern = 1;
      radius = GameFunctions.getVisibilityRadius(visibility, items);
      expect(radius).toBe(7);
    });
  });
});
