/**
 * Integration Tests for STScript Hook Execution
 *
 * Verifies that hooks fire correctly and are tracked by the mock.
 * Uses the SillyTavern API mock to capture executed commands.
 */

import { GameFunctions } from '../mocks/gameExtractor.js';
import { createMockContext, resetMocks, getMockCalls } from '../mocks/sillyTavernAPI.js';

describe('Hook Execution Integration', () => {
  let mockContext;

  beforeEach(() => {
    resetMocks();
    mockContext = createMockContext();
  });

  describe('Hook System Flow', () => {
    test('hooks fire only when command is defined', () => {
      const emptyProfile = { onMove: '' };
      const definedProfile = { onMove: '/echo Moved!' };

      const emptyResult = GameFunctions.simulateFireHook(emptyProfile, 'onMove', {});
      const definedResult = GameFunctions.simulateFireHook(definedProfile, 'onMove', {});

      expect(emptyResult.executed).toBe(false);
      expect(definedResult.executed).toBe(true);
    });

    test('parameter substitution happens before macro processing', () => {
      const profile = {
        onDamage: '/echo {{source}} dealt {{roll:{{dice}}}} damage!'
      };

      const result = GameFunctions.simulateFireHook(profile, 'onDamage', {
        source: 'Goblin',
        dice: '2d6+3'
      });

      expect(result.executed).toBe(true);
      expect(result.command).toMatch(/^\/echo Goblin dealt \d+ damage!$/);
    });

    test('all defined maze profile hooks have correct parameter structure', () => {
      const hookParamMap = {
        onMove: { x: 5, y: 10, direction: 'right' },
        onDamage: { amount: 15, source: 'trap', hp: 85, maxHp: 100 },
        onHeal: { amount: 20, source: 'potion', hp: 100, maxHp: 100 },
        onItemAdd: { item: 'key', count: 1, total: 3 },
        onItemRemove: { item: 'potion', count: 1, total: 0 },
        onChestOpen: { x: 3, y: 7, loot: 'gold' },
        onTeleport: { x: 0, y: 0, source: 'portal' },
        onEnemyMove: { minionId: 'goblin_1', x: 4, y: 5, state: 'patrol' },
        onObjectiveProgress: { objectiveId: 'collect_keys', current: 2, target: 5 },
        onObjectiveComplete: { objectiveId: 'collect_keys' },
        onAllObjectivesComplete: {},
        onStatUpdate: { statName: 'moves', value: 42 },
        onEquip: { itemId: 'sword_1', name: 'Iron Sword', slot: 'weapon', attack: 5, defense: 0 },
        onUnequip: { itemId: 'sword_1', name: 'Iron Sword', slot: 'weapon' },
        onEquipmentFound: { itemId: 'armor_1', name: 'Leather Armor', slot: 'armor', rarity: 'common' },
        onXpGain: { amount: 50, source: 'combat', totalXp: 150, level: 2 },
        onLevelUp: { newLevel: 3, skillPointsAvailable: 1, stats: {} },
        onSkillLearn: { skillId: 'fireball', skillName: 'Fireball', rank: 1, tree: 'magic' },
        onSkillUse: { skillId: 'fireball', skillName: 'Fireball', rank: 1, effect: 'burn' },
        onSecretFound: { x: 5, y: 5, direction: 'top' },
        onRoomClear: { roomId: 'room_1', roomType: 'combat', x: 3, y: 3 },
        onZoneUnlock: { zoneId: 'zone_2', zoneName: 'Dark Forest' },
        onPlayerDeath: { source: 'combat' },
        onExploreComplete: { percentage: 100 },
        onQuestComplete: { questId: 'main_1', questName: 'First Steps' },
        onQuestProgression: { questId: 'main_1', step: 2, totalSteps: 5 },
        onMinionAlert: { minionId: 'guard_1', x: 6, y: 7, alertLevel: 'alerted' },
      };

      for (const [hookName, params] of Object.entries(hookParamMap)) {
        // Build a test command that uses all params
        const paramPlaceholders = Object.keys(params).map(k => `{{${k}}}`).join(' ');
        const profile = { [hookName]: `/echo ${hookName}: ${paramPlaceholders}` };

        const result = GameFunctions.simulateFireHook(profile, hookName, params);
        expect(result.executed).toBe(true);
        // Verify no unsubstituted variables remain
        expect(result.command).not.toContain('{{');
      }
    });
  });

  describe('Combat Hooks', () => {
    const createCombatProfile = () => ({
      onTurnStart: '/echo Turn {{turn}}',
      onAttack: '/echo {{attacker}} attacks!',
      onDefend: '/echo {{defender}} defends!',
      onPlayerHit: '/echo Hit for {{damage}}!',
      onEnemyHit: '/echo {{enemy}} takes {{damage}}!',
      onWin: '/mazeitem action="add" item="key"',
      onLose: '/mazedamage amount=10',
    });

    test('combat hooks substitute all parameters', () => {
      const profile = createCombatProfile();

      const turnResult = GameFunctions.simulateFireHook(profile, 'onTurnStart', { turn: 3 });
      expect(turnResult.command).toBe('/echo Turn 3');

      const attackResult = GameFunctions.simulateFireHook(profile, 'onAttack', { attacker: 'Hero' });
      expect(attackResult.command).toBe('/echo Hero attacks!');

      const enemyHitResult = GameFunctions.simulateFireHook(profile, 'onEnemyHit', {
        enemy: 'Goblin',
        damage: 15
      });
      expect(enemyHitResult.command).toBe('/echo Goblin takes 15!');
    });

    test('win/lose hooks execute correctly', () => {
      const profile = createCombatProfile();

      const winResult = GameFunctions.simulateFireHook(profile, 'onWin', {});
      expect(winResult.executed).toBe(true);
      expect(winResult.command).toBe('/mazeitem action="add" item="key"');

      const loseResult = GameFunctions.simulateFireHook(profile, 'onLose', {});
      expect(loseResult.executed).toBe(true);
      expect(loseResult.command).toBe('/mazedamage amount=10');
    });
  });

  describe('Macro Processing in Hooks', () => {
    test('dice roll macros generate numeric values', () => {
      const profile = { onDamage: '/echo Took {{roll:1d6}} extra damage!' };

      for (let i = 0; i < 20; i++) {
        const result = GameFunctions.simulateFireHook(profile, 'onDamage', {});
        expect(result.executed).toBe(true);
        const match = result.command.match(/Took (\d+) extra damage/);
        expect(match).toBeTruthy();
        const value = parseInt(match[1], 10);
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(6);
      }
    });

    test('random macros generate values in range', () => {
      const profile = { onLoot: '/echo Found {{random:50:100}} gold!' };

      for (let i = 0; i < 20; i++) {
        const result = GameFunctions.simulateFireHook(profile, 'onLoot', {});
        expect(result.executed).toBe(true);
        const match = result.command.match(/Found (\d+) gold/);
        expect(match).toBeTruthy();
        const value = parseInt(match[1], 10);
        expect(value).toBeGreaterThanOrEqual(50);
        expect(value).toBeLessThanOrEqual(100);
      }
    });

    test('combined macros and variables work together', () => {
      const profile = {
        onAttack: '/echo {{attacker}} deals {{roll:2d6+{{bonus}}}} to {{target}}!'
      };

      const result = GameFunctions.simulateFireHook(profile, 'onAttack', {
        attacker: 'Hero',
        target: 'Goblin',
        bonus: '3'
      });

      expect(result.executed).toBe(true);
      expect(result.command).toMatch(/^\/echo Hero deals \d+ to Goblin!$/);
    });
  });

  describe('Hook Chaining', () => {
    test('piped commands remain intact after processing', () => {
      const profile = {
        onWin: '/mazeitem action="add" item="key" | /mazeheal amount=20 | /echo Victory!'
      };

      const result = GameFunctions.simulateFireHook(profile, 'onWin', {});
      expect(result.executed).toBe(true);
      expect(result.command).toBe('/mazeitem action="add" item="key" | /mazeheal amount=20 | /echo Victory!');
    });

    test('variables substitute across piped commands', () => {
      const profile = {
        onWin: '/echo {{player}} won! | /mazeitem action="add" item="{{reward}}"'
      };

      const result = GameFunctions.simulateFireHook(profile, 'onWin', {
        player: 'Hero',
        reward: 'gold_key'
      });

      expect(result.command).toBe('/echo Hero won! | /mazeitem action="add" item="gold_key"');
    });
  });

  describe('Error Scenarios', () => {
    test('missing required parameter causes validation failure', () => {
      const profile = { onMove: '/echo {{player}} moved to {{destination}}' };

      // Only provide one of two required params
      const result = GameFunctions.simulateFireHook(profile, 'onMove', { player: 'Hero' });
      expect(result.executed).toBe(false);
      expect(result.error).toContain('{{destination}}');
    });

    test('non-existent hook name returns error', () => {
      const profile = { onMove: '/echo Moved!' };

      const result = GameFunctions.simulateFireHook(profile, 'onNonExistent', {});
      expect(result.executed).toBe(false);
      expect(result.error).toBe('Hook not defined or empty');
    });

    test('null command in profile returns error', () => {
      const profile = { onMove: null };

      const result = GameFunctions.simulateFireHook(profile, 'onMove', {});
      expect(result.executed).toBe(false);
      expect(result.error).toBe('Hook not defined or empty');
    });
  });

  describe('Mock API Tracking', () => {
    test('executeSlashCommandsWithOptions mock captures calls', async () => {
      // Directly call the mock to verify tracking works
      await mockContext.executeSlashCommandsWithOptions('/echo Test');
      await mockContext.executeSlashCommandsWithOptions('/setvar key=test value=123');

      const calls = getMockCalls();
      expect(calls.executeSlashCommands).toHaveLength(2);
      expect(calls.executeSlashCommands[0].commands).toBe('/echo Test');
      expect(calls.executeSlashCommands[1].commands).toBe('/setvar key=test value=123');
    });

    test('mock returns expected pipe result', async () => {
      const result = await mockContext.executeSlashCommandsWithOptions('/echo Hello');
      expect(result).toEqual({ pipe: '' });
    });

    test('multiple hook simulations can be tracked', () => {
      const profile = {
        onMove: '/echo Moved!',
        onDamage: '/echo Damage!',
        onHeal: '/echo Healed!',
      };

      const commands = [];

      // Simulate several hooks
      let result = GameFunctions.simulateFireHook(profile, 'onMove', {});
      if (result.executed) commands.push(result.command);

      result = GameFunctions.simulateFireHook(profile, 'onDamage', {});
      if (result.executed) commands.push(result.command);

      result = GameFunctions.simulateFireHook(profile, 'onHeal', {});
      if (result.executed) commands.push(result.command);

      expect(commands).toEqual([
        '/echo Moved!',
        '/echo Damage!',
        '/echo Healed!',
      ]);
    });
  });
});
