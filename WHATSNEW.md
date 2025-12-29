# MazeMaster - What's New

## v2.0.3

### Loading Screen Progress Display
- Real-time console showing all generation steps (grid, tiles, systems, LLM)
- Fixed-position loading card at bottom of screen throughout entire loading
- Progress percentage displayed during maze generation
- Smooth transition from generation to LLM enhancement phases

### Bug Fixes
- Fixed corrupted `secretDensity` values causing maze generation to hang
- Added profile repair at load time for corrupted BSP config values
- Fixed loading screen jumping to middle of screen during LLM phase
- Game UI (D-pad) now properly hidden until loading completes

---

## v2.0.2

### Configurable XP Rates
- Per-profile XP rate configuration (exploration, combat, quest, chest, trap survival)
- XP_CONFIG system allows fine-tuning progression per difficulty tier
- XP multipliers stack with existing difficulty settings

---

## v2.0.1

### UI Improvements
- Default themes/styles now appear in profile dropdowns
- Equipment modal z-index fix for proper layering
- Quest profiles added to factory reset options

### Bug Fixes
- Fixed undefined `customThemes` error on fresh installs

---

## v2.0.0

### Interactive Storytelling with LLM
- **Chat with Characters** - Send messages directly to minions and NPCs during encounters
- **Response Generation** - Generate creature/narrator replies using your LLM
- **Impersonate Mode** - Generate messages as your character for roleplay
- **Story Participation** - Engage in dynamic conversations that shape your adventure

### LLM Enhancement System
- **Unique Minion Names** - Each encounter generates a unique, themed character name
- **Custom Starting Messages** - LLM creates immersive opening dialogue for every minion
- **Room Descriptions** - Atmospheric, contextual room narration on first entry
- **Session Memory** - Previous events influence future LLM generations
- **Truly Unique Playthroughs** - No two adventures are the same

### Equipment System
- **Equipment Modal** - Dedicated UI for managing weapons, armor, accessories
- **Durability & Charges** - Equipment degrades with use, charges deplete
- **Repair System** - Repair kits restore equipment durability
- **Equipment Breaking** - Damaged gear can break, requiring replacement
- **Auto-equip** - Starting equipment automatically equips on maze start

### Dynamic Profile Settings
- Vision settings now configurable per profile
- Combat mechanics adjustable per difficulty
- Faction reputation systems per theme
- Sound and VFX toggles per profile

---

## v1.9.x Patch Notes

### v1.9.1 - v1.9.9
- Improved maze generation with more pathway splits and zigzag corridors
- Custom items now appear in item pools
- Equipment properly absorbs trap/combat damage
- Combat victory freeze fixes

---

## v1.4.8

### LLM Room Enhancement
- Generates unique, atmospheric room descriptions on first entry
- Uses your current LLM to create immersive, contextual descriptions
- Descriptions are cached and persist with saved games
- Toggle per-profile: "Enhance Room Descriptions" checkbox (enabled by default)

### Session Memory System
- Persistent notes panel accessible via "m" button below inventory
- Auto-populates with adventure events: encounters, loot, floor changes, combat results
- Session notes are passed to LLM generations for contextual awareness
- Previous events influence future room descriptions and encounters

### Fairness/Pity Mechanics
- **Key Pity** - Increased key drop chance after multiple chests without finding one
- **Healing Pity** - Boosted healing item drops when HP is low
- **Mercy Unlock** - Locked chests auto-unlock after skipping several with no keys
- All thresholds configurable per-profile; enabled by default

### Combat Stability Fixes
- All combat modals now properly handle async operations
- Fixed game freezes after stealth, puzzle, and other encounter completions
- STScript hooks (onComplete, onCaught, onWin, onFail) now fire reliably

---

## v1.4.0

### BSP Dungeon Generation
- All map styles now use Binary Space Partitioning
- Better room-and-corridor layouts with variable room sizes
- Themed room types based on size (treasureVault, arena, library, etc.)

### Zone Progression System
- Metroidvania-style areas that unlock as you clear rooms
- Zone gates block progression until requirements are met
- Zone progress HUD shows current zone and clearing progress

