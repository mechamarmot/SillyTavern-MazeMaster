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
2. Copy the `MazeMaster` folder to: `SillyTavern/public/scripts/extensions/third-party/`
3. Restart SillyTavern

---

## Overview

MazeMaster provides three modular game components that can be used independently or combined:

| Component | Description |
|-----------|-------------|
| **Prize Wheel** | Spin-to-win wheel with configurable segments, triggers, and rewards |
| **Battlebar** | Timing-based combat minigame with hit zones and stage progression |
| **MazeRunner** | Full dungeon-crawling experience combining all components with procedural maze generation |

---

## Slash Commands

All components can be triggered via slash commands or STScript macros:

### `/wheel`
Opens a prize wheel modal.

```
/wheel profile="Reward Wheel"
```

**Parameters:**
- `profile` (optional) - Name of the wheel profile to use

---

### `/battlebar`
Starts a battlebar combat challenge.

```
/battlebar profile="Boss Battle"
```

**Parameters:**
- `profile` (optional) - Name of the battlebar profile to use

---

### `/maze`
Starts a maze game session.

```
/maze profile="Dungeon Crawl"
```

**Parameters:**
- `profile` (optional) - Name of the maze profile to use

---

### `/mazeminion`
Sets the minion display in an active maze (for custom scripting).

```
/mazeminion name="Guardian" message="You shall not pass!"
```

**Parameters:**
- `name` (optional) - Minion name (from config) or custom name
- `message` (optional) - Message to display

---

## Configuration Tabs

The MazeMaster settings panel contains five configuration tabs:

---

### Wheel Tab

Configure prize wheel profiles with customizable segments.

**Profile Management**
- Create, load, rename, and delete wheel profiles
- Each profile stores its own segments and settings

**Segment Configuration**
- **Trigger Name** - Unique identifier for the segment (used in callbacks)
- **Display Text** - Text shown on the wheel segment
- **Command** - STScript command executed when landed on
- **Size** - Relative size weight (larger = more likely to land)
- **Respin** - If checked, landing here triggers another spin

**Options**
- **Randomize Segments** - Shuffles segment positions each spin
- **Difficulty** - Affects spin animation speed

---

### Battlebar Tab

Configure timing-based combat challenges with stage progression.

**Profile Settings**
- **Main Title** - Enemy/boss name displayed during combat
- **Description** - Context for LLM narration
- **Difficulty** - Arrow speed (1=slowest, 5=fastest)
- **Hits to Win** - Successful hits required for victory
- **Misses to Lose** - Failed attempts before defeat

**Stage Images**
Add images for each hit stage, each with:
- **Image Path** - Path to the stage image
- **Stage Message** - Text displayed at this stage (LLM-enhanced)

**Commands**
- **Hit Command** - STScript executed on successful hit
- **Miss Command** - STScript executed on missed hit
- **Win Command** - STScript executed on victory
- **Lose Command** - STScript executed on defeat

**Item Drop Chances** (for maze integration)
- Configure key, POW, and stealth drop percentages after battle victories

---

### Maze Tab

The main MazeRunner configuration for complete dungeon experiences.

#### Basic Settings
- **Grid Size** - Maze dimensions (5x5 to 15x15)
- **Win Message** - Victory text displayed on escape
- **Win/Lose Commands** - STScript executed on maze completion

#### Main Minion
The narrator/guide character that appears throughout the maze:
- **Main Minion** - Select from configured minions
- **Intro Message** - First message when maze starts
- **Random Message Chance** - % chance for random messages during exploration
- **Random Messages** - Pool of messages (one per line)
- **Exit Type** - What happens at the exit (messenger, battlebar, or prizewheel)
- **Exit Profile** - Which profile to use for exit encounter
- **On Battlebar Loss** - Action when losing a battle (respawn or game over)

#### Minion Encounters
Configure which minions appear on tiles:
- **Add Minion Encounter** - Select minion and set tile percentage
- **Intelligent Distribute** - Auto-balance encounter percentages

