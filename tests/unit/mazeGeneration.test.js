/**
 * Unit Tests for Maze Generation
 *
 * Tests the core maze generation algorithms including:
 * - Recursive backtracking maze generation
 * - Grid structure validation
 * - Wall consistency
 * - Connectivity (all cells reachable)
 */

import { GameFunctions } from '../mocks/gameExtractor.js';

describe('Maze Generation', () => {
  describe('generateMaze', () => {
    const testSizes = [4, 6, 8, 10, 12, 14, 16];

    testSizes.forEach(size => {
      describe(`Size ${size}x${size}`, () => {
        let grid;

        beforeEach(() => {
          grid = GameFunctions.generateMaze(size);
        });

        test('creates grid of correct dimensions', () => {
          expect(grid.length).toBe(size);
          grid.forEach(row => {
            expect(row.length).toBe(size);
          });
        });

        test('all cells have wall structure', () => {
          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              const cell = grid[y][x];
              expect(cell).toHaveProperty('walls');
              expect(cell.walls).toHaveProperty('top');
              expect(cell.walls).toHaveProperty('right');
              expect(cell.walls).toHaveProperty('bottom');
              expect(cell.walls).toHaveProperty('left');
            }
          }
        });

        test('all cells have visited flag reset to false', () => {
          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              expect(grid[y][x].visited).toBe(false);
            }
          }
        });

        test('all cells have minion and trap slots', () => {
          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              expect(grid[y][x]).toHaveProperty('minion');
              expect(grid[y][x]).toHaveProperty('trap');
            }
          }
        });

        test('wall consistency - adjacent cells have matching wall states', () => {
          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              const cell = grid[y][x];

              // Check right wall consistency
              if (x < size - 1) {
                const rightCell = grid[y][x + 1];
                expect(cell.walls.right).toBe(rightCell.walls.left);
              }

              // Check bottom wall consistency
              if (y < size - 1) {
                const bottomCell = grid[y + 1][x];
                expect(cell.walls.bottom).toBe(bottomCell.walls.top);
              }
            }
          }
        });

        test('start cell (0,0) is reachable from at least one direction', () => {
          const startCell = grid[0][0];
          const hasOpenPath =
            !startCell.walls.right ||
            !startCell.walls.bottom;
          expect(hasOpenPath).toBe(true);
        });

        test('all cells are connected (BFS reachability)', () => {
          const visited = new Set();
          const queue = [{ x: 0, y: 0 }];
          visited.add('0,0');

          while (queue.length > 0) {
            const { x, y } = queue.shift();
            const cell = grid[y][x];

            // Check all directions
            if (!cell.walls.top && y > 0 && !visited.has(`${x},${y - 1}`)) {
              visited.add(`${x},${y - 1}`);
              queue.push({ x, y: y - 1 });
            }
            if (!cell.walls.right && x < size - 1 && !visited.has(`${x + 1},${y}`)) {
              visited.add(`${x + 1},${y}`);
              queue.push({ x: x + 1, y });
            }
            if (!cell.walls.bottom && y < size - 1 && !visited.has(`${x},${y + 1}`)) {
              visited.add(`${x},${y + 1}`);
              queue.push({ x, y: y + 1 });
            }
            if (!cell.walls.left && x > 0 && !visited.has(`${x - 1},${y}`)) {
              visited.add(`${x - 1},${y}`);
              queue.push({ x: x - 1, y });
            }
          }

          expect(visited.size).toBe(size * size);
        });

        test('no isolated cells (each cell has at least one open wall)', () => {
          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              const cell = grid[y][x];
              const hasOpenWall =
                !cell.walls.top ||
                !cell.walls.right ||
                !cell.walls.bottom ||
                !cell.walls.left;
              expect(hasOpenWall).toBe(true);
            }
          }
        });
      });
    });

    test('generates different mazes on multiple calls (randomness)', () => {
      const size = 8;
      const mazes = [];

      // Generate 5 mazes and check they're not all identical
      for (let i = 0; i < 5; i++) {
        mazes.push(GameFunctions.generateMaze(size));
      }

      // Convert to comparable strings
      const mazeStrings = mazes.map(grid =>
        JSON.stringify(grid.map(row => row.map(cell => cell.walls)))
      );

      // At least 2 unique mazes out of 5 (high probability)
      const uniqueMazes = new Set(mazeStrings);
      expect(uniqueMazes.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Grid Cell Properties', () => {
    test('cells have correct default state', () => {
      const grid = GameFunctions.generateMaze(4);
      const cell = grid[1][1];

      expect(typeof cell.walls.top).toBe('boolean');
      expect(typeof cell.walls.right).toBe('boolean');
      expect(typeof cell.walls.bottom).toBe('boolean');
      expect(typeof cell.walls.left).toBe('boolean');
      expect(cell.visited).toBe(false);
      expect(cell.minion).toBeNull();
      expect(cell.trap).toBeNull();
    });
  });

  describe('canMove', () => {
    let grid;

    beforeEach(() => {
      // Create a simple 3x3 grid for testing movement
      grid = [
        [
          { walls: { top: true, right: false, bottom: false, left: true } },
          { walls: { top: true, right: false, bottom: true, left: false } },
          { walls: { top: true, right: true, bottom: false, left: false } },
        ],
        [
          { walls: { top: false, right: true, bottom: false, left: true } },
          { walls: { top: true, right: false, bottom: false, left: true } },
          { walls: { top: false, right: true, bottom: true, left: false } },
        ],
        [
          { walls: { top: false, right: false, bottom: true, left: true } },
          { walls: { top: false, right: false, bottom: true, left: false } },
          { walls: { top: true, right: true, bottom: true, left: false } },
        ],
      ];
    });

    test('allows movement when wall is open', () => {
      expect(GameFunctions.canMove(0, 0, 'right', grid)).toBe(true);
      expect(GameFunctions.canMove(0, 0, 'bottom', grid)).toBe(true);
    });

    test('blocks movement when wall is closed', () => {
      expect(GameFunctions.canMove(0, 0, 'top', grid)).toBe(false);
      expect(GameFunctions.canMove(0, 0, 'left', grid)).toBe(false);
    });

    test('returns false for invalid positions', () => {
      expect(GameFunctions.canMove(-1, 0, 'right', grid)).toBe(false);
      expect(GameFunctions.canMove(0, -1, 'right', grid)).toBe(false);
      expect(GameFunctions.canMove(10, 10, 'right', grid)).toBe(false);
    });
  });
});

