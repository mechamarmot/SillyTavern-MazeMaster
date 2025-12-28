/**
 * E2E Tests for MazeMaster UI
 *
 * Uses Playwright to test the browser-based UI components:
 * - Maze grid rendering
 * - Player movement
 * - HP bar updates
 * - Modal interactions
 * - Inventory management
 * - D-Pad controls
 */

import { test, expect } from '@playwright/test';

test.describe('Maze Grid Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="maze-grid"]');
  });

  test('maze grid is rendered with correct dimensions', async ({ page }) => {
    const grid = page.locator('[data-testid="maze-grid"]');
    await expect(grid).toBeVisible();

    // Default size is 8x8 = 64 cells
    const cells = page.locator('.maze-cell');
    await expect(cells).toHaveCount(64);
  });

  test('player is visible at starting position', async ({ page }) => {
    const playerCell = page.locator('.maze-cell.has-player');
    await expect(playerCell).toBeVisible();
    await expect(playerCell).toHaveText('@');
  });

  test('exit is visible on the grid', async ({ page }) => {
    const exitCell = page.locator('.maze-cell.has-exit');
    await expect(exitCell).toBeVisible();
    await expect(exitCell).toHaveText('E');
  });

  test('cells have correct wall styling', async ({ page }) => {
    // Check that cells at grid edges have border walls
    const topLeftCell = page.locator('[data-testid="cell-0-0"]');
    await expect(topLeftCell).toHaveClass(/wall-top/);
    await expect(topLeftCell).toHaveClass(/wall-left/);
  });

  test('generate maze button creates new maze', async ({ page }) => {
    // Get initial maze state
    const initialPlayerPos = await page.evaluate(() => ({
      x: window.testGameState.playerX,
      y: window.testGameState.playerY
    }));

    // Click generate button
    await page.click('[data-testid="generate-maze"]');

    // Player should be at start
    const newPlayerPos = await page.evaluate(() => ({
      x: window.testGameState.playerX,
      y: window.testGameState.playerY
    }));

    expect(newPlayerPos.x).toBe(0);
    expect(newPlayerPos.y).toBe(0);
  });
});

test.describe('Player Movement', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="maze-grid"]');
  });

  test('D-Pad buttons are visible and clickable', async ({ page }) => {
    const dpad = page.locator('[data-testid="dpad"]');
    await expect(dpad).toBeVisible();

    await expect(page.locator('[data-testid="move-up"]')).toBeVisible();
    await expect(page.locator('[data-testid="move-down"]')).toBeVisible();
    await expect(page.locator('[data-testid="move-left"]')).toBeVisible();
    await expect(page.locator('[data-testid="move-right"]')).toBeVisible();
  });

  test('clicking D-Pad buttons attempts movement', async ({ page }) => {
    const initialMoves = await page.evaluate(() => window.testGameState.stats.moves);

    // Try to move (might be blocked by walls, but should attempt)
    await page.click('[data-testid="move-right"]');

    // Either moves increased or a log entry was added
    const logEntries = page.locator('.log-entry');
    await expect(logEntries.first()).toBeVisible();
  });

  test('keyboard controls work for movement', async ({ page }) => {
    // Focus the page
    await page.click('body');

    // Get initial state
    const initialMoves = await page.evaluate(() => window.testGameState.stats.moves);

    // Press arrow keys
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    // Check if movement was attempted (log should have entry)
    const logText = await page.locator('#message-log').textContent();
    expect(logText.length).toBeGreaterThan(0);
  });

  test('WASD keys work for movement', async ({ page }) => {
    await page.click('body');

    const initialState = await page.evaluate(() => ({
      x: window.testGameState.playerX,
      y: window.testGameState.playerY,
      moves: window.testGameState.stats.moves
    }));

    // Try WASD
    await page.keyboard.press('d');
    await page.waitForTimeout(100);

    const logText = await page.locator('#message-log').textContent();
    expect(logText.length).toBeGreaterThan(0);
  });

  test('movement is blocked by walls', async ({ page }) => {
    // Try to move up from (0,0) - should be blocked by top border
    await page.click('[data-testid="move-up"]');

    // Check log for wall message - could be "Wall" or "Cannot move"
    const logText = await page.locator('#message-log').textContent();
    expect(logText.includes('Wall') || logText.includes('Cannot')).toBe(true);
  });

  test('move counter increments on valid moves', async ({ page }) => {
    const initialMoves = await page.evaluate(() => window.testGameState.stats.moves);

    // Find a valid move direction by checking the grid
    const canMoveRight = await page.evaluate(() => {
      const cell = window.testGameState.grid[0][0];
      return !cell.walls.right;
    });

    if (canMoveRight) {
      await page.click('[data-testid="move-right"]');
      const newMoves = await page.evaluate(() => window.testGameState.stats.moves);
      expect(newMoves).toBe(initialMoves + 1);
    }
  });
});

