/**
 * Game Function Extractor
 *
 * Since MazeMaster is a single-file module, we extract and expose
 * key functions for unit testing by evaluating specific portions.
 * This allows testing internal logic without modifying the source.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.join(__dirname, '../../src/index.js');

/**
 * Extract constants and game data from the source
 */
export function extractConstants() {
  const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

  // Extract DIFFICULTY_TIERS
  const difficultyMatch = source.match(/const DIFFICULTY_TIERS = ({[\s\S]*?^});/m);
  const difficultyTiers = difficultyMatch ? eval(`(${difficultyMatch[1]})`) : null;

  // Extract SCENARIO_THEMES
  const themesMatch = source.match(/const SCENARIO_THEMES = ({[\s\S]*?^});/m);
  const scenarioThemes = themesMatch ? eval(`(${themesMatch[1]})`) : null;

  // Extract MINION_ALERT_STATES
  const alertStatesMatch = source.match(/const MINION_ALERT_STATES = ({[\s\S]*?^});/m);
  const minionAlertStates = alertStatesMatch ? eval(`(${alertStatesMatch[1]})`) : null;

  // Extract BATTLEBAR_DIFFICULTY_RANGE
  const battlebarRangeMatch = source.match(/const BATTLEBAR_DIFFICULTY_RANGE = ({[\s\S]*?});/);
  const battlebarDifficultyRange = battlebarRangeMatch ? eval(`(${battlebarRangeMatch[1]})`) : null;

  return {
    DIFFICULTY_TIERS: difficultyTiers,
    SCENARIO_THEMES: scenarioThemes,
    MINION_ALERT_STATES: minionAlertStates,
    BATTLEBAR_DIFFICULTY_RANGE: battlebarDifficultyRange,
  };
}

/**
 * Create testable implementations of core game functions
 * These are re-implementations based on the source code logic
 */
