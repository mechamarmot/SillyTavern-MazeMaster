# SillyTavern-MazeMaster

A comprehensive maze game extension for SillyTavern featuring procedurally generated mazes, prize wheels, battlebar combat, minions, traps, and LLM-powered narrative integration.

## Features

- **Procedural Maze Generation** - Configurable grid sizes with randomized layouts
- **Prize Wheel** - Customizable spinning wheel with configurable segments and commands
- **Battlebar Combat** - Timing-based combat minigame with difficulty levels
- **Minion System** - Multiple minion types (Messenger, Battlebar, Prize Wheel, Merchant)
- **Trap System** - Configurable traps with custom scripts
- **Inventory System** - Keys, Stealth, POW, and Grandpow items
- **Story Milestones** - Progress-based narrative updates
- **LLM Message Generation** - AI-powered minion dialogue using story context
- **Save/Load System** - Resume mazes in progress

## Installation

### Via SillyTavern Extensions Menu
1. Open SillyTavern
2. Go to Extensions > Install Extension
3. Enter: `https://github.com/mechamarmot/SillyTavern-MazeMaster`

### Manual Installation
1. Clone this repo into `/public/scripts/extensions/third-party/`
2. Run `npm install`
3. Run `npm run build`
4. Restart SillyTavern

## Usage

### Slash Commands
- `/maze [profile]` - Start a maze with optional profile name
- `/wheel [profile]` - Spin the prize wheel
- `/battlebar [profile]` - Start a battlebar encounter

### Configuration
Open the MazeMaster panel in SillyTavern to configure:
- **Game Tab** - Play mazes, manage saved games, configure LLM settings
- **Config Tab** - Configure wheels, battlebars, mazes, minions, and traps

## Development

```bash
npm install
npm run build
```

## License

AGPL-3.0 - See LICENSE file

## Author

mechamarmot