#### Chest Distribution
- **Chest Tile %** - Percentage of tiles containing chests
- **Locked Chest %** - Percentage of chests that are locked
- **Locked Bonus %** - Extra loot from locked chests
- **Mimic %** - Percentage of chests that are traps

#### Chest Loot
- **Loot Per Chest** - Min/max items per chest
- **Item Chances** - Drop rates for keys, POW, stealth, and GRANDPOW
- Separate configuration for regular and locked chests

#### Starting Inventory
Set initial player resources:
- **Keys** - For unlocking locked chests
- **POW** - Guaranteed hit in battlebars
- **Stealth** - Skip encounters
- **GRANDPOW** - Instant battlebar victory

#### Trap Encounters
Configure which traps appear on tiles:
- **Add Trap Encounter** - Select trap and set tile percentage

#### Story Milestones
Configure narrative progression based on maze exploration percentage.

---

### Minions Tab

Create and manage encounter characters.

**Minion Configuration**
- **Name** - Display name for the minion
- **Image** - Character portrait path
- **Type** - Determines encounter behavior:
  - **Messenger** - Displays messages only
  - **Battlebar** - Triggers combat challenge
  - **Prize Wheel** - Triggers wheel spin
  - **Merchant** - Offers item trades
- **Description** - Context for LLM narration
- **Messages** - Random message pool (one per line)
- **Encounter Script** - STScript executed on encounter

**Type-Specific Settings**
- Battlebar minions: Select which battlebar profiles they can use
- Prize wheel minions: Select which wheel profiles they can use
- Merchants: Configure min/max items offered

**Minion Profiles**
Save and load complete minion configurations as profiles.

---

### Traps Tab

Create and manage hazard tiles.

**Trap Configuration**
- **Name** - Trap identifier
- **Image** - Trap visual
- **Message** - Text displayed when triggered (LLM-enhanced)
- **Script** - STScript executed on trigger

**Trap Profiles**
Save and load complete trap configurations as profiles.

---

## LLM Integration

MazeMaster can enhance all messages through your connected LLM:

- **Enable LLM** - Toggle AI narration enhancement
- **LLM Preset** - Select which AI preset to use

When enabled, base messages are sent to the LLM with context (story setting, current progress, character descriptions) to generate atmospheric, in-character narration.

---

## How It All Works Together

1. **Create Minions** - Define the characters that populate your maze
2. **Create Traps** - Define hazards players may encounter
3. **Create Wheel Profiles** - Set up prize wheels for rewards
4. **Create Battlebar Profiles** - Configure combat challenges
5. **Create Maze Profile** - Combine everything:
   - Select your main narrator minion
   - Add minion encounters with tile percentages
   - Add trap encounters with tile percentages
   - Configure chest loot and distribution
   - Set win/lose conditions
   - Add story milestones for narrative progression

6. **Play** - Use `/maze profile="YourProfile"` or click Play in the settings

---

## Standalone Usage

The Wheel and Battlebar components work independently of the maze system:

**Prize Wheel Only**
```
/wheel profile="Daily Rewards"
```
Use for: Gacha systems, random events, fortune telling, etc.

**Battlebar Only**
```
/battlebar profile="Quick Fight"
```
Use for: Combat encounters, skill checks, minigames, etc.

Both can be triggered from character cards, world info, or other extensions via STScript.

---

## Tips

- Use **Intelligent Distribute** to quickly balance encounter percentages
- Set **Random Message Chance** to 15-25% for ambient narration without spam
- Configure different **Exit Types** for varied gameplay (final boss battles, reward wheels)
- Use **POW** and **Stealth** items strategically - they're valuable!
- **GRANDPOW** is rare but instantly wins any battlebar

---

## License

AGPL-3.0 - See LICENSE file

---

## Support

For issues, feature requests, or contributions, visit the GitHub repository.

---

*MazeMaster - Bringing dungeon-crawling adventures to your SillyTavern experience.*
