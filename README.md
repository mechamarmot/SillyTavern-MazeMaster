# MazeMaster

A **Roguelike RPG Adventure Toolkit** for SillyTavern featuring procedurally generated dungeons, 8 combat mini games, HP system, and inventory management. Create immersive dungeon-crawling experiences with LLM-enhanced narration.

**Author:** mechamarmot

---

## What's New in v1.3.0

- **6 Combat Modes** - Turn-based, QTE, Dice, Stealth, Puzzle, and Negotiation encounters
- **HP System** - Health points with damage/heal mechanics and visual effects
- **15 Inventory Items** - Core (key, stealth, strike, execute), Special (floorKey, portalStone, minionBane, mapFragment, timeShard, voidWalk), and HP items (potions, elixirs, revival charms)
- **Battlebar 1-10 Difficulty** - Continuous difficulty scaling with maze multipliers
- **Factory Defaults System** - Automatic profile updates when new defaults are added
- **Merchant Item Pools** - Configure item pools for merchant encounters

<details>
<summary>v1.2.1 Changes</summary>

- Isometric Renderer with Kenney sprite support
- Multi-Floor Dungeons with staircases
- Fog of War visibility system
- 12 Default Maze Profiles (Fantasy, Horror, Sci-Fi, Cyberpunk, Western, Action)
- Themed Content Packs for minions, traps, battlebars, and wheels
</details>

---

## Installation

### Via SillyTavern Extension Manager (Recommended)

1. Open SillyTavern and navigate to **Extensions** > **Install Extension**
2. Enter the repository URL: `https://github.com/mechamarmot/SillyTavern-MazeMaster`
3. Click **Install** and refresh SillyTavern

### Manual Installation

1. Clone or download this repository
2. Copy the folder to: `SillyTavern/public/scripts/extensions/third-party/`
3. Restart SillyTavern

---

## The Maze

The heart of MazeMaster is a complete dungeon-crawling adventure. Players navigate procedurally generated mazes, encountering minions, opening chests, avoiding traps, and reaching the exit.

<table>
<tr>
<td align="center"><img src="screenshots/maze.png" width="380"><br><em>Classic Top-Down View</em></td>
<td align="center"><img src="screenshots/isometric-dungeon.png" width="380"><br><em>Isometric 2.5D Rendering</em></td>
</tr>
<tr>
<td align="center"><img src="screenshots/isometric-gameplay.png" width="380"><br><em>Multi-Floor Exploration</em></td>
<td align="center"><img src="screenshots/isometric-fog.png" width="380"><br><em>Fog of War System</em></td>
</tr>
</table>

### Features

- **Procedural Generation** - Every maze is unique (5x5 to 20x20 grids)
- **Multi-Floor Dungeons** - Staircases connect multiple levels
- **Isometric Renderer** - Beautiful 2.5D view with Kenney sprite support
- **Fog of War** - Tiles reveal as you explore
- **Minion Encounters** - NPCs that trigger mini games
- **Chest System** - Regular, locked, and mimic chests with loot tables
- **Trap Tiles** - Hazards with custom effects
- **Story Milestones** - Narrative beats at exploration percentages

### Minion Types

When you encounter a minion in the maze, it triggers one of these behaviors:

| Type | Behavior |
|------|----------|
| Messenger | Displays a message (story, hints, lore) |
| Battlebar | Triggers timing-based combat |
| Prize Wheel | Triggers a wheel spin for rewards |
| Merchant | Opens a shop to buy/sell items |
| Combat | Triggers any of the 6 combat mini games |

### Items

| Item | Effect |
|------|--------|
| Key | Opens locked chests |
| Strike (POW) | Guarantees next battlebar hit |
| Stealth | Skips next encounter |
| Execute (GRANDPOW) | Instantly wins any battlebar |
| Floor Key | Unlocks staircases to next floor |
| Healing Potions | Restore HP (25%, 50%, or 100%) |
| Revival Charm | Auto-resurrect on death |

### HP System

MazeMaster features a roguelike HP system that tracks player health across encounters:

- **Damage Sources** - Traps, failed combat, minion attacks, and environmental hazards
- **Healing** - Potions, rest points, victory rewards, and STScript commands
- **Death & Revival** - Revival Charms auto-trigger on death; otherwise game over
- **Difficulty Scaling** - Easy mode has more HP and less damage; Nightmare is brutal
- **Visual Feedback** - HP bar with damage flash (red) and heal flash (green) effects
- **STScript Hooks** - `onDamage`, `onHeal`, and `onPlayerDeath` for custom behaviors

Control HP via commands: `/mazehp` (status), `/mazeheal amount=50`, `/mazedamage amount=25`

---

## Mini Games

MazeMaster includes **8 modular mini games** that can be used in two ways:

1. **Within the Maze** - Triggered by minion encounters, chests, traps, or exit conditions
2. **Standalone** - Called directly via slash commands from anywhere (character cards, Quick Replies, World Info, other extensions)

Each mini game has configurable profiles with STScript hooks for win/lose conditions, making them perfect for skill checks, combat, puzzles, or any interactive scenario.

<table>
<tr>
<td align="center"><img src="screenshots/combat-turnbased.png" width="280"><br><em>Turn-Based Combat</em></td>
<td align="center"><img src="screenshots/combat-qte.png" width="280"><br><em>QTE Challenge</em></td>
<td align="center"><img src="screenshots/combat-dice.png" width="280"><br><em>Dice Roll</em></td>
</tr>
<tr>
<td align="center"><img src="screenshots/combat-stealth.png" width="280"><br><em>Stealth Encounter</em></td>
<td align="center"><img src="screenshots/combat-puzzle.png" width="280"><br><em>Puzzle Challenge</em></td>
<td align="center"><img src="screenshots/combat-negotiate.png" width="280"><br><em>Negotiation</em></td>
</tr>
<tr>
<td align="center"><img src="screenshots/wheel.png" width="280"><br><em>Prize Wheel</em></td>
<td align="center"><img src="screenshots/battlebar.png" width="280"><br><em>Battlebar</em></td>
<td align="center"></td>
</tr>
</table>

