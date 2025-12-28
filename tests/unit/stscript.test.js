/**
 * Unit Tests for STScript Hook System
 *
 * Tests macro processing and hook execution including:
 * - Dice roll macros ({{roll:XdY+Z}})
 * - Random number macros ({{random:min:max}})
 * - Template variable substitution
 * - Hook validation and execution
 */

import { GameFunctions } from '../mocks/gameExtractor.js';

describe('STScript Macros', () => {
  describe('rollDice', () => {
    test('returns 0 for invalid input', () => {
      expect(GameFunctions.rollDice(null)).toBe(0);
      expect(GameFunctions.rollDice(undefined)).toBe(0);
      expect(GameFunctions.rollDice('')).toBe(0);
      expect(GameFunctions.rollDice(123)).toBe(0);
    });

    test('returns 0 for invalid notation', () => {
      expect(GameFunctions.rollDice('abc')).toBe(0);
      expect(GameFunctions.rollDice('d6')).toBe(0);
      expect(GameFunctions.rollDice('1d')).toBe(0);
      expect(GameFunctions.rollDice('1')).toBe(0);
      expect(GameFunctions.rollDice('0d6')).toBe(0);
      expect(GameFunctions.rollDice('1d0')).toBe(0);
    });

    test('rolls single die correctly (1d6)', () => {
      for (let i = 0; i < 100; i++) {
        const result = GameFunctions.rollDice('1d6');
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(6);
      }
    });

    test('rolls multiple dice (2d6)', () => {
      for (let i = 0; i < 100; i++) {
        const result = GameFunctions.rollDice('2d6');
        expect(result).toBeGreaterThanOrEqual(2);
        expect(result).toBeLessThanOrEqual(12);
      }
    });

    test('rolls d20 correctly', () => {
      for (let i = 0; i < 100; i++) {
        const result = GameFunctions.rollDice('1d20');
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(20);
      }
    });

    test('applies positive modifier (+3)', () => {
      for (let i = 0; i < 100; i++) {
        const result = GameFunctions.rollDice('1d6+3');
        expect(result).toBeGreaterThanOrEqual(4);
        expect(result).toBeLessThanOrEqual(9);
      }
    });

    test('applies negative modifier (-2)', () => {
      for (let i = 0; i < 100; i++) {
        const result = GameFunctions.rollDice('1d6-2');
        expect(result).toBeGreaterThanOrEqual(-1);
        expect(result).toBeLessThanOrEqual(4);
      }
    });

    test('handles large dice (3d10+5)', () => {
      for (let i = 0; i < 100; i++) {
        const result = GameFunctions.rollDice('3d10+5');
        expect(result).toBeGreaterThanOrEqual(8);
        expect(result).toBeLessThanOrEqual(35);
      }
    });

    test('is case insensitive', () => {
      const lower = GameFunctions.rollDice('1d6');
      const upper = GameFunctions.rollDice('1D6');
      expect(lower).toBeGreaterThanOrEqual(1);
      expect(upper).toBeGreaterThanOrEqual(1);
    });
  });

  describe('processMazeMasterMacros', () => {
    test('returns input unchanged for non-string values', () => {
      expect(GameFunctions.processMazeMasterMacros(null)).toBe(null);
      expect(GameFunctions.processMazeMasterMacros(undefined)).toBe(undefined);
      expect(GameFunctions.processMazeMasterMacros(123)).toBe(123);
    });

    test('returns text unchanged when no macros present', () => {
      const text = 'Hello world, no macros here!';
      expect(GameFunctions.processMazeMasterMacros(text)).toBe(text);
    });

    describe('Dice Roll Macros', () => {
      test('processes single dice roll macro', () => {
        const result = GameFunctions.processMazeMasterMacros('You roll {{roll:1d6}}!');
        expect(result).toMatch(/^You roll \d+!$/);
        const match = result.match(/You roll (\d+)!/);
        const value = parseInt(match[1], 10);
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(6);
      });

      test('processes multiple dice roll macros', () => {
        const result = GameFunctions.processMazeMasterMacros('Roll 1: {{roll:1d6}}, Roll 2: {{roll:1d6}}');
        expect(result).toMatch(/^Roll 1: \d+, Roll 2: \d+$/);
      });

      test('processes dice roll with modifier', () => {
        const result = GameFunctions.processMazeMasterMacros('Damage: {{roll:2d6+5}}');
        expect(result).toMatch(/^Damage: \d+$/);
        const value = parseInt(result.match(/Damage: (\d+)/)[1], 10);
        expect(value).toBeGreaterThanOrEqual(7);
        expect(value).toBeLessThanOrEqual(17);
      });

      test('handles whitespace in notation', () => {
        const result = GameFunctions.processMazeMasterMacros('{{roll: 1d6 }}');
        expect(result).toMatch(/^\d+$/);
      });
    });

    describe('Random Number Macros', () => {
      test('processes random number macro', () => {
        for (let i = 0; i < 50; i++) {
          const result = GameFunctions.processMazeMasterMacros('Value: {{random:1:10}}');
          expect(result).toMatch(/^Value: \d+$/);
          const value = parseInt(result.match(/Value: (\d+)/)[1], 10);
          expect(value).toBeGreaterThanOrEqual(1);
          expect(value).toBeLessThanOrEqual(10);
        }
      });

      test('processes multiple random macros', () => {
        const result = GameFunctions.processMazeMasterMacros('X={{random:0:100}}, Y={{random:0:100}}');
        expect(result).toMatch(/^X=\d+, Y=\d+$/);
      });

      test('handles edge case ranges', () => {
        for (let i = 0; i < 20; i++) {
          const result = GameFunctions.processMazeMasterMacros('{{random:5:5}}');
          expect(result).toBe('5');
        }
      });

      test('handles larger ranges', () => {
        for (let i = 0; i < 50; i++) {
          const result = GameFunctions.processMazeMasterMacros('{{random:100:200}}');
          const value = parseInt(result, 10);
          expect(value).toBeGreaterThanOrEqual(100);
          expect(value).toBeLessThanOrEqual(200);
        }
      });
    });

    describe('Combined Macros', () => {
      test('processes both dice and random macros in same text', () => {
        const text = 'Roll {{roll:1d20}} and get {{random:1:100}} gold!';
        const result = GameFunctions.processMazeMasterMacros(text);
        expect(result).toMatch(/^Roll \d+ and get \d+ gold!$/);
      });

      test('processes embedded macros in STScript command', () => {
        const command = '/setvar key=damage value={{roll:2d8+4}}';
        const result = GameFunctions.processMazeMasterMacros(command);
        expect(result).toMatch(/^\/setvar key=damage value=\d+$/);
      });
    });
  });
});