describe('Maze Cell Types', () => {
  describe('getCellType', () => {
    test('identifies exit cell', () => {
      const cell = { exit: true, walls: {} };
      expect(GameFunctions.getCellType(cell)).toBe('exit');
    });

    test('identifies portal cell', () => {
      const cell = { portal: { id: 1 }, walls: {} };
      expect(GameFunctions.getCellType(cell)).toBe('portal');
    });

    test('identifies stair cells', () => {
      expect(GameFunctions.getCellType({ stairUp: true, walls: {} })).toBe('stairUp');
      expect(GameFunctions.getCellType({ stairDown: true, walls: {} })).toBe('stairDown');
    });

    test('identifies unopened chest', () => {
      const cell = { chest: { opened: false }, walls: {} };
      expect(GameFunctions.getCellType(cell)).toBe('chest');
    });

    test('identifies opened chest as floor', () => {
      const cell = { chest: { opened: true }, walls: {} };
      expect(GameFunctions.getCellType(cell)).toBe('floor');
    });

    test('identifies untriggered trap', () => {
      const cell = { trap: { triggered: false }, walls: {} };
      expect(GameFunctions.getCellType(cell)).toBe('trap');
    });

    test('identifies triggered trap as floor', () => {
      const cell = { trap: { triggered: true }, walls: {} };
      expect(GameFunctions.getCellType(cell)).toBe('floor');
    });

    test('identifies untriggered minion', () => {
      const cell = { minion: { triggered: false }, walls: {} };
      expect(GameFunctions.getCellType(cell)).toBe('minion');
    });

    test('identifies triggered minion as floor', () => {
      const cell = { minion: { triggered: true }, walls: {} };
      expect(GameFunctions.getCellType(cell)).toBe('floor');
    });

    test('identifies empty floor', () => {
      const cell = { walls: {} };
      expect(GameFunctions.getCellType(cell)).toBe('floor');
    });

    test('exit takes priority over other cell types', () => {
      const cell = {
        exit: true,
        chest: { opened: false },
        minion: { triggered: false },
        walls: {}
      };
      expect(GameFunctions.getCellType(cell)).toBe('exit');
    });
  });
});