export const GameFunctions = {
  /**
   * Calculate battlebar settings from difficulty
   */
  getBattlebarDifficultySettings(difficulty = 5, multiplier = 1.0) {
    const BATTLEBAR_DIFFICULTY_RANGE = {
      minZoneWidth: 0.10,
      maxZoneWidth: 0.45,
      minTraverseTime: 1200,
      maxTraverseTime: 4000,
    };

    const effectiveDifficulty = Math.max(1, Math.min(10, difficulty * multiplier));
    const t = (effectiveDifficulty - 1) / 9;
    const range = BATTLEBAR_DIFFICULTY_RANGE;
    const zoneWidth = range.maxZoneWidth - (t * (range.maxZoneWidth - range.minZoneWidth));
    const traverseTime = range.maxTraverseTime - (t * (range.maxTraverseTime - range.minTraverseTime));
    return { zoneWidth, traverseTime: Math.round(traverseTime) };
  },

  /**
   * Generate a maze using recursive backtracking
   */
  generateMaze(size) {
    const grid = [];
    for (let y = 0; y < size; y++) {
      grid[y] = [];
      for (let x = 0; x < size; x++) {
        grid[y][x] = {
          walls: { top: true, right: true, bottom: true, left: true },
          visited: false,
          minion: null,
          trap: null
        };
      }
    }

    const stack = [];
    let current = { x: 0, y: 0 };
    grid[0][0].visited = true;

    function getUnvisitedNeighbors(x, y) {
      const neighbors = [];
      if (y > 0 && !grid[y-1][x].visited) neighbors.push({ x, y: y-1, dir: 'top' });
      if (x < size-1 && !grid[y][x+1].visited) neighbors.push({ x: x+1, y, dir: 'right' });
      if (y < size-1 && !grid[y+1][x].visited) neighbors.push({ x, y: y+1, dir: 'bottom' });
      if (x > 0 && !grid[y][x-1].visited) neighbors.push({ x: x-1, y, dir: 'left' });
      return neighbors;
    }

    while (true) {
      const neighbors = getUnvisitedNeighbors(current.x, current.y);
      if (neighbors.length > 0) {
        const next = neighbors[Math.floor(Math.random() * neighbors.length)];
        stack.push(current);

        if (next.dir === 'top') {
          grid[current.y][current.x].walls.top = false;
          grid[next.y][next.x].walls.bottom = false;
        } else if (next.dir === 'right') {
          grid[current.y][current.x].walls.right = false;
          grid[next.y][next.x].walls.left = false;
        } else if (next.dir === 'bottom') {
          grid[current.y][current.x].walls.bottom = false;
          grid[next.y][next.x].walls.top = false;
        } else if (next.dir === 'left') {
          grid[current.y][current.x].walls.left = false;
          grid[next.y][next.x].walls.right = false;
        }

        current = { x: next.x, y: next.y };
        grid[current.y][current.x].visited = true;
      } else if (stack.length > 0) {
        current = stack.pop();
      } else {
        break;
      }
    }

    // Reset visited flags
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        grid[y][x].visited = false;
      }
    }

    return grid;
  },

  /**
   * A* pathfinding algorithm
   */
  findPath(startX, startY, goalX, goalY, grid, size, maxSteps = 50) {
    if (startX === goalX && startY === goalY) return [];

    const openSet = [];
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    const key = (x, y) => `${x},${y}`;
    const heuristic = (x1, y1, x2, y2) => Math.abs(x1 - x2) + Math.abs(y1 - y2);

    gScore.set(key(startX, startY), 0);
    fScore.set(key(startX, startY), heuristic(startX, startY, goalX, goalY));
    openSet.push({ x: startX, y: startY, f: fScore.get(key(startX, startY)) });

    while (openSet.length > 0) {
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift();
      const currentKey = key(current.x, current.y);

      if (current.x === goalX && current.y === goalY) {
        const path = [];
        let curr = currentKey;
        while (cameFrom.has(curr)) {
          const [px, py] = curr.split(',').map(Number);
          path.unshift({ x: px, y: py });
          curr = cameFrom.get(curr);
        }
        return path;
      }

      closedSet.add(currentKey);

      const cell = grid[current.y]?.[current.x];
      if (!cell) continue;

      const neighbors = [];
      if (!cell.walls.top && current.y > 0) neighbors.push({ x: current.x, y: current.y - 1 });
      if (!cell.walls.bottom && current.y < size - 1) neighbors.push({ x: current.x, y: current.y + 1 });
      if (!cell.walls.left && current.x > 0) neighbors.push({ x: current.x - 1, y: current.y });
      if (!cell.walls.right && current.x < size - 1) neighbors.push({ x: current.x + 1, y: current.y });

      for (const neighbor of neighbors) {
        const neighborKey = key(neighbor.x, neighbor.y);
        if (closedSet.has(neighborKey)) continue;

        const tentativeG = gScore.get(currentKey) + 1;

        if (!gScore.has(neighborKey) || tentativeG < gScore.get(neighborKey)) {
          cameFrom.set(neighborKey, currentKey);
          gScore.set(neighborKey, tentativeG);
          const f = tentativeG + heuristic(neighbor.x, neighbor.y, goalX, goalY);
          fScore.set(neighborKey, f);

          if (!openSet.find(n => n.x === neighbor.x && n.y === neighbor.y)) {
            openSet.push({ x: neighbor.x, y: neighbor.y, f });
          }
        }
      }

      if (closedSet.size > maxSteps * 4) return null;
    }

    return null;
  },

  /**
   * Check line of sight between two points
   */
  hasLineOfSight(x1, y1, x2, y2, grid) {
    // Bresenham's line algorithm
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;

    let x = x1;
    let y = y1;

    while (x !== x2 || y !== y2) {
      const cell = grid[y]?.[x];
      if (!cell) return false;

      const e2 = 2 * err;
      let nextX = x;
      let nextY = y;

      if (e2 > -dy) {
        err -= dy;
        nextX = x + sx;
      }
      if (e2 < dx) {
        err += dx;
        nextY = y + sy;
      }

      // Check walls blocking movement
      if (nextX !== x) {
        const wallDir = sx > 0 ? 'right' : 'left';
        if (cell.walls[wallDir]) return false;
      }
      if (nextY !== y) {
        const wallDir = sy > 0 ? 'bottom' : 'top';
        if (cell.walls[wallDir]) return false;
      }

      x = nextX;
      y = nextY;
    }

    return true;
  },

  /**
   * Calculate damage with modifiers
   */
  calculateDamage(baseDamage, modifiers = {}) {
    const {
      damageMult = 1.0,
      comboBonus = 0,
      criticalHit = false,
      critMultiplier = 1.5,
      damageReduction = 0,
      blocking = false,
      blockReduction = 0.5,
    } = modifiers;

    let damage = baseDamage * damageMult;

    // Apply combo bonus (+5% per hit, max +50%)
    const effectiveComboBonus = Math.min(comboBonus * 0.05, 0.5);
    damage *= (1 + effectiveComboBonus);

    // Apply critical hit
    if (criticalHit) {
      damage *= critMultiplier;
    }

    // Apply blocking
    if (blocking) {
      damage *= (1 - blockReduction);
    }

    // Apply damage reduction from equipment
    damage *= (1 - Math.min(damageReduction, 0.75));

    return Math.round(damage);
  },

  /**
   * Calculate healing amount
   */
  calculateHealing(baseHealing, modifiers = {}) {
    const {
      healMult = 1.0,
      maxHp = 100,
      currentHp = 50,
      isPercent = false,
    } = modifiers;

    let healing;
    if (isPercent) {
      healing = (baseHealing / 100) * maxHp;
    } else {
      healing = baseHealing;
    }

    healing *= healMult;

    // Don't overheal
    healing = Math.min(healing, maxHp - currentHp);

    return Math.round(healing);
  },

  /**
   * Get valid moves for a minion (respects walls)
   */
  getValidMinionMoves(x, y, grid, size) {
    const cell = grid[y]?.[x];
    if (!cell) return [];

    const moves = [];
    if (!cell.walls.top && y > 0) moves.push({ x, y: y - 1 });
    if (!cell.walls.bottom && y < size - 1) moves.push({ x, y: y + 1 });
    if (!cell.walls.left && x > 0) moves.push({ x: x - 1, y });
    if (!cell.walls.right && x < size - 1) moves.push({ x: x + 1, y });

    return moves;
  },

  /**
   * Calculate Manhattan distance
   */
  manhattanDistance(x1, y1, x2, y2) {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
  },

  /**
   * Calculate visibility radius with bonuses
   */
  getVisibilityRadius(visibility, items = {}) {
    const { baseRadius = 3, tempBonus = 0, permBonus = 0 } = visibility;
    let radius = baseRadius + tempBonus + permBonus;

    // Items can add visibility
    if (items.lantern) radius += 2;
    if (items.torch) radius += 1;

    return Math.max(1, radius);
  },

  /**
   * Attempt secret passage discovery
   */
  attemptSecretDiscovery(cell, direction, method, inventory = {}) {
    if (!cell.secretPassage || cell.secretPassage.direction !== direction) {
      return { found: false };
    }

    if (cell.secretPassage.revealed) {
      return { found: false };
    }

    const secret = cell.secretPassage;
    let chance;

    switch (method) {
      case 'tap':
        chance = 0.15 + (secret.hintLevel * 0.25);
        if (secret.hintLevel >= 3) chance = 0.95;
        break;
      case 'item':
        chance = 0.9 + (secret.hintLevel * 0.025);
        break;
      case 'passive':
        chance = secret.hintLevel >= 3 ? 0.7 : 0;
        break;
      default:
        chance = 0;
    }

    if (inventory?.secretSense > 0) {
      chance += 0.2;
    }

    chance = Math.min(chance, 1.0);

    if (Math.random() < chance) {
      return { found: true, revealed: true };
    }

    if (secret.hintLevel > 0 && method === 'tap') {
      return { found: false, hint: true, hintLevel: secret.hintLevel };
    }

    return { found: false };
  },

  /**
   * Initialize objectives for a maze profile
   */
  initObjectives(profile) {
    const progress = {};
    const objectives = profile.objectives || [];

    for (const obj of objectives) {
      progress[obj.id] = {
        current: 0,
        completed: false,
        target: obj.count || 1,
      };
    }

    return progress;
  },

  /**
   * Check if player can move in direction
   */
  canMove(playerX, playerY, direction, grid) {
    const cell = grid[playerY]?.[playerX];
    if (!cell) return false;
    return !cell.walls[direction];
  },

  /**
   * Get cell type string for rendering
   */
  getCellType(cell) {
    if (cell.exit) return 'exit';
    if (cell.portal) return 'portal';
    if (cell.stairUp) return 'stairUp';
    if (cell.stairDown) return 'stairDown';
    if (cell.chest && !cell.chest.opened) return 'chest';
    if (cell.trap && !cell.trap.triggered) return 'trap';
    if (cell.minion && !cell.minion.triggered) return 'minion';
    return 'floor';
  },

  /**
   * Parse and roll dice notation (XdY+Z or XdY-Z)
   * @param {string} notation - Dice notation like "2d6+3" or "1d20"
   * @returns {number} - Total roll result
   */
  rollDice(notation) {
    if (!notation || typeof notation !== 'string') return 0;

    const match = notation.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if (!match) return 0;

    const numDice = parseInt(match[1], 10);
    const diceSides = parseInt(match[2], 10);
    const modifier = match[3] ? parseInt(match[3], 10) : 0;

    if (numDice <= 0 || diceSides <= 0) return 0;

    let total = 0;
    for (let i = 0; i < numDice; i++) {
      total += Math.floor(Math.random() * diceSides) + 1;
    }

    return total + modifier;
  },

  /**
   * Process MazeMaster macros in text
   * - {{roll:XdY+Z}} - Dice roll notation
   * - {{random:min:max}} - Random number in range
   * @param {string} text - Text containing macros
   * @returns {string} - Text with macros replaced
   */
  processMazeMasterMacros(text) {
    if (!text || typeof text !== 'string') return text;

    // Process {{roll:XdY+Z}} macros
    text = text.replace(/\{\{roll:([^}]+)\}\}/gi, (match, notation) => {
      return String(this.rollDice(notation.trim()));
    });

    // Process {{random:min:max}} macros
    text = text.replace(/\{\{random:(\d+):(\d+)\}\}/gi, (match, min, max) => {
      const minVal = parseInt(min, 10);
      const maxVal = parseInt(max, 10);
      return String(Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal);
    });

    return text;
  },

  /**
   * Substitute template variables in hook commands
   * @param {string} command - Command with {{varName}} placeholders
   * @param {Object} params - Key-value pairs for substitution
   * @returns {string} - Command with variables replaced
   */
  substituteHookParams(command, params = {}) {
    if (!command || typeof command !== 'string') return command;

    let result = command;
    for (const [key, value] of Object.entries(params)) {
      result = result.replaceAll(`{{${key}}}`, String(value));
    }
    return result;
  },

  /**
   * Validate a hook command is safe to execute
   * @param {string} command - Command to validate
   * @returns {Object} - { valid: boolean, reason?: string }
   */
  validateHookCommand(command) {
    if (!command || typeof command !== 'string') {
      return { valid: false, reason: 'Command is empty or not a string' };
    }

    const trimmed = command.trim();
    if (!trimmed) {
      return { valid: false, reason: 'Command is empty after trimming' };
    }

    // Check for unsubstituted template variables
    const unsubstituted = trimmed.match(/\{\{[^}]+\}\}/g);
    if (unsubstituted) {
      // Filter out valid macro patterns
      const invalidVars = unsubstituted.filter(v =>
        !v.match(/^\{\{roll:[^}]+\}\}$/) &&
        !v.match(/^\{\{random:\d+:\d+\}\}$/)
      );
      if (invalidVars.length > 0) {
        return { valid: false, reason: `Unsubstituted variables: ${invalidVars.join(', ')}` };
      }
    }

    return { valid: true };
  },

  /**
   * Simulate fireHook behavior for testing
   * @param {Object} profile - Profile containing hook definitions
   * @param {string} hookName - Name of the hook to fire
   * @param {Object} params - Parameters to substitute
   * @returns {Object} - { executed: boolean, command?: string, error?: string }
   */
  simulateFireHook(profile, hookName, params = {}) {
    if (!profile) {
      return { executed: false, error: 'No profile provided' };
    }

    const command = profile[hookName];
    if (!command || typeof command !== 'string' || !command.trim()) {
      return { executed: false, error: 'Hook not defined or empty' };
    }

    // Substitute parameters
    let finalCommand = this.substituteHookParams(command, params);

    // Process MazeMaster macros
    finalCommand = this.processMazeMasterMacros(finalCommand);

    // Validate the command
    const validation = this.validateHookCommand(finalCommand);
    if (!validation.valid) {
      return { executed: false, error: validation.reason };
    }

    return { executed: true, command: finalCommand };
  },
};

export default GameFunctions;
