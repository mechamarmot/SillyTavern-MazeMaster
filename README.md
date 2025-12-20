# MazeMaster

A comprehensive game system extension for SillyTavern featuring procedurally generated mazes, prize wheels, and battle challenges. Create immersive dungeon-crawling experiences with LLM-enhanced narration.

**Author:** mechamarmot

---

## Installation

### Via SillyTavern Extension Manager (Recommended)

1. Open SillyTavern and navigate to **Extensions** > **Install Extension**
2. Enter the repository URL: `https://github.com/mechamarmot/SillyTavern-MazeMaster`
3. Click **Install**
4. Refresh SillyTavern

### Manual Installation

1. Clone or download this repository
2. Copy the folder to: `SillyTavern/public/scripts/extensions/third-party/`
3. Restart SillyTavern

---

## What is MazeMaster?

MazeMaster is a modular game system that brings interactive gameplay elements to SillyTavern. At its core, it's a complete dungeon-crawling experience with procedurally generated mazes, but its components can also be used independently for any purpose.

### The Three Components

| Component | Description |
|-----------|-------------|
| **Prize Wheel** | Spin-to-win wheel with configurable segments and callbacks |
| **Battlebar** | Timing-based combat minigame with hit zones and progression |
| **Maze** | Full dungeon-crawling experience combining all components |

---

## STScript Integration

**MazeMaster is built from the ground up for STScript integration.** Almost every feature supports STScript callbacks, making it easy to incorporate into character cards, world info, Quick Replies, or other extensions.

### Every Action Can Run Scripts

- **Wheel segments** - execute commands when landed on
- **Battlebar events** - hit, miss, win, and lose each have command slots
- **Minion encounters** - run scripts when triggered
- **Trap triggers** - execute scripts when stepped on
- **Maze completion** - win/lose runs configurable commands
- **Chest events** - trigger custom behaviors

### Example Use Cases
- Update character stats or variables
- Trigger chat messages or narration
- Modify world state
- Chain into other extensions
- Create complex branching gameplay

---

## Slash Commands

All components can be triggered via slash commands from anywhere:

| Command | Description |
|---------|-------------|
| `/wheel profile="Name"` | Opens the specified wheel profile |
| `/battlebar profile="Name"` | Starts the specified battlebar challenge |
| `/maze profile="Name"` | Starts the specified maze |
| `/mazeminion name="Name" message="Text"` | Sets minion display in active maze |

---

## Message Macros

MazeMaster also supports **message macros** that automatically trigger when they appear in chat (from characters or users):

| Macro | Effect |
|-------|--------|
| `{{wheel:ProfileName}}` | Automatically opens the wheel |
| `{{battlebar:ProfileName}}` | Automatically starts the battlebar |
| `{{maze:ProfileName}}` | Automatically starts the maze |

This allows characters to trigger game events naturally through their dialogue:

```
"Step right up and spin the wheel of fortune! {{wheel:Fortune Wheel}}"
```

```
"You dare challenge me? Then face my blade! {{battlebar:Boss Fight}}"
```

---

## Prize Wheel (In-Depth)

The Prize Wheel is a fully customizable spin-to-win game that can be used for rewards, random events, decision making, or any scenario where you want randomized outcomes.

### Features
- Unlimited segments per wheel
- Variable segment sizes (weighted probability)
- Respin capability on specific segments
- Segment randomization option
- Adjustable difficulty (spin speed)
- STScript command per segment

### Segment Configuration

Each segment has:
- **Trigger Name** - Identifier for callbacks
- **Display Text** - What shows on the wheel
- **Command** - STScript executed when landed on
- **Size** - `fraction` (1x), `halfseg` (0.5x), or `doubleseg` (2x)
- **Respin** - Whether landing triggers another spin

### Segment Size Rules
Sizes affect probability. A `doubleseg` is twice as likely as a `fraction`. Note: `halfseg` count must equal `doubleseg` count for wheel balance.

### Example Commands

**Give gold:**
```
/setvar key=gold {{getvar::gold}}+100 | /echo You won 100 gold!
```

**Trigger an event:**
```
/trigger Jackpot Celebration | /sendas name=Dealer Great spin!
```

**Chain multiple actions:**
```
/setvar key=luck {{getvar::luck}}+1 | /echo Lucky! | /wheel profile="Bonus Wheel"
```

### Standalone Usage

Use the wheel anywhere in SillyTavern:
- Gacha/loot systems
- Random event triggers
- Fortune telling mechanics
- Reward distribution
- Decision making tools
- Slot machine games

---

## Battlebar (In-Depth)

The Battlebar is a timing-based combat minigame where players must hit a button when an arrow passes through a target zone. It supports multiple stages, visual progression, and full STScript integration.

### Features
- Adjustable difficulty (arrow speed)
- Configurable hits to win / misses to lose
- Stage images with LLM-enhanced messages
- Four command hooks (hit, miss, win, lose)
- POW items for guaranteed hits
- GRANDPOW for instant victory
- Item drop chances after battles

### Profile Configuration

