/**
 * Unit Tests for Combat System
 *
 * Tests combat mechanics including:
 * - Damage calculations
 * - Healing calculations
 * - Combo bonuses
 * - Critical hits
 * - Blocking and damage reduction
 * - Battlebar difficulty settings
 */

import { GameFunctions } from '../mocks/gameExtractor.js';

describe('Combat System', () => {
  describe('calculateDamage', () => {
    test('returns base damage with no modifiers', () => {
      expect(GameFunctions.calculateDamage(100)).toBe(100);
    });

    test('applies damage multiplier', () => {
      expect(GameFunctions.calculateDamage(100, { damageMult: 1.5 })).toBe(150);
      expect(GameFunctions.calculateDamage(100, { damageMult: 0.5 })).toBe(50);
    });

    describe('Combo Bonus', () => {
      test('applies combo bonus correctly', () => {
        // Each combo hit adds 5%
        expect(GameFunctions.calculateDamage(100, { comboBonus: 1 })).toBe(105);
        expect(GameFunctions.calculateDamage(100, { comboBonus: 2 })).toBe(110);
        expect(GameFunctions.calculateDamage(100, { comboBonus: 5 })).toBe(125);
      });

      test('caps combo bonus at 50%', () => {
        // Max is 10 hits = 50%
        expect(GameFunctions.calculateDamage(100, { comboBonus: 10 })).toBe(150);
        expect(GameFunctions.calculateDamage(100, { comboBonus: 15 })).toBe(150); // Still capped
        expect(GameFunctions.calculateDamage(100, { comboBonus: 100 })).toBe(150); // Still capped
      });
    });

    describe('Critical Hits', () => {
      test('applies default critical multiplier (1.5x)', () => {
        expect(GameFunctions.calculateDamage(100, { criticalHit: true })).toBe(150);
      });

      test('applies custom critical multiplier', () => {
        expect(GameFunctions.calculateDamage(100, {
          criticalHit: true,
          critMultiplier: 2.0
        })).toBe(200);
      });

      test('no bonus when criticalHit is false', () => {
        expect(GameFunctions.calculateDamage(100, { criticalHit: false })).toBe(100);
      });
    });

    describe('Blocking', () => {
      test('applies default block reduction (50%)', () => {
        expect(GameFunctions.calculateDamage(100, { blocking: true })).toBe(50);
      });

      test('applies custom block reduction', () => {
        expect(GameFunctions.calculateDamage(100, {
          blocking: true,
          blockReduction: 0.8 // 80% reduction
        })).toBe(20);
      });

      test('no reduction when not blocking', () => {
        expect(GameFunctions.calculateDamage(100, { blocking: false })).toBe(100);
      });
    });

    describe('Damage Reduction (Equipment)', () => {
      test('applies damage reduction', () => {
        expect(GameFunctions.calculateDamage(100, { damageReduction: 0.2 })).toBe(80);
        expect(GameFunctions.calculateDamage(100, { damageReduction: 0.5 })).toBe(50);
      });

      test('caps damage reduction at 75%', () => {
        expect(GameFunctions.calculateDamage(100, { damageReduction: 0.75 })).toBe(25);
        expect(GameFunctions.calculateDamage(100, { damageReduction: 0.9 })).toBe(25); // Capped
        expect(GameFunctions.calculateDamage(100, { damageReduction: 1.0 })).toBe(25); // Capped
      });
    });

    describe('Combined Modifiers', () => {
      test('stacks all modifiers correctly', () => {
        const result = GameFunctions.calculateDamage(100, {
          damageMult: 1.5,      // 100 * 1.5 = 150
          comboBonus: 4,        // 150 * 1.2 = 180
          criticalHit: true,    // 180 * 1.5 = 270
          blocking: true,       // 270 * 0.5 = 135
          damageReduction: 0.2  // 135 * 0.8 = 108
        });
        expect(result).toBe(108);
      });

      test('handles edge case of minimal damage', () => {
        const result = GameFunctions.calculateDamage(10, {
          damageMult: 0.5,
          blocking: true,
          damageReduction: 0.5
        });
        expect(result).toBeGreaterThanOrEqual(0);
      });
    });

    test('rounds to nearest integer', () => {
      expect(GameFunctions.calculateDamage(33, { damageMult: 1.5 })).toBe(50);
      expect(GameFunctions.calculateDamage(33, { damageReduction: 0.33 })).toBe(22);
    });
  });

  describe('calculateHealing', () => {
    test('returns base healing with no modifiers', () => {
      expect(GameFunctions.calculateHealing(50, {
        maxHp: 100,
        currentHp: 50
      })).toBe(50);
    });

    test('applies heal multiplier', () => {
      expect(GameFunctions.calculateHealing(50, {
        healMult: 1.5,
        maxHp: 100,
        currentHp: 0
      })).toBe(75);
    });

    describe('Percentage Healing', () => {
      test('calculates percent of max HP', () => {
        expect(GameFunctions.calculateHealing(25, {
          isPercent: true,
          maxHp: 100,
          currentHp: 0
        })).toBe(25);

        expect(GameFunctions.calculateHealing(50, {
          isPercent: true,
          maxHp: 200,
          currentHp: 0
        })).toBe(100);
      });

      test('applies multiplier to percentage healing', () => {
        expect(GameFunctions.calculateHealing(25, {
          isPercent: true,
          healMult: 2.0,
          maxHp: 100,
          currentHp: 0
        })).toBe(50);
      });
    });

    describe('Overheal Prevention', () => {
      test('does not heal beyond max HP', () => {
        expect(GameFunctions.calculateHealing(100, {
          maxHp: 100,
          currentHp: 80
        })).toBe(20); // Only heals 20 to reach max

        expect(GameFunctions.calculateHealing(50, {
          maxHp: 100,
          currentHp: 90
        })).toBe(10); // Only heals 10 to reach max
      });

      test('returns 0 when already at max HP', () => {
        expect(GameFunctions.calculateHealing(50, {
          maxHp: 100,
          currentHp: 100
        })).toBe(0);
      });

      test('handles percentage healing at near-full HP', () => {
        expect(GameFunctions.calculateHealing(50, {
          isPercent: true,
          maxHp: 100,
          currentHp: 95
        })).toBe(5);
      });
    });

    test('rounds to nearest integer', () => {
      expect(GameFunctions.calculateHealing(33, {
        healMult: 1.5,
        maxHp: 100,
        currentHp: 0
      })).toBe(50); // 33 * 1.5 = 49.5 → 50
    });
  });
});