describe('Template Variable Substitution', () => {
  describe('substituteHookParams', () => {
    test('returns input unchanged for non-string values', () => {
      expect(GameFunctions.substituteHookParams(null, {})).toBe(null);
      expect(GameFunctions.substituteHookParams(undefined, {})).toBe(undefined);
    });

    test('returns text unchanged when no params provided', () => {
      const text = 'Hello {{name}}!';
      expect(GameFunctions.substituteHookParams(text, {})).toBe(text);
    });

    test('substitutes single variable', () => {
      const result = GameFunctions.substituteHookParams('Hello {{name}}!', { name: 'World' });
      expect(result).toBe('Hello World!');
    });

    test('substitutes multiple variables', () => {
      const result = GameFunctions.substituteHookParams(
        'Player {{playerName}} at ({{x}}, {{y}})',
        { playerName: 'Hero', x: 5, y: 10 }
      );
      expect(result).toBe('Player Hero at (5, 10)');
    });

    test('substitutes same variable multiple times', () => {
      const result = GameFunctions.substituteHookParams(
        '{{item}} + {{item}} = 2x {{item}}',
        { item: 'Potion' }
      );
      expect(result).toBe('Potion + Potion = 2x Potion');
    });

    test('converts non-string values to strings', () => {
      const result = GameFunctions.substituteHookParams(
        'HP: {{hp}}, Gold: {{gold}}',
        { hp: 100, gold: 500.5 }
      );
      expect(result).toBe('HP: 100, Gold: 500.5');
    });

    test('handles boolean values', () => {
      const result = GameFunctions.substituteHookParams(
        'Alive: {{alive}}, Dead: {{dead}}',
        { alive: true, dead: false }
      );
      expect(result).toBe('Alive: true, Dead: false');
    });

    test('leaves unmatched variables unchanged', () => {
      const result = GameFunctions.substituteHookParams(
        '{{known}} and {{unknown}}',
        { known: 'value' }
      );
      expect(result).toBe('value and {{unknown}}');
    });
  });
});