### Secret Passages
- Hidden walls with hint-based discovery system
- Bump walls to attempt discovery (chance based on hint level)
- Visual hints: drafts (level 1), cracks (level 2), glowing (level 3)
- Secret Sense item boosts discovery chance by 20%

### Per-Floor Complexity Scaling
- Deeper floors generate with more rooms and secrets
- Enemy density increases on lower floors
- More complex layouts as you descend

---

## v1.3.2

### Vision Items (5 new)
- **Torch** - +2 visibility radius for 3 moves
- **Lantern** - +1 passive visibility (permanent while held)
- **Reveal Scroll** - Reveals entire current floor
- **Sight Potion** - +1 permanent visibility bonus
- **Crystal Ball** - Reveals all minion locations on floor

### Dynamic Fog of War
- Visibility radius expands based on items and buffs
- Line-of-sight calculations for realistic exploration
- Temporary and permanent visibility bonuses stack

---

## v1.3.0

### 6 Combat Modes
- **Turn-Based** - RPG combat with Attack/Defend/Item/Flee
- **QTE** - Quick-time event key presses
- **Dice** - Roll against target numbers
- **Stealth** - Sneak past with Advance/Hide/Distract/Wait
- **Puzzle** - Sequence and memory challenges
- **Negotiation** - Social encounters with Persuade/Intimidate/Bribe

### HP System
- Health points tracked across encounters
- Damage from traps, failed combat, and environmental hazards
- Healing via potions, safe rooms, rest mechanic, and victory rewards
- Visual feedback: HP bar with damage (red) and heal (green) flash effects
- Revival Charms auto-trigger on death
- Difficulty tiers affect HP and damage scaling

### HP Items (5 new)
- **Healing Potion** - Restore 25% HP
- **Greater Healing** - Restore 50% HP
- **Elixir** - Full HP restore
- **Revival Charm** - Auto-revive once on death
- **Heart Crystal** - +10 max HP permanently

### Rest Mechanic
- Rest button to recover HP between encounters
- Configurable heal percentage and cooldown
- Optional interrupt chance with custom STScript

### Battlebar 1-10 Difficulty
- Continuous difficulty scaling (was 1-5)
- Maze-level multipliers for difficulty and damage
- Legacy profile auto-conversion

---

## v1.2.1

### Isometric Renderer
- Full 2.5D isometric view with procedural sprites
- Kenney asset pack support for custom tiles
- Smooth camera panning and player animation

### Multi-Floor Dungeons
- Configure 1-5 floors per maze
- Staircases connect floors (up/down)
- Floor Keys required for staircase use (configurable)
- SHIFT+Arrow keys for floor navigation

### Fog of War
- Tiles reveal as you explore
- Map Fragments reveal 3x3 areas
- Visibility persists with saved games

### Default Profiles
- 12 pre-built maze profiles across 6 themes
- Fantasy, Horror, Sci-Fi, Cyberpunk, Western, Action
- Themed content packs for minions, traps, and encounters

---

## v1.2.0

### Map Styles (12 total)
- Classic Maze, Dungeon, City Streets, Forest
- Space Station, Outpost, College Campus, Apartment Complex
- Neo Tokyo, Battle Arena, Hospital, Abandoned Highrise

### Room Info System
- Each tile has themed name and description
- Room info box shows exits, occupants, and defeated entities

### New Items (6)
- Floor Key, Portal Stone, Minion Bane
- Map Fragment, Time Shard, Void Walk

### Circular D-Pad
- Touch-friendly navigation controls
- Optional floating/draggable mode
- Floor buttons appear on staircases

### Per-Persona Stats
- Stats tracked per SillyTavern persona
- Global totals alongside persona-specific tracking

---

## v1.1.0

- Profile rename functionality
- Field validation for all profile types
- Grid size validation (5-20)

---

## v1.0.0

- Initial release
- Wheel of Fortune and Battlebar minigames
- Maze exploration with fog of war
- Inventory system
- Minion encounters with LLM integration
- Quest/objective system
- STScript hooks
- Difficulty tiers