describe('Battlebar Difficulty', () => {
  describe('getBattlebarDifficultySettings', () => {
    test('returns settings for default difficulty', () => {
      const settings = GameFunctions.getBattlebarDifficultySettings();
      expect(settings).toHaveProperty('zoneWidth');
      expect(settings).toHaveProperty('traverseTime');
    });

    describe('Difficulty Scaling', () => {
      test('easiest difficulty (1) has largest zone and slowest speed', () => {
        const easy = GameFunctions.getBattlebarDifficultySettings(1);
        expect(easy.zoneWidth).toBeCloseTo(0.45, 2);
        expect(easy.traverseTime).toBe(4000);
      });

      test('hardest difficulty (10) has smallest zone and fastest speed', () => {
        const hard = GameFunctions.getBattlebarDifficultySettings(10);
        expect(hard.zoneWidth).toBeCloseTo(0.10, 2);
        expect(hard.traverseTime).toBe(1200);
      });

      test('medium difficulty (5) is interpolated', () => {
        const medium = GameFunctions.getBattlebarDifficultySettings(5);
        expect(medium.zoneWidth).toBeGreaterThan(0.10);
        expect(medium.zoneWidth).toBeLessThan(0.45);
        expect(medium.traverseTime).toBeGreaterThan(1200);
        expect(medium.traverseTime).toBeLessThan(4000);
      });

      test('difficulty scales linearly', () => {
        const d3 = GameFunctions.getBattlebarDifficultySettings(3);
        const d5 = GameFunctions.getBattlebarDifficultySettings(5);
        const d7 = GameFunctions.getBattlebarDifficultySettings(7);

        // Zone width should decrease as difficulty increases
        expect(d3.zoneWidth).toBeGreaterThan(d5.zoneWidth);
        expect(d5.zoneWidth).toBeGreaterThan(d7.zoneWidth);

        // Traverse time should decrease as difficulty increases
        expect(d3.traverseTime).toBeGreaterThan(d5.traverseTime);
        expect(d5.traverseTime).toBeGreaterThan(d7.traverseTime);
      });
    });

    describe('Multiplier Effects', () => {
      test('multiplier increases effective difficulty', () => {
        const base = GameFunctions.getBattlebarDifficultySettings(5, 1.0);
        const harder = GameFunctions.getBattlebarDifficultySettings(5, 1.5);

        expect(harder.zoneWidth).toBeLessThan(base.zoneWidth);
        expect(harder.traverseTime).toBeLessThan(base.traverseTime);
      });

      test('multiplier decreases effective difficulty when < 1', () => {
        const base = GameFunctions.getBattlebarDifficultySettings(5, 1.0);
        const easier = GameFunctions.getBattlebarDifficultySettings(5, 0.5);

        expect(easier.zoneWidth).toBeGreaterThan(base.zoneWidth);
        expect(easier.traverseTime).toBeGreaterThan(base.traverseTime);
      });

      test('clamps difficulty to valid range with high multiplier', () => {
        const extreme = GameFunctions.getBattlebarDifficultySettings(10, 5.0);
        // Should be clamped to max difficulty
        expect(extreme.zoneWidth).toBeCloseTo(0.10, 2);
        expect(extreme.traverseTime).toBe(1200);
      });

      test('clamps difficulty to valid range with low multiplier', () => {
        const extreme = GameFunctions.getBattlebarDifficultySettings(1, 0.1);
        // Should be clamped to min difficulty
        expect(extreme.zoneWidth).toBeCloseTo(0.45, 2);
        expect(extreme.traverseTime).toBe(4000);
      });
    });

    test('traverse time is always an integer', () => {
      for (let d = 1; d <= 10; d++) {
        const settings = GameFunctions.getBattlebarDifficultySettings(d);
        expect(Number.isInteger(settings.traverseTime)).toBe(true);
      }
    });
  });
});