### Mini Game Types

| Game | Description | Slash Command |
|------|-------------|---------------|
| **Battlebar** | Timing-based combat - hit the green zone | `/battlebar profile="Name"` |
| **Prize Wheel** | Spin-to-win with weighted segments | `/wheel profile="Name"` |
| **Turn-Based** | RPG combat with Attack/Defend/Item/Flee | `/turnbased profile="Name"` |
| **QTE** | Quick-time events - press keys as prompted | `/qte profile="Name"` |
| **Dice** | Roll dice against a target number | `/dice profile="Name"` |
| **Stealth** | Sneak past guards using Advance/Hide/Distract | `/stealth profile="Name"` |
| **Puzzle** | Sequence/memory puzzles on a grid | `/puzzle profile="Name"` |
| **Negotiation** | Social encounters with Persuade/Intimidate/Bribe | `/negotiate profile="Name"` |

### Standalone Usage Examples

Use mini games outside of mazes for any purpose:

```
/wheel profile="Loot Table"           // Random rewards
/battlebar profile="Boss Fight"       // Combat encounter
/dice profile="Skill Check"           // Ability check
/negotiate profile="Merchant Haggle"  // Social encounter
/stealth profile="Guard Patrol"       // Infiltration scene
```

### In-Maze Integration

When configured as minion encounters, mini games integrate seamlessly:
- **Win** rewards items, opens paths, or advances the story
- **Lose** deals HP damage, spawns traps, or triggers consequences
- Results feed into maze statistics and STScript hooks

---

## Configuration

<table>
<tr>
<td align="center"><img src="screenshots/config-maze.png" width="380"><br><em>Maze Profile Configuration</em></td>
<td align="center"><img src="screenshots/config-wheel.png" width="380"><br><em>Wheel Segment Setup</em></td>
</tr>
</table>

<p align="center">
  <img src="screenshots/config-minions.png" alt="Minions Configuration" width="400">
</p>
<p align="center"><em>Minions - Define NPCs with types, images, and encounter scripts</em></p>

### Tabs

| Tab | Purpose |
|-----|---------|
| **Maze** | Grid size, encounters, chests, loot, milestones, win/lose conditions |
| **Wheel** | Segment text, sizes, colors, STScript commands |
| **Battlebar** | Difficulty, hit counts, stage images, event hooks |
| **Combat** | Turn-based, QTE, Dice, Stealth, Puzzle, Negotiation profiles |
| **Minions** | Reusable NPC configurations with types and scripts |
| **Traps** | Trap configurations with images and effects |

---

## STScript Integration

**MazeMaster is built for STScript.** Every component supports callbacks:

- **Maze events** - onEnter, onExit, onMove, onFloorChange, onEncounter, onChest, onTrap
- **HP events** - onDamage, onHeal, onPlayerDeath
- **Mini game events** - onWin, onLose, onHit, onMiss, and game-specific hooks

### Message Macros

Trigger games naturally through dialogue:

```
"You dare challenge me? {{battlebar:Boss Fight}}"
"Spin for your reward! {{wheel:Treasure}}"
"The ancient door requires a test of wit. {{puzzle:Ancient Riddle}}"
```

---

## Slash Commands

| Command | Description |
|---------|-------------|
| `/maze profile="Name"` | Start a maze |
| `/mazeclose` | Close active maze |
| `/mazestats` | Get session statistics |
| `/mazehp` | Get/set player HP |
| `/mazeitem action="add" item="key"` | Manage inventory |
| `/wheel`, `/battlebar`, `/turnbased`, `/qte`, `/dice`, `/stealth`, `/puzzle`, `/negotiate` | Launch mini games |

---

## Quick Start

### Option 1: Jump Right In
MazeMaster comes with **12 pre-built maze profiles** across 6 themes (Fantasy, Horror, Sci-Fi, Cyberpunk, Western, Action). Just open the extension panel, select a profile, and click **Play**.

### Option 2: Test the Mini Games
Try any mini game standalone to see how they work:
```
/turnbased profile="Training Bout"    // Learn turn-based combat
/dice profile="Lucky Roll"            // Simple dice challenge
/stealth profile="Simple Sneak"       // Stealth mechanics
/puzzle profile="Simple Riddle"       // Sequence puzzle
/negotiate profile="Friendly Chat"    // Social encounter
/wheel profile="Blessing Wheel"       // Spin for rewards
/battlebar profile="Training Dummy"   // Timing combat
```

### Option 3: Build Your Own
1. **Minions Tab** - Create NPCs (messengers, merchants, combat triggers)
2. **Combat Tabs** - Configure mini game profiles with custom difficulty
3. **Maze Tab** - Build a dungeon profile with your encounters, loot, and win conditions
4. Click **Play** or use `/maze profile="Your Profile"`

---

## Tips

- Use **Intelligent Distribute** to auto-balance encounter percentages
- **POW** and **Stealth** items are valuable - use strategically!
- Chain STScript commands with `|` for complex behaviors
- Test mini games with the **Preview buttons** before adding to mazes

---

## License

AGPL-3.0 - See LICENSE file

---

## Support

For issues, feature requests, or contributions, visit the [GitHub repository](https://github.com/mechamarmot/SillyTavern-MazeMaster).