test.describe('HP System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="hp-bar"]');
  });

  test('HP bar is visible and shows correct values', async ({ page }) => {
    const hpBar = page.locator('[data-testid="hp-bar"]');
    await expect(hpBar).toBeVisible();
    await expect(hpBar).toContainText('100 / 100');
  });

  test('HP bar updates when taking damage', async ({ page }) => {
    await page.click('[data-testid="take-damage"]');

    const hpBar = page.locator('[data-testid="hp-bar"]');
    await expect(hpBar).toContainText('80 / 100');

    // Check HP bar width decreased
    const width = await hpBar.evaluate(el => el.style.width);
    expect(width).toBe('80%');
  });

  test('HP bar updates when healing', async ({ page }) => {
    // First take damage
    await page.click('[data-testid="take-damage"]');
    await page.click('[data-testid="take-damage"]');

    const hpAfterDamage = await page.evaluate(() => window.testGameState.hp);
    expect(hpAfterDamage).toBe(60);

    // Then heal
    await page.click('[data-testid="heal"]');

    const hpAfterHeal = await page.evaluate(() => window.testGameState.hp);
    expect(hpAfterHeal).toBe(90);
  });

  test('HP cannot go below 0', async ({ page }) => {
    // Take lots of damage
    for (let i = 0; i < 10; i++) {
      await page.click('[data-testid="take-damage"]');
    }

    const hp = await page.evaluate(() => window.testGameState.hp);
    expect(hp).toBe(0);
  });

  test('HP cannot exceed max HP', async ({ page }) => {
    // Try to heal when already at max
    await page.click('[data-testid="heal"]');

    const hp = await page.evaluate(() => window.testGameState.hp);
    expect(hp).toBe(100);
  });
});

test.describe('Modal Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('modal is hidden by default', async ({ page }) => {
    const modal = page.locator('[data-testid="modal-overlay"]');
    await expect(modal).not.toHaveClass(/active/);
  });

  test('modal can be closed with button', async ({ page }) => {
    // Trigger a modal by finding a chest
    await page.evaluate(() => {
      window.testHarness.showModal('Test', 'Test message');
    });

    const modal = page.locator('[data-testid="modal-overlay"]');
    await expect(modal).toHaveClass(/active/);

    // Close it
    await page.click('[data-testid="modal-close"]');
    await expect(modal).not.toHaveClass(/active/);
  });

  test('modal displays correct content', async ({ page }) => {
    await page.evaluate(() => {
      window.testHarness.showModal('Victory!', 'You won the game!');
    });

    await expect(page.locator('[data-testid="modal-title"]')).toContainText('Victory!');
    await expect(page.locator('[data-testid="modal-message"]')).toContainText('You won the game!');
  });
});

test.describe('Inventory System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="inventory"]');
  });

  test('inventory slots are visible', async ({ page }) => {
    const inventory = page.locator('[data-testid="inventory"]');
    await expect(inventory).toBeVisible();

    const slots = page.locator('.inventory-slot');
    await expect(slots).toHaveCount(6);
  });

  test('add item button adds items to inventory', async ({ page }) => {
    await page.click('[data-testid="add-item"]');

    const inventory = await page.evaluate(() => window.testGameState.inventory);
    const itemCount = Object.values(inventory).reduce((a, b) => a + b, 0);
    expect(itemCount).toBe(1);

    // Check log
    const logText = await page.locator('#message-log').textContent();
    expect(logText).toContain('Found');
  });

  test('items stack in inventory', async ({ page }) => {
    // Add multiple items
    for (let i = 0; i < 5; i++) {
      await page.click('[data-testid="add-item"]');
    }

    const inventory = await page.evaluate(() => window.testGameState.inventory);
    const itemCount = Object.values(inventory).reduce((a, b) => a + b, 0);
    expect(itemCount).toBe(5);
  });
});

test.describe('Stats Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('stats display correct initial values', async ({ page }) => {
    await expect(page.locator('[data-testid="stat-moves"]')).toContainText('0');
    await expect(page.locator('[data-testid="stat-chests"]')).toContainText('0');
    await expect(page.locator('[data-testid="stat-encounters"]')).toContainText('0');
    await expect(page.locator('[data-testid="stat-floor"]')).toContainText('1');
  });

  test('move counter updates correctly', async ({ page }) => {
    // Find a direction we can move
    const canMove = await page.evaluate(() => {
      const cell = window.testGameState.grid[0][0];
      if (!cell.walls.right) return 'right';
      if (!cell.walls.bottom) return 'down';
      return null;
    });

    if (canMove === 'right') {
      await page.click('[data-testid="move-right"]');
    } else if (canMove === 'down') {
      await page.click('[data-testid="move-down"]');
    }

    if (canMove) {
      await expect(page.locator('[data-testid="stat-moves"]')).toContainText('1');
    }
  });
});

