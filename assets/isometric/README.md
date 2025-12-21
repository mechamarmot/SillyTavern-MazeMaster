# Isometric Sprite Packs

Each mapStyle folder needs these sprites (256x512 PNG recommended):

## Required Sprites (filename must match exactly):
- `floor.png` - Base floor tile
- `wall.png` - Wall/barrier tile  
- `wall_corner.png` - Corner wall piece
- `player.png` - Player character
- `minion.png` - Enemy/NPC
- `chest_closed.png` - Closed treasure chest
- `chest_open.png` - Opened chest
- `trap.png` - Trap/hazard
- `portal.png` - Teleporter
- `stairs_up.png` - Stairs going up
- `stairs_down.png` - Stairs going down
- `exit.png` - Level exit marker
- `fog.png` - Fog of war tile (dark/obscured)

## Optional Props (future support):
- `door.png`, `door_open.png`
- `barrel.png`, `crate.png`
- `table.png`, `chair.png`
- `decoration_1.png`, `decoration_2.png`, etc.

## Sprite Format:
- **Size**: 256x512 pixels (Kenney Miniature format)
- **Format**: PNG with transparency
- **Orientation**: South-facing (_S variant if directional)

## Current Status:
- ✅ maze (15 sprites)
- ✅ dungeon (15 sprites)
- ✅ city (15 sprites)
- ✅ forest (13 sprites)
- ✅ outpost (15 sprites)
- ✅ spacestation (15 sprites)
- ✅ college (13 sprites)
- ✅ apartment (15 sprites)
- ✅ neotokyo (15 sprites)
- ✅ arena (15 sprites)
- ✅ hospital (15 sprites)
- ✅ highrise (15 sprites)

## Recommended Sources:
- **Kenney.nl** - Free, CC0 license
- **itch.io/game-assets/tag-isometric** - Free & paid
- **OpenGameArt.org** - Free, various licenses

## To Add New Pack:
1. Download isometric sprites
2. Rename to match required filenames above
3. Place in appropriate mapStyle folder
4. Rebuild extension: `npm run build`