- **Main Title** - Enemy/boss name displayed
- **Description** - Context for LLM narration
- **Difficulty** - Arrow speed (1=slowest, 5=fastest)
- **Hits to Win** - Successful hits required
- **Misses to Lose** - Failed attempts before defeat

### Stage Images

Add images for each hit stage to show progression:
- Stage 0: "The enemy appears!"
- Stage 1: "You land a blow!"
- Stage 2: "The enemy staggers!"
- Stage 3: "Victory!"

### STScript Commands

| Event | When it fires |
|-------|---------------|
| Hit Command | Each successful hit |
| Miss Command | Each missed attempt |
| Win Command | When player wins |
| Lose Command | When player loses |

### Example Commands

**Track damage:**
```
Hit: /setvar key=damage {{getvar::damage}}+10
Win: /echo You dealt {{getvar::damage}} total damage!
```

**Consequences for losing:**
```
Lose: /setvar key=hp {{getvar::hp}}-20 | /echo You lost 20 HP!
```

### Standalone Usage

Use battlebars anywhere:
- Combat encounters
- Skill checks
- Reaction tests
- Boss fights
- Quick-time events
- Any timing-based challenge

---

## Maze (The Complete Experience)

The Maze brings everything together into a complete dungeon-crawling adventure. Players navigate procedurally generated mazes, encountering minions, opening chests, avoiding traps, and reaching the exit.

### Maze Features

- **Procedural Generation** - Every maze is unique (5x5 to 15x15 grids)
- **Minion Encounters** - Configure NPCs that appear on tiles
- **Chest System** - Regular, locked, and mimic chests with loot tables
- **Trap Tiles** - Hazards with custom effects
- **Item System** - Keys, POW, Stealth, and GRANDPOW items
- **Story Milestones** - Narrative beats at exploration percentages
- **Exit Encounters** - Final challenge before escaping

### Minion Types

| Type | Behavior |
|------|----------|
| Messenger | Displays messages only |
| Battlebar | Triggers a combat challenge |
| Prize Wheel | Triggers a wheel spin |
| Merchant | Offers item trades |

Each minion has:
- Custom image
- Message pool
- Encounter script (STScript)
- Type-specific settings

### Chest System

**Regular Chests:**
- Configurable loot tables
- Item drop chances (keys, POW, stealth, GRANDPOW)

**Locked Chests:**
- Require keys to open
- Bonus loot percentage

**Mimics:**
- Trap chests that trigger consequences

### Items

| Item | Effect |
|------|--------|
| Key | Opens locked chests |
| POW | Guarantees next battlebar hit |
| Stealth | Skips next encounter |
| GRANDPOW | Instantly wins any battlebar |

### Traps

Traps are hazard tiles with:
- Custom image
- Message (LLM-enhanced)
- Script (STScript executed on trigger)

### Story Milestones

Configure narrative beats based on exploration progress:
- 25% explored: "You're making progress..."
- 50% explored: "Halfway through the maze..."
- 75% explored: "The exit must be close..."

### Exit Encounters

Choose what happens at the maze exit:
- **Messenger** - Final message before victory
- **Battlebar** - Boss fight to escape
- **Prize Wheel** - Final reward spin

---

## Configuration Tabs

The MazeMaster settings panel has five tabs:

### Wheel Tab
- Create/manage wheel profiles
- Configure segments
- Set randomization and difficulty
- Preview button to test

### Battlebar Tab
- Create/manage battlebar profiles
- Configure difficulty and hit counts
- Add stage images
- Set STScript commands
- Preview button to test

### Maze Tab
- Create/manage maze profiles
- Set grid size and win/lose conditions
- Configure main minion (narrator)
- Add minion and trap encounters
- Configure chest distribution and loot
- Set starting inventory
- Add story milestones

### Minions Tab
- Create reusable minion configurations
- Set type, images, messages
- Configure encounter scripts
- Save/load minion profiles

### Traps Tab
- Create trap configurations
- Set images, messages, scripts
- Save/load trap profiles

---

## LLM Integration

MazeMaster can enhance all messages through your connected LLM:

- **Enable LLM** - Toggle AI narration enhancement
- **LLM Preset** - Select which preset to use

When enabled, messages are sent to the LLM with context (story setting, progress, character descriptions) to generate atmospheric, in-character narration.

---

## Quick Start

1. **Create a few minions** in the Minions tab
2. **Create a battlebar profile** for combat encounters
3. **Create a maze profile** and add your minions as encounters
4. **Click Play** or use `/maze profile="YourProfile"`

Or use components standalone:
```
/wheel profile="Reward Wheel"
/battlebar profile="Quick Fight"
```

---

## Tips

- Use **Intelligent Distribute** to auto-balance encounter percentages
- Set **Random Message Chance** to 15-25% for ambient narration
- Chain STScript commands with `|` for complex behaviors
- Use the **Preview buttons** to test Wheel and Battlebar
- **POW** and **Stealth** are valuable - use strategically!
- **GRANDPOW** is rare but instantly wins any battlebar

---

## License

AGPL-3.0 - See LICENSE file

---

## Support

For issues, feature requests, or contributions, visit the GitHub repository.

---

*MazeMaster - Bringing dungeon-crawling adventures to your SillyTavern experience.*