describe('Hook Validation', () => {
  describe('validateHookCommand', () => {
    test('rejects null/undefined commands', () => {
      expect(GameFunctions.validateHookCommand(null)).toEqual({
        valid: false,
        reason: 'Command is empty or not a string'
      });
      expect(GameFunctions.validateHookCommand(undefined)).toEqual({
        valid: false,
        reason: 'Command is empty or not a string'
      });
    });

    test('rejects empty string commands', () => {
      expect(GameFunctions.validateHookCommand('')).toEqual({
        valid: false,
        reason: 'Command is empty or not a string'
      });
      expect(GameFunctions.validateHookCommand('   ')).toEqual({
        valid: false,
        reason: 'Command is empty after trimming'
      });
    });

    test('accepts valid STScript commands', () => {
      expect(GameFunctions.validateHookCommand('/echo Hello')).toEqual({ valid: true });
      expect(GameFunctions.validateHookCommand('/setvar key=test value=123')).toEqual({ valid: true });
    });

    test('allows dice roll macros', () => {
      expect(GameFunctions.validateHookCommand('/setvar key=dmg value={{roll:2d6}}')).toEqual({ valid: true });
    });

    test('allows random macros', () => {
      expect(GameFunctions.validateHookCommand('/echo {{random:1:100}}')).toEqual({ valid: true });
    });

    test('rejects unsubstituted template variables', () => {
      const result = GameFunctions.validateHookCommand('/echo {{playerName}} took damage');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Unsubstituted variables');
      expect(result.reason).toContain('{{playerName}}');
    });

    test('rejects multiple unsubstituted variables', () => {
      const result = GameFunctions.validateHookCommand('/say {{char}} hit {{target}} for {{damage}}');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('{{char}}');
      expect(result.reason).toContain('{{target}}');
      expect(result.reason).toContain('{{damage}}');
    });

    test('allows valid macros while rejecting unsubstituted vars', () => {
      const result = GameFunctions.validateHookCommand('/echo {{roll:1d6}} damage to {{target}}');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('{{target}}');
      expect(result.reason).not.toContain('roll');
    });
  });
});

describe('Hook Execution Simulation', () => {
  describe('simulateFireHook', () => {
    test('returns error when no profile provided', () => {
      const result = GameFunctions.simulateFireHook(null, 'onMove', {});
      expect(result).toEqual({
        executed: false,
        error: 'No profile provided'
      });
    });

    test('returns error when hook is not defined', () => {
      const profile = { name: 'Test' };
      const result = GameFunctions.simulateFireHook(profile, 'onMove', {});
      expect(result).toEqual({
        executed: false,
        error: 'Hook not defined or empty'
      });
    });

    test('returns error for empty hook string', () => {
      const profile = { onMove: '' };
      const result = GameFunctions.simulateFireHook(profile, 'onMove', {});
      expect(result).toEqual({
        executed: false,
        error: 'Hook not defined or empty'
      });
    });

    test('returns error for whitespace-only hook', () => {
      const profile = { onMove: '   ' };
      const result = GameFunctions.simulateFireHook(profile, 'onMove', {});
      expect(result).toEqual({
        executed: false,
        error: 'Hook not defined or empty'
      });
    });

    test('executes simple hook command', () => {
      const profile = { onMove: '/echo Player moved!' };
      const result = GameFunctions.simulateFireHook(profile, 'onMove', {});
      expect(result).toEqual({
        executed: true,
        command: '/echo Player moved!'
      });
    });

    test('substitutes template variables', () => {
      const profile = { onMove: '/echo Player moved to ({{x}}, {{y}})' };
      const result = GameFunctions.simulateFireHook(profile, 'onMove', { x: 5, y: 10 });
      expect(result).toEqual({
        executed: true,
        command: '/echo Player moved to (5, 10)'
      });
    });

    test('processes dice macros in hook', () => {
      const profile = { onDamage: '/setvar key=damage value={{roll:2d6}}' };
      const result = GameFunctions.simulateFireHook(profile, 'onDamage', {});
      expect(result.executed).toBe(true);
      expect(result.command).toMatch(/^\/setvar key=damage value=\d+$/);
    });

    test('processes random macros in hook', () => {
      const profile = { onLoot: '/echo Found {{random:1:100}} gold!' };
      const result = GameFunctions.simulateFireHook(profile, 'onLoot', {});
      expect(result.executed).toBe(true);
      expect(result.command).toMatch(/^\/echo Found \d+ gold!$/);
    });

    test('combines variable substitution with macros', () => {
      const profile = { onAttack: '/echo {{attacker}} deals {{roll:1d8+2}} damage to {{target}}' };
      const result = GameFunctions.simulateFireHook(profile, 'onAttack', {
        attacker: 'Hero',
        target: 'Goblin'
      });
      expect(result.executed).toBe(true);
      expect(result.command).toMatch(/^\/echo Hero deals \d+ damage to Goblin$/);
    });

    test('fails when template variable not substituted', () => {
      const profile = { onMove: '/echo {{player}} moved to {{x}}, {{y}}' };
      const result = GameFunctions.simulateFireHook(profile, 'onMove', { x: 5, y: 10 });
      expect(result.executed).toBe(false);
      expect(result.error).toContain('{{player}}');
    });
  });
});

