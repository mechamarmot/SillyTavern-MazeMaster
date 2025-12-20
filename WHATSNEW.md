# MazeMaster - What's New

## v1.2.0

### New Features

**Per-Persona Stats**
- Stats are now tracked per SillyTavern persona
- Global totals maintained alongside persona-specific stats
- `{{user}}` macro support in LLM prompts for personalization

**Scenario Themes**
- 9 themes: Fantasy, Horror, Sci-Fi, Action, Cyberpunk, Noir, Post-Apocalyptic, Comedy, Western
- Themed item names (e.g., "Iron Key" vs "Access Card")
- Themed flavor text for encounters and events

**Circular D-Pad Controls**
- New circular D-pad for touch-friendly navigation
- Floating/draggable mode option
- Toggle in Game tab settings
- Floor navigation buttons appear on staircases

**6 New Inventory Items**
- **Floor Key** - Required to use staircases (when enabled)
- **Portal Stone** - Teleport to any revealed portal
- **Minion Bane** - Auto-defeat next minion encounter
- **Map Fragment** - Reveal 3x3 area around player
- **Time Shard** - Slow next battlebar by 50%
- **Void Walk** - Phase through one wall

**Map Styles (12 total)**
- **Classic Maze** - Recursive backtracking algorithm
- **Dungeon** - BSP chamber generation with hallways
- **City Streets** - Grid-based streets with building blocks
- **Forest** - Organic winding paths with clearings
- **Space Station** - Room pods connected by corridors
- **Outpost** - Frontier settlement layout
- **College Campus** - Academic buildings and walkways
- **Apartment Complex** - Residential floor plans
- **Neo Tokyo** - Cyberpunk urban sprawl
- **Battle Arena** - Combat-focused arenas
- **Hospital** - Medical facility wings
- **Abandoned Highrise** - Vertical exploration

**Multi-Floor Maps**
- Configure 1-5 floors per maze profile
- Staircases connect floors (up/down)
- SHIFT+Arrow keys for floor navigation
- Floor indicator in stats bar
- Exploration tracked across all floors

**New Slash Commands**
- `/mazepersonastats persona=X` - Get stats for a persona
- `/mazefloor` - Get current floor information
- `/mazetheme theme=X` - Get/set maze theme
- `/mazemapstyle style=X` - Get/set map generation style

**Chat Isolation**
- Playing a maze now closes the current ST chat
- Prevents LLM from absorbing chat context during gameplay
- Lorebooks/World Info disabled during LLM generation

**Pluggable Renderer System**
- Abstracted rendering into swappable renderer classes
- `CSSGridRenderer` - Current default (CSS Grid layout)
- `CanvasRenderer` - Sprite-based 2D rendering
- `IsometricRenderer` - Full 2.5D isometric view with procedural sprites
- `RendererRegistry` - Factory for switching renderers
- Renderer dropdown in Game tab settings
- Future-ready for custom tile/sprite asset packs

**Responsive Layout System**
- Auto-detect mobile/portrait orientation
- Desktop (horizontal) and Mobile (vertical) layout modes
- Layout mode dropdown in Game tab settings
- Optimized touch targets for mobile
- Scrollable grid on small screens

**Scrolling Message Log**
- Game messages now scroll instead of replacing
- Full message history preserved during gameplay
- Message log persists with saved games
- Each saved game maintains its own message history

**Room Info System**
- Each room tile has a unique themed name and description
- Names generated from theme + map style combination
- Room info box displays:
  - Room name and atmospheric description
  - Available exits (North, South, East, West)
  - Current occupants (active enemies)
  - Defeated entities in the room
- Room data persists with saved games
- Special names for staircases, portals, treasure rooms, etc.

---

## v1.1.0

- Profile rename functionality for wheel, battlebar, and maze
- Field validation for all profile types
- Grid size validation (5-20)
- Version sync between manifest and package.json

---

## v1.0.0

- Initial release
- Wheel of Fortune minigame
- Battlebar timing challenge
- Maze exploration with fog of war
- Inventory system (keys, stealth, pow, grandpow)
- Minion encounters with LLM integration
- Teleport portals
- Quest/objective system
- STScript hooks for extensibility
- Difficulty tiers (easy, normal, hard, nightmare)