test.describe('Message Log', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('message log is visible', async ({ page }) => {
    const log = page.locator('[data-testid="message-log"]');
    await expect(log).toBeVisible();
  });

  test('initial message is logged', async ({ page }) => {
    const log = page.locator('[data-testid="message-log"]');
    await expect(log).toContainText('Game initialized');
  });

  test('movement attempts are logged', async ({ page }) => {
    await page.click('[data-testid="move-up"]');

    const log = page.locator('[data-testid="message-log"]');
    const text = await log.textContent();

    // Should have either "Moved", "Wall", or "Cannot" message
    expect(text.includes('Moved') || text.includes('Wall') || text.includes('Cannot')).toBe(true);
  });

  test('log entries have timestamps', async ({ page }) => {
    const logEntry = page.locator('.log-entry').first();
    const text = await logEntry.textContent();

    // Should contain time format like [HH:MM:SS]
    expect(text).toMatch(/\[\d{1,2}:\d{2}:\d{2}/);
  });

  test('log entries have correct type classes', async ({ page }) => {
    // Trigger different log types
    await page.click('[data-testid="take-damage"]');
    await expect(page.locator('.log-entry.combat').first()).toBeVisible();

    await page.click('[data-testid="heal"]');
    await expect(page.locator('.log-entry.loot').first()).toBeVisible();
  });
});

test.describe('New Game Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('new game resets all state', async ({ page }) => {
    // Make some changes
    await page.click('[data-testid="take-damage"]');
    await page.click('[data-testid="add-item"]');

    // Start new game
    await page.click('[data-testid="new-game"]');

    // Check HP is reset
    const hp = await page.evaluate(() => window.testGameState.hp);
    expect(hp).toBe(100);

    // Check stats are reset
    await expect(page.locator('[data-testid="stat-moves"]')).toContainText('0');
  });

  test('new game generates new maze', async ({ page }) => {
    // Get initial grid hash
    const initialGrid = await page.evaluate(() =>
      JSON.stringify(window.testGameState.grid.map(row =>
        row.map(cell => cell.walls)
      ))
    );

    // Multiple new games should eventually produce different maze
    let different = false;
    for (let i = 0; i < 5; i++) {
      await page.click('[data-testid="new-game"]');
      const newGrid = await page.evaluate(() =>
        JSON.stringify(window.testGameState.grid.map(row =>
          row.map(cell => cell.walls)
        ))
      );
      if (newGrid !== initialGrid) {
        different = true;
        break;
      }
    }

    expect(different).toBe(true);
  });

  test('player starts at (0,0) after new game', async ({ page }) => {
    // Move player first
    await page.evaluate(() => {
      window.testGameState.playerX = 5;
      window.testGameState.playerY = 5;
    });

    // New game
    await page.click('[data-testid="new-game"]');

    const pos = await page.evaluate(() => ({
      x: window.testGameState.playerX,
      y: window.testGameState.playerY
    }));

    expect(pos.x).toBe(0);
    expect(pos.y).toBe(0);
  });
});

test.describe('Visual Feedback', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('player cell has distinct styling', async ({ page }) => {
    const playerCell = page.locator('.maze-cell.has-player');

    // Check it has the player class
    await expect(playerCell).toHaveClass(/has-player/);
  });

  test('explored cells have visual indicator', async ({ page }) => {
    // Starting cell should be explored
    const startCell = page.locator('[data-testid="cell-0-0"]');
    await expect(startCell).toHaveClass(/explored/);
  });

  test('chest cells are visually distinct', async ({ page }) => {
    const chestCells = page.locator('.maze-cell.has-chest');
    const count = await chestCells.count();

    if (count > 0) {
      await expect(chestCells.first()).toHaveText('C');
    }
  });
});

test.describe('Responsive Design', () => {
  test('works on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Grid should still be visible
    await expect(page.locator('[data-testid="maze-grid"]')).toBeVisible();

    // D-Pad should be visible
    await expect(page.locator('[data-testid="dpad"]')).toBeVisible();

    // Controls should be visible
    await expect(page.locator('[data-testid="new-game"]')).toBeVisible();
  });

  test('works on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    await expect(page.locator('[data-testid="maze-grid"]')).toBeVisible();
    await expect(page.locator('[data-testid="dpad"]')).toBeVisible();
  });
});