describe('Hook Integration Scenarios', () => {
  const createMazeProfile = () => ({
    name: 'Test Dungeon',
    onMove: '/echo Moved to ({{x}}, {{y}})',
    onDamage: '/echo Took {{damage}} damage! HP: {{hp}}',
    onItemPickup: '/echo Found {{itemName}}! +{{quantity}}',
    onCombatStart: '/echo Battle begins! Enemy: {{enemyName}}',
    onCombatEnd: '/echo Victory! Gained {{xp}} XP',
    onFloorChange: '/echo Now on floor {{floor}}',
  });

  test('onMove hook with coordinates', () => {
    const profile = createMazeProfile();
    const result = GameFunctions.simulateFireHook(profile, 'onMove', { x: 3, y: 7 });
    expect(result.command).toBe('/echo Moved to (3, 7)');
  });

  test('onDamage hook with HP tracking', () => {
    const profile = createMazeProfile();
    const result = GameFunctions.simulateFireHook(profile, 'onDamage', { damage: 15, hp: 85 });
    expect(result.command).toBe('/echo Took 15 damage! HP: 85');
  });

  test('onItemPickup hook with item details', () => {
    const profile = createMazeProfile();
    const result = GameFunctions.simulateFireHook(profile, 'onItemPickup', {
      itemName: 'Health Potion',
      quantity: 2
    });
    expect(result.command).toBe('/echo Found Health Potion! +2');
  });

  test('onCombatStart hook with enemy info', () => {
    const profile = createMazeProfile();
    const result = GameFunctions.simulateFireHook(profile, 'onCombatStart', {
      enemyName: 'Shadow Dragon'
    });
    expect(result.command).toBe('/echo Battle begins! Enemy: Shadow Dragon');
  });

  test('onCombatEnd hook with XP reward', () => {
    const profile = createMazeProfile();
    const result = GameFunctions.simulateFireHook(profile, 'onCombatEnd', { xp: 250 });
    expect(result.command).toBe('/echo Victory! Gained 250 XP');
  });

  test('onFloorChange hook', () => {
    const profile = createMazeProfile();
    const result = GameFunctions.simulateFireHook(profile, 'onFloorChange', { floor: 5 });
    expect(result.command).toBe('/echo Now on floor 5');
  });

  test('hook with dice roll for dynamic damage', () => {
    const profile = {
      onAttack: '/echo {{attacker}} hits for {{roll:2d6+{{modifier}}}} damage!'
    };
    // Note: This won't work perfectly because we substitute first then process macros
    // But this tests the expected workflow
    const result = GameFunctions.simulateFireHook(profile, 'onAttack', {
      attacker: 'Warrior',
      modifier: '3'
    });
    // After substitution: /echo Warrior hits for {{roll:2d6+3}} damage!
    // After macro processing: /echo Warrior hits for X damage!
    expect(result.executed).toBe(true);
    expect(result.command).toMatch(/^\/echo Warrior hits for \d+ damage!$/);
  });

  test('complex hook with multiple macros and variables', () => {
    const profile = {
      onEncounter: '/echo {{enemy}} appeared at ({{x}},{{y}})! Initiative: {{roll:1d20}}, Threat: {{random:1:10}}'
    };
    const result = GameFunctions.simulateFireHook(profile, 'onEncounter', {
      enemy: 'Dire Wolf',
      x: 4,
      y: 8
    });
    expect(result.executed).toBe(true);
    expect(result.command).toMatch(/^\/echo Dire Wolf appeared at \(4,8\)! Initiative: \d+, Threat: \d+$/);
  });
});

describe('Edge Cases and Error Handling', () => {
  test('handles special characters in variable values', () => {
    const profile = { onChat: '/echo {{message}}' };
    const result = GameFunctions.simulateFireHook(profile, 'onChat', {
      message: "Hello, World! <>&\"'"
    });
    expect(result.command).toBe("/echo Hello, World! <>&\"'");
  });

  test('handles numeric variable values', () => {
    const profile = { onStat: '/setvar key=hp value={{hp}}' };
    const result = GameFunctions.simulateFireHook(profile, 'onStat', { hp: 100 });
    expect(result.command).toBe('/setvar key=hp value=100');
  });

  test('handles zero values', () => {
    const profile = { onStat: '/setvar key=score value={{score}}' };
    const result = GameFunctions.simulateFireHook(profile, 'onStat', { score: 0 });
    expect(result.command).toBe('/setvar key=score value=0');
  });

  test('handles empty string values', () => {
    const profile = { onStat: '/echo "{{value}}"' };
    const result = GameFunctions.simulateFireHook(profile, 'onStat', { value: '' });
    expect(result.command).toBe('/echo ""');
  });

  test('handles very long commands', () => {
    const longMessage = 'A'.repeat(1000);
    const profile = { onLong: `/echo ${longMessage}` };
    const result = GameFunctions.simulateFireHook(profile, 'onLong', {});
    expect(result.executed).toBe(true);
    expect(result.command.length).toBe(6 + 1000);
  });
});