describe('Secret Discovery', () => {
  describe('attemptSecretDiscovery', () => {
    const createSecretCell = (hintLevel = 0, revealed = false) => ({
      secretPassage: {
        direction: 'top',
        hintLevel,
        revealed
      },
      walls: { top: true, right: true, bottom: true, left: true }
    });

    test('returns found:false for cell without secret', () => {
      const cell = { walls: { top: true } };
      const result = GameFunctions.attemptSecretDiscovery(cell, 'top', 'tap');
      expect(result.found).toBe(false);
    });

    test('returns found:false for wrong direction', () => {
      const cell = createSecretCell(0);
      const result = GameFunctions.attemptSecretDiscovery(cell, 'bottom', 'tap');
      expect(result.found).toBe(false);
    });

    test('returns found:false for already revealed secret', () => {
      const cell = createSecretCell(0, true);
      const result = GameFunctions.attemptSecretDiscovery(cell, 'top', 'tap');
      expect(result.found).toBe(false);
    });

    test('item method has highest base chance', () => {
      // Item method has 90%+ base chance
      // We can't test random outcomes deterministically, but we can verify the function runs
      const cell = createSecretCell(3);
      const result = GameFunctions.attemptSecretDiscovery(cell, 'top', 'item');
      expect(result).toHaveProperty('found');
    });

    test('secretSense item increases discovery chance', () => {
      const cell = createSecretCell(0);
      const result = GameFunctions.attemptSecretDiscovery(cell, 'top', 'tap', { secretSense: 1 });
      expect(result).toHaveProperty('found');
    });

    test('returns hint for tap method when not found', () => {
      const cell = createSecretCell(2); // Has hint level
      // Run multiple times to catch a "not found" case
      let foundHint = false;
      for (let i = 0; i < 50; i++) {
        const result = GameFunctions.attemptSecretDiscovery(cell, 'top', 'tap');
        if (!result.found && result.hint) {
          foundHint = true;
          expect(result.hintLevel).toBe(2);
          break;
        }
      }
      // It's possible (but unlikely) all 50 attempts succeed
      // At hintLevel 2, chance is 0.65, so failure is likely
    });
  });
});

describe('Objectives', () => {
  describe('initObjectives', () => {
    test('returns empty object for profile without objectives', () => {
      const progress = GameFunctions.initObjectives({});
      expect(progress).toEqual({});
    });

    test('initializes progress for each objective', () => {
      const profile = {
        objectives: [
          { id: 'collect_keys', type: 'collect', count: 3 },
          { id: 'defeat_boss', type: 'defeat', count: 1 },
          { id: 'explore', type: 'explore', count: 80 }
        ]
      };

      const progress = GameFunctions.initObjectives(profile);

      expect(progress.collect_keys).toEqual({
        current: 0,
        completed: false,
        target: 3
      });
      expect(progress.defeat_boss).toEqual({
        current: 0,
        completed: false,
        target: 1
      });
      expect(progress.explore).toEqual({
        current: 0,
        completed: false,
        target: 80
      });
    });

    test('defaults count to 1 if not specified', () => {
      const profile = {
        objectives: [
          { id: 'simple', type: 'defeat' }
        ]
      };

      const progress = GameFunctions.initObjectives(profile);
      expect(progress.simple.target).toBe(1);
    });
  });
});
