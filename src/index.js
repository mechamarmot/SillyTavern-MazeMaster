/* global SillyTavern */

const MODULE_NAME = 'MazeMaster';

// Dynamically detect the extension folder name from the script URL
// This handles both 'MazeMaster' and 'SillyTavern-MazeMaster' folder names
let EXTENSION_FOLDER_NAME = MODULE_NAME;
try {
    // import.meta.url gives us the current script's URL in ES modules
    const scriptUrl = import.meta.url;
    const match = scriptUrl.match(/\/scripts\/extensions\/third-party\/([^/]+)\//);
    if (match && match[1]) {
        EXTENSION_FOLDER_NAME = match[1];
    }
} catch (e) {
    // Fallback: search for our script in document
    const scripts = document.querySelectorAll('script[src*="MazeMaster"]');
    for (const script of scripts) {
        const match = script.src.match(/\/scripts\/extensions\/third-party\/([^/]+)\//);
        if (match && match[1]) {
            EXTENSION_FOLDER_NAME = match[1];
            break;
        }
    }
}

const {
    saveSettingsDebounced,
    SlashCommandParser,
    SlashCommand,
    ARGUMENT_TYPE,
    SlashCommandNamedArgument,
    executeSlashCommandsWithOptions,
    getRequestHeaders,
    callGenericPopup,
    POPUP_TYPE,
    generateQuietPrompt,
    getPresetManager,
    mainApi,
} = SillyTavern.getContext();

// =============================================================================
// CONSTANTS
// =============================================================================

const WHEEL_COLORS = [
    '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
    '#9b59b6', '#1abc9c', '#e67e22', '#34495e',
    '#e91e63', '#00bcd4', '#8bc34a', '#ff5722',
];

const SIZE_UNITS = {
    fraction: 1,
    halfseg: 0.5,
    doubleseg: 2,
};

const SIZE_OPTIONS = ['fraction', 'halfseg', 'doubleseg'];

// Battlebar difficulty: 1 = easiest, 5 = hardest
// Zone time = traverseTime * zoneWidth (all levels playable)
const BATTLEBAR_DIFFICULTY = {
    1: { zoneWidth: 0.40, traverseTime: 3500 }, // Very Easy (~1400ms in zone)
    2: { zoneWidth: 0.32, traverseTime: 3000 }, // Easy (~960ms in zone)
    3: { zoneWidth: 0.26, traverseTime: 2500 }, // Medium (~650ms in zone)
    4: { zoneWidth: 0.20, traverseTime: 2000 }, // Hard (~400ms in zone)
    5: { zoneWidth: 0.15, traverseTime: 1600 }, // Very Hard (~240ms in zone)
};

// Default timeout for STScript execution (10 seconds)
const STSCRIPT_TIMEOUT_MS = 10000;

// Difficulty tier configurations for full scaling
const DIFFICULTY_TIERS = {
    easy: {
        name: 'Easy',
        gridSizeRange: { min: 5, max: 10 },
        encounterDensityMult: 0.7,
        trapFrequencyMult: 0.5,
        battlebarZoneMult: 1.3,
        battlebarSpeedMult: 0.8,
        inventoryStartMult: 1.5,
        minionAggressionMult: 0.5,
        chestLootMult: 1.2,
    },
    normal: {
        name: 'Normal',
        gridSizeRange: { min: 5, max: 20 },
        encounterDensityMult: 1.0,
        trapFrequencyMult: 1.0,
        battlebarZoneMult: 1.0,
        battlebarSpeedMult: 1.0,
        inventoryStartMult: 1.0,
        minionAggressionMult: 1.0,
        chestLootMult: 1.0,
    },
    hard: {
        name: 'Hard',
        gridSizeRange: { min: 8, max: 20 },
        encounterDensityMult: 1.3,
        trapFrequencyMult: 1.5,
        battlebarZoneMult: 0.8,
        battlebarSpeedMult: 1.2,
        inventoryStartMult: 0.7,
        minionAggressionMult: 1.5,
        chestLootMult: 0.8,
    },
    nightmare: {
        name: 'Nightmare',
        gridSizeRange: { min: 10, max: 20 },
        encounterDensityMult: 1.6,
        trapFrequencyMult: 2.0,
        battlebarZoneMult: 0.6,
        battlebarSpeedMult: 1.4,
        inventoryStartMult: 0.5,
        minionAggressionMult: 2.0,
        chestLootMult: 0.6,
    },
};

// Scenario themes for flavor text and naming
const SCENARIO_THEMES = {
    fantasy: {
        name: 'Fantasy',
        tileMappings: {
            wall: 'stone wall',
            floor: 'dungeon floor',
            chest: 'treasure chest',
            exit: 'portal to freedom',
            portal: 'mystic gateway',
            trap: 'arcane trap',
            stairUp: 'ascending staircase',
            stairDown: 'descending staircase',
            minion: 'creature',
        },
        itemAliases: {
            key: 'Iron Key',
            stealth: 'Cloak of Shadows',
            pow: 'Battle Fury',
            grandpow: 'Divine Wrath',
            floorKey: 'Stairway Key',
            portalStone: 'Portal Stone',
            minionBane: 'Monster Bane',
            mapFragment: 'Ancient Map',
            timeShard: 'Time Crystal',
            voidWalk: 'Ghost Step Potion',
        },
        flavorMessages: {
            chestFind: 'You discover an ancient treasure chest!',
            portalUse: 'The mystic gateway shimmers and pulls you through!',
            trapTrigger: 'An arcane glyph activates beneath your feet!',
            stairUp: 'You ascend the ancient staircase...',
            stairDown: 'You descend into the depths below...',
            victory: 'Glory! You have conquered the dungeon!',
            defeat: 'The darkness claims another soul...',
        },
        colors: {
            primary: '#2ecc71',
            secondary: '#27ae60',
            accent: '#f1c40f',
        },
    },
    horror: {
        name: 'Horror',
        tileMappings: {
            wall: 'blood-stained wall',
            floor: 'creaking floorboard',
            chest: 'ominous coffin',
            exit: 'escape route',
            portal: 'dark rift',
            trap: 'deadly snare',
            stairUp: 'rickety ladder up',
            stairDown: 'descending pit',
            minion: 'abomination',
        },
        itemAliases: {
            key: 'Rusty Key',
            stealth: 'Shadow Shroud',
            pow: 'Adrenaline Rush',
            grandpow: 'Survival Instinct',
            floorKey: 'Cellar Key',
            portalStone: 'Dark Crystal',
            minionBane: 'Banishment Charm',
            mapFragment: 'Torn Note',
            timeShard: 'Slowing Serum',
            voidWalk: 'Phase Vial',
        },
        flavorMessages: {
            chestFind: 'A decrepit coffin... dare you open it?',
            portalUse: 'The rift tears open, pulling you into darkness!',
            trapTrigger: 'You hear a click... then screaming.',
            stairUp: 'The ladder groans under your weight...',
            stairDown: 'You descend into the suffocating darkness...',
            victory: 'You escape... but the nightmares will follow.',
            defeat: 'Your screams echo eternally in the void...',
        },
        colors: {
            primary: '#c0392b',
            secondary: '#8e1b1b',
            accent: '#7f8c8d',
        },
    },
    scifi: {
        name: 'Sci-Fi',
        tileMappings: {
            wall: 'reinforced bulkhead',
            floor: 'metal grating',
            chest: 'supply crate',
            exit: 'escape pod',
            portal: 'warp gate',
            trap: 'security system',
            stairUp: 'elevator up',
            stairDown: 'elevator down',
            minion: 'hostile entity',
        },
        itemAliases: {
            key: 'Access Card',
            stealth: 'Cloaking Device',
            pow: 'Combat Stim',
            grandpow: 'Overdrive Module',
            floorKey: 'Deck Keycard',
            portalStone: 'Teleport Beacon',
            minionBane: 'EMP Grenade',
            mapFragment: 'Data Pad',
            timeShard: 'Temporal Disruptor',
            voidWalk: 'Phase Shifter',
        },
        flavorMessages: {
            chestFind: 'A sealed supply crate. Contents unknown.',
            portalUse: 'Warp gate activated. Brace for teleportation.',
            trapTrigger: 'SECURITY ALERT: Hostile detected!',
            stairUp: 'Elevator ascending to upper deck...',
            stairDown: 'Elevator descending to lower deck...',
            victory: 'Mission complete. Extraction successful.',
            defeat: 'SYSTEM FAILURE: Life signs terminated.',
        },
        colors: {
            primary: '#3498db',
            secondary: '#2980b9',
            accent: '#1abc9c',
        },
    },
    action: {
        name: 'Action',
        tileMappings: {
            wall: 'concrete barrier',
            floor: 'worn tile',
            chest: 'ammo crate',
            exit: 'extraction point',
            portal: 'fast rope insertion',
            trap: 'booby trap',
            stairUp: 'ladder up',
            stairDown: 'ladder down',
            minion: 'hostile',
        },
        itemAliases: {
            key: 'Master Key',
            stealth: 'Smoke Grenade',
            pow: 'Adrenaline Shot',
            grandpow: 'Air Strike',
            floorKey: 'Building Key',
            portalStone: 'Zip Line',
            minionBane: 'Flashbang',
            mapFragment: 'Intel Report',
            timeShard: 'Slow-Mo Serum',
            voidWalk: 'Breach Charge',
        },
        flavorMessages: {
            chestFind: 'Supply cache located. Check for booby traps.',
            portalUse: 'Moving to new position!',
            trapTrigger: 'Contact! Hostile fire!',
            stairUp: 'Moving up! Watch your six!',
            stairDown: 'Descending! Stay frosty!',
            victory: 'Area secured. Good work, soldier.',
            defeat: 'Man down! Mission failed.',
        },
        colors: {
            primary: '#e67e22',
            secondary: '#d35400',
            accent: '#95a5a6',
        },
    },
    cyberpunk: {
        name: 'Cyberpunk',
        tileMappings: {
            wall: 'neon-lit barrier',
            floor: 'chrome plating',
            chest: 'data cache',
            exit: 'extraction node',
            portal: 'netrunner jack',
            trap: 'ICE protocol',
            stairUp: 'mag-lift up',
            stairDown: 'mag-lift down',
            minion: 'cyborg',
        },
        itemAliases: {
            key: 'Access Chip',
            stealth: 'Optical Camo',
            pow: 'Combat Stims',
            grandpow: 'Berserker Mode',
            floorKey: 'Elevator Override',
            portalStone: 'Fast Travel Chip',
            minionBane: 'System Crash',
            mapFragment: 'Hacked Schematic',
            timeShard: 'Reflex Booster',
            voidWalk: 'Ghost Protocol',
        },
        flavorMessages: {
            chestFind: 'Data cache detected. Initiating decrypt...',
            portalUse: 'Jacking in... connection established.',
            trapTrigger: 'ICE DETECTED! Countermeasures active!',
            stairUp: 'Mag-lift ascending to upper level...',
            stairDown: 'Mag-lift descending to sub-level...',
            victory: 'Run complete. Payout received, choom.',
            defeat: 'Flatlined. Your chrome belongs to the corp now.',
        },
        colors: {
            primary: '#ff00ff',
            secondary: '#00ffff',
            accent: '#ffff00',
        },
    },
    noir: {
        name: 'Noir',
        tileMappings: {
            wall: 'rain-streaked wall',
            floor: 'wet pavement',
            chest: 'locked safe',
            exit: 'back alley exit',
            portal: 'secret passage',
            trap: 'hidden wire',
            stairUp: 'fire escape up',
            stairDown: 'cellar stairs',
            minion: 'goon',
        },
        itemAliases: {
            key: 'Skeleton Key',
            stealth: 'Trench Coat',
            pow: 'Brass Knuckles',
            grandpow: 'Tommy Gun',
            floorKey: 'Service Key',
            portalStone: 'Secret Map',
            minionBane: 'Blackmail File',
            mapFragment: 'Case Notes',
            timeShard: 'Pocket Watch',
            voidWalk: 'Shadow Step',
        },
        flavorMessages: {
            chestFind: 'A safe in the shadows. Someone has secrets...',
            portalUse: 'The bookcase slides aside, revealing a passage.',
            trapTrigger: 'You hear a click. This was a setup.',
            stairUp: 'The fire escape groans in the rain...',
            stairDown: 'Down into the cellar. Watch your back.',
            victory: 'Case closed. Time for a drink.',
            defeat: 'Another gumshoe lost to the city...',
        },
        colors: {
            primary: '#4a4a4a',
            secondary: '#2c2c2c',
            accent: '#c9a227',
        },
    },
    postapoc: {
        name: 'Post-Apocalyptic',
        tileMappings: {
            wall: 'crumbling rubble',
            floor: 'irradiated ground',
            chest: 'salvage pile',
            exit: 'safe zone',
            portal: 'collapsed tunnel',
            trap: 'radiation hotspot',
            stairUp: 'rusted ladder up',
            stairDown: 'crater descent',
            minion: 'mutant',
        },
        itemAliases: {
            key: 'Vault Keycard',
            stealth: 'Ghillie Wrap',
            pow: 'Rad-X Boost',
            grandpow: 'Mini Nuke',
            floorKey: 'Bunker Code',
            portalStone: 'Signal Flare',
            minionBane: 'Purifier',
            mapFragment: 'Scavenged Map',
            timeShard: 'Stasis Field',
            voidWalk: 'Hazmat Suit',
        },
        flavorMessages: {
            chestFind: 'A salvage cache from the old world...',
            portalUse: 'You squeeze through the collapsed tunnel.',
            trapTrigger: 'GEIGER SPIKE! Radiation flooding the area!',
            stairUp: 'The rusted ladder holds... barely.',
            stairDown: 'Descending into the crater...',
            victory: 'You survived. For now.',
            defeat: 'The wasteland claims another soul...',
        },
        colors: {
            primary: '#8b7355',
            secondary: '#556b2f',
            accent: '#cd853f',
        },
    },
    comedy: {
        name: 'Comedy',
        tileMappings: {
            wall: 'suspiciously normal wall',
            floor: 'slightly sticky floor',
            chest: 'mystery box',
            exit: 'extremely obvious exit',
            portal: 'plot hole',
            trap: 'banana peel',
            stairUp: 'escalator (broken)',
            stairDown: 'slide',
            minion: 'weirdo',
        },
        itemAliases: {
            key: 'Comically Large Key',
            stealth: 'Cardboard Box',
            pow: 'Energy Drink',
            grandpow: 'Power of Friendship',
            floorKey: 'Janitor\'s Master Key',
            portalStone: 'Plot Device',
            minionBane: 'Bad Pun',
            mapFragment: 'Napkin Drawing',
            timeShard: 'Dramatic Pause',
            voidWalk: 'Fourth Wall Break',
        },
        flavorMessages: {
            chestFind: 'Ooh, a mystery box! It could be anything!',
            portalUse: 'You fall through a plot hole!',
            trapTrigger: 'Classic banana peel. You saw it coming.',
            stairUp: 'The escalator is broken. Guess it\'s just stairs now.',
            stairDown: 'WHEEE! *slide noises*',
            victory: 'You win! The crowd goes mild!',
            defeat: 'Wah wah wahhh... Game Over, buddy.',
        },
        colors: {
            primary: '#ff6b6b',
            secondary: '#feca57',
            accent: '#48dbfb',
        },
    },
    western: {
        name: 'Western',
        tileMappings: {
            wall: 'wooden planks',
            floor: 'dusty floorboards',
            chest: 'strongbox',
            exit: 'town limits',
            portal: 'mine shaft',
            trap: 'rattlesnake den',
            stairUp: 'rickety stairs up',
            stairDown: 'cellar hatch',
            minion: 'outlaw',
        },
        itemAliases: {
            key: 'Skeleton Key',
            stealth: 'Poncho',
            pow: 'Whiskey Courage',
            grandpow: 'Dynamite Bundle',
            floorKey: 'Mine Key',
            portalStone: 'Treasure Map',
            minionBane: 'Silver Bullet',
            mapFragment: 'Wanted Poster',
            timeShard: 'High Noon Focus',
            voidWalk: 'Tumbleweed Roll',
        },
        flavorMessages: {
            chestFind: 'A locked strongbox. Could be gold inside...',
            portalUse: 'You duck into the old mine shaft.',
            trapTrigger: 'RATTLESNAKES! Draw!',
            stairUp: 'The stairs creak with every step...',
            stairDown: 'Down into the root cellar...',
            victory: 'You ride off into the sunset, partner.',
            defeat: 'This town wasn\'t big enough for both of ya.',
        },
        colors: {
            primary: '#d2691e',
            secondary: '#8b4513',
            accent: '#ffd700',
        },
    },
};

// =============================================================================
// ROOM NAME GENERATION SYSTEM (v1.2.1)
// =============================================================================

/**
 * Theme modifiers applied on top of base mapStyle room names
 */
const THEME_MODIFIERS = {
    fantasy: { adjectives: ['Ancient', 'Mystical', 'Enchanted', 'Arcane', 'Forgotten'] },
    horror: { adjectives: ['Blood-Stained', 'Haunted', 'Cursed', 'Rotting', 'Whispering'] },
    scifi: { adjectives: ['Automated', 'Sterile', 'Malfunctioning', 'Quarantined', 'Pressurized'] },
    action: { adjectives: ['Reinforced', 'Tactical', 'Fortified', 'Hostile', 'Secured'] },
    cyberpunk: { adjectives: ['Neon-Lit', 'Chrome', 'Glitched', 'Hacked', 'Blackmarket'] },
    noir: { adjectives: ['Shadowy', 'Smoky', 'Rain-Soaked', 'Dimly-Lit', 'Forgotten'] },
    postapoc: { adjectives: ['Ruined', 'Overgrown', 'Irradiated', 'Collapsed', 'Scavenged'] },
    comedy: { adjectives: ['Suspiciously Normal', 'Slightly Damp', 'Questionable', 'Overdecorated', 'Poorly Labeled'] },
    western: { adjectives: ['Dusty', 'Sun-Bleached', 'Weathered', 'Abandoned', 'Rickety'] },
};

/**
 * Room name data organized by mapStyle and roomType
 * Room types: common, junction, deadend, staircase, portal, chest, minion, trap, exit, start
 */
const ROOM_NAME_DATA = {
    maze: {
        common: {
            prefixes: ['Winding', 'Narrow', 'Long', 'Dark', 'Quiet'],
            nouns: ['Corridor', 'Passage', 'Hallway', 'Path', 'Tunnel'],
            descriptions: ['The walls press in from both sides.', 'Echoes fade into the distance.', 'The path stretches onward.'],
        },
        junction: {
            prefixes: ['Central', 'Open', 'Connecting', 'Main'],
            nouns: ['Junction', 'Crossroads', 'Intersection', 'Hub'],
            descriptions: ['Multiple paths branch from here.', 'A decision point in the maze.', 'Which way to go?'],
        },
        deadend: {
            prefixes: ['Sealed', 'Blocked', 'Empty', 'Forgotten'],
            nouns: ['Dead End', 'Alcove', 'Nook', 'Corner'],
            descriptions: ['No way forward from here.', 'A quiet corner of the maze.', 'Time to backtrack.'],
        },
        staircase: {
            names: ['The Spiral Path', 'Winding Stairs', 'The Descent', 'Stone Steps'],
            descriptions: ['Worn steps lead to another level.', 'The stairway beckons.'],
        },
        portal: {
            names: ['Mystic Gateway', 'Shimmering Portal', 'The Threshold', 'Warp Point'],
            descriptions: ['Reality bends here.', 'Step through to somewhere else.'],
        },
        chest: {
            names: ['Treasure Alcove', 'Hidden Cache', 'Fortune\'s Corner', 'The Vault'],
            descriptions: ['Something valuable awaits.', 'A promising discovery.'],
        },
        minion: {
            names: ['Guardian\'s Post', 'The Confrontation', 'Danger Zone', 'Enemy Territory'],
            descriptions: ['You sense a presence.', 'Something stirs ahead.'],
        },
        trap: {
            names: ['Treacherous Ground', 'The Snare', 'Danger Ahead', 'False Safety'],
            descriptions: ['The floor seems unstable.', 'Something feels wrong here.'],
        },
        exit: {
            names: ['The Final Gate', 'Freedom\'s Door', 'The End', 'Escape Route'],
            descriptions: ['The exit is within reach!', 'Almost there...'],
        },
        start: {
            names: ['The Beginning', 'Starting Point', 'Entry Hall', 'The Origin'],
            descriptions: ['Your journey begins here.', 'The entrance to the maze.'],
        },
    },
    dungeon: {
        common: {
            prefixes: ['Damp', 'Crumbling', 'Moss-Covered', 'Torch-Lit', 'Stone'],
            nouns: ['Corridor', 'Passage', 'Chamber', 'Tunnel', 'Crypt'],
            descriptions: ['Water drips from the ceiling.', 'Ancient stones line the walls.', 'The air is thick and musty.'],
        },
        junction: {
            prefixes: ['Grand', 'Central', 'Ruined', 'Pillared'],
            nouns: ['Hall', 'Atrium', 'Chamber', 'Rotunda'],
            descriptions: ['Pillars support the vaulted ceiling.', 'Several passages meet here.'],
        },
        deadend: {
            prefixes: ['Collapsed', 'Sealed', 'Empty', 'Forgotten'],
            nouns: ['Tomb', 'Cell', 'Alcove', 'Crypt'],
            descriptions: ['The way is blocked by rubble.', 'Nothing but bones and dust.'],
        },
        staircase: {
            names: ['The Spiral Descent', 'Stone Stairwell', 'Dungeon Steps', 'The Deep Stairs'],
            descriptions: ['Worn steps descend into darkness.', 'Each step echoes ominously.'],
        },
        portal: {
            names: ['Arcane Circle', 'The Dark Rift', 'Summoning Chamber', 'Void Gate'],
            descriptions: ['Strange runes glow on the floor.', 'The air crackles with energy.'],
        },
        chest: {
            names: ['Treasure Vault', 'Burial Cache', 'Hidden Hoard', 'Ancient Coffer'],
            descriptions: ['Gold glimmers in the torchlight.', 'What treasures lie within?'],
        },
        minion: {
            names: ['Guardian\'s Lair', 'The Beast\'s Den', 'Cursed Chamber', 'Haunted Hall'],
            descriptions: ['Something lurks in the shadows.', 'Eyes watch from the darkness.'],
        },
        trap: {
            names: ['Pressure Plates', 'Spike Corridor', 'The Gauntlet', 'Death Trap'],
            descriptions: ['The floor has suspicious tiles.', 'Previous adventurers weren\'t so lucky.'],
        },
        exit: {
            names: ['Dungeon Gate', 'Surface Access', 'The Way Out', 'Freedom\'s Light'],
            descriptions: ['Daylight streams through ahead!', 'The exit awaits!'],
        },
        start: {
            names: ['Dungeon Entrance', 'The First Chamber', 'Entry Vault', 'Beginning of the End'],
            descriptions: ['You enter the dungeon depths.', 'Adventure awaits within.'],
        },
    },
    city: {
        common: {
            prefixes: ['Narrow', 'Crowded', 'Busy', 'Quiet', 'Back'],
            nouns: ['Street', 'Alley', 'Lane', 'Road', 'Avenue'],
            descriptions: ['Buildings tower on either side.', 'The city hums around you.', 'Footsteps echo on cobblestones.'],
        },
        junction: {
            prefixes: ['Main', 'Central', 'Open', 'Market'],
            nouns: ['Square', 'Plaza', 'Intersection', 'Crossroads'],
            descriptions: ['Several streets converge here.', 'A bustling urban hub.'],
        },
        deadend: {
            prefixes: ['Blocked', 'Private', 'Forgotten', 'Secluded'],
            nouns: ['Courtyard', 'Dead End', 'Cul-de-sac', 'Alley'],
            descriptions: ['No way through here.', 'A quiet corner of the city.'],
        },
        staircase: {
            names: ['Fire Escape', 'Metro Stairs', 'Building Access', 'Service Stairwell'],
            descriptions: ['Metal stairs lead up or down.', 'An urban vertical passage.'],
        },
        portal: {
            names: ['Subway Entrance', 'Secret Door', 'Hidden Passage', 'Underground Access'],
            descriptions: ['A way to move quickly.', 'Not everyone knows about this.'],
        },
        chest: {
            names: ['Supply Cache', 'Abandoned Stash', 'Hidden Storage', 'Drop Point'],
            descriptions: ['Someone left supplies here.', 'Could be useful items inside.'],
        },
        minion: {
            names: ['Gang Territory', 'Hostile Zone', 'Ambush Point', 'Danger Zone'],
            descriptions: ['This area isn\'t safe.', 'Watch your back.'],
        },
        trap: {
            names: ['Construction Zone', 'Hazard Area', 'Unstable Ground', 'Danger Zone'],
            descriptions: ['Caution signs litter the area.', 'Something\'s not right here.'],
        },
        exit: {
            names: ['City Limits', 'The Way Out', 'Freedom Boulevard', 'Exit Gate'],
            descriptions: ['Safety is just ahead!', 'Almost out of the city!'],
        },
        start: {
            names: ['Downtown Drop', 'Starting Block', 'Entry Point', 'Ground Zero'],
            descriptions: ['Your urban adventure begins.', 'The city awaits.'],
        },
    },
    forest: {
        common: {
            prefixes: ['Overgrown', 'Shaded', 'Winding', 'Mossy', 'Dense'],
            nouns: ['Path', 'Trail', 'Grove', 'Thicket', 'Clearing'],
            descriptions: ['Leaves rustle overhead.', 'Sunlight filters through the canopy.', 'The forest is alive with sounds.'],
        },
        junction: {
            prefixes: ['Central', 'Open', 'Sunny', 'Ancient'],
            nouns: ['Clearing', 'Glade', 'Meadow', 'Crossroads'],
            descriptions: ['Several paths diverge here.', 'A peaceful clearing in the woods.'],
        },
        deadend: {
            prefixes: ['Tangled', 'Blocked', 'Overgrown', 'Dense'],
            nouns: ['Thicket', 'Dead End', 'Brush', 'Undergrowth'],
            descriptions: ['The vegetation is too thick to pass.', 'No way through this tangle.'],
        },
        staircase: {
            names: ['Root Steps', 'Cliff Path', 'Tree Ladder', 'Natural Stairs'],
            descriptions: ['Natural formations create a path up or down.', 'The terrain changes elevation.'],
        },
        portal: {
            names: ['Fairy Ring', 'Ancient Tree', 'Spirit Gate', 'Enchanted Grove'],
            descriptions: ['Magic lingers in this place.', 'The veil between worlds is thin here.'],
        },
        chest: {
            names: ['Hollow Tree', 'Hidden Cache', 'Nature\'s Gift', 'Forest Bounty'],
            descriptions: ['Something hidden among the roots.', 'The forest provides.'],
        },
        minion: {
            names: ['Beast\'s Territory', 'Predator\'s Ground', 'Wild Zone', 'Creature\'s Lair'],
            descriptions: ['Something territorial lives here.', 'The wildlife seems hostile.'],
        },
        trap: {
            names: ['Quicksand', 'Poison Ivy Patch', 'Hunter\'s Snare', 'Treacherous Ground'],
            descriptions: ['The ground looks unstable.', 'Nature can be dangerous.'],
        },
        exit: {
            names: ['Forest Edge', 'The Clearing', 'Open Fields', 'Way Out'],
            descriptions: ['The tree line ends ahead!', 'Almost out of the forest!'],
        },
        start: {
            names: ['Forest Entrance', 'Trail Head', 'Woods Edge', 'Into the Wild'],
            descriptions: ['The forest path begins here.', 'Adventure awaits in the trees.'],
        },
    },
    outpost: {
        common: {
            prefixes: ['Dusty', 'Wooden', 'Fortified', 'Patrol', 'Guard'],
            nouns: ['Walkway', 'Corridor', 'Passage', 'Path', 'Route'],
            descriptions: ['Wooden planks creak underfoot.', 'The outpost feels hastily constructed.', 'Frontier life is rough.'],
        },
        junction: {
            prefixes: ['Central', 'Main', 'Command', 'Trading'],
            nouns: ['Courtyard', 'Square', 'Hub', 'Plaza'],
            descriptions: ['The heart of the outpost.', 'People gather here.'],
        },
        deadend: {
            prefixes: ['Storage', 'Private', 'Blocked', 'Abandoned'],
            nouns: ['Corner', 'Area', 'Section', 'Alcove'],
            descriptions: ['This area is off-limits.', 'Nothing to see here.'],
        },
        staircase: {
            names: ['Watchtower Ladder', 'Rampart Stairs', 'Cellar Access', 'Tower Steps'],
            descriptions: ['Rough-hewn steps lead up or down.', 'A vertical route through the outpost.'],
        },
        portal: {
            names: ['Secret Tunnel', 'Escape Route', 'Hidden Exit', 'Underground Path'],
            descriptions: ['A hidden way to move quickly.', 'Not on any official maps.'],
        },
        chest: {
            names: ['Supply Crate', 'Armory Cache', 'Provisions Store', 'Trade Goods'],
            descriptions: ['Frontier supplies are valuable.', 'Someone stockpiled resources here.'],
        },
        minion: {
            names: ['Hostile Territory', 'Raider Camp', 'Enemy Ground', 'Danger Zone'],
            descriptions: ['This area isn\'t friendly.', 'Hostiles have been spotted here.'],
        },
        trap: {
            names: ['Perimeter Defense', 'Booby Trap', 'Defensive Line', 'Warning Zone'],
            descriptions: ['The outpost has defenses.', 'Watch where you step.'],
        },
        exit: {
            names: ['Main Gate', 'Frontier Exit', 'The Way Out', 'Open Plains'],
            descriptions: ['The frontier awaits beyond!', 'Almost to safety!'],
        },
        start: {
            names: ['Outpost Gate', 'Arrival Point', 'Entry Post', 'Checkpoint'],
            descriptions: ['Welcome to the frontier.', 'Your mission begins here.'],
        },
    },
    spacestation: {
        common: {
            prefixes: ['Pressurized', 'Maintenance', 'Crew', 'Service', 'Transit'],
            nouns: ['Corridor', 'Deck', 'Section', 'Tube', 'Passageway'],
            descriptions: ['The hum of life support fills the air.', 'Zero-G handles line the walls.', 'Status lights blink in sequence.'],
        },
        junction: {
            prefixes: ['Central', 'Main', 'Command', 'Hub'],
            nouns: ['Atrium', 'Nexus', 'Hub', 'Junction'],
            descriptions: ['Multiple decks connect here.', 'The station\'s central point.'],
        },
        deadend: {
            prefixes: ['Sealed', 'Depressurized', 'Locked', 'Abandoned'],
            nouns: ['Airlock', 'Module', 'Section', 'Bay'],
            descriptions: ['This section is sealed off.', 'No access beyond this point.'],
        },
        staircase: {
            names: ['Deck Ladder', 'Gravity Lift', 'Access Tube', 'Inter-deck Transit'],
            descriptions: ['Vertical transit between decks.', 'Watch your head in zero-G.'],
        },
        portal: {
            names: ['Teleport Pad', 'Warp Gate', 'Transit Pod', 'Instant Travel'],
            descriptions: ['Advanced technology enables instant travel.', 'Step on the pad to teleport.'],
        },
        chest: {
            names: ['Supply Locker', 'Cargo Pod', 'Equipment Bay', 'Resource Cache'],
            descriptions: ['Standard station supplies.', 'Emergency equipment stored here.'],
        },
        minion: {
            names: ['Hostile Sector', 'Quarantine Zone', 'Breach Area', 'Danger Zone'],
            descriptions: ['Security protocols are active.', 'Something hostile is aboard.'],
        },
        trap: {
            names: ['Radiation Leak', 'Decompression Risk', 'Electrical Hazard', 'System Failure'],
            descriptions: ['Warning lights flash urgently.', 'Safety systems are offline.'],
        },
        exit: {
            names: ['Escape Pod Bay', 'Extraction Point', 'Docking Ring', 'The Way Out'],
            descriptions: ['Rescue is just ahead!', 'Almost to the escape pods!'],
        },
        start: {
            names: ['Docking Bay', 'Arrival Deck', 'Entry Point', 'Station Access'],
            descriptions: ['Welcome aboard the station.', 'Your mission begins here.'],
        },
    },
    college: {
        common: {
            prefixes: ['Main', 'Academic', 'Student', 'Faculty', 'Campus'],
            nouns: ['Hallway', 'Corridor', 'Wing', 'Path', 'Walkway'],
            descriptions: ['Lockers line the walls.', 'Motivational posters are everywhere.', 'The smell of cafeteria food lingers.'],
        },
        junction: {
            prefixes: ['Central', 'Main', 'Student', 'Campus'],
            nouns: ['Quad', 'Commons', 'Atrium', 'Hub'],
            descriptions: ['Students gather between classes.', 'The heart of campus life.'],
        },
        deadend: {
            prefixes: ['Maintenance', 'Staff Only', 'Locked', 'Private'],
            nouns: ['Closet', 'Office', 'Room', 'Storage'],
            descriptions: ['This area is restricted.', 'Faculty only beyond this point.'],
        },
        staircase: {
            names: ['Main Stairwell', 'Fire Stairs', 'Back Stairs', 'Service Access'],
            descriptions: ['Standard institutional stairs.', 'Watch out for students rushing to class.'],
        },
        portal: {
            names: ['Secret Passage', 'Underground Tunnel', 'Maintenance Route', 'Shortcut'],
            descriptions: ['Not on the official campus map.', 'Students pass down secret knowledge.'],
        },
        chest: {
            names: ['Lost and Found', 'Supply Closet', 'Locker', 'Hidden Stash'],
            descriptions: ['Someone left something behind.', 'Might find something useful.'],
        },
        minion: {
            names: ['Bully Territory', 'Staff Patrol', 'Security Zone', 'No-Go Area'],
            descriptions: ['Best to avoid this area.', 'Someone unfriendly is here.'],
        },
        trap: {
            names: ['Wet Floor', 'Construction Zone', 'Prank Setup', 'Hazard Area'],
            descriptions: ['Watch your step.', 'Something seems off here.'],
        },
        exit: {
            names: ['Main Exit', 'Campus Gate', 'Front Doors', 'Freedom'],
            descriptions: ['School\'s out!', 'Almost to freedom!'],
        },
        start: {
            names: ['Main Entrance', 'Welcome Hall', 'Registration', 'Starting Point'],
            descriptions: ['Welcome to campus.', 'Your academic adventure begins.'],
        },
    },
    apartment: {
        common: {
            prefixes: ['Narrow', 'Dimly-Lit', 'Carpeted', 'Quiet', 'Long'],
            nouns: ['Hallway', 'Corridor', 'Landing', 'Passage', 'Floor'],
            descriptions: ['Apartment doors line both sides.', 'The building is eerily quiet.', 'Fluorescent lights flicker.'],
        },
        junction: {
            prefixes: ['Main', 'Central', 'Elevator', 'Stair'],
            nouns: ['Lobby', 'Landing', 'Foyer', 'Hub'],
            descriptions: ['Multiple hallways branch from here.', 'The building\'s central area.'],
        },
        deadend: {
            prefixes: ['Locked', 'Private', 'Utility', 'Maintenance'],
            nouns: ['Apartment', 'Room', 'Closet', 'Unit'],
            descriptions: ['This unit is locked.', 'No access here.'],
        },
        staircase: {
            names: ['Fire Stairs', 'Main Stairwell', 'Back Stairs', 'Service Stairs'],
            descriptions: ['Concrete steps echo with each footfall.', 'Standard apartment building stairs.'],
        },
        portal: {
            names: ['Dumbwaiter', 'Laundry Chute', 'Hidden Panel', 'Secret Room'],
            descriptions: ['A hidden way through the building.', 'Not everyone knows about this.'],
        },
        chest: {
            names: ['Storage Unit', 'Abandoned Locker', 'Supply Closet', 'Hidden Cache'],
            descriptions: ['Someone left something behind.', 'Might contain useful items.'],
        },
        minion: {
            names: ['Hostile Unit', 'Occupied Floor', 'Danger Zone', 'Unfriendly Neighbors'],
            descriptions: ['Something unfriendly lives here.', 'Best to be careful.'],
        },
        trap: {
            names: ['Broken Floor', 'Electrical Hazard', 'Gas Leak', 'Structural Damage'],
            descriptions: ['The building isn\'t safe here.', 'Watch your step.'],
        },
        exit: {
            names: ['Main Exit', 'Front Door', 'Fire Exit', 'Street Access'],
            descriptions: ['The street is just ahead!', 'Almost out of the building!'],
        },
        start: {
            names: ['Building Entrance', 'Main Lobby', 'Entry Hall', 'Ground Floor'],
            descriptions: ['You enter the apartment building.', 'Your urban exploration begins.'],
        },
    },
    neotokyo: {
        common: {
            prefixes: ['Neon', 'Crowded', 'Rain-Slicked', 'Holographic', 'Bustling'],
            nouns: ['Street', 'Alley', 'Arcade', 'Passage', 'Lane'],
            descriptions: ['Neon signs reflect off wet pavement.', 'Holographic ads fill the air.', 'The city never sleeps.'],
        },
        junction: {
            prefixes: ['Central', 'Shibuya-Style', 'Main', 'Mega'],
            nouns: ['Crossing', 'Plaza', 'Square', 'Hub'],
            descriptions: ['Thousands of screens illuminate the area.', 'A sensory overload of lights and sounds.'],
        },
        deadend: {
            prefixes: ['Sealed', 'Private', 'VIP', 'Restricted'],
            nouns: ['Booth', 'Room', 'Alley', 'Zone'],
            descriptions: ['No access without credentials.', 'This area is off-limits.'],
        },
        staircase: {
            names: ['Gravity Lift', 'Mag-Rail', 'Sky Bridge', 'Vertical Transit'],
            descriptions: ['High-tech vertical transportation.', 'The city builds upward.'],
        },
        portal: {
            names: ['VR Hub', 'Data Port', 'Network Node', 'Fast Travel'],
            descriptions: ['Jack in to move instantly.', 'The network connects all.'],
        },
        chest: {
            names: ['Vending Cache', 'Data Stash', 'Loot Box', 'Street Vendor'],
            descriptions: ['Even garbage has value here.', 'Credits can buy anything.'],
        },
        minion: {
            names: ['Yakuza Turf', 'Corp Security', 'Gang Territory', 'Hostile Zone'],
            descriptions: ['Someone owns this block.', 'You\'re not welcome here.'],
        },
        trap: {
            names: ['ICE Node', 'Security Grid', 'Drone Patrol', 'Surveillance Zone'],
            descriptions: ['Automated defenses are active.', 'Big Brother is watching.'],
        },
        exit: {
            names: ['City Limits', 'Extraction Point', 'Safe House', 'The Way Out'],
            descriptions: ['Almost out of the neon jungle!', 'Freedom awaits beyond!'],
        },
        start: {
            names: ['Drop Zone', 'Street Level', 'Entry Point', 'Ground Zero'],
            descriptions: ['Welcome to the future.', 'Your cyberpunk adventure begins.'],
        },
    },
    arena: {
        common: {
            prefixes: ['Stone', 'Sandy', 'Blood-Stained', 'Gladiator', 'Battle'],
            nouns: ['Corridor', 'Passage', 'Tunnel', 'Path', 'Way'],
            descriptions: ['The roar of the crowd echoes.', 'Sand and blood mix underfoot.', 'Glory or death awaits.'],
        },
        junction: {
            prefixes: ['Central', 'Main', 'Grand', 'Champion\'s'],
            nouns: ['Arena', 'Ring', 'Pit', 'Stage'],
            descriptions: ['The fighting grounds await.', 'All paths lead to battle.'],
        },
        deadend: {
            prefixes: ['Holding', 'Recovery', 'Equipment', 'Fighter\'s'],
            nouns: ['Cell', 'Room', 'Bay', 'Quarters'],
            descriptions: ['A moment of rest between fights.', 'Prepare for the next battle.'],
        },
        staircase: {
            names: ['Gladiator\'s Rise', 'Champion\'s Lift', 'Arena Access', 'Victory Steps'],
            descriptions: ['The path to glory.', 'Rise to meet your opponent.'],
        },
        portal: {
            names: ['Fighter\'s Gate', 'Champion Portal', 'Mystery Entrance', 'Wild Card'],
            descriptions: ['Where will you emerge?', 'The crowd loves surprises.'],
        },
        chest: {
            names: ['Weapon Rack', 'Prize Cache', 'Spoils of War', 'Victor\'s Reward'],
            descriptions: ['The strong deserve rewards.', 'Claim your prize.'],
        },
        minion: {
            names: ['Fighter\'s Corner', 'Beast Pit', 'Champion\'s Ground', 'Battle Zone'],
            descriptions: ['An opponent awaits.', 'Prepare for combat!'],
        },
        trap: {
            names: ['Spike Pit', 'Fire Trap', 'Collapsing Floor', 'Arena Hazard'],
            descriptions: ['The arena is dangerous.', 'Watch your footing!'],
        },
        exit: {
            names: ['Victor\'s Gate', 'Champion\'s Exit', 'Freedom Gate', 'The Way Out'],
            descriptions: ['Glory awaits the victor!', 'Survive and escape!'],
        },
        start: {
            names: ['Challenger\'s Gate', 'Fighter\'s Entrance', 'Arena Entry', 'The Beginning'],
            descriptions: ['The crowd awaits.', 'Prove your worth!'],
        },
    },
    hospital: {
        common: {
            prefixes: ['Sterile', 'White', 'Quiet', 'Flickering', 'Abandoned'],
            nouns: ['Corridor', 'Hallway', 'Ward', 'Wing', 'Section'],
            descriptions: ['The smell of antiseptic lingers.', 'Medical equipment lies scattered.', 'Fluorescent lights hum overhead.'],
        },
        junction: {
            prefixes: ['Central', 'Main', 'Nurse\'s', 'Reception'],
            nouns: ['Station', 'Hub', 'Desk', 'Lobby'],
            descriptions: ['Multiple wards connect here.', 'The hospital\'s central hub.'],
        },
        deadend: {
            prefixes: ['Private', 'Quarantine', 'Restricted', 'Sealed'],
            nouns: ['Room', 'Bay', 'Ward', 'Unit'],
            descriptions: ['This area is restricted.', 'No access without clearance.'],
        },
        staircase: {
            names: ['Emergency Stairs', 'Service Elevator', 'Staff Access', 'Fire Stairs'],
            descriptions: ['Standard hospital vertical access.', 'Watch for gurneys.'],
        },
        portal: {
            names: ['Morgue Tunnel', 'Utility Access', 'Hidden Passage', 'Underground Route'],
            descriptions: ['Not on the hospital map.', 'A hidden way through.'],
        },
        chest: {
            names: ['Supply Closet', 'Medical Storage', 'Equipment Room', 'Pharmacy Cache'],
            descriptions: ['Medical supplies could be useful.', 'Someone stockpiled resources.'],
        },
        minion: {
            names: ['Quarantine Zone', 'Infected Ward', 'Danger Area', 'Hostile Section'],
            descriptions: ['Something isn\'t right here.', 'Proceed with caution.'],
        },
        trap: {
            names: ['Biohazard Zone', 'Contaminated Area', 'Structural Damage', 'Hazmat Zone'],
            descriptions: ['Warning signs are everywhere.', 'This area isn\'t safe.'],
        },
        exit: {
            names: ['Emergency Exit', 'Main Entrance', 'Ambulance Bay', 'The Way Out'],
            descriptions: ['Fresh air awaits!', 'Almost out of the hospital!'],
        },
        start: {
            names: ['ER Entrance', 'Main Lobby', 'Admission', 'Ground Floor'],
            descriptions: ['You enter the hospital.', 'Something feels wrong here.'],
        },
    },
    highrise: {
        common: {
            prefixes: ['Dusty', 'Abandoned', 'Crumbling', 'Empty', 'Dark'],
            nouns: ['Hallway', 'Floor', 'Corridor', 'Office', 'Suite'],
            descriptions: ['Abandoned furniture gathers dust.', 'The building creaks in the wind.', 'Nature reclaims the space.'],
        },
        junction: {
            prefixes: ['Main', 'Central', 'Executive', 'Open'],
            nouns: ['Lobby', 'Atrium', 'Floor', 'Hub'],
            descriptions: ['Once a place of business.', 'Multiple paths through the floor.'],
        },
        deadend: {
            prefixes: ['Collapsed', 'Sealed', 'Blocked', 'Destroyed'],
            nouns: ['Office', 'Room', 'Section', 'Area'],
            descriptions: ['The way is impassable.', 'Structural damage blocks the path.'],
        },
        staircase: {
            names: ['Fire Stairs', 'Emergency Exit', 'Service Stairs', 'Broken Elevator'],
            descriptions: ['Concrete stairs wind upward.', 'The elevator hasn\'t worked in years.'],
        },
        portal: {
            names: ['Window Ledge', 'Broken Wall', 'Collapsed Floor', 'Vent Shaft'],
            descriptions: ['An unconventional route.', 'Not for the faint of heart.'],
        },
        chest: {
            names: ['Old Safe', 'Forgotten Cache', 'Executive Stash', 'Supply Closet'],
            descriptions: ['Something was left behind.', 'Previous occupants stored valuables.'],
        },
        minion: {
            names: ['Squatter\'s Territory', 'Hostile Floor', 'Danger Zone', 'Occupied Area'],
            descriptions: ['Someone else calls this home.', 'You\'re not alone here.'],
        },
        trap: {
            names: ['Weak Floor', 'Broken Glass', 'Falling Debris', 'Structural Collapse'],
            descriptions: ['The building is unstable.', 'Every step could be your last.'],
        },
        exit: {
            names: ['Ground Floor', 'Street Exit', 'Fire Escape', 'The Way Out'],
            descriptions: ['Solid ground awaits!', 'Almost out of the building!'],
        },
        start: {
            names: ['Rooftop Access', 'Upper Floor', 'Entry Point', 'The Beginning'],
            descriptions: ['You enter the abandoned building.', 'Urban exploration begins.'],
        },
    },
};

/**
 * Determine the room type based on cell properties
 * @param {object} cell - The cell to analyze
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} size - Grid size
 * @param {number} exitX - Exit X coordinate
 * @param {number} exitY - Exit Y coordinate
 * @returns {string} Room type identifier
 */
function determineRoomType(cell, x, y, size, exitX, exitY) {
    // Check for special tiles first (priority order)
    if (x === 0 && y === 0) return 'start';
    if (x === exitX && y === exitY) return 'exit';
    if (cell.staircase) return 'staircase';
    if (cell.portal) return 'portal';
    if (cell.chest) return 'chest';
    if (cell.minion) return 'minion';
    if (cell.trap) return 'trap';

    // Count open exits (no walls)
    const exits = [!cell.walls.top, !cell.walls.right, !cell.walls.bottom, !cell.walls.left].filter(Boolean).length;

    if (exits >= 3) return 'junction';
    if (exits === 1) return 'deadend';
    return 'common';
}

/**
 * Generate room info (name and description) for a cell
 * @param {object} cell - The cell to generate info for
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {object} profile - The maze profile with theme and mapStyle
 * @param {number} size - Grid size
 * @param {number} exitX - Exit X coordinate
 * @param {number} exitY - Exit Y coordinate
 * @returns {object} { name, description, roomType }
 */
function generateRoomInfo(cell, x, y, profile, size, exitX, exitY) {
    const theme = profile.theme || 'fantasy';
    const mapStyle = profile.mapStyle || 'maze';
    const roomType = determineRoomType(cell, x, y, size, exitX, exitY);

    // Get room data for this mapStyle and roomType, fallback to maze/common
    const styleData = ROOM_NAME_DATA[mapStyle] || ROOM_NAME_DATA.maze;
    const roomData = styleData[roomType] || styleData.common;
    const themeModifier = THEME_MODIFIERS[theme] || THEME_MODIFIERS.fantasy;

    let name, description;

    if (roomData.names) {
        // Special room type with predefined names
        name = roomData.names[Math.floor(Math.random() * roomData.names.length)];
    } else {
        // Common room type with prefix + noun construction
        const prefix = roomData.prefixes[Math.floor(Math.random() * roomData.prefixes.length)];
        const noun = roomData.nouns[Math.floor(Math.random() * roomData.nouns.length)];

        // 30% chance to add a theme modifier adjective
        if (Math.random() < 0.3 && themeModifier.adjectives) {
            const themeAdj = themeModifier.adjectives[Math.floor(Math.random() * themeModifier.adjectives.length)];
            name = `${themeAdj} ${prefix} ${noun}`;
        } else {
            name = `${prefix} ${noun}`;
        }
    }

    // Pick a random description
    description = roomData.descriptions[Math.floor(Math.random() * roomData.descriptions.length)];

    return { name, description, roomType };
}

/**
 * Generate room info for all cells in a floor grid
 * @param {array} grid - The floor grid
 * @param {object} profile - The maze profile
 * @param {number} size - Grid size
 * @param {number} exitX - Exit X coordinate
 * @param {number} exitY - Exit Y coordinate
 */
function generateRoomInfoForGrid(grid, profile, size, exitX, exitY) {
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const cell = grid[y][x];
            cell.roomInfo = generateRoomInfo(cell, x, y, profile, size, exitX, exitY);
        }
    }
}

// =============================================================================
// PLUGGABLE RENDERER SYSTEM (v1.2.0)
// =============================================================================

/**
 * Base MazeRenderer interface - all renderers must implement these methods
 * This abstraction allows swapping between CSS Grid, Canvas, WebGL, Isometric, etc.
 */
class MazeRenderer {
    constructor(options = {}) {
        this.options = options;
        this.container = null;
        this.initialized = false;
    }

    /**
     * Get the renderer type identifier
     * @returns {string}
     */
    getType() {
        return 'base';
    }

    /**
     * Initialize the renderer with a container element
     * @param {HTMLElement} container - The container to render into
     * @param {Object} mazeState - Initial maze state
     */
    init(container, mazeState) {
        this.container = container;
        this.initialized = true;
    }

    /**
     * Get the HTML template for the grid container
     * @param {number} size - Grid size
     * @returns {string} HTML string
     */
    getGridHTML(size) {
        throw new Error('getGridHTML must be implemented by subclass');
    }

    /**
     * Get the HTML for the player overlay element
     * @param {number} cellSize - Size of each cell
     * @returns {string} HTML string
     */
    getPlayerOverlayHTML(cellSize) {
        throw new Error('getPlayerOverlayHTML must be implemented by subclass');
    }

    /**
     * Calculate cell size based on grid size
     * @param {number} gridSize - Number of cells per side
     * @returns {number} Cell size in pixels
     */
    getCellSize(gridSize) {
        // Larger cells for desktop - map area has more space now
        if (gridSize <= 5) return 50;
        if (gridSize <= 7) return 45;
        if (gridSize <= 10) return 38;
        if (gridSize <= 12) return 32;
        if (gridSize <= 15) return 26;
        return 22;
    }

    /**
     * Render the entire maze grid
     * @param {Object} mazeState - Current maze state
     */
    render(mazeState) {
        throw new Error('render must be implemented by subclass');
    }

    /**
     * Update player position with optional animation
     * @param {number} x - Player X coordinate
     * @param {number} y - Player Y coordinate
     * @param {boolean} animate - Whether to animate the movement
     * @param {number} cellSize - Size of each cell
     */
    updatePlayerPosition(x, y, animate, cellSize) {
        throw new Error('updatePlayerPosition must be implemented by subclass');
    }

    /**
     * Highlight a cell (for encounters, selection, etc.)
     * @param {number} x - Cell X coordinate
     * @param {number} y - Cell Y coordinate
     * @param {string} type - Highlight type (encounter, selected, path, etc.)
     */
    highlightCell(x, y, type) {
        // Optional - base implementation does nothing
    }

    /**
     * Clear all highlights
     */
    clearHighlights() {
        // Optional - base implementation does nothing
    }

    /**
     * Play a visual effect at a cell
     * @param {number} x - Cell X coordinate
     * @param {number} y - Cell Y coordinate
     * @param {string} effect - Effect name (teleport, damage, heal, etc.)
     */
    playEffect(x, y, effect) {
        // Optional - base implementation does nothing
    }

    /**
     * Get CSS styles required by this renderer
     * @returns {string} CSS styles string
     */
    getStyles() {
        return '';
    }

    /**
     * Clean up renderer resources
     */
    cleanup() {
        this.initialized = false;
        this.container = null;
    }
}

/**
 * CSS Grid Renderer - Current default renderer using CSS Grid layout
 * Simple, fast, works everywhere, easy to style with CSS
 */
class CSSGridRenderer extends MazeRenderer {
    getType() {
        return 'css-grid';
    }

    getGridHTML(size) {
        const cellSize = this.getCellSize(size);
        return `
            <div id="maze_grid" class="maze-grid" style="
                display: grid;
                grid-template-columns: repeat(${size}, ${cellSize}px);
                gap: 0;
                position: relative;
            "></div>
        `;
    }

    getPlayerOverlayHTML(cellSize) {
        return `
            <div id="maze_player_overlay" class="maze-player-overlay" style="width: ${cellSize}px; height: ${cellSize}px;">
                <div class="maze-player-marker"></div>
            </div>
        `;
    }

    render(mazeState) {
        const { grid, size, playerX, playerY, visited, exitX, exitY, isVictory, profile, currentFloor, totalFloors } = mazeState;
        const gridEl = document.getElementById('maze_grid');
        if (!gridEl) return;

        const cellSize = this.getCellSize(size);
        const fogOfWarEnabled = profile?.fogOfWar ?? false;
        gridEl.style.gridTemplateColumns = `repeat(${size}, ${cellSize}px)`;
        gridEl.innerHTML = '';

        // Build visited key prefix for multi-floor support
        const floorPrefix = (totalFloors > 1) ? `${currentFloor}:` : '';

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const cell = grid[y][x];
                const cellEl = document.createElement('div');
                cellEl.className = 'maze-cell';
                cellEl.style.width = `${cellSize}px`;
                cellEl.style.height = `${cellSize}px`;

                // Check visited status (support both old and new format)
                const keyNew = `${floorPrefix}${x},${y}`;
                const keyOld = `${x},${y}`;
                const isVisited = visited.has(keyNew) || visited.has(keyOld);
                const isPlayer = x === playerX && y === playerY;
                const isExit = x === exitX && y === exitY;

                // If fog of war is disabled, treat all cells as visited for rendering
                const showAsVisited = !fogOfWarEnabled || isVisited;

                // Fog of war
                if (!showAsVisited) {
                    cellEl.classList.add('hidden');
                } else {
                    cellEl.classList.add('visited');
                    if (cell.walls.top) cellEl.classList.add('wall-top');
                    if (cell.walls.right) cellEl.classList.add('wall-right');
                    if (cell.walls.bottom) cellEl.classList.add('wall-bottom');
                    if (cell.walls.left) cellEl.classList.add('wall-left');
                }

                if (isPlayer) cellEl.classList.add('player');
                if (isExit && showAsVisited) {
                    cellEl.classList.add('exit');
                    if (isVictory) cellEl.classList.add('victory-glow');
                }

                // Minion indicators
                if (cell.minion && showAsVisited) {
                    cellEl.classList.add('has-minion');
                    if (cell.minion.triggered) {
                        cellEl.classList.add('minion-triggered');
                    }
                }

                // Chest indicators
                if (cell.chest && showAsVisited) {
                    cellEl.classList.add('has-chest');
                    if (cell.chest.type === 'locked') cellEl.classList.add('chest-locked');
                    if (cell.chest.opened) cellEl.classList.add('chest-opened');

                    // Custom chest image
                    if (profile?.chestImage && !cell.chest.opened) {
                        cellEl.classList.add('has-custom-chest');
                        const chestImg = document.createElement('img');
                        chestImg.src = getExtensionImagePath(profile.chestImage);
                        chestImg.className = 'maze-chest-img';
                        chestImg.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 70%; height: 70%; object-fit: cover; border-radius: 3px; z-index: 1;';
                        if (cell.chest.type === 'locked') chestImg.style.filter = 'grayscale(50%)';
                        cellEl.appendChild(chestImg);
                    }
                }

                // Trap indicators
                if (cell.trap && showAsVisited) {
                    cellEl.classList.add('has-trap');
                    if (cell.trap.triggered) cellEl.classList.add('trap-triggered');
                }

                // Portal indicators
                if (cell.portal && showAsVisited) {
                    cellEl.classList.add('has-portal');
                    cellEl.dataset.portalColor = cell.portal.color || '#9b59b6';
                    cellEl.style.setProperty('--portal-color', cell.portal.color || '#9b59b6');
                    if (!cell.portal.bidirectional && !cell.portal.isStart) {
                        cellEl.classList.add('portal-exit-only');
                    }
                }

                // Staircase indicators
                if (cell.staircase && showAsVisited) {
                    cellEl.classList.add('has-staircase');
                    cellEl.classList.add(cell.staircase.direction === 'up' ? 'staircase-up' : 'staircase-down');
                    if (cell.staircase.requireKey) cellEl.classList.add('staircase-locked');
                }

                // Store coordinates for event handling
                cellEl.dataset.x = x;
                cellEl.dataset.y = y;

                gridEl.appendChild(cellEl);
            }
        }
    }

    updatePlayerPosition(x, y, animate, cellSize) {
        const overlay = document.getElementById('maze_player_overlay');
        if (!overlay) return;

        const pixelX = x * cellSize;
        const pixelY = y * cellSize;

        if (!animate) {
            overlay.style.transition = 'none';
        } else {
            overlay.style.transition = 'transform 0.15s ease-out';
        }

        overlay.style.transform = `translate(${pixelX}px, ${pixelY}px)`;

        if (!animate) {
            requestAnimationFrame(() => {
                overlay.style.transition = 'transform 0.15s ease-out';
            });
        }
    }

    highlightCell(x, y, type) {
        const cell = document.querySelector(`.maze-cell[data-x="${x}"][data-y="${y}"]`);
        if (cell) {
            cell.classList.add(`highlight-${type}`);
        }
    }

    clearHighlights() {
        document.querySelectorAll('.maze-cell[class*="highlight-"]').forEach(cell => {
            cell.className = cell.className.replace(/highlight-\w+/g, '').trim();
        });
    }

    playEffect(x, y, effect) {
        const cell = document.querySelector(`.maze-cell[data-x="${x}"][data-y="${y}"]`);
        if (!cell) return;

        cell.classList.add(`effect-${effect}`);
        setTimeout(() => {
            cell.classList.remove(`effect-${effect}`);
        }, 500);
    }
}

/**
 * Canvas Renderer - Placeholder for future sprite-based 2.5D rendering
 * Will use HTML5 Canvas for tile/sprite rendering
 */
class CanvasRenderer extends MazeRenderer {
    constructor(options = {}) {
        super(options);
        this.canvas = null;
        this.ctx = null;
        this.sprites = {};
        this.tileSize = options.tileSize || 32;
    }

    getType() {
        return 'canvas';
    }

    getGridHTML(size) {
        const canvasSize = size * this.tileSize;
        return `
            <canvas id="maze_canvas" width="${canvasSize}" height="${canvasSize}" style="
                display: block;
                image-rendering: pixelated;
            "></canvas>
        `;
    }

    getPlayerOverlayHTML(cellSize) {
        // Canvas renderer doesn't use overlay - player is drawn on canvas
        return '';
    }

    async loadSprites(spriteMap) {
        // spriteMap: { floor: 'url', wall: 'url', player: 'url', ... }
        const loadPromises = Object.entries(spriteMap).map(async ([key, url]) => {
            const img = new Image();
            img.src = url;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });
            this.sprites[key] = img;
        });
        await Promise.all(loadPromises);
    }

    init(container, mazeState) {
        super.init(container, mazeState);
        this.canvas = document.getElementById('maze_canvas');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
        }
    }

    render(mazeState) {
        if (!this.ctx) return;

        const { grid, size, playerX, playerY, visited, exitX, exitY, profile } = mazeState;
        const ts = this.tileSize;
        const fogOfWarEnabled = profile?.fogOfWar ?? false;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw tiles
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const cell = grid[y][x];
                const key = `${x},${y}`;
                const isVisited = visited.has(key);
                const showAsVisited = !fogOfWarEnabled || isVisited;

                if (!showAsVisited) {
                    // Fog of war - draw black
                    this.ctx.fillStyle = '#1a1a2e';
                    this.ctx.fillRect(x * ts, y * ts, ts, ts);
                } else {
                    // Draw floor sprite or fallback color
                    if (this.sprites.floor) {
                        this.ctx.drawImage(this.sprites.floor, x * ts, y * ts, ts, ts);
                    } else {
                        this.ctx.fillStyle = '#2d2d44';
                        this.ctx.fillRect(x * ts, y * ts, ts, ts);
                    }

                    // Draw walls
                    this.ctx.strokeStyle = '#8b5cf6';
                    this.ctx.lineWidth = 2;
                    if (cell.walls.top) {
                        this.ctx.beginPath();
                        this.ctx.moveTo(x * ts, y * ts);
                        this.ctx.lineTo((x + 1) * ts, y * ts);
                        this.ctx.stroke();
                    }
                    if (cell.walls.right) {
                        this.ctx.beginPath();
                        this.ctx.moveTo((x + 1) * ts, y * ts);
                        this.ctx.lineTo((x + 1) * ts, (y + 1) * ts);
                        this.ctx.stroke();
                    }
                    if (cell.walls.bottom) {
                        this.ctx.beginPath();
                        this.ctx.moveTo(x * ts, (y + 1) * ts);
                        this.ctx.lineTo((x + 1) * ts, (y + 1) * ts);
                        this.ctx.stroke();
                    }
                    if (cell.walls.left) {
                        this.ctx.beginPath();
                        this.ctx.moveTo(x * ts, y * ts);
                        this.ctx.lineTo(x * ts, (y + 1) * ts);
                        this.ctx.stroke();
                    }

                    // Draw exit
                    if (x === exitX && y === exitY) {
                        if (this.sprites.exit) {
                            this.ctx.drawImage(this.sprites.exit, x * ts, y * ts, ts, ts);
                        } else {
                            this.ctx.fillStyle = '#22c55e';
                            this.ctx.fillRect(x * ts + 4, y * ts + 4, ts - 8, ts - 8);
                        }
                    }

                    // Draw entities
                    if (cell.chest && !cell.chest.opened) {
                        if (this.sprites.chest) {
                            this.ctx.drawImage(this.sprites.chest, x * ts, y * ts, ts, ts);
                        } else {
                            this.ctx.fillStyle = '#f59e0b';
                            this.ctx.fillRect(x * ts + 6, y * ts + 6, ts - 12, ts - 12);
                        }
                    }

                    if (cell.minion && !cell.minion.triggered) {
                        if (this.sprites.minion) {
                            this.ctx.drawImage(this.sprites.minion, x * ts, y * ts, ts, ts);
                        } else {
                            this.ctx.fillStyle = '#ef4444';
                            this.ctx.beginPath();
                            this.ctx.arc(x * ts + ts/2, y * ts + ts/2, ts/4, 0, Math.PI * 2);
                            this.ctx.fill();
                        }
                    }
                }
            }
        }

        // Draw player
        if (this.sprites.player) {
            this.ctx.drawImage(this.sprites.player, playerX * ts, playerY * ts, ts, ts);
        } else {
            this.ctx.fillStyle = '#3b82f6';
            this.ctx.beginPath();
            this.ctx.arc(playerX * ts + ts/2, playerY * ts + ts/2, ts/3, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    updatePlayerPosition(x, y, animate, cellSize) {
        // Canvas renderer re-renders everything, no separate update needed
        // Animation would be handled via requestAnimationFrame in a real implementation
    }

    getCellSize(gridSize) {
        return this.tileSize;
    }
}

/**
 * Isometric Renderer - Full 2.5D isometric rendering with programmatic sprites
 * Supports both generated placeholders and loaded sprite assets
 */
class IsometricRenderer extends CanvasRenderer {
    constructor(options = {}) {
        super(options);
        this.tileWidth = options.tileWidth || 64;
        this.tileHeight = options.tileHeight || 32;
        this.wallHeight = options.wallHeight || 24;
        this.spriteCache = {};
        this.spritesLoaded = false;
        this.spritesLoading = false;

        // Sprite asset paths (relative to extension root)
        this.spritePaths = {
            floor: 'assets/isometric/dungeon/floor.png',
            wall: 'assets/isometric/dungeon/wall.png',
            wallCorner: 'assets/isometric/dungeon/wall_corner.png',
            fog: 'assets/isometric/dungeon/fog.png',
            exit: 'assets/isometric/dungeon/exit.png',
            chest: 'assets/isometric/dungeon/chest_closed.png',
            chestOpen: 'assets/isometric/dungeon/chest_open.png',
            portal: 'assets/isometric/dungeon/portal.png',
            trap: 'assets/isometric/dungeon/trap.png',
            minion: 'assets/isometric/dungeon/minion.png',
            player: 'assets/isometric/dungeon/player.png',
            stairsUp: 'assets/isometric/dungeon/stairs_up.png',
            stairsDown: 'assets/isometric/dungeon/stairs_down.png',
        };

        // Fallback color palette for procedural sprites (used if sprites not loaded)
        this.palette = {
            floor: { top: '#3d3d5c', light: '#4a4a6a', dark: '#2d2d44' },
            wall: { top: '#6b5b95', light: '#8b7bb5', dark: '#4b3b75' },
            fog: { top: '#1a1a2e', light: '#222244', dark: '#111122' },
            exit: { top: '#22c55e', light: '#4ade80', dark: '#16a34a' },
            chest: { top: '#f59e0b', light: '#fbbf24', dark: '#d97706' },
            chestOpen: { top: '#78716c', light: '#a8a29e', dark: '#57534e' },
            minion: { top: '#ef4444', light: '#f87171', dark: '#dc2626' },
            trap: { top: '#a855f7', light: '#c084fc', dark: '#9333ea' },
            portal: { top: '#06b6d4', light: '#22d3ee', dark: '#0891b2' },
            stairUp: { top: '#10b981', light: '#34d399', dark: '#059669' },
            stairDown: { top: '#f97316', light: '#fb923c', dark: '#ea580c' },
            player: { top: '#3b82f6', light: '#60a5fa', dark: '#2563eb' },
        };
    }

    getType() {
        return 'isometric';
    }

    /**
     * Load all sprite images asynchronously
     */
    async loadSprites() {
        if (this.spritesLoaded || this.spritesLoading) return;
        this.spritesLoading = true;

        const extensionPath = '/scripts/extensions/third-party/SillyTavern-MazeMaster/';
        const loadPromises = Object.entries(this.spritePaths).map(async ([key, path]) => {
            try {
                const img = new Image();
                img.src = extensionPath + path;
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                });
                this.spriteCache[key] = img;
            } catch (e) {
                console.warn(`[MazeMaster] Failed to load sprite: ${path}`);
            }
        });

        await Promise.all(loadPromises);
        this.spritesLoaded = true;
        this.spritesLoading = false;
        console.log('[MazeMaster] Isometric sprites loaded:', Object.keys(this.spriteCache));

        // Re-render with sprites now that they're loaded
        if (this.lastMazeState) {
            this.render(this.lastMazeState);
        }
    }

    gridToIso(x, y) {
        return {
            x: (x - y) * (this.tileWidth / 2),
            y: (x + y) * (this.tileHeight / 2),
        };
    }

    isoToGrid(screenX, screenY) {
        const x = (screenX / (this.tileWidth / 2) + screenY / (this.tileHeight / 2)) / 2;
        const y = (screenY / (this.tileHeight / 2) - screenX / (this.tileWidth / 2)) / 2;
        return { x: Math.floor(x), y: Math.floor(y) };
    }

    getGridHTML(size) {
        // Pre-compute tile sizes based on grid size (same logic as init)
        const tileWidth = this.getCellSize(size);
        const tileHeight = tileWidth / 2;
        const spriteHeight = tileWidth * 2; // Kenney sprites are 256x512 (2:1 aspect)

        const canvasWidth = (size + 1) * tileWidth;
        const canvasHeight = size * tileHeight + spriteHeight + tileHeight;
        return `
            <canvas id="maze_canvas" width="${canvasWidth}" height="${canvasHeight}" style="
                display: block;
                image-rendering: crisp-edges;
                max-width: 100%;
            "></canvas>
        `;
    }

    getPlayerOverlayHTML() {
        return ''; // Player drawn on canvas
    }

    getCellSize(gridSize) {
        // Balanced tile sizes for visibility
        if (gridSize <= 7) return 76;
        if (gridSize <= 10) return 64;
        if (gridSize <= 15) return 52;
        if (gridSize <= 20) return 44;
        return 36;
    }

    init(container, mazeState) {
        // Adjust tile size based on maze size
        if (mazeState?.size) {
            const newSize = this.getCellSize(mazeState.size);
            this.tileWidth = newSize;
            this.tileHeight = newSize / 2;
            this.wallHeight = newSize * 0.375;
        }
        super.init(container, mazeState);
        // Start loading sprites (async, will be ready for next render)
        this.loadSprites();
    }

    /**
     * Draw a sprite at isometric position, scaled to tile size
     * Kenney sprites are 256x512 with the isometric tile at the bottom ~1/4 of image
     */
    drawSprite(spriteName, x, y, scale = 1) {
        const sprite = this.spriteCache[spriteName];
        if (!sprite) return false;

        // Kenney sprites are 256x512, we scale to fit tile width
        const spriteAspect = sprite.height / sprite.width; // ~2 for Kenney
        const w = this.tileWidth * scale;
        const h = w * spriteAspect;

        // The isometric diamond in Kenney sprites is at the bottom ~25% of the image
        // Position so the diamond part aligns with the tile position
        // Bottom of sprite should be at y + tileHeight/2 (bottom of isometric diamond)
        const drawX = x - w / 2;
        const drawY = y + this.tileHeight / 2 - h;

        this.ctx.drawImage(sprite, drawX, drawY, w, h);
        return true;
    }

    render(mazeState) {
        if (!this.ctx) {
            this.canvas = document.getElementById('maze_canvas');
            if (this.canvas) this.ctx = this.canvas.getContext('2d');
            if (!this.ctx) return;
        }

        // Store for re-rendering after sprites load
        this.lastMazeState = mazeState;

        const { grid, size, playerX, playerY, visited, exitX, exitY, isVictory, currentFloor, totalFloors, profile } = mazeState;
        const fogOfWarEnabled = profile?.fogOfWar ?? false;

        // Kenney sprites are 256x512 (2:1 aspect), so sprite height = tileWidth * 2
        const spriteHeight = this.tileWidth * 2;

        // Canvas needs extra height at top for tall sprites
        const canvasWidth = (size + 1) * this.tileWidth;
        const canvasHeight = size * this.tileHeight + spriteHeight + this.tileHeight;
        if (this.canvas.width !== canvasWidth || this.canvas.height !== canvasHeight) {
            this.canvas.width = canvasWidth;
            this.canvas.height = canvasHeight;
        }

        // Clear with dark background
        this.ctx.fillStyle = '#0a0a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const offsetX = this.canvas.width / 2;
        // Offset Y needs room for tall sprites at the top
        const offsetY = spriteHeight;

        // Build visited key prefix for multi-floor
        const floorPrefix = (totalFloors > 1) ? `${currentFloor}:` : '';

        // Draw in isometric order (back to front)
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const cell = grid[y][x];
                const keyNew = `${floorPrefix}${x},${y}`;
                const keyOld = `${x},${y}`;
                const isVisited = visited.has(keyNew) || visited.has(keyOld);
                const iso = this.gridToIso(x, y);
                const drawX = iso.x + offsetX;
                const drawY = iso.y + offsetY;

                // If fog of war is disabled, treat all cells as visited for rendering
                const showAsVisited = !fogOfWarEnabled || isVisited;

                if (!showAsVisited) {
                    // Fog of war - always use procedural dark block (sprite is same as floor)
                    this.drawIsoBlock(drawX, drawY, this.palette.fog, 0);
                } else {
                    // Draw floor
                    if (!this.drawSprite('floor', drawX, drawY)) {
                        this.drawIsoDiamond(drawX, drawY, this.palette.floor);
                    }

                    // Draw walls (use wall sprite for cells with walls)
                    if (cell.walls.left || cell.walls.top) {
                        const hasCorner = cell.walls.left && cell.walls.top;
                        if (hasCorner) {
                            if (!this.drawSprite('wallCorner', drawX, drawY)) {
                                this.drawWallLeft(drawX, drawY, this.palette.wall);
                                this.drawWallTop(drawX, drawY, this.palette.wall);
                            }
                        } else if (cell.walls.left) {
                            if (!this.drawSprite('wall', drawX, drawY)) {
                                this.drawWallLeft(drawX, drawY, this.palette.wall);
                            }
                        } else if (cell.walls.top) {
                            if (!this.drawSprite('wall', drawX, drawY)) {
                                this.drawWallTop(drawX, drawY, this.palette.wall);
                            }
                        }
                    }

                    // Draw entities on top of floor
                    const isExit = x === exitX && y === exitY;
                    const isPlayer = x === playerX && y === playerY;

                    if (isExit) {
                        if (!this.drawSprite('exit', drawX, drawY, 1.0)) {
                            this.drawIsoBlock(drawX, drawY - 2, isVictory ? this.palette.stairUp : this.palette.exit, 4);
                        }
                    }

                    if (cell.staircase) {
                        const stairSprite = cell.staircase.direction === 'up' ? 'stairsUp' : 'stairsDown';
                        if (!this.drawSprite(stairSprite, drawX, drawY, 1.0)) {
                            const pal = cell.staircase.direction === 'up' ? this.palette.stairUp : this.palette.stairDown;
                            this.drawIsoBlock(drawX, drawY - 2, pal, 6);
                            this.drawStairIcon(drawX, drawY - 6, cell.staircase.direction);
                        }
                    }

                    if (cell.portal) {
                        if (!this.drawSprite('portal', drawX, drawY, 0.8)) {
                            this.drawPortal(drawX, drawY);
                        }
                    }

                    if (cell.chest) {
                        const chestSprite = cell.chest.opened ? 'chestOpen' : 'chest';
                        if (!this.drawSprite(chestSprite, drawX, drawY, 0.8)) {
                            const pal = cell.chest.opened ? this.palette.chestOpen : this.palette.chest;
                            this.drawChest(drawX, drawY, pal, cell.chest.opened);
                        }
                    }

                    if (cell.trap && !cell.trap.triggered) {
                        if (!this.drawSprite('trap', drawX, drawY, 1.0)) {
                            this.drawTrap(drawX, drawY);
                        }
                    }

                    if (cell.minion && !cell.minion.triggered) {
                        if (!this.drawSprite('minion', drawX, drawY, 1.0)) {
                            this.drawMinion(drawX, drawY);
                        }
                    }

                    if (isPlayer) {
                        if (!this.drawSprite('player', drawX, drawY, 1.0)) {
                            this.drawPlayer(drawX, drawY);
                        }
                    }
                }
            }
        }
    }

    drawIsoDiamond(x, y, palette) {
        const hw = this.tileWidth / 2;
        const hh = this.tileHeight / 2;

        this.ctx.fillStyle = palette.top;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y - hh);
        this.ctx.lineTo(x + hw, y);
        this.ctx.lineTo(x, y + hh);
        this.ctx.lineTo(x - hw, y);
        this.ctx.closePath();
        this.ctx.fill();
    }

    drawIsoBlock(x, y, palette, height = 8) {
        const hw = this.tileWidth / 2;
        const hh = this.tileHeight / 2;

        // Left face
        this.ctx.fillStyle = palette.dark;
        this.ctx.beginPath();
        this.ctx.moveTo(x - hw, y);
        this.ctx.lineTo(x, y + hh);
        this.ctx.lineTo(x, y + hh + height);
        this.ctx.lineTo(x - hw, y + height);
        this.ctx.closePath();
        this.ctx.fill();

        // Right face
        this.ctx.fillStyle = palette.light;
        this.ctx.beginPath();
        this.ctx.moveTo(x + hw, y);
        this.ctx.lineTo(x, y + hh);
        this.ctx.lineTo(x, y + hh + height);
        this.ctx.lineTo(x + hw, y + height);
        this.ctx.closePath();
        this.ctx.fill();

        // Top face
        this.drawIsoDiamond(x, y, palette);
    }

    drawWallLeft(x, y, palette) {
        const hw = this.tileWidth / 2;
        const hh = this.tileHeight / 2;
        const h = this.wallHeight;

        this.ctx.fillStyle = palette.dark;
        this.ctx.beginPath();
        this.ctx.moveTo(x - hw, y);
        this.ctx.lineTo(x - hw, y - h);
        this.ctx.lineTo(x, y - hh - h);
        this.ctx.lineTo(x, y - hh);
        this.ctx.closePath();
        this.ctx.fill();

        // Top edge
        this.ctx.fillStyle = palette.top;
        this.ctx.fillRect(x - hw - 1, y - h - 2, 4, 4);
    }

    drawWallTop(x, y, palette) {
        const hw = this.tileWidth / 2;
        const hh = this.tileHeight / 2;
        const h = this.wallHeight;

        this.ctx.fillStyle = palette.light;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y - hh);
        this.ctx.lineTo(x, y - hh - h);
        this.ctx.lineTo(x + hw, y - h);
        this.ctx.lineTo(x + hw, y);
        this.ctx.closePath();
        this.ctx.fill();

        // Top edge
        this.ctx.fillStyle = palette.top;
        this.ctx.fillRect(x + hw - 2, y - h - 2, 4, 4);
    }

    drawPlayer(x, y) {
        const pal = this.palette.player;
        const r = this.tileWidth / 5;

        // Shadow
        this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
        this.ctx.beginPath();
        this.ctx.ellipse(x, y + 2, r, r/2, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Body (sphere-ish)
        const gradient = this.ctx.createRadialGradient(x - r/3, y - r - r/2, 0, x, y - r/2, r * 1.5);
        gradient.addColorStop(0, pal.light);
        gradient.addColorStop(0.5, pal.top);
        gradient.addColorStop(1, pal.dark);
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(x, y - r/2, r, 0, Math.PI * 2);
        this.ctx.fill();

        // Highlight
        this.ctx.fillStyle = 'rgba(255,255,255,0.4)';
        this.ctx.beginPath();
        this.ctx.arc(x - r/3, y - r, r/4, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawChest(x, y, palette, opened) {
        const w = this.tileWidth / 3;
        const h = this.tileHeight / 2;

        // Chest body
        this.ctx.fillStyle = palette.dark;
        this.ctx.fillRect(x - w/2, y - h, w, h);
        this.ctx.fillStyle = palette.top;
        this.ctx.fillRect(x - w/2, y - h, w, h/3);

        if (!opened) {
            // Lock
            this.ctx.fillStyle = '#ffd700';
            this.ctx.fillRect(x - 2, y - h/2 - 2, 4, 4);
        } else {
            // Open lid
            this.ctx.fillStyle = palette.light;
            this.ctx.fillRect(x - w/2, y - h - 4, w, 4);
        }
    }

    drawMinion(x, y) {
        const pal = this.palette.minion;
        const r = this.tileWidth / 6;

        // Shadow
        this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
        this.ctx.beginPath();
        this.ctx.ellipse(x, y + 2, r, r/2, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Body
        this.ctx.fillStyle = pal.top;
        this.ctx.beginPath();
        this.ctx.arc(x, y - r/2, r, 0, Math.PI * 2);
        this.ctx.fill();

        // Eyes
        this.ctx.fillStyle = '#fff';
        this.ctx.beginPath();
        this.ctx.arc(x - 3, y - r/2, 2, 0, Math.PI * 2);
        this.ctx.arc(x + 3, y - r/2, 2, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawTrap(x, y) {
        const pal = this.palette.trap;
        this.ctx.fillStyle = pal.top;

        // Spikes pattern
        for (let i = -1; i <= 1; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x + i * 6 - 2, y);
            this.ctx.lineTo(x + i * 6, y - 6);
            this.ctx.lineTo(x + i * 6 + 2, y);
            this.ctx.fill();
        }
    }

    drawPortal(x, y) {
        const pal = this.palette.portal;
        const r = this.tileWidth / 4;

        // Glow
        const gradient = this.ctx.createRadialGradient(x, y - r/2, 0, x, y - r/2, r * 1.5);
        gradient.addColorStop(0, pal.light);
        gradient.addColorStop(0.5, pal.top + '88');
        gradient.addColorStop(1, 'transparent');
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(x, y - r/2, r * 1.5, 0, Math.PI * 2);
        this.ctx.fill();

        // Core
        this.ctx.fillStyle = pal.top;
        this.ctx.beginPath();
        this.ctx.arc(x, y - r/2, r/2, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawStairIcon(x, y, direction) {
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(direction === 'up' ? '▲' : '▼', x, y);
    }

    updatePlayerPosition(x, y, animate, cellSize) {
        // Canvas re-renders everything, animation handled in render
    }
}

/**
 * Renderer Registry - Factory for creating and switching renderers
 */
const RendererRegistry = {
    renderers: {
        'css-grid': CSSGridRenderer,
        'canvas': CanvasRenderer,
        'isometric': IsometricRenderer,
    },

    currentRenderer: null,
    currentType: 'css-grid',

    /**
     * Register a new renderer type
     */
    register(type, RendererClass) {
        this.renderers[type] = RendererClass;
    },

    /**
     * Create a renderer instance
     */
    create(type, options = {}) {
        const RendererClass = this.renderers[type];
        if (!RendererClass) {
            console.warn(`[MazeMaster] Unknown renderer type: ${type}, falling back to css-grid`);
            return new CSSGridRenderer(options);
        }
        return new RendererClass(options);
    },

    /**
     * Get or create the current active renderer
     */
    getRenderer(type = null) {
        // If no type specified, check settings for renderer preference
        if (!type && typeof extensionSettings !== 'undefined' && extensionSettings?.rendererType) {
            type = extensionSettings.rendererType;
        }

        if (type && type !== this.currentType) {
            if (this.currentRenderer) {
                this.currentRenderer.cleanup();
            }
            this.currentType = type;
            this.currentRenderer = this.create(type);
        }

        if (!this.currentRenderer) {
            this.currentRenderer = this.create(this.currentType);
        }

        return this.currentRenderer;
    },

    /**
     * Get list of available renderer types
     */
    getAvailableTypes() {
        return Object.keys(this.renderers);
    },
};

// =============================================================================
// LAYOUT MODE SYSTEM (v1.2.0)
// =============================================================================

/**
 * Detect if we're on a mobile/portrait device
 * @returns {'mobile' | 'desktop'}
 */
function detectLayoutMode() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const isPortrait = height > width;
    const isSmallScreen = width < 768;

    // Mobile if portrait OR small screen
    return (isPortrait || isSmallScreen) ? 'mobile' : 'desktop';
}

/**
 * Get the current layout mode based on settings
 * @returns {'mobile' | 'desktop'}
 */
function getLayoutMode() {
    const mode = extensionSettings?.layoutMode || 'auto';
    if (mode === 'auto') {
        return detectLayoutMode();
    }
    return mode;
}

/**
 * Apply layout mode CSS classes to maze modal
 */
function applyLayoutMode() {
    const modal = document.getElementById('mazemaster_maze_modal');
    if (!modal) return;

    const mode = getLayoutMode();
    modal.classList.remove('layout-mobile', 'layout-desktop');
    modal.classList.add(`layout-${mode}`);

    // Also update the main container if it exists
    const container = modal.querySelector('.maze-modal-container');
    if (container) {
        container.classList.remove('layout-mobile', 'layout-desktop');
        container.classList.add(`layout-${mode}`);
    }
}

// Listen for orientation/resize changes
if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
        if (extensionSettings?.layoutMode === 'auto') {
            applyLayoutMode();
        }
    });
}

// Default maze profile fields for backwards compatibility
const MAZE_PROFILE_DEFAULTS = {
    difficulty: 'normal',
    theme: 'fantasy',
    mapStyle: 'maze',
    floors: 1,
    fogOfWar: false, // Disabled by default for testing
    // STScript hooks
    onMove: '',
    onMilestone: '',
    onExploreComplete: '',
    onItemAdd: '',
    onItemRemove: '',
    onChestOpen: '',
    onTrade: '',
    onEnemyMove: '',
    onTeleport: '',
    onObjectiveProgress: '',
    onObjectiveComplete: '',
    onAllObjectivesComplete: '',
    onDifficultySet: '',
    onStatUpdate: '',
    // New features
    portals: [],
    objectives: [],
};

/**
 * Execute STScript command with timeout protection
 * Prevents hanging if a script takes too long or gets stuck
 * @param {string} command - The STScript command to execute
 * @param {number} timeoutMs - Timeout in milliseconds (default: 10000)
 * @returns {Promise<any>} - Result of the command or null if timed out
 */
async function executeWithTimeout(command, timeoutMs = STSCRIPT_TIMEOUT_MS) {
    if (!command || typeof command !== 'string' || command.trim() === '') {
        return null;
    }

    try {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`STScript timed out after ${timeoutMs}ms`)), timeoutMs);
        });

        const result = await Promise.race([
            executeSlashCommandsWithOptions(command),
            timeoutPromise
        ]);

        return result;
    } catch (err) {
        if (err.message?.includes('timed out')) {
            console.warn(`[MazeMaster] STScript timed out: ${command.substring(0, 50)}...`);
        } else {
            console.error('[MazeMaster] STScript error:', err);
        }
        return null;
    }
}

/**
 * Fire an STScript hook with parameter substitution
 * @param {string} hookName - The hook name (e.g., 'onMove', 'onItemAdd')
 * @param {Object} params - Parameters to substitute (e.g., {x: 1, y: 2})
 */
async function fireHook(hookName, params = {}) {
    const profile = currentMaze?.profile;
    if (!profile) return;

    let command = profile[hookName];
    if (!command || typeof command !== 'string' || !command.trim()) return;

    // Replace template variables {{varName}} with values
    for (const [key, value] of Object.entries(params)) {
        command = command.replaceAll(`{{${key}}}`, String(value));
    }

    await executeWithTimeout(command);
}

/**
 * Get difficulty tier settings for a profile
 * @param {Object|string} profileOrDifficulty - Profile object or difficulty string
 * @returns {Object} Difficulty tier configuration
 */
function getDifficultySettings(profileOrDifficulty) {
    const difficulty = typeof profileOrDifficulty === 'string'
        ? profileOrDifficulty
        : (profileOrDifficulty?.difficulty || 'normal');
    return DIFFICULTY_TIERS[difficulty] || DIFFICULTY_TIERS.normal;
}

/**
 * Get maze profile with defaults merged in for backwards compatibility
 * @param {string} name - Profile name
 * @returns {Object|null} Profile with defaults merged
 */
function getMazeProfileWithDefaults(name) {
    const profile = extensionSettings.mazeProfiles?.[name];
    if (!profile) return null;
    return { ...MAZE_PROFILE_DEFAULTS, ...profile };
}

// =============================================================================
// STATISTICS TRACKING
// =============================================================================

/**
 * Initialize session stats for a new maze
 */
/**
 * Get current persona name from SillyTavern context
 * @returns {string} The current persona name or 'Default User'
 */
function getCurrentPersonaName() {
    try {
        const context = SillyTavern.getContext();
        // Try various context properties that might contain the persona name
        return context?.name1 || context?.persona || context?.user_avatar?.replace(/\.[^/.]+$/, '') || 'Default User';
    } catch (e) {
        console.warn('[MazeMaster] Could not get persona name:', e);
        return 'Default User';
    }
}

function initSessionStats() {
    return {
        startTime: Date.now(),
        moves: 0,
        encountersTotal: 0,
        encountersWon: 0,
        encountersLost: 0,
        chestsOpened: 0,
        trapsTriggered: 0,
        teleportsUsed: 0,
        itemsCollected: { key: 0, pow: 0, stealth: 0, grandpow: 0 },
    };
}

/**
 * Increment a stat and fire the onStatUpdate hook
 * @param {string} statName - Name of the stat to increment
 * @param {number} delta - Amount to add (default 1)
 */
async function incrementStat(statName, delta = 1) {
    if (!currentMaze?.stats) return;

    if (typeof currentMaze.stats[statName] === 'number') {
        currentMaze.stats[statName] += delta;
        updateStatsDisplay();
        await fireHook('onStatUpdate', { statName, value: currentMaze.stats[statName] });
    }
}

/**
 * Get current session stats
 * @returns {Object} Current session stats
 */
function getSessionStats() {
    if (!currentMaze?.stats) return null;
    return {
        ...currentMaze.stats,
        elapsedTime: getElapsedTime(),
        explorationPercent: getExplorationPercent(),
    };
}

/**
 * Get elapsed time as formatted string
 * @returns {string} Formatted time (M:SS or H:MM:SS)
 */
function getElapsedTime() {
    if (!currentMaze?.stats?.startTime) return '0:00';
    const elapsed = Math.floor((Date.now() - currentMaze.stats.startTime) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const mins = Math.floor((elapsed % 3600) / 60);
    const secs = elapsed % 60;
    if (hours > 0) {
        return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get exploration percentage
 * @returns {number} Exploration percentage (0-100)
 */
function getExplorationPercent() {
    if (!currentMaze?.visited || !currentMaze?.size) return 0;
    const totalFloors = currentMaze.totalFloors || 1;
    const totalCells = currentMaze.size * currentMaze.size * totalFloors;
    return Math.floor((currentMaze.visited.size / totalCells) * 100);
}

/**
 * Update the stats display in the maze modal
 */
function updateStatsDisplay() {
    const movesEl = document.getElementById('maze_stat_moves');
    const timeEl = document.getElementById('maze_stat_time');
    const exploreEl = document.getElementById('maze_stat_explore');

    if (movesEl) movesEl.textContent = currentMaze?.stats?.moves || 0;
    if (timeEl) timeEl.textContent = getElapsedTime();
    if (exploreEl) exploreEl.textContent = `${getExplorationPercent()}%`;
}

/**
 * Helper to update a stats object with game results
 * @param {Object} statsObj - The stats object to update
 * @param {string} profileName - The profile name
 * @param {string} result - 'win' or 'lose'
 * @param {number} elapsed - Elapsed time in ms
 * @param {number} moves - Number of moves
 */
function updateStatsObject(statsObj, profileName, result, elapsed, moves) {
    if (!statsObj.profileStats) {
        statsObj.profileStats = {};
    }

    // Update profile-specific stats
    const profileStats = statsObj.profileStats[profileName] || {
        totalGames: 0,
        wins: 0,
        losses: 0,
        bestTime: null,
        totalMoves: 0,
    };

    profileStats.totalGames++;
    if (result === 'win') {
        profileStats.wins++;
        if (profileStats.bestTime === null || elapsed < profileStats.bestTime) {
            profileStats.bestTime = elapsed;
        }
    } else {
        profileStats.losses++;
    }
    profileStats.totalMoves += moves;
    statsObj.profileStats[profileName] = profileStats;

    // Update aggregate stats
    statsObj.totalGames = (statsObj.totalGames || 0) + 1;
    if (result === 'win') {
        statsObj.wins = (statsObj.wins || 0) + 1;
        if (statsObj.bestTime === null || elapsed < statsObj.bestTime) {
            statsObj.bestTime = elapsed;
        }
    } else {
        statsObj.losses = (statsObj.losses || 0) + 1;
    }
    statsObj.totalMoves = (statsObj.totalMoves || 0) + moves;
}

/**
 * Migrate old stats format to new global/persona structure
 */
function migrateStatsToNewFormat() {
    if (!extensionSettings.mazeStats) return;

    // Check if already migrated (has global property)
    if (extensionSettings.mazeStats.global) return;

    // Old format: { profileStats: { ... } }
    // New format: { global: { profileStats: { ... }, ... }, personas: { ... } }
    const oldProfileStats = extensionSettings.mazeStats.profileStats || {};

    extensionSettings.mazeStats = {
        global: {
            totalGames: 0,
            wins: 0,
            losses: 0,
            bestTime: null,
            totalMoves: 0,
            profileStats: { ...oldProfileStats },
        },
        personas: {},
    };

    // Calculate aggregate totals from migrated profile stats
    for (const profileName in oldProfileStats) {
        const ps = oldProfileStats[profileName];
        extensionSettings.mazeStats.global.totalGames += ps.totalGames || 0;
        extensionSettings.mazeStats.global.wins += ps.wins || 0;
        extensionSettings.mazeStats.global.losses += ps.losses || 0;
        extensionSettings.mazeStats.global.totalMoves += ps.totalMoves || 0;
        if (ps.bestTime !== null) {
            if (extensionSettings.mazeStats.global.bestTime === null ||
                ps.bestTime < extensionSettings.mazeStats.global.bestTime) {
                extensionSettings.mazeStats.global.bestTime = ps.bestTime;
            }
        }
    }

    console.log('[MazeMaster] Migrated stats to new global/persona format');
    saveSettingsDebounced();
}

/**
 * Save persistent stats after game end
 * @param {string} result - 'win' or 'lose'
 */
function savePersistentStats(result) {
    if (!currentMaze?.profileName || !currentMaze?.stats) return;

    const profileName = currentMaze.profileName;
    const personaName = getCurrentPersonaName();
    const elapsed = Date.now() - currentMaze.stats.startTime;
    const moves = currentMaze.stats.moves;

    // Initialize mazeStats structure if needed
    if (!extensionSettings.mazeStats) {
        extensionSettings.mazeStats = {
            global: {
                totalGames: 0,
                wins: 0,
                losses: 0,
                bestTime: null,
                totalMoves: 0,
                profileStats: {},
            },
            personas: {},
        };
    }

    // Migrate old format if needed
    if (!extensionSettings.mazeStats.global) {
        migrateStatsToNewFormat();
    }

    // Update global stats
    updateStatsObject(extensionSettings.mazeStats.global, profileName, result, elapsed, moves);

    // Initialize persona stats if needed
    if (!extensionSettings.mazeStats.personas[personaName]) {
        extensionSettings.mazeStats.personas[personaName] = {
            totalGames: 0,
            wins: 0,
            losses: 0,
            bestTime: null,
            totalMoves: 0,
            profileStats: {},
        };
    }

    // Update persona-specific stats
    updateStatsObject(extensionSettings.mazeStats.personas[personaName], profileName, result, elapsed, moves);

    saveSettingsDebounced();
}

// Stats display update interval
let statsUpdateInterval = null;

function startStatsTimer() {
    if (statsUpdateInterval) clearInterval(statsUpdateInterval);
    statsUpdateInterval = setInterval(() => {
        if (currentMaze?.isOpen && !currentMaze?.isVictory) {
            updateStatsDisplay();
        } else {
            clearInterval(statsUpdateInterval);
            statsUpdateInterval = null;
        }
    }, 1000);
}

function stopStatsTimer() {
    if (statsUpdateInterval) {
        clearInterval(statsUpdateInterval);
        statsUpdateInterval = null;
    }
}

// =============================================================================
// THEME HELPER FUNCTIONS
// =============================================================================

/**
 * Get themed text for an element type
 * @param {string} elementType - Type of element (wall, floor, chest, exit, portal, trap, etc.)
 * @param {Object} profile - The maze profile
 * @returns {string} Themed text or original elementType
 */
function getThemedText(elementType, profile) {
    const themeName = profile?.theme || 'fantasy';
    const theme = SCENARIO_THEMES[themeName] || SCENARIO_THEMES.fantasy;
    return theme?.tileMappings?.[elementType] || elementType;
}

/**
 * Get themed item name
 * @param {string} itemId - The item ID (key, pow, stealth, etc.)
 * @param {Object} profile - The maze profile
 * @returns {string} Themed item name or original itemId
 */
function getThemedItemName(itemId, profile) {
    const themeName = profile?.theme || 'fantasy';
    const theme = SCENARIO_THEMES[themeName] || SCENARIO_THEMES.fantasy;
    return theme?.itemAliases?.[itemId] || itemId;
}

/**
 * Get themed flavor message
 * @param {string} messageType - Type of message (chestFind, portalUse, trapTrigger, etc.)
 * @param {Object} profile - The maze profile
 * @returns {string} Themed message or empty string
 */
function getThemedFlavorMessage(messageType, profile) {
    const themeName = profile?.theme || 'fantasy';
    const theme = SCENARIO_THEMES[themeName] || SCENARIO_THEMES.fantasy;
    return theme?.flavorMessages?.[messageType] || '';
}

/**
 * Get theme colors
 * @param {Object} profile - The maze profile
 * @returns {Object} Theme colors object with primary, secondary, accent
 */
function getThemeColors(profile) {
    const themeName = profile?.theme || 'fantasy';
    const theme = SCENARIO_THEMES[themeName] || SCENARIO_THEMES.fantasy;
    return theme?.colors || { primary: '#2ecc71', secondary: '#27ae60', accent: '#f1c40f' };
}

/**
 * Apply theme colors to maze UI as CSS variables
 * @param {Object} profile - The maze profile
 */
function applyThemeColors(profile) {
    const colors = getThemeColors(profile);
    const container = document.querySelector('.mazemaster-maze-container');
    if (container) {
        container.style.setProperty('--theme-primary', colors.primary);
        container.style.setProperty('--theme-secondary', colors.secondary);
        container.style.setProperty('--theme-accent', colors.accent);
    }
}

// =============================================================================
// D-PAD FUNCTIONALITY
// =============================================================================

/**
 * Initialize D-Pad drag functionality for floating mode
 */
function initDpadDrag() {
    const dpad = document.getElementById('maze_dpad');
    if (!dpad || !dpad.classList.contains('floating')) return;

    const handle = dpad.querySelector('.dpad-drag-handle');
    if (!handle) return;

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const startDrag = (clientX, clientY) => {
        isDragging = true;
        offsetX = clientX - dpad.offsetLeft;
        offsetY = clientY - dpad.offsetTop;
        dpad.style.cursor = 'grabbing';
    };

    const moveDrag = (clientX, clientY) => {
        if (!isDragging) return;
        const x = Math.max(0, Math.min(window.innerWidth - dpad.offsetWidth, clientX - offsetX));
        const y = Math.max(0, Math.min(window.innerHeight - dpad.offsetHeight, clientY - offsetY));
        dpad.style.left = `${x}px`;
        dpad.style.top = `${y}px`;
        dpad.style.right = 'auto';
        dpad.style.bottom = 'auto';
    };

    const endDrag = () => {
        if (isDragging) {
            isDragging = false;
            dpad.style.cursor = '';
            // Save position to settings
            if (!extensionSettings.dpadConfig) {
                extensionSettings.dpadConfig = { enabled: true, floating: true, position: {} };
            }
            extensionSettings.dpadConfig.position = {
                x: dpad.offsetLeft,
                y: dpad.offsetTop
            };
            saveSettingsDebounced();
        }
    };

    // Mouse events
    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startDrag(e.clientX, e.clientY);
    });

    document.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
    document.addEventListener('mouseup', endDrag);

    // Touch events
    handle.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        startDrag(touch.clientX, touch.clientY);
    });

    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const touch = e.touches[0];
        moveDrag(touch.clientX, touch.clientY);
    });

    document.addEventListener('touchend', endDrag);
}

/**
 * Initialize pinch-zoom and pan/drag for the maze map area
 */
function initMapPanZoom() {
    const container = document.getElementById('maze_grid_container');
    const mazeArea = document.querySelector('.mazemaster-maze-area');
    if (!container || !mazeArea) return;

    let scale = 1;
    let panX = 0;
    let panY = 0;
    let isPanning = false;
    let startX = 0;
    let startY = 0;
    let lastTouchDist = 0;
    let lastScale = 1;

    const minScale = 0.5;
    const maxScale = 3;

    const applyTransform = () => {
        container.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
        container.style.transformOrigin = 'center center';
    };

    // Mouse wheel zoom
    mazeArea.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        scale = Math.max(minScale, Math.min(maxScale, scale * delta));
        applyTransform();
    }, { passive: false });

    // Mouse drag pan
    mazeArea.addEventListener('mousedown', (e) => {
        if (e.target.closest('.maze-cell, canvas')) {
            isPanning = true;
            startX = e.clientX - panX;
            startY = e.clientY - panY;
            mazeArea.style.cursor = 'grabbing';
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        panX = e.clientX - startX;
        panY = e.clientY - startY;
        applyTransform();
    });

    document.addEventListener('mouseup', () => {
        isPanning = false;
        mazeArea.style.cursor = '';
    });

    // Touch pinch zoom
    const getTouchDist = (touches) => {
        if (touches.length < 2) return 0;
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    };

    mazeArea.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            // Pinch start
            lastTouchDist = getTouchDist(e.touches);
            lastScale = scale;
        } else if (e.touches.length === 1) {
            // Pan start
            isPanning = true;
            startX = e.touches[0].clientX - panX;
            startY = e.touches[0].clientY - panY;
        }
    }, { passive: true });

    mazeArea.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            // Pinch zoom
            e.preventDefault();
            const dist = getTouchDist(e.touches);
            if (lastTouchDist > 0) {
                const delta = dist / lastTouchDist;
                scale = Math.max(minScale, Math.min(maxScale, lastScale * delta));
                applyTransform();
            }
        } else if (e.touches.length === 1 && isPanning) {
            // Pan
            panX = e.touches[0].clientX - startX;
            panY = e.touches[0].clientY - startY;
            applyTransform();
        }
    }, { passive: false });

    mazeArea.addEventListener('touchend', () => {
        isPanning = false;
        lastTouchDist = 0;
        lastScale = scale;
    });

    // Double-tap to reset zoom
    let lastTap = 0;
    mazeArea.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTap < 300 && e.changedTouches.length === 1) {
            // Double tap - reset zoom and pan
            scale = 1;
            panX = 0;
            panY = 0;
            applyTransform();
        }
        lastTap = now;
    });

    // Add cursor hint
    mazeArea.style.cursor = 'grab';
}

/**
 * Update D-Pad floor buttons visibility based on current position
 */
function updateDpadFloorButtons() {
    const upBtn = document.querySelector('.dpad-floor-up');
    const downBtn = document.querySelector('.dpad-floor-down');

    if (!upBtn || !downBtn || !currentMaze) {
        return;
    }

    // Check if player is on a staircase
    const cell = currentMaze.grid?.[currentMaze.playerY]?.[currentMaze.playerX];
    const staircase = cell?.staircase;

    if (staircase?.direction === 'up') {
        upBtn.classList.remove('hidden');
    } else {
        upBtn.classList.add('hidden');
    }

    if (staircase?.direction === 'down') {
        downBtn.classList.remove('hidden');
    } else {
        downBtn.classList.add('hidden');
    }
}

/**
 * Try to change floors via staircase
 * @param {string} direction - 'up' or 'down'
 */
async function tryFloorChange(direction) {
    if (!currentMaze?.isOpen || currentMaze.isPaused) return false;
    if (currentMaze.totalFloors <= 1) return false;

    const cell = currentMaze.grid?.[currentMaze.playerY]?.[currentMaze.playerX];
    if (!cell?.staircase) {
        console.log('[MazeMaster] Not on a staircase');
        return false;
    }

    if (cell.staircase.direction !== direction) {
        console.log('[MazeMaster] Staircase direction mismatch');
        return false;
    }

    // Check if floor key is required
    if (cell.staircase.requireKey && direction === 'up') {
        if (!hasFloorKey()) {
            currentMaze.currentMinion = {
                name: 'Locked Staircase',
                imagePath: '',
                message: 'This staircase is locked! You need a Floor Key to ascend.',
            };
            updateMazeHero();
            return false;
        }
        // Consume the floor key
        await consumeFloorKey();
    }

    const targetFloor = cell.staircase.targetFloor;
    const targetX = cell.staircase.targetX;
    const targetY = cell.staircase.targetY;

    // Validate target floor
    if (targetFloor < 0 || targetFloor >= currentMaze.totalFloors) {
        console.error('[MazeMaster] Invalid target floor');
        return false;
    }

    // Update floor and position
    currentMaze.currentFloor = targetFloor;
    currentMaze.grid = currentMaze.floors[targetFloor];
    currentMaze.playerX = targetX;
    currentMaze.playerY = targetY;

    // Mark new position as visited (with floor prefix for proper tracking)
    currentMaze.visited.add(`${targetFloor}:${targetX},${targetY}`);

    // Show transition message
    const theme = SCENARIO_THEMES[currentMaze.profile?.theme] || SCENARIO_THEMES.fantasy;
    const flavorMsg = direction === 'up'
        ? theme.flavorMessages.stairUp
        : theme.flavorMessages.stairDown;

    currentMaze.currentMinion = {
        name: direction === 'up' ? 'Ascending' : 'Descending',
        imagePath: '',
        message: flavorMsg || `You ${direction === 'up' ? 'ascend' : 'descend'} to floor ${targetFloor + 1}...`,
    };
    updateMazeHero();

    // Fire hook
    await fireHook('onMove', { x: targetX, y: targetY, direction: direction === 'up' ? 'floor-up' : 'floor-down', floor: targetFloor });

    // Re-render grid
    renderMazeGrid();
    updatePlayerPosition(false);
    updateStatsDisplay();
    updateDpadFloorButtons();
    updateFloorIndicator();

    console.log(`[MazeMaster] Changed to floor ${targetFloor + 1}`);
    return true;
}

/**
 * Update floor indicator display
 */
function updateFloorIndicator() {
    const currentEl = document.getElementById('maze_floor_current');
    const totalEl = document.getElementById('maze_floor_total');
    const indicator = document.querySelector('.maze-floor-indicator');

    if (currentMaze.totalFloors <= 1) {
        if (indicator) indicator.style.display = 'none';
        return;
    }

    if (indicator) indicator.style.display = '';
    if (currentEl) currentEl.textContent = currentMaze.currentFloor + 1;
    if (totalEl) totalEl.textContent = currentMaze.totalFloors;
}

// =============================================================================
// v1.2.0 NEW ITEM USAGE FUNCTIONS
// =============================================================================

/**
 * Use a Map Fragment to reveal a 3x3 area around the player
 */
async function useMapFragment() {
    if (!currentMaze || currentMaze.isPaused) return false;
    if (!currentMaze.inventory.mapFragment || currentMaze.inventory.mapFragment <= 0) {
        console.log('[MazeMaster] No Map Fragments available');
        return false;
    }

    const { playerX, playerY, grid, size } = currentMaze;

    // Reveal 3x3 area around player
    let revealed = 0;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const x = playerX + dx;
            const y = playerY + dy;
            if (x >= 0 && x < size && y >= 0 && y < size) {
                const key = `${x},${y}`;
                if (!currentMaze.visited.has(key)) {
                    currentMaze.visited.add(key);
                    grid[y][x].visited = true;
                    revealed++;
                }
            }
        }
    }

    await removeFromInventory('mapFragment', 1);
    renderMazeGrid();

    // Show message
    currentMaze.currentMinion = {
        name: 'Map Fragment',
        imagePath: '',
        message: revealed > 0
            ? `The ancient map reveals ${revealed} hidden area${revealed > 1 ? 's' : ''}!`
            : 'The map shows only what you already knew.',
    };
    updateMazeHero();

    await fireHook('onItemRemove', { item: 'mapFragment', count: 1, total: currentMaze.inventory.mapFragment });
    return true;
}

/**
 * Use a Portal Stone to teleport to a revealed portal
 * Shows selection UI if multiple portals are available
 */
async function usePortalStone() {
    if (!currentMaze || currentMaze.isPaused) return false;
    if (!currentMaze.inventory.portalStone || currentMaze.inventory.portalStone <= 0) {
        console.log('[MazeMaster] No Portal Stones available');
        return false;
    }

    // Find all revealed portals (visited cells with portal)
    const revealedPortals = [];
    for (const key of currentMaze.visited) {
        const [x, y] = key.split(',').map(Number);
        const cell = currentMaze.grid[y]?.[x];
        if (cell?.portal && !(x === currentMaze.playerX && y === currentMaze.playerY)) {
            revealedPortals.push({ x, y, portal: cell.portal });
        }
    }

    if (revealedPortals.length === 0) {
        currentMaze.currentMinion = {
            name: 'Portal Stone',
            imagePath: '',
            message: 'No revealed portals to teleport to. Explore more to find portals first!',
        };
        updateMazeHero();
        return false;
    }

    // If only one portal, teleport directly
    if (revealedPortals.length === 1) {
        const target = revealedPortals[0];
        await executePortalStoneTeleport(target.x, target.y);
        return true;
    }

    // Multiple portals - show selection (simple first-found for now, TODO: selection UI)
    const target = revealedPortals[0];
    await executePortalStoneTeleport(target.x, target.y);
    return true;
}

/**
 * Execute portal stone teleportation
 */
async function executePortalStoneTeleport(targetX, targetY) {
    await removeFromInventory('portalStone', 1);

    // Teleport player
    currentMaze.playerX = targetX;
    currentMaze.playerY = targetY;
    currentMaze.visited.add(`${currentMaze.currentFloor}:${targetX},${targetY}`);

    updatePlayerPosition(true);
    renderMazeGrid();

    currentMaze.currentMinion = {
        name: 'Portal Stone',
        imagePath: '',
        message: 'The portal stone crumbles as you are whisked through space!',
    };
    updateMazeHero();

    await fireHook('onTeleport', { x: targetX, y: targetY, source: 'portalStone' });
}

/**
 * Activate Void Walk mode - next move can phase through a wall
 */
function activateVoidWalk() {
    if (!currentMaze || currentMaze.isPaused) return false;
    if (!currentMaze.inventory.voidWalk || currentMaze.inventory.voidWalk <= 0) {
        console.log('[MazeMaster] No Void Walk available');
        return false;
    }

    if (currentMaze.voidWalkActive) {
        console.log('[MazeMaster] Void Walk already active');
        return false;
    }

    currentMaze.voidWalkActive = true;

    // Visual indicator
    const dpad = document.getElementById('maze_dpad');
    if (dpad) dpad.classList.add('void-walk-active');

    currentMaze.currentMinion = {
        name: 'Void Walk',
        imagePath: '',
        message: 'You become ethereal... Your next move can phase through walls!',
    };
    updateMazeHero();

    return true;
}

/**
 * Consume void walk on successful wall phase
 */
async function consumeVoidWalk() {
    if (currentMaze?.voidWalkActive) {
        currentMaze.voidWalkActive = false;
        await removeFromInventory('voidWalk', 1);

        const dpad = document.getElementById('maze_dpad');
        if (dpad) dpad.classList.remove('void-walk-active');
    }
}

/**
 * Cancel void walk mode
 */
function cancelVoidWalk() {
    if (currentMaze?.voidWalkActive) {
        currentMaze.voidWalkActive = false;
        const dpad = document.getElementById('maze_dpad');
        if (dpad) dpad.classList.remove('void-walk-active');
    }
}

/**
 * Check if Minion Bane should auto-defeat a minion
 * Returns true if bane was consumed and minion defeated
 */
async function checkMinionBane() {
    if (!currentMaze?.inventory.minionBane || currentMaze.inventory.minionBane <= 0) {
        return false;
    }

    await removeFromInventory('minionBane', 1);

    currentMaze.currentMinion = {
        name: 'Minion Bane',
        imagePath: '',
        message: 'Your Minion Bane flares with power, instantly vanquishing the foe!',
    };
    updateMazeHero();

    return true;
}

/**
 * Apply Time Shard effect to battlebar (50% slower)
 * Returns the multiplier to apply
 */
function getTimeShardMultiplier() {
    if (!currentMaze?.inventory.timeShard || currentMaze.inventory.timeShard <= 0) {
        return 1.0;
    }
    return 0.5; // 50% speed = 2x more time to react
}

/**
 * Consume time shard when battlebar starts
 */
async function consumeTimeShard() {
    if (currentMaze?.inventory.timeShard > 0) {
        await removeFromInventory('timeShard', 1);
        currentMaze.currentMinion = {
            name: 'Time Shard',
            imagePath: '',
            message: 'Time slows around you... The battlebar moves at half speed!',
        };
        updateMazeHero();
    }
}

/**
 * Check if Floor Key is required and available
 */
function hasFloorKey() {
    return currentMaze?.inventory.floorKey > 0;
}

/**
 * Consume a floor key when using stairs
 */
async function consumeFloorKey() {
    if (currentMaze?.inventory.floorKey > 0) {
        await removeFromInventory('floorKey', 1);
    }
}

/**
 * Check if exploration is complete and fire hook
 */
async function checkExplorationComplete() {
    if (!currentMaze) return;

    const percent = getExplorationPercent();

    // Update explore objectives with current percentage
    if (currentMaze.profile?.objectives) {
        for (const obj of currentMaze.profile.objectives) {
            if (obj.type === 'explore') {
                const objProgress = currentMaze.objectiveProgress[obj.id];
                if (objProgress && !objProgress.completed) {
                    // Set current to actual exploration percent
                    objProgress.current = percent;

                    // Check if target reached
                    if (percent >= (obj.count || 100)) {
                        objProgress.completed = true;
                        await fireHook('onObjectiveComplete', { objectiveId: obj.id });
                        if (obj.reward && obj.reward.trim()) {
                            await executeWithTimeout(obj.reward);
                        }
                    }
                }
            }
        }
        updateObjectivesDisplay();
        checkAllObjectivesComplete();
    }

    if (!currentMaze.explorationComplete && percent >= 100) {
        currentMaze.explorationComplete = true;
        await fireHook('onExploreComplete', { percentage: 100 });
    }
}

/**
 * Update player overlay position for smooth animation
 * @param {boolean} animate - Whether to animate the movement
 */
function updatePlayerPosition(animate = true) {
    if (!currentMaze) return;

    const renderer = RendererRegistry.getRenderer();
    const cellSize = getCellSize(currentMaze.size);
    renderer.updatePlayerPosition(currentMaze.playerX, currentMaze.playerY, animate, cellSize);

    // v1.2.1: Update room info when player moves
    updateRoomInfoBox();
}

/**
 * Place portals on the maze grid based on profile configuration
 */
function placePortals(grid, profile, size, validCells) {
    if (!profile.portals || profile.portals.length === 0) return;

    const placedPortals = [];

    for (const portalConfig of profile.portals) {
        // Find start and end positions
        let startX = portalConfig.startX;
        let startY = portalConfig.startY;
        let endX = portalConfig.endX;
        let endY = portalConfig.endY;

        // If positions are null/undefined, pick random empty cells
        if (startX == null || startY == null) {
            const availableStart = validCells.find(c =>
                !grid[c.y][c.x].chest &&
                !grid[c.y][c.x].minion &&
                !grid[c.y][c.x].trap &&
                !grid[c.y][c.x].portal &&
                !(c.x === 0 && c.y === 0) &&
                !(c.x === size - 1 && c.y === size - 1)
            );
            if (availableStart) {
                startX = availableStart.x;
                startY = availableStart.y;
                // Remove from valid cells
                const idx = validCells.indexOf(availableStart);
                if (idx > -1) validCells.splice(idx, 1);
            } else continue;
        }

        if (endX == null || endY == null) {
            const availableEnd = validCells.find(c =>
                !grid[c.y][c.x].chest &&
                !grid[c.y][c.x].minion &&
                !grid[c.y][c.x].trap &&
                !grid[c.y][c.x].portal &&
                !(c.x === startX && c.y === startY) &&
                !(c.x === 0 && c.y === 0) &&
                !(c.x === size - 1 && c.y === size - 1)
            );
            if (availableEnd) {
                endX = availableEnd.x;
                endY = availableEnd.y;
                const idx = validCells.indexOf(availableEnd);
                if (idx > -1) validCells.splice(idx, 1);
            } else continue;
        }

        const portalId = portalConfig.id || `portal_${placedPortals.length + 1}`;
        const color = portalConfig.color || '#9b59b6';
        const bidirectional = portalConfig.bidirectional !== false;

        // Place start portal
        grid[startY][startX].portal = {
            id: portalId,
            target: { x: endX, y: endY },
            isStart: true,
            color: color,
            bidirectional: bidirectional,
        };

        // Place end portal (bidirectional or one-way destination)
        grid[endY][endX].portal = {
            id: portalId,
            target: { x: startX, y: startY },
            isStart: false,
            color: color,
            bidirectional: bidirectional,
        };

        placedPortals.push({
            id: portalId,
            startX, startY,
            endX, endY,
            color,
            bidirectional,
        });
    }

    if (placedPortals.length > 0) {
        console.log(`[MazeMaster] Placed ${placedPortals.length} portal pair(s)`);
    }

    return placedPortals;
}

/**
 * Handle teleportation when player steps on a portal
 */
async function handleTeleport(fromX, fromY, portal) {
    if (!portal) return false;

    // Check if this portal can teleport (bidirectional portals always work, one-way only from start)
    if (!portal.bidirectional && !portal.isStart) {
        return false; // One-way portal exit, no teleportation
    }

    const target = portal.target;
    if (!target || target.x == null || target.y == null) return false;

    // Fire the onTeleport hook
    await fireHook('onTeleport', {
        portalId: portal.id,
        fromX: fromX,
        fromY: fromY,
        toX: target.x,
        toY: target.y,
    });

    // Update player position
    currentMaze.playerX = target.x;
    currentMaze.playerY = target.y;

    // Mark destination as visited
    currentMaze.visited.add(`${currentMaze.currentFloor}:${target.x},${target.y}`);

    // Update position instantly (no animation for teleport)
    updatePlayerPosition(false);

    // Increment teleport stat
    await incrementStat('teleportsUsed', 1);

    // Flash effect on both cells
    const startCell = document.querySelector(`.maze-cell[data-x="${fromX}"][data-y="${fromY}"]`);
    const endCell = document.querySelector(`.maze-cell[data-x="${target.x}"][data-y="${target.y}"]`);

    if (startCell) {
        startCell.classList.add('portal-flash');
        setTimeout(() => startCell.classList.remove('portal-flash'), 300);
    }
    if (endCell) {
        endCell.classList.add('portal-flash');
        setTimeout(() => endCell.classList.remove('portal-flash'), 300);
    }

    console.log(`[MazeMaster] Teleported from (${fromX},${fromY}) to (${target.x},${target.y})`);
    return true;
}

/**
 * Initialize moving minions list from placed minions on the grid
 */
function initMovingMinions(grid, size) {
    const movingMinions = [];

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const cell = grid[y][x];
            if (cell.minion && !cell.minion.triggered) {
                const minionData = getMinion(cell.minion.minionId);
                const movement = minionData?.movement || { type: 'stationary' };

                if (movement.type !== 'stationary') {
                    movingMinions.push({
                        minionId: cell.minion.minionId,
                        x: x,
                        y: y,
                        originX: x,
                        originY: y,
                        triggered: false,
                        movement: { ...movement },
                    });
                }
            }
        }
    }

    console.log(`[MazeMaster] Initialized ${movingMinions.length} moving minion(s)`);
    return movingMinions;
}

/**
 * Process minion movement after player moves
 */
async function processMinionMovement() {
    if (!currentMaze || !currentMaze.movingMinions || currentMaze.movingMinions.length === 0) return;

    const { grid, size, playerX, playerY, moveCount } = currentMaze;
    const difficulty = getDifficultySettings(currentMaze.profile);

    for (const minion of currentMaze.movingMinions) {
        if (minion.triggered) continue;

        // Check speed (moves every N player moves)
        const speed = minion.movement.speed || 1;
        if (moveCount % speed !== 0) continue;

        const newPos = calculateMinionMove(minion, grid, size, playerX, playerY, difficulty);
        if (!newPos) continue;

        const fromX = minion.x;
        const fromY = minion.y;

        // Remove minion from old cell
        if (grid[fromY][fromX].minion?.minionId === minion.minionId) {
            grid[fromY][fromX].minion = null;
        }

        // Move minion to new cell
        minion.x = newPos.x;
        minion.y = newPos.y;
        grid[newPos.y][newPos.x].minion = {
            minionId: minion.minionId,
            triggered: false,
        };

        // Fire onEnemyMove hook
        await fireHook('onEnemyMove', {
            minionId: minion.minionId,
            fromX: fromX,
            fromY: fromY,
            toX: newPos.x,
            toY: newPos.y,
        });

        // Check for collision with player
        if (newPos.x === playerX && newPos.y === playerY) {
            console.log(`[MazeMaster] Moving minion ${minion.minionId} caught the player!`);
            minion.triggered = true;
            grid[newPos.y][newPos.x].minion.triggered = true;
            triggerMinionEncounter(minion.minionId, newPos.x, newPos.y);
            return; // Stop processing after encounter
        }
    }
}

/**
 * Calculate the next move for a minion based on its movement type
 */
function calculateMinionMove(minion, grid, size, playerX, playerY, difficulty) {
    const { x, y, originX, originY, movement } = minion;
    const aggressionMult = difficulty?.minionAggressionMult || 1;

    // Get valid adjacent cells (not blocked by walls)
    const validMoves = getValidMinionMoves(x, y, grid, size);
    if (validMoves.length === 0) return null;

    switch (movement.type) {
        case 'patrol': {
            // Patrol: Random movement within radius of origin
            const radius = movement.patrolRadius || 3;
            const inRangeMoves = validMoves.filter(pos => {
                const distFromOrigin = Math.abs(pos.x - originX) + Math.abs(pos.y - originY);
                return distFromOrigin <= radius;
            });
            if (inRangeMoves.length === 0) return null;
            return inRangeMoves[Math.floor(Math.random() * inRangeMoves.length)];
        }

        case 'chase': {
            // Chase: Move toward player if within range
            const baseRange = movement.chaseRange || 5;
            const range = Math.ceil(baseRange * aggressionMult);
            const distToPlayer = Math.abs(x - playerX) + Math.abs(y - playerY);

            if (distToPlayer > range) {
                // Out of range, random movement
                return validMoves[Math.floor(Math.random() * validMoves.length)];
            }

            // Move toward player (A* would be overkill, use greedy approach)
            let bestMove = null;
            let bestDist = distToPlayer;

            for (const pos of validMoves) {
                const newDist = Math.abs(pos.x - playerX) + Math.abs(pos.y - playerY);
                if (newDist < bestDist) {
                    bestDist = newDist;
                    bestMove = pos;
                }
            }

            // 50% chance to make suboptimal move (makes AI less predictable)
            if (bestMove && Math.random() < 0.5 * (1 / aggressionMult)) {
                return validMoves[Math.floor(Math.random() * validMoves.length)];
            }

            return bestMove || validMoves[Math.floor(Math.random() * validMoves.length)];
        }

        default:
            return null;
    }
}

/**
 * Initialize objectives for the current maze
 */
function initObjectives(profile) {
    const progress = {};
    const objectives = profile.objectives || [];

    for (const obj of objectives) {
        progress[obj.id] = {
            current: 0,
            completed: false,
            target: obj.count || 1,
        };
    }

    return progress;
}

/**
 * Update objective progress for a specific type/target
 */
async function updateObjectiveProgress(type, target, delta = 1) {
    if (!currentMaze || !currentMaze.profile?.objectives) return;

    const objectives = currentMaze.profile.objectives;
    const progress = currentMaze.objectiveProgress;

    for (const obj of objectives) {
        if (obj.type !== type) continue;
        // For collect/defeat, target must match; for explore/moves, target is optional
        if ((type === 'collect' || type === 'defeat') && obj.target !== target) continue;

        const objProgress = progress[obj.id];
        if (!objProgress || objProgress.completed) continue;

        objProgress.current += delta;

        // Fire progress hook
        await fireHook('onObjectiveProgress', {
            objectiveId: obj.id,
            current: objProgress.current,
            target: obj.count || 1,
        });

        // Check completion
        if (objProgress.current >= (obj.count || 1) && !objProgress.completed) {
            objProgress.completed = true;

            // Fire completion hook
            await fireHook('onObjectiveComplete', { objectiveId: obj.id });

            // Execute reward script if any
            if (obj.reward && obj.reward.trim()) {
                await executeWithTimeout(obj.reward);
            }

            console.log(`[MazeMaster] Objective "${obj.id}" completed!`);
        }
    }

    // Update objectives display
    updateObjectivesDisplay();

    // Check if all required objectives complete
    checkAllObjectivesComplete();
}

/**
 * Check if all required objectives are complete
 */
async function checkAllObjectivesComplete() {
    if (!currentMaze || currentMaze.allObjectivesComplete) return;

    const objectives = currentMaze.profile?.objectives || [];
    const progress = currentMaze.objectiveProgress;

    const requiredComplete = objectives.every(obj => {
        if (!obj.required) return true;
        return progress[obj.id]?.completed;
    });

    if (requiredComplete && objectives.some(obj => obj.required)) {
        currentMaze.allObjectivesComplete = true;
        await fireHook('onAllObjectivesComplete', {});
        console.log('[MazeMaster] All required objectives complete!');
    }
}

/**
 * Check if the player can win the maze (all required objectives completed)
 */
function canWinMaze() {
    if (!currentMaze || !currentMaze.profile?.objectives) return true;

    const objectives = currentMaze.profile.objectives;
    const progress = currentMaze.objectiveProgress;

    // If no required objectives, can always win
    const requiredObjectives = objectives.filter(obj => obj.required);
    if (requiredObjectives.length === 0) return true;

    return requiredObjectives.every(obj => progress[obj.id]?.completed);
}

/**
 * Update the objectives display in the maze modal
 */
function updateObjectivesDisplay() {
    const container = document.getElementById('maze_objectives_list');
    if (!container || !currentMaze) return;

    const objectives = currentMaze.profile?.objectives || [];
    const progress = currentMaze.objectiveProgress;

    if (objectives.length === 0) {
        container.innerHTML = '';
        container.closest('.maze-objectives-section')?.classList.add('hidden');
        return;
    }

    container.closest('.maze-objectives-section')?.classList.remove('hidden');

    container.innerHTML = objectives.map(obj => {
        const objProgress = progress[obj.id] || { current: 0, completed: false };
        const isComplete = objProgress.completed;
        const icon = isComplete ? 'fa-check-circle' : (obj.required ? 'fa-circle' : 'fa-circle-o');
        const colorClass = isComplete ? 'objective-complete' : (obj.required ? 'objective-required' : 'objective-optional');

        return `
            <div class="objective-item ${colorClass}">
                <i class="fa-solid ${icon}"></i>
                <span class="objective-description">${escapeHtml(obj.description || obj.id)}</span>
                <span class="objective-progress">${objProgress.current}/${obj.count || 1}</span>
            </div>
        `;
    }).join('');
}

/**
 * Get valid movement positions for a minion (respects walls)
 */
function getValidMinionMoves(x, y, grid, size) {
    const moves = [];
    const cell = grid[y][x];

    // Check each direction
    if (!cell.walls.top && y > 0) {
        const targetCell = grid[y - 1][x];
        if (!targetCell.minion && !(x === 0 && y - 1 === 0)) {
            moves.push({ x: x, y: y - 1 });
        }
    }
    if (!cell.walls.bottom && y < size - 1) {
        const targetCell = grid[y + 1][x];
        if (!targetCell.minion && !(x === size - 1 && y + 1 === size - 1)) {
            moves.push({ x: x, y: y + 1 });
        }
    }
    if (!cell.walls.left && x > 0) {
        const targetCell = grid[y][x - 1];
        if (!targetCell.minion && !(x - 1 === 0 && y === 0)) {
            moves.push({ x: x - 1, y: y });
        }
    }
    if (!cell.walls.right && x < size - 1) {
        const targetCell = grid[y][x + 1];
        if (!targetCell.minion && !(x + 1 === size - 1 && y === size - 1)) {
            moves.push({ x: x + 1, y: y });
        }
    }

    return moves;
}

// =============================================================================
// STATE
// =============================================================================

const defaultSettings = {
    profiles: {
        // "profileName": { segments: [{ trigger, text, command, size, respin }] }
    },
    battlebarProfiles: {
        // "profileName": { difficulty, hitsToWin, missesToLose, hitCommand, missCommand, winCommand, loseCommand, images }
    },
    mazeProfiles: {
        // "profileName": { gridSize, winCommand, winImage, winMessage, mainMinion, mainMinionIntroMessage,
        //   mainMinionRandomChance, mainMinionRandomMessages, mainMinionExitType, mainMinionExitProfile,
        //   minionEncounters, onBattlebarLoss, loseCommand }
    },
    minions: {
        // "minionId": { name, imagePath, type, battlebarProfiles, wheelProfiles, messages }
    },
    minionProfiles: {
        // "profileName": { minions: { minionId: {...}, ... } }
    },
    trapProfiles: {
        // "profileName": { traps: { trapId: {...}, ... } }
    },
    currentProfile: 'default',
    currentBattlebarProfile: 'default',
    currentMazeProfile: 'default',
    currentMinionProfile: 'default',
    currentTrapProfile: 'default',
    activeGameConfig: 'wheel', // 'wheel' | 'battlebar' | 'maze' | 'minions' | 'traps'
    llmEnabled: true,
    llmPreset: '',
    // D-Pad configuration
    dpadConfig: {
        enabled: true,
        floating: true,
        position: { x: null, y: null }, // null = auto-position
    },
};

// =============================================================================
// DEFAULT EXAMPLE DATA
// =============================================================================

const DEFAULT_WHEEL_PROFILES = {
    'Reward Wheel': {
        segments: [
            { trigger: '', text: 'Small Prize', command: '/echo You won a small prize!', size: 'fraction', respin: false },
            { trigger: '', text: 'Medium Prize', command: '/echo You won a medium prize!', size: 'fraction', respin: false },
            { trigger: '', text: 'Big Prize!', command: '/echo Amazing! You won the big prize!', size: 'fraction', respin: false },
            { trigger: '', text: 'Try Again', command: '/echo Better luck next time...', size: 'fraction', respin: false },
            { trigger: '', text: 'JACKPOT!', command: '/echo JACKPOT! Incredible luck!', size: 'fraction', respin: false },
            { trigger: '', text: 'Bonus Spin', command: '/echo You get another spin!', size: 'fraction', respin: true },
        ],
        randomize: true,
        difficulty: 1,
    },
    'Challenge Wheel': {
        segments: [
            { trigger: '', text: 'Easy Task', command: '/echo Easy task assigned!', size: 'doubleseg', respin: false },
            { trigger: '', text: 'Medium Task', command: '/echo Medium task assigned!', size: 'fraction', respin: false },
            { trigger: '', text: 'Hard Task', command: '/echo Hard task - good luck!', size: 'halfseg', respin: false },
            { trigger: '', text: 'Free Pass', command: '/echo Lucky! You get a free pass!', size: 'doubleseg', respin: false },
            { trigger: '', text: 'Double or Nothing', command: '/echo Spin again - double stakes!', size: 'halfseg', respin: true },
        ],
        randomize: false,
        difficulty: 2,
    },
};

const DEFAULT_BATTLEBAR_PROFILES = {
    'Easy Fight': {
        difficulty: 2,
        hitsToWin: 3,
        missesToLose: 5,
        description: 'A minor enemy blocks your path - a quick skirmish to test your reflexes.',
        hitCommand: '/echo Hit! Keep going!',
        missCommand: '/echo Missed! Watch the timing!',
        winCommand: '/echo Victory! You defeated the enemy!',
        loseCommand: '/echo Defeated... Try again!',
        mainTitle: 'Goblin',
        images: [
            { imagePath: 'images/easy_fight.jpeg', stageMessage: 'The enemy appears!' },
            { imagePath: 'images/easy_fight.jpeg', stageMessage: 'You land a blow!' },
            { imagePath: 'images/easy_fight.jpeg', stageMessage: 'Almost there!' },
            { imagePath: 'images/easy_fight.jpeg', stageMessage: 'Victory!' },
        ],
        // Item drop chances (for maze encounters)
        keyDropChance: 40,
        powDropChance: 20,
        stealthDropChance: 10,
    },
    'Boss Battle': {
        difficulty: 4,
        hitsToWin: 5,
        missesToLose: 3,
        description: 'A fearsome boss enemy stands before you - a brutal fight for survival with no room for error.',
        hitCommand: '/echo Critical hit!',
        missCommand: '/echo The boss counters!',
        winCommand: '/echo The boss has been defeated!',
        loseCommand: '/echo The boss was too powerful...',
        mainTitle: 'Death Knight',
        images: [
            { imagePath: 'images/boss_battle.jpeg', stageMessage: 'The boss towers before you!' },
            { imagePath: 'images/boss_battle.jpeg', stageMessage: 'You find an opening!' },
            { imagePath: 'images/boss_battle.jpeg', stageMessage: 'The boss staggers!' },
            { imagePath: 'images/boss_battle.jpeg', stageMessage: 'Keep attacking!' },
            { imagePath: 'images/boss_battle.jpeg', stageMessage: 'One more hit!' },
            { imagePath: 'images/boss_battle.jpeg', stageMessage: 'VICTORY!' },
        ],
        // Item drop chances (for maze encounters)
        keyDropChance: 50,
        powDropChance: 30,
        stealthDropChance: 20,
    },
};

const EXTENSION_NAME = 'MazeMaster';

// Helper to resolve extension asset paths
function getExtensionImagePath(relativePath) {
    if (!relativePath) return '';
    // If it's already an absolute path or URL, return as-is
    if (relativePath.startsWith('/') || relativePath.startsWith('http')) {
        return relativePath;
    }
    // Use the dynamically detected folder name for the extension path
    // This works whether the extension is installed as 'MazeMaster' or 'SillyTavern-MazeMaster'
    return `/scripts/extensions/third-party/${EXTENSION_FOLDER_NAME}/${relativePath}`;
}

const DEFAULT_MINIONS = {
    'herald': {
        name: 'Herald',
        imagePath: `images/herald.jpeg`,
        type: 'messenger',
        description: 'A mysterious messenger cloaked in shadow who delivers cryptic warnings and hints about the maze ahead.',
        messages: ['Greetings, traveler!', 'The maze master watches...', 'Beware what lies ahead!'],
        encounterScript: '',
    },
    'guardian': {
        name: 'Guardian',
        imagePath: `images/guardian.jpeg`,
        type: 'battlebar',
        description: 'A fearsome armored warrior who blocks the path, challenging all who dare to pass.',
        battlebarProfiles: ['Easy Fight'],
        messages: ['You shall not pass!', 'Prepare to fight!', 'Only the worthy may continue!'],
        encounterScript: '',
    },
    'fortune_teller': {
        name: 'Fortune Teller',
        imagePath: `images/fortune_teller.jpeg`,
        type: 'prizewheel',
        description: 'An enigmatic mystic with glowing eyes who offers to reveal your fate through a magical spinning wheel.',
        wheelProfiles: ['Reward Wheel'],
        messages: ['Spin the wheel of fate!', 'Let destiny decide!', 'What fortune awaits you?'],
        encounterScript: '',
    },
    'trader': {
        name: 'Wandering Trader',
        imagePath: `images/merchant.jpeg`,
        type: 'merchant',
        description: 'A cunning merchant draped in exotic fabrics who trades valuable items for powerful rewards.',
        merchantItemCount: { min: 2, max: 4 },
        messages: ['Care to make a trade?', 'I have something special...', 'A fair exchange benefits us both!'],
        encounterScript: '',
    },
};

const DEFAULT_TRAPS = {
    'spike_trap': {
        name: 'Spike Trap',
        imagePath: 'images/spike_trap.jpg',
        message: 'Sharp spikes shoot up from the floor!',
        script: '/echo You triggered a spike trap!',
    },
    'poison_gas': {
        name: 'Poison Gas',
        imagePath: 'images/poison_trap.jpeg',
        message: 'A cloud of noxious gas fills the corridor!',
        script: '/echo Poison gas surrounds you!',
    },
};

// Default minion profile (a saved set of minions)
const DEFAULT_MINION_PROFILES = {
    'Dungeon Crawl': {
        'herald': {
            name: 'Herald',
            imagePath: 'images/herald.jpeg',
            type: 'messenger',
            description: 'A mysterious messenger cloaked in shadow who delivers cryptic warnings and hints about the maze ahead.',
            messages: ['Greetings, traveler!', 'The maze master watches...', 'Beware what lies ahead!'],
            encounterScript: '',
        },
        'guardian': {
            name: 'Guardian',
            imagePath: 'images/guardian.jpeg',
            type: 'battlebar',
            description: 'A fearsome armored warrior who blocks the path, challenging all who dare to pass.',
            battlebarProfiles: ['Easy Fight'],
            messages: ['You shall not pass!', 'Prepare to fight!', 'Only the worthy may continue!'],
            encounterScript: '',
        },
        'fortune_teller': {
            name: 'Fortune Teller',
            imagePath: 'images/fortune_teller.jpeg',
            type: 'prizewheel',
            description: 'An enigmatic mystic with glowing eyes who offers to reveal your fate through a magical spinning wheel.',
            wheelProfiles: ['Reward Wheel'],
            messages: ['Spin the wheel of fate!', 'Let destiny decide!', 'What fortune awaits you?'],
            encounterScript: '',
        },
        'trader': {
            name: 'Wandering Trader',
            imagePath: 'images/merchant.jpeg',
            type: 'merchant',
            description: 'A cunning merchant draped in exotic fabrics who trades valuable items for powerful rewards.',
            merchantItemCount: { min: 2, max: 4 },
            messages: ['Care to make a trade?', 'I have something special...', 'A fair exchange benefits us both!'],
            encounterScript: '',
        },
    },
};

// Default trap profile (a saved set of traps)
const DEFAULT_TRAP_PROFILES = {
    'Dungeon Crawl': {
        'spike_trap': {
            name: 'Spike Trap',
            imagePath: 'images/spike_trap.jpg',
            message: 'Sharp spikes shoot up from the floor!',
            script: '/echo You triggered a spike trap!',
        },
        'poison_gas': {
            name: 'Poison Gas',
            imagePath: 'images/poison_trap.jpeg',
            message: 'A cloud of noxious gas fills the corridor!',
            script: '/echo Poison gas surrounds you!',
        },
    },
};

const DEFAULT_MAZE_PROFILE = {
    'Dungeon Crawl': {
        gridSize: 10,
        winCommand: '/echo Congratulations! You escaped the dungeon!',
        loseCommand: '/echo The dungeon claims another victim...',
        winMessage: 'You found the exit and escaped!',
        winImage: '',
        mainMinion: 'guardian',
        mainMinionIntroMessage: 'Welcome to my dungeon, adventurer. Find the exit... if you can!',
        mainMinionRandomChance: 20,
        mainMinionRandomMessages: [
            'Still wandering, I see...',
            'The exit grows ever closer... or does it?',
            'Many have tried. Few have succeeded.',
            'Your persistence is... admirable.',
        ],
        mainMinionExitType: 'battlebar',
        mainMinionExitProfile: 'Boss Battle',
        minionEncounters: [
            { minionId: 'herald', percent: 15 },
            { minionId: 'guardian', percent: 10 },
            { minionId: 'fortune_teller', percent: 8 },
            { minionId: 'trader', percent: 3 },
        ],
        trapEncounters: [
            { trapId: 'spike_trap', percent: 4 },
            { trapId: 'poison_gas', percent: 3 },
        ],
        onBattlebarLoss: 'respawn',
        chestImage: '',
        chestTilePercent: 15,
        chestLockedPercent: 30,
        chestLockedBonusPercent: 50,
        chestMimicPercent: 15,
        chestLootMin: 1,
        chestLootMax: 3,
        chestKeyChance: 35,
        chestPowChance: 45,
        chestStealthChance: 15,
        chestGrandpowChance: 2,
        lockedChestKeyChance: 25,
        lockedChestPowChance: 55,
        lockedChestStealthChance: 25,
        lockedChestGrandpowChance: 8,
        startingInventory: { key: 1, pow: 0, stealth: 1, grandpow: 0 },
        storyConfig: {
            mainStory: 'You descend into the ancient dungeon. Shadows dance on the walls as torchlight flickers...',
            milestones: [
                { percent: 25, storyUpdate: 'You venture deeper. The air grows colder and the walls damper.' },
                { percent: 50, storyUpdate: 'Halfway through! Strange sounds echo from the darkness ahead.' },
                { percent: 75, storyUpdate: 'You sense the exit is near. But so is something else...' },
            ],
        },
    },
};

let extensionSettings = {};

// Runtime wheel state
let currentWheel = {
    segments: [],
    isOpen: false,
    isSpinning: false,
    pendingRespin: false,
    hasRespun: false,
};

// Runtime battlebar state
let currentBattlebar = {
    isOpen: false,
    profile: null,
    hits: 0,
    misses: 0,
    arrowPosition: 0,
    arrowDirection: 1,
    zoneStart: 0,
    zoneEnd: 0,
    animationId: null,
    lastFrameTime: 0,
    isVictory: false,
    isDefeat: false,
};

// Runtime maze state
let currentMaze = {
    isOpen: false,
    profile: null,
    profileName: null,
    grid: [],
    size: 10,
    playerX: 0,
    playerY: 0,
    exitX: 0,
    exitY: 0,
    visited: new Set(),
    isVictory: false,
    currentMinion: null,
    // Encounter system
    isPaused: false,              // True during encounters
    pendingEncounter: null,       // Current encounter being processed
    exitEncounterDone: false,     // Has exit boss been defeated
    // v1.2.0 Multi-floor system
    currentFloor: 0,              // Current floor index (0-based)
    totalFloors: 1,               // Total number of floors
    floors: [],                   // Array of floor grids
    // Inventory system
    inventory: {
        key: 0,
        stealth: 0,
        pow: 0,
        grandpow: 0,
        // v1.2.0 new items
        floorKey: 0,
        portalStone: 0,
        minionBane: 0,
        mapFragment: 0,
        timeShard: 0,
        voidWalk: 0,
    },
    pendingConfirmation: null,    // { type, minionId, x, y, canSlipAway }
    pendingChest: null,           // { chestData, x, y } for Open/Ignore flow
    voidWalkActive: false,        // v1.2.0: Void Walk active for next move
    messageLog: [],               // v1.2.1: Persistent message history
};

// Last game results (for macros and tracking)
const lastResults = {
    wheel: {},      // { profileName: { segmentName, command, timestamp } }
    battlebar: {}, // { profileName: { result: 'win'|'lose', hits, misses, timestamp } }
    maze: {},       // { profileName: { result: 'win', timestamp } }
};

// Track processed messages to avoid reprocessing macros
const processedMacroMessages = new WeakSet();

// =============================================================================
// LLM MESSAGE GENERATION
// =============================================================================

/**
 * Generate a minion message using the LLM
 * @param {object} options - Generation options
 * @param {string} options.minionName - Name of the minion speaking
 * @param {string} options.minionDescription - Description of the minion character
 * @param {string} options.baseMessage - Base message/template to expand
 * @param {string} options.mainStory - Main story context (optional)
 * @param {string} options.currentMilestone - Current milestone story update (optional)
 * @param {string} options.minionType - Type of minion (messenger, battlebar, prizewheel, merchant)
 * @returns {Promise<string>} Generated message or fallback to baseMessage
 */
async function generateMinionMessage(options) {
    const { minionName, minionDescription, baseMessage, mainStory, currentMilestone, minionType } = options;

    // If no baseMessage, nothing to generate
    if (!baseMessage) return '';

    // Check if LLM generation is enabled
    if (extensionSettings.llmEnabled === false) {
        console.log('[MazeMaster] LLM generation disabled, using base message');
        return baseMessage;
    }

    // Check if generateQuietPrompt is available
    if (typeof generateQuietPrompt !== 'function') {
        console.log('[MazeMaster] generateQuietPrompt not available, using base message');
        return baseMessage;
    }

    // Build the context prompt
    let contextParts = [];

    if (mainStory) {
        contextParts.push(`Story Setting: ${mainStory}`);
    }

    if (currentMilestone) {
        contextParts.push(`Current Progress: ${currentMilestone}`);
    }

    // Use custom description if provided, otherwise fall back to type-based role
    const minionRole = minionDescription || {
        messenger: 'a mysterious messenger who delivers cryptic hints',
        battlebar: 'a guardian who challenges travelers to combat',
        prizewheel: 'a fortune teller who offers games of chance',
        merchant: 'a wandering trader who barters for rare items',
    }[minionType] || 'a mysterious figure';

    // Get the player's name for personalization
    const playerName = getCurrentPersonaName();

    const prompt = `You are ${minionName}, ${minionRole}.
The player's name is ${playerName}.

${contextParts.length > 0 ? contextParts.join('\n') + '\n\n' : ''}The player has encountered you in a maze. Based on this message template: "${baseMessage}"

Write a short, atmospheric response (1-2 sentences max, under 100 characters if possible). Stay in character. Be mysterious and engaging. You may address the player by name if appropriate. Do not use quotation marks around your response.`;

    try {
        console.log('[MazeMaster] Generating LLM message for:', minionName);

        const response = await generateQuietPrompt(prompt, {
            quietToLoud: false,
            skipWIAN: true,
            skipWI: true,  // v1.2.0: Disable lorebooks during maze generation
            max_length: 80, // Keep responses short
        });

        if (response && response.trim()) {
            // Clean up the response - remove quotes, trim
            let cleaned = response.trim();
            cleaned = cleaned.replace(/^["']|["']$/g, '');
            cleaned = cleaned.replace(/^["""''']|["""''']$/g, '');
            console.log('[MazeMaster] Generated message:', cleaned);
            return cleaned;
        }
    } catch (error) {
        console.error('[MazeMaster] LLM generation failed:', error);
    }

    // Fallback to base message
    return baseMessage;
}

/**
 * Generate a trap message using the LLM
 * @param {object} options - Generation options
 * @param {string} options.trapName - Name of the trap
 * @param {string} options.baseMessage - Base message to expand
 * @param {string} options.mainStory - Main story context (optional)
 * @returns {Promise<string>} Generated message or fallback to baseMessage
 */
async function generateTrapMessage(options) {
    const { trapName, baseMessage, mainStory } = options;

    if (!baseMessage) return '';

    if (extensionSettings.llmEnabled === false) {
        return baseMessage;
    }

    if (typeof generateQuietPrompt !== 'function') {
        return baseMessage;
    }

    const playerName = getCurrentPersonaName();

    const prompt = `The player ${playerName} has triggered a trap called "${trapName}" in a maze.

${mainStory ? `Story Setting: ${mainStory}\n\n` : ''}Based on this trap description: "${baseMessage}"

Write a short, dramatic narration of the trap being triggered (1-2 sentences, under 100 characters). Make it visceral and immediate. You may reference the player by name. Do not use quotation marks.`;

    try {
        console.log('[MazeMaster] Generating LLM message for trap:', trapName);

        const response = await generateQuietPrompt(prompt, {
            quietToLoud: false,
            skipWIAN: true,
            skipWI: true,  // v1.2.0: Disable lorebooks during maze generation
            max_length: 80,
        });

        if (response && response.trim()) {
            let cleaned = response.trim();
            cleaned = cleaned.replace(/^["']|["']$/g, '');
            cleaned = cleaned.replace(/^["""''']|["""''']$/g, '');
            console.log('[MazeMaster] Generated trap message:', cleaned);
            return cleaned;
        }
    } catch (error) {
        console.error('[MazeMaster] Trap LLM generation failed:', error);
    }

    return baseMessage;
}

/**
 * Generate a battlebar stage message using the LLM
 * @param {object} options - Generation options
 * @param {string} options.battlebarName - Name of the battlebar/fight
 * @param {string} options.description - Description of the battlebar encounter
 * @param {string} options.stageMessage - Current stage message
 * @param {string} options.mainStory - Main story context (optional)
 * @param {number} options.currentHits - Current hit count
 * @param {number} options.hitsToWin - Hits needed to win
 * @returns {Promise<string>} Generated message or fallback to stageMessage
 */
async function generateBattlebarMessage(options) {
    const { battlebarName, description, stageMessage, mainStory, currentHits, hitsToWin } = options;

    if (!stageMessage) return '';

    if (extensionSettings.llmEnabled === false) {
        return stageMessage;
    }

    if (typeof generateQuietPrompt !== 'function') {
        return stageMessage;
    }

    const progress = currentHits !== undefined && hitsToWin ? `Progress: ${currentHits}/${hitsToWin} hits` : '';
    const battleDesc = description || 'a challenging combat encounter';
    const playerName = getCurrentPersonaName();

    const prompt = `The player ${playerName} is in a battle called "${battlebarName}" - ${battleDesc}.

${mainStory ? `Story Setting: ${mainStory}\n\n` : ''}${progress ? progress + '\n\n' : ''}Based on this stage message: "${stageMessage}"

Write a short, intense combat narration (1-2 sentences, under 100 characters). Make it exciting and dramatic. You may reference the player by name. Do not use quotation marks.`;

    try {
        console.log('[MazeMaster] Generating LLM message for battlebar:', battlebarName);

        const response = await generateQuietPrompt(prompt, {
            quietToLoud: false,
            skipWIAN: true,
            skipWI: true,  // v1.2.0: Disable lorebooks during maze generation
            max_length: 80,
        });

        if (response && response.trim()) {
            let cleaned = response.trim();
            cleaned = cleaned.replace(/^["']|["']$/g, '');
            cleaned = cleaned.replace(/^["""''']|["""''']$/g, '');
            console.log('[MazeMaster] Generated battlebar message:', cleaned);
            return cleaned;
        }
    } catch (error) {
        console.error('[MazeMaster] Battlebar LLM generation failed:', error);
    }

    return stageMessage;
}

/**
 * Generate a chest message using the LLM
 * @param {object} options - Generation options
 * @param {string} options.chestType - Type of chest ('normal' or 'locked')
 * @param {string} options.baseMessage - Base message to expand
 * @param {string} options.mainStory - Main story context (optional)
 * @param {boolean} options.hasKey - Whether player has a key (for locked chests)
 * @returns {Promise<string>} Generated message or fallback to baseMessage
 */
async function generateChestMessage(options) {
    const { chestType, baseMessage, mainStory, hasKey } = options;

    if (!baseMessage) return '';

    if (extensionSettings.llmEnabled === false) {
        return baseMessage;
    }

    if (typeof generateQuietPrompt !== 'function') {
        return baseMessage;
    }

    const chestDesc = chestType === 'locked'
        ? (hasKey ? 'a locked treasure chest - the player has a key to open it' : 'a locked treasure chest - the player lacks the key')
        : 'a treasure chest waiting to be opened';
    const playerName = getCurrentPersonaName();

    const prompt = `The player ${playerName} has discovered ${chestDesc} in a maze.

${mainStory ? `Story Setting: ${mainStory}\n\n` : ''}Based on this chest discovery message: "${baseMessage}"

Write a short, atmospheric description of finding the chest (1-2 sentences, under 100 characters). Make it feel rewarding and mysterious. You may reference the player by name. Do not use quotation marks.`;

    try {
        console.log('[MazeMaster] Generating LLM message for chest');

        const response = await generateQuietPrompt(prompt, {
            quietToLoud: false,
            skipWIAN: true,
            skipWI: true,  // v1.2.0: Disable lorebooks during maze generation
            max_length: 80,
        });

        if (response && response.trim()) {
            let cleaned = response.trim();
            cleaned = cleaned.replace(/^["']|["']$/g, '');
            cleaned = cleaned.replace(/^["""''']|["""''']$/g, '');
            console.log('[MazeMaster] Generated chest message:', cleaned);
            return cleaned;
        }
    } catch (error) {
        console.error('[MazeMaster] Chest LLM generation failed:', error);
    }

    return baseMessage;
}

/**
 * Get current story milestone based on maze progress
 * @returns {string|null} Current milestone text or null
 */
function getCurrentMilestone() {
    if (!currentMaze.isOpen || !currentMaze.profile) return null;

    const storyConfig = currentMaze.profile.storyConfig;
    if (!storyConfig || !storyConfig.milestones || storyConfig.milestones.length === 0) return null;

    // Calculate maze progress percentage
    const totalCells = currentMaze.size * currentMaze.size;
    const visitedCount = currentMaze.visited?.size || 0;
    const progressPercent = (visitedCount / totalCells) * 100;

    // Find the highest milestone that has been reached
    let currentMilestoneText = null;
    for (const milestone of storyConfig.milestones) {
        if (progressPercent >= milestone.percent) {
            currentMilestoneText = milestone.storyUpdate;
        }
    }

    return currentMilestoneText;
}

/**
 * Get the main story from the current maze profile
 * @returns {string|null} Main story text or null
 */
function getMainStory() {
    if (!currentMaze.isOpen || !currentMaze.profile) return null;
    return currentMaze.profile.storyConfig?.mainStory || null;
}

// =============================================================================
// SETTINGS
// =============================================================================

function loadSettings() {
    const context = SillyTavern.getContext();

    // Initialize settings if they don't exist
    if (!context.extensionSettings[MODULE_NAME]) {
        context.extensionSettings[MODULE_NAME] = JSON.parse(JSON.stringify(defaultSettings));
    }

    // Get reference to stored settings
    extensionSettings = context.extensionSettings[MODULE_NAME];

    // Fill in any missing defaults
    for (const key in defaultSettings) {
        if (extensionSettings[key] === undefined) {
            extensionSettings[key] = JSON.parse(JSON.stringify(defaultSettings[key]));
        }
    }

    // Ensure profiles objects exist
    if (!extensionSettings.profiles) {
        extensionSettings.profiles = {};
    }
    if (!extensionSettings.battlebarProfiles) {
        extensionSettings.battlebarProfiles = {};
    }
    if (!extensionSettings.mazeProfiles) {
        extensionSettings.mazeProfiles = {};
    }
    if (!extensionSettings.minions) {
        extensionSettings.minions = {};
    }
    if (!extensionSettings.traps) {
        extensionSettings.traps = {};
    }
    if (!extensionSettings.savedMazes) {
        extensionSettings.savedMazes = {};
    }
    if (!extensionSettings.minionProfiles) {
        extensionSettings.minionProfiles = {};
    }
    if (!extensionSettings.trapProfiles) {
        extensionSettings.trapProfiles = {};
    }

    // Always merge in default example data (won't overwrite existing profiles with same name)
    let needsSave = false;

    // Merge default wheel profiles
    for (const [name, profile] of Object.entries(DEFAULT_WHEEL_PROFILES)) {
        if (!extensionSettings.profiles[name]) {
            extensionSettings.profiles[name] = JSON.parse(JSON.stringify(profile));
            needsSave = true;
            console.log(`[MazeMaster] Added default wheel profile: ${name}`);
        }
    }
    if (!extensionSettings.currentProfile) {
        extensionSettings.currentProfile = 'Reward Wheel';
    }

    // Merge default battlebar profiles
    for (const [name, profile] of Object.entries(DEFAULT_BATTLEBAR_PROFILES)) {
        if (!extensionSettings.battlebarProfiles[name]) {
            extensionSettings.battlebarProfiles[name] = JSON.parse(JSON.stringify(profile));
            needsSave = true;
            console.log(`[MazeMaster] Added default battlebar profile: ${name}`);
        }
    }
    if (!extensionSettings.currentBattlebarProfile) {
        extensionSettings.currentBattlebarProfile = 'Easy Fight';
    }

    // Update existing battlebar profiles with any missing fields from defaults
    const defaultBbTemplate = DEFAULT_BATTLEBAR_PROFILES['Easy Fight'];
    for (const [name, savedProfile] of Object.entries(extensionSettings.battlebarProfiles)) {
        for (const [key, defaultValue] of Object.entries(defaultBbTemplate)) {
            if (savedProfile[key] === undefined) {
                savedProfile[key] = JSON.parse(JSON.stringify(defaultValue));
                needsSave = true;
                console.log(`[MazeMaster] Added missing field "${key}" to battlebar profile: ${name}`);
            }
        }
    }

    // Merge default minions
    for (const [id, minion] of Object.entries(DEFAULT_MINIONS)) {
        if (!extensionSettings.minions[id]) {
            extensionSettings.minions[id] = JSON.parse(JSON.stringify(minion));
            needsSave = true;
            console.log(`[MazeMaster] Added default minion: ${id}`);
        }
    }

    // Merge default traps
    for (const [id, trap] of Object.entries(DEFAULT_TRAPS)) {
        if (!extensionSettings.traps[id]) {
            extensionSettings.traps[id] = JSON.parse(JSON.stringify(trap));
            needsSave = true;
            console.log(`[MazeMaster] Added default trap: ${id}`);
        }
    }

    // Merge default minion profiles (saved sets of minions)
    for (const [name, profile] of Object.entries(DEFAULT_MINION_PROFILES)) {
        if (!extensionSettings.minionProfiles[name]) {
            extensionSettings.minionProfiles[name] = JSON.parse(JSON.stringify(profile));
            needsSave = true;
            console.log(`[MazeMaster] Added default minion profile: ${name}`);
        }
    }

    // Merge default trap profiles (saved sets of traps)
    for (const [name, profile] of Object.entries(DEFAULT_TRAP_PROFILES)) {
        if (!extensionSettings.trapProfiles[name]) {
            extensionSettings.trapProfiles[name] = JSON.parse(JSON.stringify(profile));
            needsSave = true;
            console.log(`[MazeMaster] Added default trap profile: ${name}`);
        }
    }

    // Merge default maze profile (and update existing with missing or empty fields)
    for (const [name, defaultProfile] of Object.entries(DEFAULT_MAZE_PROFILE)) {
        if (!extensionSettings.mazeProfiles[name]) {
            extensionSettings.mazeProfiles[name] = JSON.parse(JSON.stringify(defaultProfile));
            needsSave = true;
            console.log(`[MazeMaster] Added default maze profile: ${name}`);
        } else {
            // Update existing profile with any missing or empty fields from default
            const existing = extensionSettings.mazeProfiles[name];
            for (const [key, value] of Object.entries(defaultProfile)) {
                // Check if the existing value is empty/missing
                const isEmptyArray = Array.isArray(existing[key]) && existing[key].length === 0;
                const isEmptyObject = typeof existing[key] === 'object' && existing[key] !== null &&
                    !Array.isArray(existing[key]) && Object.keys(existing[key]).length === 0;
                const isEmpty = existing[key] === undefined || isEmptyArray || isEmptyObject;

                // Also check if startingInventory has all zero values (treat as empty)
                const isZeroInventory = key === 'startingInventory' && existing[key] &&
                    typeof existing[key] === 'object' &&
                    (existing[key].key || 0) === 0 &&
                    (existing[key].stealth || 0) === 0 &&
                    (existing[key].pow || 0) === 0 &&
                    (existing[key].grandpow || 0) === 0;

                if ((isEmpty || isZeroInventory) && value && (Array.isArray(value) ? value.length > 0 : true)) {
                    existing[key] = JSON.parse(JSON.stringify(value));
                    needsSave = true;
                    console.log(`[MazeMaster] Added missing/empty field '${key}' to maze profile: ${name}`);
                }
            }
        }
    }
    if (!extensionSettings.currentMazeProfile) {
        extensionSettings.currentMazeProfile = 'Dungeon Crawl';
    }

    // Save to ensure structure is persisted
    if (needsSave) {
        saveSettingsDebounced();
    }

    console.log('[MazeMaster] Loaded settings:', extensionSettings);
}

function getProfileNames() {
    return Object.keys(extensionSettings.profiles || {});
}

function getProfile(name) {
    return extensionSettings.profiles[name];
}

function saveProfile(name, segments, randomize = false, difficulty = 1) {
    extensionSettings.profiles[name] = { segments, randomize, difficulty };
    saveSettingsDebounced();
    console.log('[MazeMaster] Profile saved:', name, extensionSettings.profiles[name]);
}

function deleteProfile(name) {
    delete extensionSettings.profiles[name];
    if (extensionSettings.currentProfile === name) {
        const remaining = getProfileNames();
        extensionSettings.currentProfile = remaining[0] || 'default';
    }
    saveSettingsDebounced();
}

// Battlebar profile functions
function getBattlebarProfileNames() {
    return Object.keys(extensionSettings.battlebarProfiles || {});
}

function getBattlebarProfile(name) {
    return extensionSettings.battlebarProfiles[name];
}

function saveBattlebarProfile(name, profileData) {
    extensionSettings.battlebarProfiles[name] = {
        mainTitle: profileData.mainTitle || '',
        description: profileData.description || '',
        difficulty: profileData.difficulty || 3,
        hitsToWin: profileData.hitsToWin || 5,
        missesToLose: profileData.missesToLose || 3,
        hitCommand: profileData.hitCommand || '',
        missCommand: profileData.missCommand || '',
        winCommand: profileData.winCommand || '',
        loseCommand: profileData.loseCommand || '',
        images: profileData.images || [],
        // Item drop chances (maze only)
        keyDropChance: profileData.keyDropChance ?? 40,
        powDropChance: profileData.powDropChance ?? 20,
        stealthDropChance: profileData.stealthDropChance ?? 10,
    };
    saveSettingsDebounced();
    console.log('[MazeMaster] Battlebar profile saved:', name, extensionSettings.battlebarProfiles[name]);
}

function deleteBattlebarProfile(name) {
    delete extensionSettings.battlebarProfiles[name];
    if (extensionSettings.currentBattlebarProfile === name) {
        const remaining = getBattlebarProfileNames();
        extensionSettings.currentBattlebarProfile = remaining[0] || 'default';
    }
    saveSettingsDebounced();
}

// Maze profile functions
function getMazeProfileNames() {
    return Object.keys(extensionSettings.mazeProfiles || {});
}

function getMazeProfile(name) {
    return extensionSettings.mazeProfiles[name];
}

function saveMazeProfile(name, profileData) {
    extensionSettings.mazeProfiles[name] = {
        gridSize: profileData.gridSize || 10,
        winCommand: profileData.winCommand || '',
        winImage: profileData.winImage || '',
        winMessage: profileData.winMessage || '',
        // Main minion settings
        mainMinion: profileData.mainMinion || '',
        mainMinionIntroMessage: profileData.mainMinionIntroMessage || '',
        mainMinionRandomChance: profileData.mainMinionRandomChance || 15,
        mainMinionRandomMessages: profileData.mainMinionRandomMessages || [],
        mainMinionExitType: profileData.mainMinionExitType || 'messenger',
        mainMinionExitProfile: profileData.mainMinionExitProfile || '',
        // Encounter settings (percent-based)
        minionEncounters: profileData.minionEncounters || [], // { minionId, percent }
        onBattlebarLoss: profileData.onBattlebarLoss || 'continue',
        loseCommand: profileData.loseCommand || '',
        // Chest tile settings
        chestImage: profileData.chestImage || '',
        chestTilePercent: profileData.chestTilePercent || 10,
        chestLockedPercent: profileData.chestLockedPercent || 30,
        chestLockedBonusPercent: profileData.chestLockedBonusPercent || 50,
        chestMimicPercent: profileData.chestMimicPercent || 15,
        // Chest loot settings
        chestLootMin: profileData.chestLootMin || 1,
        chestLootMax: profileData.chestLootMax || 2,
        // Regular chest loot chances
        chestKeyChance: profileData.chestKeyChance || 30,
        chestPowChance: profileData.chestPowChance || 50,
        chestStealthChance: profileData.chestStealthChance || 0,
        // Locked chest loot chances
        lockedChestKeyChance: profileData.lockedChestKeyChance || 40,
        lockedChestPowChance: profileData.lockedChestPowChance || 60,
        lockedChestStealthChance: profileData.lockedChestStealthChance || 30,
        // Grandpow chances (rare)
        chestGrandpowChance: profileData.chestGrandpowChance || 0,
        lockedChestGrandpowChance: profileData.lockedChestGrandpowChance || 5,
        // Starting inventory
        startingInventory: profileData.startingInventory || { key: 0, stealth: 0, pow: 0, grandpow: 0 },
        // Trap encounters
        trapEncounters: profileData.trapEncounters || [],
        // Story milestones
        storyConfig: profileData.storyConfig || { mainStory: '', milestones: [] },
    };
    saveSettingsDebounced();
    console.log('[MazeMaster] Maze profile saved:', name, extensionSettings.mazeProfiles[name]);
}

function deleteMazeProfile(name) {
    delete extensionSettings.mazeProfiles[name];
    if (extensionSettings.currentMazeProfile === name) {
        const remaining = getMazeProfileNames();
        extensionSettings.currentMazeProfile = remaining[0] || 'default';
    }
    saveSettingsDebounced();
}

// Minion functions
function getMinionNames() {
    return Object.keys(extensionSettings.minions || {});
}

function getMinion(name) {
    return extensionSettings.minions[name];
}

function saveMinion(id, minionData) {
    extensionSettings.minions[id] = {
        name: minionData.name || 'Unknown',
        imagePath: minionData.imagePath || '',
        description: minionData.description || '', // For LLM generation
        type: minionData.type || 'messenger', // 'messenger' | 'battlebar' | 'prizewheel' | 'merchant'
        battlebarProfiles: minionData.battlebarProfiles || [], // For battlebar type
        wheelProfiles: minionData.wheelProfiles || [], // For prizewheel type
        messages: minionData.messages || [], // For messenger type
        encounterScript: minionData.encounterScript || '', // Optional STScript to run on encounter
        merchantItemCount: minionData.merchantItemCount || { min: 1, max: 3 }, // For merchant type
        // Movement settings for maze encounters
        movement: minionData.movement || {
            type: 'stationary', // 'stationary' | 'patrol' | 'chase'
            patrolRadius: 3,
            chaseRange: 5,
            speed: 1, // moves per player move (1 = every move, 2 = every other move)
        },
    };
    saveSettingsDebounced();
    console.log('[MazeMaster] Minion saved:', id, extensionSettings.minions[id]);
}

function deleteMinion(id) {
    delete extensionSettings.minions[id];
    saveSettingsDebounced();
}

function getDefaultMinion() {
    return {
        name: 'The Maze',
        imagePath: '',
        message: 'Find your way to the exit...',
    };
}

// =============================================================================
// TRAP FUNCTIONS
// =============================================================================

function getTrapNames() {
    return Object.keys(extensionSettings.traps || {});
}

function getTrap(id) {
    return extensionSettings.traps?.[id];
}

function saveTrap(id, trapData) {
    if (!extensionSettings.traps) extensionSettings.traps = {};
    extensionSettings.traps[id] = {
        name: trapData.name || 'Unknown Trap',
        imagePath: trapData.imagePath || '',
        message: trapData.message || 'You triggered a trap!',
        script: trapData.script || '', // STScript to execute
    };
    saveSettingsDebounced();
    console.log('[MazeMaster] Trap saved:', id, extensionSettings.traps[id]);
}

function deleteTrap(id) {
    delete extensionSettings.traps[id];
    saveSettingsDebounced();
}

// =============================================================================
// WHEEL LOGIC
// =============================================================================

function loadWheelFromProfile(profileName) {
    const profile = getProfile(profileName);
    if (!profile || !profile.segments || profile.segments.length === 0) {
        return { error: `Profile "${profileName}" not found or empty` };
    }

    currentWheel.segments = profile.segments.map((seg, i) => ({
        ...seg,
        units: SIZE_UNITS[seg.size] || 1,
        color: WHEEL_COLORS[i % WHEEL_COLORS.length],
    }));
    currentWheel.isOpen = false;
    currentWheel.isSpinning = false;
    currentWheel.pendingRespin = false;
    currentWheel.hasRespun = false;

    return { success: true, count: currentWheel.segments.length };
}

function validateWheelBalance() {
    const halfCount = currentWheel.segments.filter(s => s.size === 'halfseg').length;
    const doubleCount = currentWheel.segments.filter(s => s.size === 'doubleseg').length;

    if (halfCount !== doubleCount) {
        console.error(`[MazeMaster] Wheel balance error: ${halfCount} halfseg(s) but ${doubleCount} doubleseg(s). They must be equal.`);
        return { valid: false, error: `Wheel unbalanced: ${halfCount} halfseg(s) ≠ ${doubleCount} doubleseg(s)` };
    }
    return { valid: true };
}

function getTotalUnits() {
    return currentWheel.segments.reduce((sum, s) => sum + s.units, 0);
}

function selectWinner() {
    const totalUnits = getTotalUnits();
    let random = Math.random() * totalUnits;

    for (const segment of currentWheel.segments) {
        random -= segment.units;
        if (random <= 0) {
            return segment;
        }
    }
    return currentWheel.segments[currentWheel.segments.length - 1];
}

function clearWheel() {
    currentWheel.segments = [];
    currentWheel.isOpen = false;
    currentWheel.isSpinning = false;
    currentWheel.pendingRespin = false;
    currentWheel.hasRespun = false;
}

// =============================================================================
// WHEEL MODAL & CANVAS
// =============================================================================

function getWheelModalHtml() {
    return `
        <div id="mazemaster_wheel_modal" style="position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.95);">
            <div class="mazemaster-wheel-container">
                <div class="mazemaster-wheel-pointer"></div>
                <canvas id="mazemaster_wheel_canvas" width="400" height="400"></canvas>
                <button id="mazemaster_spin_btn" class="mazemaster-spin-btn">
                    <i class="fa-solid fa-play"></i> SPIN
                </button>
            </div>
        </div>
    `;
}

function getWheelStyles() {
    return `
        .mazemaster-wheel-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.95);
            display: flex;
            align-items: flex-start;
            justify-content: center;
            z-index: 10002;
            overflow-y: auto;
            padding: 10px 0;
            -webkit-overflow-scrolling: touch;
        }

        .mazemaster-wheel-container {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
            padding: 25px;
            margin: auto;
            background: #1a1a2e;
            border-radius: 15px;
            border: 2px solid #333;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        }

        .mazemaster-wheel-pointer {
            position: absolute;
            top: -20px;
            left: 50%;
            transform: translateX(-50%);
            width: 0;
            height: 0;
            border-left: 15px solid transparent;
            border-right: 15px solid transparent;
            border-top: 30px solid #fff;
            z-index: 10;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
        }

        #mazemaster_wheel_canvas {
            border-radius: 50%;
            box-shadow: 0 0 30px rgba(0,0,0,0.5), inset 0 0 20px rgba(255,255,255,0.1);
            transition: transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99);
        }

        .mazemaster-spin-btn {
            padding: 15px 40px;
            font-size: 1.2em;
            font-weight: bold;
            background: linear-gradient(135deg, #e74c3c, #c0392b);
            color: white;
            border: none;
            border-radius: 30px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 4px 15px rgba(231, 76, 60, 0.4);
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .mazemaster-spin-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 6px 20px rgba(231, 76, 60, 0.6);
        }

        .mazemaster-spin-btn:disabled {
            background: #555;
            cursor: not-allowed;
            box-shadow: none;
            transform: none;
        }

        .mazemaster-spin-btn.respin {
            background: linear-gradient(135deg, #f39c12, #d68910);
            box-shadow: 0 4px 15px rgba(243, 156, 18, 0.4);
        }

        .mazemaster-spin-btn.respin:hover {
            box-shadow: 0 6px 20px rgba(243, 156, 18, 0.6);
        }
    `;
}

function drawWheel(canvas) {
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 10;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const totalUnits = getTotalUnits();
    let currentAngle = -Math.PI / 2;

    for (const segment of currentWheel.segments) {
        const segmentAngle = (segment.units / totalUnits) * 2 * Math.PI;

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + segmentAngle);
        ctx.closePath();
        ctx.fillStyle = segment.color;
        ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        ctx.stroke();

        const textAngle = currentAngle + segmentAngle / 2;
        const textRadius = radius * 0.55;
        const textX = centerX + Math.cos(textAngle) * textRadius;
        const textY = centerY + Math.sin(textAngle) * textRadius;

        ctx.save();
        ctx.translate(textX, textY);
        // Rotate text to be radial (pointing outward from center)
        ctx.rotate(textAngle);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 3;

        let displayText = segment.text || segment.trigger;
        if (displayText.length > 12) {
            displayText = displayText.substring(0, 10) + '...';
        }
        ctx.fillText(displayText, 0, 0);
        ctx.restore();

        currentAngle += segmentAngle;
    }

    ctx.beginPath();
    ctx.arc(centerX, centerY, 20, 0, 2 * Math.PI);
    ctx.fillStyle = '#333';
    ctx.fill();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 3;
    ctx.stroke();
}

function showWheelModal() {
    const existing = document.getElementById('mazemaster_wheel_modal');
    if (existing) existing.remove();

    if (!document.getElementById('mazemaster_wheel_styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'mazemaster_wheel_styles';
        styleEl.textContent = getWheelStyles();
        document.head.appendChild(styleEl);
    }

    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = getWheelModalHtml();
    document.body.appendChild(modalContainer.firstElementChild);

    const canvas = document.getElementById('mazemaster_wheel_canvas');
    if (canvas) {
        drawWheel(canvas);
    }

    const spinBtn = document.getElementById('mazemaster_spin_btn');
    if (spinBtn) {
        spinBtn.addEventListener('click', handleSpinClick);
    }

    currentWheel.isOpen = true;
}

function closeWheelModal() {
    const modal = document.getElementById('mazemaster_wheel_modal');
    if (modal) modal.remove();
    currentWheel.isOpen = false;

    // Handle maze integration if this was a maze encounter
    if (currentMaze.isOpen && currentMaze.pendingEncounter) {
        const encounterType = currentMaze.pendingEncounter.type;

        if (encounterType === 'exit_wheel') {
            // Exit wheel completed - win the maze
            currentMaze.exitEncounterDone = true;
            currentMaze.isPaused = false;
            handleMazeWin();
        } else if (encounterType === 'wheel') {
            // Regular wheel encounter - resume maze
            resumeMaze();
        }
    }
}

async function handleSpinClick() {
    const spinBtn = document.getElementById('mazemaster_spin_btn');
    if (!spinBtn || currentWheel.isSpinning) return;

    spinBtn.disabled = true;
    spinBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Spinning...';

    currentWheel.isSpinning = true;
    currentWheel.pendingRespin = false;

    const winner = selectWinner();
    const canvas = document.getElementById('mazemaster_wheel_canvas');

    if (!canvas) {
        currentWheel.isSpinning = false;
        return;
    }

    // Calculate winning angle
    const totalUnits = getTotalUnits();
    let winnerStartAngle = 0;
    for (const segment of currentWheel.segments) {
        if (segment === winner) break;
        winnerStartAngle += (segment.units / totalUnits) * 360;
    }
    const winnerMidAngle = winnerStartAngle + ((winner.units / totalUnits) * 360) / 2;

    const fullRotations = 5 + Math.floor(Math.random() * 3);
    const currentRotation = parseFloat(canvas.style.transform?.match(/rotate\((\d+\.?\d*)deg\)/)?.[1] || 0);
    const finalAngle = currentRotation + fullRotations * 360 + (360 - winnerMidAngle);

    canvas.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
    canvas.style.transform = `rotate(${finalAngle}deg)`;

    await new Promise(resolve => setTimeout(resolve, 4200));

    currentWheel.isSpinning = false;

    // Execute command
    const wheelCmd = extensionSettings.profiles[extensionSettings.currentProfile]?.segments
        ?.find(s => s.trigger === winner.trigger);

    if (wheelCmd && wheelCmd.command) {
        console.log(`[MazeMaster] Executing command for "${winner.text}": ${wheelCmd.command}`);
        await executeWithTimeout(wheelCmd.command);
    }

    // Store result for macros
    lastResults.wheel[extensionSettings.currentProfile] = {
        segmentName: winner.text,
        command: wheelCmd?.command || '',
        timestamp: Date.now(),
    };

    // Check for respin (only one respin allowed per wheel session)
    if (winner.respin && !currentWheel.hasRespun) {
        currentWheel.pendingRespin = true;
        currentWheel.hasRespun = true; // Mark that we've used our one respin
        spinBtn.disabled = false;
        spinBtn.className = 'mazemaster-spin-btn respin';
        spinBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> RESPIN';
    } else {
        closeWheelModal();
        clearWheel();
    }
}

// =============================================================================
// SLASH COMMANDS
// =============================================================================

function registerSlashCommands() {
    // Wheel command
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'wheel',
        callback: async (args) => {
            const profileName = args.profile || 'default';

            const result = loadWheelFromProfile(profileName);
            if (result.error) {
                return `Error: ${result.error}`;
            }

            const validation = validateWheelBalance();
            if (!validation.valid) {
                return `Error: ${validation.error}`;
            }

            extensionSettings.currentProfile = profileName;
            showWheelModal();
            return `Wheel "${profileName}" opened with ${result.count} segments. Click SPIN!`;
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'profile',
                description: 'Name of the wheel profile to use',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
                defaultValue: 'default',
            }),
        ],
        helpString: 'Open a wheel by profile name. Example: /wheel profile="mywheel"',
    }));

    // Battlebar command
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'battlebar',
        callback: async (args) => {
            const profileName = args.profile || 'default';
            const result = startBattlebar(profileName);
            if (result.error) {
                return `Error: ${result.error}`;
            }
            return `Battlebar "${profileName}" started! Press SPACE when the arrow is in the green zone.`;
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'profile',
                description: 'Name of the battlebar profile to use',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
                defaultValue: 'default',
            }),
        ],
        helpString: 'Start a battlebar challenge. Example: /battlebar profile="boss1"',
    }));

    // Maze command
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'maze',
        callback: async (args) => {
            const profileName = args.profile || extensionSettings.currentMazeProfile || 'default';
            const result = startMaze(profileName);
            if (result.error) {
                return `Error: ${result.error}`;
            }
            return `Maze "${profileName}" started! Use arrow keys to navigate.`;
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'profile',
                description: 'Name of the maze profile to use',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
        ],
        helpString: 'Start a maze game. Example: /maze profile="dungeon1"',
    }));

    // Mazeminion command - sets the current minion display in an active maze
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'mazeminion',
        callback: async (args) => {
            if (!currentMaze.isOpen) {
                return 'No maze is currently open.';
            }

            const minionName = args.name;
            const message = args.message || '';

            // Check if this is a configured minion
            const minion = getMinion(minionName);
            if (minion) {
                currentMaze.currentMinion = {
                    name: minion.name,
                    imagePath: minion.imagePath,
                    message: message,
                };
            } else {
                // Custom minion name
                currentMaze.currentMinion = {
                    name: minionName || 'Unknown',
                    imagePath: '',
                    message: message,
                };
            }

            updateMazeHero();
            return '';
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'name',
                description: 'Minion name (from config) or custom name',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'message',
                description: 'Message to display',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
        ],
        helpString: 'Set the minion display in an active maze. Example: /mazeminion name="Goblin" message="You shall not pass!"',
    }));

    // Mazestats command - get current session stats as JSON
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'mazestats',
        callback: async () => {
            if (!currentMaze.isOpen) {
                return JSON.stringify({ error: 'No maze is currently open.' });
            }

            const stats = {
                moves: currentMaze.stats?.moves || 0,
                encountersTotal: currentMaze.stats?.encountersTotal || 0,
                encountersWon: currentMaze.stats?.encountersWon || 0,
                chestsOpened: currentMaze.stats?.chestsOpened || 0,
                trapsTriggered: currentMaze.stats?.trapsTriggered || 0,
                teleportsUsed: currentMaze.stats?.teleportsUsed || 0,
                itemsCollected: currentMaze.stats?.itemsCollected || {},
                exploration: getExplorationPercent(),
                elapsedTime: getElapsedTime(),
                difficulty: currentMaze.profile?.difficulty || 'normal',
            };

            return JSON.stringify(stats);
        },
        helpString: 'Get current maze session statistics as JSON. Example: /mazestats',
    }));

    // Mazeexplore command - get exploration percentage
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'mazeexplore',
        callback: async () => {
            if (!currentMaze.isOpen) {
                return 'No maze is currently open.';
            }

            const percent = getExplorationPercent();
            return String(percent);
        },
        helpString: 'Get current maze exploration percentage (0-100). Example: /mazeexplore',
    }));

    // Mazeobjective command - get objective progress
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'mazeobjective',
        callback: async (args) => {
            if (!currentMaze.isOpen) {
                return JSON.stringify({ error: 'No maze is currently open.' });
            }

            const objectives = currentMaze.profile?.objectives || [];
            const progress = currentMaze.objectiveProgress || {};

            if (args.id) {
                // Get specific objective
                const obj = objectives.find(o => o.id === args.id);
                if (!obj) {
                    return JSON.stringify({ error: `Objective "${args.id}" not found.` });
                }
                const prog = progress[args.id] || { current: 0, completed: false };
                return JSON.stringify({
                    id: obj.id,
                    type: obj.type,
                    target: obj.target,
                    description: obj.description,
                    current: prog.current,
                    required: obj.count,
                    completed: prog.completed,
                    isRequired: obj.required,
                });
            } else {
                // Get all objectives
                const allProgress = objectives.map(obj => {
                    const prog = progress[obj.id] || { current: 0, completed: false };
                    return {
                        id: obj.id,
                        type: obj.type,
                        description: obj.description,
                        current: prog.current,
                        required: obj.count,
                        completed: prog.completed,
                        isRequired: obj.required,
                    };
                });
                return JSON.stringify(allProgress);
            }
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'id',
                description: 'Specific objective ID to get (optional, returns all if omitted)',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
        ],
        helpString: 'Get maze objective progress. Example: /mazeobjective id="collect_keys" or /mazeobjective (for all)',
    }));

    // Mazedifficulty command - set difficulty for next maze
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'mazedifficulty',
        callback: async (args) => {
            const tier = args.tier?.toLowerCase();
            const validTiers = ['easy', 'normal', 'hard', 'nightmare'];

            if (!tier) {
                // Return current difficulty setting
                const currentProfile = extensionSettings.mazeProfiles?.[extensionSettings.currentMazeProfile || 'default'];
                return currentProfile?.difficulty || 'normal';
            }

            if (!validTiers.includes(tier)) {
                return `Error: Invalid difficulty tier. Valid options: ${validTiers.join(', ')}`;
            }

            // Update the current maze profile's difficulty
            const profileName = extensionSettings.currentMazeProfile || 'default';
            if (extensionSettings.mazeProfiles?.[profileName]) {
                extensionSettings.mazeProfiles[profileName].difficulty = tier;
                saveSettings();
                return `Difficulty set to "${tier}" for profile "${profileName}".`;
            } else {
                return `Error: Profile "${profileName}" not found.`;
            }
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'tier',
                description: 'Difficulty tier: easy, normal, hard, or nightmare',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
        ],
        helpString: 'Get or set maze difficulty. Example: /mazedifficulty tier="hard" or /mazedifficulty (to get current)',
    }));

    // v1.2.0: Persona stats command
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'mazepersonastats',
        callback: async (args) => {
            const personaName = args.persona || getCurrentPersonaName();
            const stats = extensionSettings.mazeStats?.personas?.[personaName];

            if (!stats) {
                return JSON.stringify({ error: `No stats found for persona "${personaName}".` });
            }

            return JSON.stringify({
                persona: personaName,
                totalGames: stats.totalGames || 0,
                wins: stats.wins || 0,
                losses: stats.losses || 0,
                totalMoves: stats.totalMoves || 0,
                bestTime: stats.bestTime,
                profileStats: stats.profileStats || {},
            });
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'persona',
                description: 'Name of the persona to get stats for (default: current persona)',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
        ],
        helpString: 'Get maze stats for a specific persona. Example: /mazepersonastats persona="Alice"',
    }));

    // v1.2.0: Floor command
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'mazefloor',
        callback: async () => {
            if (!currentMaze.isOpen) {
                return JSON.stringify({ error: 'No maze is currently open.' });
            }

            return JSON.stringify({
                current: (currentMaze.currentFloor || 0) + 1,
                total: currentMaze.totalFloors || 1,
            });
        },
        helpString: 'Get current floor information in an active maze. Example: /mazefloor',
    }));

    // v1.2.0: Theme command
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'mazetheme',
        callback: async (args) => {
            const theme = args.theme?.toLowerCase();
            const validThemes = ['fantasy', 'horror', 'scifi', 'action'];

            if (!theme) {
                // Return current theme
                const profileName = extensionSettings.currentMazeProfile || 'default';
                const currentProfile = extensionSettings.mazeProfiles?.[profileName];
                return currentProfile?.theme || 'fantasy';
            }

            if (!validThemes.includes(theme)) {
                return `Error: Invalid theme. Valid options: ${validThemes.join(', ')}`;
            }

            const profileName = extensionSettings.currentMazeProfile || 'default';
            if (extensionSettings.mazeProfiles?.[profileName]) {
                extensionSettings.mazeProfiles[profileName].theme = theme;
                saveSettings();
                return `Theme set to "${theme}" for profile "${profileName}".`;
            } else {
                return `Error: Profile "${profileName}" not found.`;
            }
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'theme',
                description: 'Theme: fantasy, horror, scifi, or action',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
        ],
        helpString: 'Get or set maze theme. Example: /mazetheme theme="horror" or /mazetheme (to get current)',
    }));

    // v1.2.0: Map style command
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'mazemapstyle',
        callback: async (args) => {
            const style = args.style?.toLowerCase();
            const validStyles = ['maze', 'dungeon', 'city', 'forest', 'spaceship'];

            if (!style) {
                // Return current map style
                const profileName = extensionSettings.currentMazeProfile || 'default';
                const currentProfile = extensionSettings.mazeProfiles?.[profileName];
                return currentProfile?.mapStyle || 'maze';
            }

            if (!validStyles.includes(style)) {
                return `Error: Invalid map style. Valid options: ${validStyles.join(', ')}`;
            }

            const profileName = extensionSettings.currentMazeProfile || 'default';
            if (extensionSettings.mazeProfiles?.[profileName]) {
                extensionSettings.mazeProfiles[profileName].mapStyle = style;
                saveSettings();
                return `Map style set to "${style}" for profile "${profileName}".`;
            } else {
                return `Error: Profile "${profileName}" not found.`;
            }
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'style',
                description: 'Map style: maze, dungeon, city, forest, or spaceship',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
        ],
        helpString: 'Get or set maze map style. Example: /mazemapstyle style="dungeon" or /mazemapstyle (to get current)',
    }));

    console.log('[MazeMaster] Slash commands registered');
}

// =============================================================================
// BATTLEBAR MODAL & GAME LOGIC
// =============================================================================

function getBattlebarModalHtml() {
    return `
        <div id="mazemaster_battlebar_modal" style="position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.9);">
            <div class="mazemaster-bb-container">
                <div id="bb_main_title" class="mazemaster-bb-main-title"></div>
                <div class="mazemaster-bb-image-display">
                    <img id="mazemaster_bb_img" src="" alt="">
                </div>
                <div id="bb_stage_title" class="mazemaster-bb-stage-title"></div>
                <div class="mazemaster-bb-stats">
                    <span class="bb-stat bb-stat-hits">
                        Hits: <span id="bb_current_hits">0</span>/<span id="bb_needed_hits">5</span>
                    </span>
                    <span class="bb-stat bb-stat-misses">
                        Misses: <span id="bb_current_misses">0</span>/<span id="bb_max_misses">3</span>
                    </span>
                </div>
                <div class="mazemaster-bb-bar-container">
                    <div class="mazemaster-bb-bar">
                        <div class="mazemaster-bb-zone" id="bb_zone"></div>
                        <div class="mazemaster-bb-arrow" id="bb_arrow"></div>
                    </div>
                </div>
                <div class="mazemaster-bb-instructions">
                    Press <kbd>SPACE</kbd> when the arrow is in the green zone!
                </div>
                <div class="mazemaster-bb-action-buttons">
                    <button id="mazemaster_bb_hit_btn" class="mazemaster-bb-hit-btn">
                        <i class="fa-solid fa-bullseye"></i> HIT!
                    </button>
                    <button id="mazemaster_bb_pow_btn" class="mazemaster-bb-pow-btn" style="display: none;">
                        <i class="fa-solid fa-bolt"></i> POW! (<span id="bb_pow_count">0</span>)
                    </button>
                    <button id="mazemaster_bb_grandpow_btn" class="mazemaster-bb-grandpow-btn" style="display: none;">
                        <i class="fa-solid fa-star"></i> GRANDPOW! (<span id="bb_grandpow_count">0</span>)
                    </button>
                </div>
            </div>
        </div>
    `;
}

function getBattlebarStyles() {
    return `
        .mazemaster-bb-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10010;
        }

        .mazemaster-bb-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 15px;
            padding: 25px;
            background: #1a1a2e;
            border-radius: 15px;
            border: 2px solid #333;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
            width: 450px;
            max-width: 95vw;
            overflow-y: auto;
        }

        .mazemaster-bb-main-title {
            font-size: 32px;
            font-weight: bold;
            color: #fff;
            text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
            text-align: center;
        }

        .mazemaster-bb-stage-title {
            font-size: 18px;
            color: #aaa;
            text-align: center;
            min-height: 24px;
            max-width: 100%;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }

        .mazemaster-bb-image-display {
            width: min(300px, 80vw);
            height: min(300px, 40vh);
            border: 3px solid #444;
            border-radius: 10px;
            overflow: hidden;
            background: #222;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .mazemaster-bb-image-display img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
        }

        .mazemaster-bb-stats {
            display: flex;
            gap: 30px;
            font-size: 1.2em;
            font-weight: bold;
        }

        .bb-stat-hits {
            color: #27ae60;
        }

        .bb-stat-misses {
            color: #e74c3c;
        }

        .mazemaster-bb-bar-container {
            padding: 10px;
        }

        .mazemaster-bb-bar {
            position: relative;
            width: min(400px, 90vw);
            height: 50px;
            background: linear-gradient(to bottom, #c0392b, #a93226);
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5), inset 0 2px 5px rgba(0, 0, 0, 0.3);
        }

        .mazemaster-bb-zone {
            position: absolute;
            height: 100%;
            background: linear-gradient(to bottom, #27ae60, #1e8449);
            box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.2);
        }

        .mazemaster-bb-arrow {
            position: absolute;
            width: 6px;
            height: 100%;
            background: #fff;
            box-shadow: 0 0 15px #fff, 0 0 30px rgba(255, 255, 255, 0.5);
            left: 0;
            transition: none;
        }

        .mazemaster-bb-instructions {
            font-size: 1.1em;
            color: #aaa;
        }

        .mazemaster-bb-instructions kbd {
            background: #444;
            padding: 5px 15px;
            border-radius: 5px;
            font-weight: bold;
            color: #fff;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
        }

        .mazemaster-bb-bar.flash-hit {
            animation: flashHit 0.3s ease;
        }

        .mazemaster-bb-bar.flash-miss {
            animation: flashMiss 0.3s ease;
        }

        @keyframes flashHit {
            0%, 100% { box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5); }
            50% { box-shadow: 0 0 30px rgba(39, 174, 96, 0.8), 0 0 60px rgba(39, 174, 96, 0.5); }
        }

        @keyframes flashMiss {
            0%, 100% { box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5); }
            50% { box-shadow: 0 0 30px rgba(231, 76, 60, 0.8), 0 0 60px rgba(231, 76, 60, 0.5); }
        }

        .mazemaster-bb-hit-btn {
            width: min(100%, 90vw);
            max-width: 400px;
            padding: 20px 30px;
            font-size: 24px;
            font-weight: bold;
            background: linear-gradient(135deg, #27ae60, #2ecc71);
            color: white;
            border: none;
            border-radius: 12px;
            cursor: pointer;
            margin-top: 10px;
            box-shadow: 0 6px 20px rgba(39, 174, 96, 0.4);
            transition: transform 0.1s ease, box-shadow 0.1s ease;
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
        }

        .mazemaster-bb-hit-btn:hover {
            transform: scale(1.02);
            box-shadow: 0 8px 25px rgba(39, 174, 96, 0.5);
        }

        .mazemaster-bb-hit-btn:active {
            transform: scale(0.98);
            box-shadow: 0 4px 15px rgba(39, 174, 96, 0.3);
        }

        .mazemaster-bb-hit-btn i {
            margin-right: 10px;
        }

        .mazemaster-bb-hit-btn.victory {
            background: linear-gradient(135deg, #f39c12, #e67e22);
            box-shadow: 0 6px 20px rgba(243, 156, 18, 0.4);
        }

        .mazemaster-bb-hit-btn.victory:hover {
            box-shadow: 0 8px 25px rgba(243, 156, 18, 0.5);
        }

        .mazemaster-bb-hit-btn.defeat {
            background: linear-gradient(135deg, #c0392b, #e74c3c);
            box-shadow: 0 6px 20px rgba(192, 57, 43, 0.4);
        }

        .mazemaster-bb-hit-btn.defeat:hover {
            box-shadow: 0 8px 25px rgba(192, 57, 43, 0.5);
        }
    `;
}

function startBattlebar(profileName) {
    const profile = getBattlebarProfile(profileName);
    if (!profile) {
        return { error: `Battlebar profile "${profileName}" not found` };
    }

    // Check for Time Shard effect (slows battlebar by 50%)
    const timeShardMultiplier = getTimeShardMultiplier();
    const hasTimeShard = timeShardMultiplier < 1.0;

    currentBattlebar = {
        isOpen: true,
        profile: profile,
        hits: 0,
        misses: 0,
        arrowPosition: 0,
        arrowDirection: 1,
        zoneStart: 0,
        zoneEnd: 0,
        animationId: null,
        lastFrameTime: 0,
        isVictory: false,
        isDefeat: false,
        // v1.2.0: Time Shard speed multiplier
        speedMultiplier: timeShardMultiplier,
    };

    randomizeBattlebarZone();
    showBattlebarModal();
    startBattlebarAnimation();
    document.addEventListener('keydown', handleBattlebarKeydown);

    // Consume Time Shard if used
    if (hasTimeShard) {
        consumeTimeShard();
    }

    return { success: true };
}

function showBattlebarModal() {
    const existing = document.getElementById('mazemaster_battlebar_modal');
    if (existing) existing.remove();

    if (!document.getElementById('mazemaster_battlebar_styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'mazemaster_battlebar_styles';
        styleEl.textContent = getBattlebarStyles();
        document.head.appendChild(styleEl);
    }

    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = getBattlebarModalHtml();
    document.body.appendChild(modalContainer.firstElementChild);

    // Update stats display
    updateBattlebarStatsDisplay();

    // Update zone position
    updateBattlebarZoneElement();

    // Show first image if available
    updateBattlebarImageDisplay();

    // Show titles
    updateBattlebarTitles();

    // Attach mobile hit button handler
    const hitBtn = document.getElementById('mazemaster_bb_hit_btn');
    if (hitBtn) {
        hitBtn.addEventListener('click', handleBattlebarHitButton);
        hitBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            handleBattlebarHitButton(e);
        });
    }

    // Attach POW button handler
    const powBtn = document.getElementById('mazemaster_bb_pow_btn');
    if (powBtn) {
        powBtn.addEventListener('click', handlePowButton);
    }

    // Attach GRANDPOW button handler
    const grandpowBtn = document.getElementById('mazemaster_bb_grandpow_btn');
    if (grandpowBtn) {
        grandpowBtn.addEventListener('click', handleGrandpowButton);
    }

    // Update POW and GRANDPOW button visibility
    updatePowButtonVisibility();
    updateGrandpowButtonVisibility();
}

function updateBattlebarTitles() {
    const profile = currentBattlebar.profile || {};

    // Main title
    const mainTitleEl = document.getElementById('bb_main_title');
    if (mainTitleEl) {
        mainTitleEl.textContent = profile.mainTitle || '';
    }

    // Stage title (based on current hits = current stage, from image stageMessage)
    const stageTitleEl = document.getElementById('bb_stage_title');
    if (stageTitleEl) {
        const images = profile.images || [];
        const currentStage = currentBattlebar.hits || 0;
        const currentImage = images[currentStage];
        stageTitleEl.textContent = currentImage?.stageMessage || '';
    }
}

function handleBattlebarHitButton(e) {
    e.preventDefault();
    if (!currentBattlebar.isOpen) return;

    // If in victory or defeat state, close the modal
    if (currentBattlebar.isVictory || currentBattlebar.isDefeat) {
        closeBattlebarModal();
        return;
    }

    const inZone = currentBattlebar.arrowPosition >= currentBattlebar.zoneStart
                && currentBattlebar.arrowPosition <= currentBattlebar.zoneEnd;

    console.log('[MazeMaster] Hit check:', {
        arrowPosition: currentBattlebar.arrowPosition,
        zoneStart: currentBattlebar.zoneStart,
        zoneEnd: currentBattlebar.zoneEnd,
        inZone: inZone,
    });

    if (inZone) {
        handleBattlebarHit();
    } else {
        handleBattlebarMiss();
    }
}

/**
 * Update POW button visibility based on maze inventory
 */
function updatePowButtonVisibility() {
    const powBtn = document.getElementById('mazemaster_bb_pow_btn');
    const powCount = document.getElementById('bb_pow_count');

    if (powBtn && currentMaze.isOpen && currentMaze.inventory.pow > 0) {
        powBtn.style.display = '';
        if (powCount) powCount.textContent = currentMaze.inventory.pow;
    } else if (powBtn) {
        powBtn.style.display = 'none';
    }
}

/**
 * Handle POW button click - guaranteed hit
 */
function handlePowButton(e) {
    e.preventDefault();
    if (!currentMaze.isOpen || currentMaze.inventory.pow <= 0) return;
    if (!currentBattlebar.isOpen) return;
    if (currentBattlebar.isVictory || currentBattlebar.isDefeat) return;

    // Use POW - automatic hit
    removeFromInventory('pow');
    updatePowButtonVisibility();

    // Register as a hit
    currentBattlebar.hits++;
    updateBattlebarDisplay();

    // Check for win
    if (currentBattlebar.hits >= currentBattlebar.profile.hitsToWin) {
        handleBattlebarWin();
    }
}

/**
 * Check if current battlebar is a main minion exit encounter
 */
function isMainMinionEncounter() {
    return currentMaze.pendingEncounter && currentMaze.pendingEncounter.type === 'exit_battlebar';
}

/**
 * Update GRANDPOW button visibility based on maze inventory and encounter type
 */
function updateGrandpowButtonVisibility() {
    const grandpowBtn = document.getElementById('mazemaster_bb_grandpow_btn');
    const grandpowCount = document.getElementById('bb_grandpow_count');

    // Hide if not in maze, no grandpow, or fighting main minion
    if (grandpowBtn && currentMaze.isOpen && currentMaze.inventory.grandpow > 0 && !isMainMinionEncounter()) {
        grandpowBtn.style.display = '';
        if (grandpowCount) grandpowCount.textContent = currentMaze.inventory.grandpow;
    } else if (grandpowBtn) {
        grandpowBtn.style.display = 'none';
    }
}

/**
 * Handle GRANDPOW button click - instant win (except vs main minion)
 */
function handleGrandpowButton(e) {
    e.preventDefault();
    if (!currentMaze.isOpen || currentMaze.inventory.grandpow <= 0) return;
    if (!currentBattlebar.isOpen) return;
    if (currentBattlebar.isVictory || currentBattlebar.isDefeat) return;

    // Cannot use against main minion
    if (isMainMinionEncounter()) {
        console.log('[MazeMaster] GRANDPOW cannot be used against the main minion!');
        return;
    }

    // Use GRANDPOW - instant win
    removeFromInventory('grandpow');
    updateGrandpowButtonVisibility();

    // Set hits to win threshold - instant victory
    currentBattlebar.hits = currentBattlebar.profile.hitsToWin;
    updateBattlebarDisplay();

    // Trigger win
    handleBattlebarWin();
}

function closeBattlebarModal() {
    const wasVictory = currentBattlebar.isVictory;
    const wasDefeat = currentBattlebar.isDefeat;

    if (currentBattlebar.animationId) {
        cancelAnimationFrame(currentBattlebar.animationId);
    }
    document.removeEventListener('keydown', handleBattlebarKeydown);

    const modal = document.getElementById('mazemaster_battlebar_modal');
    if (modal) modal.remove();

    currentBattlebar.isOpen = false;
    currentBattlebar.isVictory = false;
    currentBattlebar.isDefeat = false;

    // Handle maze integration if this was a maze encounter
    if (currentMaze.isOpen && currentMaze.pendingEncounter) {
        const encounterType = currentMaze.pendingEncounter.type;

        if (wasVictory) {
            if (encounterType === 'exit_battlebar') {
                // Exit boss defeated - win the maze
                currentMaze.exitEncounterDone = true;
                currentMaze.isPaused = false;
                handleMazeWin();
            } else {
                // Regular encounter - resume maze
                resumeMaze();
            }
        } else if (wasDefeat) {
            const lossAction = currentMaze.profile.onBattlebarLoss || 'continue';

            if (encounterType === 'exit_battlebar') {
                // Exit boss loss - always respawn or game over (can't continue past exit)
                if (lossAction === 'gameover') {
                    handleMazeLoss();
                } else {
                    respawnPlayer();
                }
            } else {
                // Regular encounter loss
                switch (lossAction) {
                    case 'gameover':
                        handleMazeLoss();
                        break;
                    case 'respawn':
                        respawnPlayer();
                        break;
                    case 'continue':
                    default:
                        resumeMaze();
                        break;
                }
            }
        }
    }
}

function randomizeBattlebarZone() {
    const difficultyLevel = currentBattlebar.profile.difficulty || 3;
    const difficulty = BATTLEBAR_DIFFICULTY[difficultyLevel];

    if (!difficulty) {
        console.error('[MazeMaster] Invalid difficulty level:', difficultyLevel);
        return;
    }

    const zoneWidth = difficulty.zoneWidth * 100;
    const maxStart = 100 - zoneWidth;

    currentBattlebar.zoneStart = Math.random() * maxStart;
    currentBattlebar.zoneEnd = currentBattlebar.zoneStart + zoneWidth;

    console.log('[MazeMaster] Zone randomized:', {
        difficulty: difficultyLevel,
        zoneWidth: zoneWidth,
        zoneStart: currentBattlebar.zoneStart,
        zoneEnd: currentBattlebar.zoneEnd,
    });
}

function updateBattlebarZoneElement() {
    const zone = document.getElementById('bb_zone');
    if (zone) {
        zone.style.left = `${currentBattlebar.zoneStart}%`;
        zone.style.width = `${currentBattlebar.zoneEnd - currentBattlebar.zoneStart}%`;
    }
}

function updateBattlebarArrowElement() {
    const arrow = document.getElementById('bb_arrow');
    if (arrow) {
        arrow.style.left = `${currentBattlebar.arrowPosition}%`;
    }
}

function updateBattlebarStatsDisplay() {
    const hitsEl = document.getElementById('bb_current_hits');
    const neededEl = document.getElementById('bb_needed_hits');
    const missesEl = document.getElementById('bb_current_misses');
    const maxMissesEl = document.getElementById('bb_max_misses');

    if (hitsEl) hitsEl.textContent = currentBattlebar.hits;
    if (neededEl) neededEl.textContent = currentBattlebar.profile.hitsToWin || 5;
    if (missesEl) missesEl.textContent = currentBattlebar.misses;
    if (maxMissesEl) maxMissesEl.textContent = currentBattlebar.profile.missesToLose || 3;
}

function updateBattlebarImageDisplay() {
    const imgEl = document.getElementById('mazemaster_bb_img');
    if (!imgEl) return;

    const images = currentBattlebar.profile.images || [];
    if (images.length === 0) {
        imgEl.style.display = 'none';
        return;
    }

    // Show image based on current hit count
    const imageIndex = Math.min(currentBattlebar.hits, images.length - 1);
    const currentImage = images[imageIndex];
    // Support both 'imagePath' and 'path' field names
    const imagePath = currentImage.imagePath || currentImage.path || '';
    if (imagePath) {
        imgEl.src = getExtensionImagePath(imagePath);
        imgEl.style.display = 'block';
    } else {
        imgEl.style.display = 'none';
    }
}

function startBattlebarAnimation() {
    const difficulty = BATTLEBAR_DIFFICULTY[currentBattlebar.profile.difficulty || 3];
    // Apply Time Shard speed multiplier if present (lower = slower)
    const baseSpeed = 100 / difficulty.traverseTime; // % per ms
    const speed = baseSpeed * (currentBattlebar.speedMultiplier || 1.0);

    function animate(timestamp) {
        if (!currentBattlebar.isOpen) return;

        if (currentBattlebar.lastFrameTime === 0) {
            currentBattlebar.lastFrameTime = timestamp;
        }

        const delta = timestamp - currentBattlebar.lastFrameTime;
        currentBattlebar.lastFrameTime = timestamp;

        // Move arrow
        currentBattlebar.arrowPosition += speed * delta * currentBattlebar.arrowDirection;

        // Bounce at edges
        if (currentBattlebar.arrowPosition >= 100) {
            currentBattlebar.arrowPosition = 100;
            currentBattlebar.arrowDirection = -1;
        } else if (currentBattlebar.arrowPosition <= 0) {
            currentBattlebar.arrowPosition = 0;
            currentBattlebar.arrowDirection = 1;
        }

        updateBattlebarArrowElement();
        currentBattlebar.animationId = requestAnimationFrame(animate);
    }

    currentBattlebar.lastFrameTime = 0;
    currentBattlebar.animationId = requestAnimationFrame(animate);
}

function handleBattlebarKeydown(e) {
    if (e.code !== 'Space' || !currentBattlebar.isOpen) return;
    e.preventDefault();

    // If in victory or defeat state, close the modal
    if (currentBattlebar.isVictory || currentBattlebar.isDefeat) {
        closeBattlebarModal();
        return;
    }

    const inZone = currentBattlebar.arrowPosition >= currentBattlebar.zoneStart
                && currentBattlebar.arrowPosition <= currentBattlebar.zoneEnd;

    if (inZone) {
        handleBattlebarHit();
    } else {
        handleBattlebarMiss();
    }
}

async function handleBattlebarHit() {
    currentBattlebar.hits++;

    // Flash green
    const bar = document.querySelector('.mazemaster-bb-bar');
    if (bar) {
        bar.classList.remove('flash-hit', 'flash-miss');
        void bar.offsetWidth; // Trigger reflow
        bar.classList.add('flash-hit');
    }

    updateBattlebarStatsDisplay();
    updateBattlebarImageDisplay();
    updateBattlebarTitles();

    // Execute hit command
    if (currentBattlebar.profile.hitCommand) {
        await executeWithTimeout(currentBattlebar.profile.hitCommand);
    }

    // Check for win
    if (currentBattlebar.hits >= (currentBattlebar.profile.hitsToWin || 5)) {
        await handleBattlebarWin();
        return;
    }

    // Randomize zone for next attempt
    randomizeBattlebarZone();
    updateBattlebarZoneElement();
}

async function handleBattlebarMiss() {
    currentBattlebar.misses++;

    // Flash red
    const bar = document.querySelector('.mazemaster-bb-bar');
    if (bar) {
        bar.classList.remove('flash-hit', 'flash-miss');
        void bar.offsetWidth;
        bar.classList.add('flash-miss');
    }

    updateBattlebarStatsDisplay();

    // Execute miss command
    if (currentBattlebar.profile.missCommand) {
        await executeWithTimeout(currentBattlebar.profile.missCommand);
    }

    // Check for loss
    if (currentBattlebar.misses >= (currentBattlebar.profile.missesToLose || 3)) {
        await handleBattlebarLoss();
        return;
    }
}

async function handleBattlebarWin() {
    const profileName = extensionSettings.currentBattlebarProfile || 'default';

    // Store result for macros
    lastResults.battlebar[profileName] = {
        result: 'win',
        hits: currentBattlebar.hits,
        misses: currentBattlebar.misses,
        timestamp: Date.now(),
    };

    // Set victory state
    currentBattlebar.isVictory = true;

    // Handle item drops for maze encounters
    if (currentMaze.isOpen && currentMaze.pendingEncounter) {
        const profile = currentBattlebar.profile;

        // Roll for drops
        if (Math.random() * 100 < (profile.keyDropChance ?? 40)) {
            addToInventory('key');
        }
        if (Math.random() * 100 < (profile.powDropChance ?? 20)) {
            addToInventory('pow');
        }
        if (Math.random() * 100 < (profile.stealthDropChance ?? 10)) {
            addToInventory('stealth');
        }
    }

    // Stop the arrow animation
    if (currentBattlebar.animationId) {
        cancelAnimationFrame(currentBattlebar.animationId);
        currentBattlebar.animationId = null;
    }

    // Hide the bar and instructions
    const barContainer = document.querySelector('.mazemaster-bb-bar-container');
    const instructions = document.querySelector('.mazemaster-bb-instructions');
    if (barContainer) barContainer.style.display = 'none';
    if (instructions) instructions.style.display = 'none';

    // Show victory image (last image in array) and its message
    const images = currentBattlebar.profile.images || [];
    const victoryImage = images.length > 0 ? images[images.length - 1] : null;

    if (victoryImage) {
        const imgEl = document.getElementById('mazemaster_bb_img');
        if (imgEl) {
            imgEl.src = '/' + victoryImage.path;
        }
    }

    // Update stage title to show victory message from last image
    const stageTitleEl = document.getElementById('bb_stage_title');
    if (stageTitleEl) {
        const victoryMessage = victoryImage?.stageMessage || 'Victory!';
        stageTitleEl.textContent = victoryMessage;
    }

    // Change button to "Close"
    const hitBtn = document.getElementById('mazemaster_bb_hit_btn');
    if (hitBtn) {
        hitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Close';
        hitBtn.classList.add('victory');
    }

    // Execute win command
    if (currentBattlebar.profile.winCommand) {
        await executeWithTimeout(currentBattlebar.profile.winCommand);
    }
}

async function handleBattlebarLoss() {
    const profileName = extensionSettings.currentBattlebarProfile || 'default';

    // Store result for macros
    lastResults.battlebar[profileName] = {
        result: 'lose',
        hits: currentBattlebar.hits,
        misses: currentBattlebar.misses,
        timestamp: Date.now(),
    };

    // Set defeat state
    currentBattlebar.isDefeat = true;

    // Stop the arrow animation
    if (currentBattlebar.animationId) {
        cancelAnimationFrame(currentBattlebar.animationId);
        currentBattlebar.animationId = null;
    }

    // Hide the bar and instructions
    const barContainer = document.querySelector('.mazemaster-bb-bar-container');
    const instructions = document.querySelector('.mazemaster-bb-instructions');
    if (barContainer) barContainer.style.display = 'none';
    if (instructions) instructions.style.display = 'none';

    // Update stage title to show defeat
    const stageTitleEl = document.getElementById('bb_stage_title');
    if (stageTitleEl) {
        stageTitleEl.textContent = 'Defeat...';
    }

    // Change button to "Close"
    const hitBtn = document.getElementById('mazemaster_bb_hit_btn');
    if (hitBtn) {
        hitBtn.innerHTML = '<i class="fa-solid fa-times"></i> Close';
        hitBtn.classList.add('defeat');
    }

    // Execute lose command
    if (currentBattlebar.profile.loseCommand) {
        await executeWithTimeout(currentBattlebar.profile.loseCommand);
    }
}

// =============================================================================
// MAZE LOGIC
// =============================================================================

function generateMaze(size) {
    // Create grid of cells with all walls
    const grid = [];
    for (let y = 0; y < size; y++) {
        grid[y] = [];
        for (let x = 0; x < size; x++) {
            grid[y][x] = {
                walls: { top: true, right: true, bottom: true, left: true },
                visited: false,
                minion: null, // { minionId, triggered }
                trap: null // { trapId, triggered }
            };
        }
    }

    // Recursive backtracking
    const stack = [];
    let current = { x: 0, y: 0 };
    grid[0][0].visited = true;

    function getUnvisitedNeighbors(x, y) {
        const neighbors = [];
        if (y > 0 && !grid[y-1][x].visited) neighbors.push({ x, y: y-1, dir: 'top' });
        if (x < size-1 && !grid[y][x+1].visited) neighbors.push({ x: x+1, y, dir: 'right' });
        if (y < size-1 && !grid[y+1][x].visited) neighbors.push({ x, y: y+1, dir: 'bottom' });
        if (x > 0 && !grid[y][x-1].visited) neighbors.push({ x: x-1, y, dir: 'left' });
        return neighbors;
    }

    while (true) {
        const neighbors = getUnvisitedNeighbors(current.x, current.y);
        if (neighbors.length > 0) {
            const next = neighbors[Math.floor(Math.random() * neighbors.length)];
            stack.push(current);

            // Remove walls between current and next
            if (next.dir === 'top') {
                grid[current.y][current.x].walls.top = false;
                grid[next.y][next.x].walls.bottom = false;
            } else if (next.dir === 'right') {
                grid[current.y][current.x].walls.right = false;
                grid[next.y][next.x].walls.left = false;
            } else if (next.dir === 'bottom') {
                grid[current.y][current.x].walls.bottom = false;
                grid[next.y][next.x].walls.top = false;
            } else if (next.dir === 'left') {
                grid[current.y][current.x].walls.left = false;
                grid[next.y][next.x].walls.right = false;
            }

            current = { x: next.x, y: next.y };
            grid[current.y][current.x].visited = true;
        } else if (stack.length > 0) {
            current = stack.pop();
        } else {
            break;
        }
    }

    // Add extra passages for multiple pathways and dead ends
    addExtraPassages(grid, size);

    // Reset visited flags for gameplay
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            grid[y][x].visited = false;
        }
    }

    return grid;
}

// =============================================================================
// v1.2.0 MAP STYLE GENERATION ALGORITHMS
// =============================================================================

/**
 * Generate a city-style grid with streets between building blocks
 */
function generateCityGrid(size) {
    const grid = [];

    // Initialize all cells with walls
    for (let y = 0; y < size; y++) {
        grid[y] = [];
        for (let x = 0; x < size; x++) {
            grid[y][x] = {
                walls: { top: true, right: true, bottom: true, left: true },
                visited: false,
                minion: null,
                trap: null
            };
        }
    }

    // Create main street grid (every 3-4 cells)
    const streetSpacing = Math.max(3, Math.floor(size / 4));

    // Create horizontal streets
    for (let y = 0; y < size; y++) {
        if (y % streetSpacing === 1 || y === 0 || y === size - 1) {
            for (let x = 0; x < size - 1; x++) {
                grid[y][x].walls.right = false;
                grid[y][x + 1].walls.left = false;
            }
        }
    }

    // Create vertical streets
    for (let x = 0; x < size; x++) {
        if (x % streetSpacing === 1 || x === 0 || x === size - 1) {
            for (let y = 0; y < size - 1; y++) {
                grid[y][x].walls.bottom = false;
                grid[y + 1][x].walls.top = false;
            }
        }
    }

    // Add random alleys within blocks (20% chance per potential alley)
    for (let y = 0; y < size - 1; y++) {
        for (let x = 0; x < size - 1; x++) {
            if (Math.random() < 0.2) {
                const dir = Math.random() < 0.5 ? 'right' : 'bottom';
                if (dir === 'right') {
                    grid[y][x].walls.right = false;
                    grid[y][x + 1].walls.left = false;
                } else {
                    grid[y][x].walls.bottom = false;
                    grid[y + 1][x].walls.top = false;
                }
            }
        }
    }

    // Ensure start and exit are connected
    ensureConnected(grid, size, 0, 0, size - 1, size - 1);

    return grid;
}

/**
 * Generate a forest-style grid with organic winding paths
 */
function generateForestGrid(size) {
    const grid = [];

    // Initialize all cells with walls
    for (let y = 0; y < size; y++) {
        grid[y] = [];
        for (let x = 0; x < size; x++) {
            grid[y][x] = {
                walls: { top: true, right: true, bottom: true, left: true },
                visited: false,
                minion: null,
                trap: null
            };
        }
    }

    // Create main winding path from start to exit using weighted random walk
    let x = 0, y = 0;
    const visited = new Set(['0,0']);
    const path = [{ x: 0, y: 0 }];
    grid[0][0].visited = true;

    while (x !== size - 1 || y !== size - 1) {
        // Weight movement toward exit
        const directions = [];
        if (y > 0) directions.push({ dx: 0, dy: -1, weight: 0.1 });  // up (away from exit)
        if (x < size - 1) directions.push({ dx: 1, dy: 0, weight: 0.4 }); // right (toward exit)
        if (y < size - 1) directions.push({ dx: 0, dy: 1, weight: 0.4 }); // down (toward exit)
        if (x > 0) directions.push({ dx: -1, dy: 0, weight: 0.1 }); // left (away from exit)

        // Filter unvisited cells with walls
        const validDirs = directions.filter(d => {
            const nx = x + d.dx;
            const ny = y + d.dy;
            return nx >= 0 && nx < size && ny >= 0 && ny < size;
        });

        if (validDirs.length === 0) break;

        // Weighted random selection
        const totalWeight = validDirs.reduce((sum, d) => sum + d.weight, 0);
        let rand = Math.random() * totalWeight;
        let chosen = validDirs[0];
        for (const dir of validDirs) {
            rand -= dir.weight;
            if (rand <= 0) { chosen = dir; break; }
        }

        const nx = x + chosen.dx;
        const ny = y + chosen.dy;

        // Remove wall between cells
        if (chosen.dx === 1) { grid[y][x].walls.right = false; grid[ny][nx].walls.left = false; }
        if (chosen.dx === -1) { grid[y][x].walls.left = false; grid[ny][nx].walls.right = false; }
        if (chosen.dy === 1) { grid[y][x].walls.bottom = false; grid[ny][nx].walls.top = false; }
        if (chosen.dy === -1) { grid[y][x].walls.top = false; grid[ny][nx].walls.bottom = false; }

        x = nx;
        y = ny;
        visited.add(`${x},${y}`);
        path.push({ x, y });
        grid[y][x].visited = true;
    }

    // Add branch paths from main path to create exploration areas
    const branchCount = Math.floor(size * 0.8);
    for (let i = 0; i < branchCount; i++) {
        const start = path[Math.floor(Math.random() * path.length)];
        createBranchPath(grid, size, start.x, start.y, Math.floor(size / 2));
    }

    // Add clearings (open 2x2 areas)
    const clearingCount = Math.floor(size / 5);
    for (let i = 0; i < clearingCount; i++) {
        const cx = 1 + Math.floor(Math.random() * (size - 2));
        const cy = 1 + Math.floor(Math.random() * (size - 2));
        createClearing(grid, cx, cy);
    }

    // Reset visited flags
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            grid[y][x].visited = false;
        }
    }

    ensureConnected(grid, size, 0, 0, size - 1, size - 1);
    return grid;
}

/**
 * Generate a spaceship-style grid with room pods connected by corridors
 */
function generateSpaceshipGrid(size) {
    const grid = [];

    // Initialize all cells with walls
    for (let y = 0; y < size; y++) {
        grid[y] = [];
        for (let x = 0; x < size; x++) {
            grid[y][x] = {
                walls: { top: true, right: true, bottom: true, left: true },
                visited: false,
                minion: null,
                trap: null
            };
        }
    }

    // Generate room pods (2x2 or 3x3 open areas)
    const rooms = [];
    const roomCount = Math.max(4, Math.floor((size * size) / 20));

    for (let i = 0; i < roomCount * 3; i++) { // Try multiple times to place rooms
        if (rooms.length >= roomCount) break;

        const roomSize = Math.random() < 0.5 ? 2 : 3;
        const rx = Math.floor(Math.random() * (size - roomSize));
        const ry = Math.floor(Math.random() * (size - roomSize));

        // Check for overlap with existing rooms
        let overlaps = false;
        for (const room of rooms) {
            if (rx < room.x + room.size + 1 && rx + roomSize + 1 > room.x &&
                ry < room.y + room.size + 1 && ry + roomSize + 1 > room.y) {
                overlaps = true;
                break;
            }
        }

        if (!overlaps) {
            rooms.push({ x: rx, y: ry, size: roomSize });
            // Open the room
            for (let dy = 0; dy < roomSize; dy++) {
                for (let dx = 0; dx < roomSize; dx++) {
                    if (dx < roomSize - 1) {
                        grid[ry + dy][rx + dx].walls.right = false;
                        grid[ry + dy][rx + dx + 1].walls.left = false;
                    }
                    if (dy < roomSize - 1) {
                        grid[ry + dy][rx + dx].walls.bottom = false;
                        grid[ry + dy + 1][rx + dx].walls.top = false;
                    }
                }
            }
        }
    }

    // Ensure start and exit rooms exist
    if (!rooms.some(r => r.x === 0 && r.y === 0)) {
        rooms.unshift({ x: 0, y: 0, size: 2 });
        grid[0][0].walls.right = false; grid[0][1].walls.left = false;
        grid[1][0].walls.right = false; grid[1][1].walls.left = false;
        grid[0][0].walls.bottom = false; grid[1][0].walls.top = false;
        grid[0][1].walls.bottom = false; grid[1][1].walls.top = false;
    }

    // Connect rooms with corridors
    for (let i = 0; i < rooms.length - 1; i++) {
        const r1 = rooms[i];
        const r2 = rooms[i + 1];
        connectRoomsWithCorridor(grid, size, r1, r2);
    }

    // Connect last room to first to ensure full connectivity
    if (rooms.length > 2) {
        connectRoomsWithCorridor(grid, size, rooms[rooms.length - 1], rooms[0]);
    }

    ensureConnected(grid, size, 0, 0, size - 1, size - 1);
    return grid;
}

/**
 * Generate a dungeon-style grid with BSP-like chambers and hallways
 */
function generateDungeonGrid(size) {
    const grid = [];

    // Initialize all cells with walls
    for (let y = 0; y < size; y++) {
        grid[y] = [];
        for (let x = 0; x < size; x++) {
            grid[y][x] = {
                walls: { top: true, right: true, bottom: true, left: true },
                visited: false,
                minion: null,
                trap: null
            };
        }
    }

    // Create rectangular chambers
    const chambers = [];
    const minChamberSize = 2;
    const maxChamberSize = Math.max(3, Math.floor(size / 3));

    // Place chambers
    for (let attempts = 0; attempts < size * 2; attempts++) {
        const w = minChamberSize + Math.floor(Math.random() * (maxChamberSize - minChamberSize + 1));
        const h = minChamberSize + Math.floor(Math.random() * (maxChamberSize - minChamberSize + 1));
        const x = Math.floor(Math.random() * (size - w));
        const y = Math.floor(Math.random() * (size - h));

        // Check overlap
        let valid = true;
        for (const c of chambers) {
            if (x < c.x + c.w + 1 && x + w + 1 > c.x &&
                y < c.y + c.h + 1 && y + h + 1 > c.y) {
                valid = false;
                break;
            }
        }

        if (valid) {
            chambers.push({ x, y, w, h });
            // Carve out chamber
            for (let cy = y; cy < y + h; cy++) {
                for (let cx = x; cx < x + w; cx++) {
                    if (cx < x + w - 1) {
                        grid[cy][cx].walls.right = false;
                        grid[cy][cx + 1].walls.left = false;
                    }
                    if (cy < y + h - 1) {
                        grid[cy][cx].walls.bottom = false;
                        grid[cy + 1][cx].walls.top = false;
                    }
                }
            }
        }
    }

    // Ensure start chamber exists
    if (!chambers.some(c => c.x <= 1 && c.y <= 1)) {
        chambers.unshift({ x: 0, y: 0, w: 2, h: 2 });
        grid[0][0].walls.right = false; grid[0][1].walls.left = false;
        grid[1][0].walls.right = false; grid[1][1].walls.left = false;
        grid[0][0].walls.bottom = false; grid[1][0].walls.top = false;
    }

    // Connect chambers with hallways
    for (let i = 0; i < chambers.length - 1; i++) {
        const c1 = chambers[i];
        const c2 = chambers[i + 1];
        connectChambersWithHallway(grid, size, c1, c2);
    }

    // Connect first and last chambers
    if (chambers.length > 2) {
        connectChambersWithHallway(grid, size, chambers[chambers.length - 1], chambers[0]);
    }

    ensureConnected(grid, size, 0, 0, size - 1, size - 1);
    return grid;
}

/**
 * Generate grid based on map style
 */
function generateGridByStyle(size, mapStyle) {
    switch (mapStyle) {
        case 'city':
        case 'neotokyo':
            return generateCityGrid(size);
        case 'forest':
            return generateForestGrid(size);
        case 'spaceship':
        case 'spacestation':
            return generateSpaceshipGrid(size);
        case 'dungeon':
            return generateDungeonGrid(size);
        case 'outpost':
        case 'arena':
            // Use dungeon style for outposts and arenas (open rooms with corridors)
            return generateDungeonGrid(size);
        case 'college':
        case 'apartment':
        case 'hospital':
        case 'highrise':
            // Use city style for building interiors (grid-like layout)
            return generateCityGrid(size);
        case 'maze':
        default:
            return generateMaze(size);
    }
}

// Helper functions for map generation

function createBranchPath(grid, size, startX, startY, maxLength) {
    let x = startX, y = startY;
    for (let i = 0; i < maxLength; i++) {
        const dirs = [];
        if (y > 0) dirs.push({ dx: 0, dy: -1 });
        if (x < size - 1) dirs.push({ dx: 1, dy: 0 });
        if (y < size - 1) dirs.push({ dx: 0, dy: 1 });
        if (x > 0) dirs.push({ dx: -1, dy: 0 });

        if (dirs.length === 0) break;

        const chosen = dirs[Math.floor(Math.random() * dirs.length)];
        const nx = x + chosen.dx;
        const ny = y + chosen.dy;

        // Remove wall
        if (chosen.dx === 1) { grid[y][x].walls.right = false; grid[ny][nx].walls.left = false; }
        if (chosen.dx === -1) { grid[y][x].walls.left = false; grid[ny][nx].walls.right = false; }
        if (chosen.dy === 1) { grid[y][x].walls.bottom = false; grid[ny][nx].walls.top = false; }
        if (chosen.dy === -1) { grid[y][x].walls.top = false; grid[ny][nx].walls.bottom = false; }

        x = nx;
        y = ny;
    }
}

function createClearing(grid, cx, cy) {
    // Open a 2x2 area
    if (cx > 0 && cy > 0 && cx < grid[0].length - 1 && cy < grid.length - 1) {
        grid[cy][cx].walls.right = false; grid[cy][cx + 1].walls.left = false;
        grid[cy + 1][cx].walls.right = false; grid[cy + 1][cx + 1].walls.left = false;
        grid[cy][cx].walls.bottom = false; grid[cy + 1][cx].walls.top = false;
        grid[cy][cx + 1].walls.bottom = false; grid[cy + 1][cx + 1].walls.top = false;
    }
}

function connectRoomsWithCorridor(grid, size, r1, r2) {
    // Find center points of rooms
    const x1 = Math.floor(r1.x + r1.size / 2);
    const y1 = Math.floor(r1.y + r1.size / 2);
    const x2 = Math.floor(r2.x + r2.size / 2);
    const y2 = Math.floor(r2.y + r2.size / 2);

    // L-shaped corridor
    let x = x1, y = y1;

    // Move horizontally first
    while (x !== x2) {
        const nx = x < x2 ? x + 1 : x - 1;
        if (nx >= 0 && nx < size) {
            if (x < x2) { grid[y][x].walls.right = false; grid[y][nx].walls.left = false; }
            else { grid[y][x].walls.left = false; grid[y][nx].walls.right = false; }
            x = nx;
        } else break;
    }

    // Then vertically
    while (y !== y2) {
        const ny = y < y2 ? y + 1 : y - 1;
        if (ny >= 0 && ny < size) {
            if (y < y2) { grid[y][x].walls.bottom = false; grid[ny][x].walls.top = false; }
            else { grid[y][x].walls.top = false; grid[ny][x].walls.bottom = false; }
            y = ny;
        } else break;
    }
}

function connectChambersWithHallway(grid, size, c1, c2) {
    // Find edge midpoints
    const x1 = Math.floor(c1.x + c1.w / 2);
    const y1 = Math.floor(c1.y + c1.h / 2);
    const x2 = Math.floor(c2.x + c2.w / 2);
    const y2 = Math.floor(c2.y + c2.h / 2);

    // L-shaped hallway
    let x = x1, y = y1;

    // Horizontal then vertical (or vice versa randomly)
    const horizontalFirst = Math.random() < 0.5;

    if (horizontalFirst) {
        while (x !== x2) {
            const nx = x < x2 ? x + 1 : x - 1;
            if (nx >= 0 && nx < size) {
                if (x < x2) { grid[y][x].walls.right = false; grid[y][nx].walls.left = false; }
                else { grid[y][x].walls.left = false; grid[y][nx].walls.right = false; }
                x = nx;
            } else break;
        }
        while (y !== y2) {
            const ny = y < y2 ? y + 1 : y - 1;
            if (ny >= 0 && ny < size) {
                if (y < y2) { grid[y][x].walls.bottom = false; grid[ny][x].walls.top = false; }
                else { grid[y][x].walls.top = false; grid[ny][x].walls.bottom = false; }
                y = ny;
            } else break;
        }
    } else {
        while (y !== y2) {
            const ny = y < y2 ? y + 1 : y - 1;
            if (ny >= 0 && ny < size) {
                if (y < y2) { grid[y][x].walls.bottom = false; grid[ny][x].walls.top = false; }
                else { grid[y][x].walls.top = false; grid[ny][x].walls.bottom = false; }
                y = ny;
            } else break;
        }
        while (x !== x2) {
            const nx = x < x2 ? x + 1 : x - 1;
            if (nx >= 0 && nx < size) {
                if (x < x2) { grid[y][x].walls.right = false; grid[y][nx].walls.left = false; }
                else { grid[y][x].walls.left = false; grid[y][nx].walls.right = false; }
                x = nx;
            } else break;
        }
    }
}

function ensureConnected(grid, size, startX, startY, endX, endY) {
    // Use BFS to check if end is reachable from start
    const visited = new Set([`${startX},${startY}`]);
    const queue = [{ x: startX, y: startY }];

    while (queue.length > 0) {
        const { x, y } = queue.shift();
        if (x === endX && y === endY) return; // Already connected

        // Check each direction
        if (!grid[y][x].walls.top && y > 0 && !visited.has(`${x},${y - 1}`)) {
            visited.add(`${x},${y - 1}`);
            queue.push({ x, y: y - 1 });
        }
        if (!grid[y][x].walls.right && x < size - 1 && !visited.has(`${x + 1},${y}`)) {
            visited.add(`${x + 1},${y}`);
            queue.push({ x: x + 1, y });
        }
        if (!grid[y][x].walls.bottom && y < size - 1 && !visited.has(`${x},${y + 1}`)) {
            visited.add(`${x},${y + 1}`);
            queue.push({ x, y: y + 1 });
        }
        if (!grid[y][x].walls.left && x > 0 && !visited.has(`${x - 1},${y}`)) {
            visited.add(`${x - 1},${y}`);
            queue.push({ x: x - 1, y });
        }
    }

    // Not connected - carve a direct path
    let x = startX, y = startY;
    while (x !== endX || y !== endY) {
        if (x < endX) {
            grid[y][x].walls.right = false;
            grid[y][x + 1].walls.left = false;
            x++;
        } else if (y < endY) {
            grid[y][x].walls.bottom = false;
            grid[y + 1][x].walls.top = false;
            y++;
        } else break;
    }
}

/**
 * Add staircases connecting multiple floors
 */
function addStaircasesToFloors(floors, size, requireFloorKey) {
    const totalFloors = floors.length;

    for (let f = 0; f < totalFloors - 1; f++) {
        const lowerFloor = floors[f];
        const upperFloor = floors[f + 1];

        // Find suitable positions for stairs (not on start, exit, or existing features)
        const validPositions = [];
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                // Skip start (0,0) and exit (size-1, size-1)
                if ((x === 0 && y === 0) || (x === size - 1 && y === size - 1)) continue;
                // Skip cells with existing features
                const lowerCell = lowerFloor[y][x];
                const upperCell = upperFloor[y][x];
                if (lowerCell.minion || lowerCell.trap || lowerCell.chest) continue;
                if (upperCell.minion || upperCell.trap || upperCell.chest) continue;
                validPositions.push({ x, y });
            }
        }

        if (validPositions.length < 2) continue;

        // Pick 1-2 staircase locations per floor connection
        const staircaseCount = Math.min(2, Math.max(1, Math.floor(size / 5)));

        for (let s = 0; s < staircaseCount && validPositions.length > 0; s++) {
            const idx = Math.floor(Math.random() * validPositions.length);
            const pos = validPositions.splice(idx, 1)[0];

            // Add ascending staircase on lower floor
            lowerFloor[pos.y][pos.x].staircase = {
                direction: 'up',
                targetFloor: f + 1,
                targetX: pos.x,
                targetY: pos.y,
                requireKey: requireFloorKey,
            };

            // Add descending staircase on upper floor (same position)
            upperFloor[pos.y][pos.x].staircase = {
                direction: 'down',
                targetFloor: f,
                targetX: pos.x,
                targetY: pos.y,
                requireKey: false, // Going down doesn't require key
            };
        }
    }
}

/**
 * Add extra passages to create multiple pathways and dead ends
 */
function addExtraPassages(grid, size) {
    // Calculate how many extra passages based on grid size (~8% of cells)
    const extraCount = Math.floor(size * size * 0.08);

    for (let i = 0; i < extraCount; i++) {
        // Pick random cell (not on edge to avoid border issues)
        const x = 1 + Math.floor(Math.random() * (size - 2));
        const y = 1 + Math.floor(Math.random() * (size - 2));

        // Pick random direction
        const directions = ['top', 'right', 'bottom', 'left'];
        const dir = directions[Math.floor(Math.random() * 4)];

        // Remove wall if it exists (creates alternate path)
        removeWallBetweenCells(grid, x, y, dir, size);
    }
}

/**
 * Remove wall between a cell and its neighbor in a given direction
 */
function removeWallBetweenCells(grid, x, y, dir, size) {
    const cell = grid[y][x];
    if (dir === 'top' && y > 0) {
        cell.walls.top = false;
        grid[y-1][x].walls.bottom = false;
    } else if (dir === 'right' && x < size - 1) {
        cell.walls.right = false;
        grid[y][x+1].walls.left = false;
    } else if (dir === 'bottom' && y < size - 1) {
        cell.walls.bottom = false;
        grid[y+1][x].walls.top = false;
    } else if (dir === 'left' && x > 0) {
        cell.walls.left = false;
        grid[y][x-1].walls.right = false;
    }
}

/**
 * Normalize tile distribution from percentages to counts
 * Applies difficulty scaling multipliers
 */
function normalizeTileDistribution(profile, totalValidCells) {
    const result = {
        minionPlacements: [],
        trapPlacements: [],
        chestCount: 0,
    };

    // Get difficulty settings for scaling
    const difficulty = getDifficultySettings(profile);
    const encounterMult = difficulty.encounterDensityMult || 1.0;
    const trapMult = difficulty.trapFrequencyMult || 1.0;

    // Calculate raw percentages
    const chestPercent = profile.chestTilePercent || 0;
    const minionEncounters = profile.minionEncounters || [];
    const trapEncounters = profile.trapEncounters || [];

    // Apply difficulty multipliers to percentages
    let totalMinionPercent = minionEncounters.reduce((sum, e) => sum + ((e.percent || 0) * encounterMult), 0);
    let totalTrapPercent = trapEncounters.reduce((sum, e) => sum + ((e.percent || 0) * trapMult), 0);

    // Calculate total allocation
    const totalPercent = chestPercent + totalMinionPercent + totalTrapPercent;

    // Scale down proportionally if over 100%
    let scale = 1;
    if (totalPercent > 100) {
        scale = 100 / totalPercent;
        console.log(`[MazeMaster] Distribution over 100% (${totalPercent}%), scaling down by ${scale.toFixed(2)}`);
    }

    // Calculate chest count
    result.chestCount = Math.floor(totalValidCells * (chestPercent * scale) / 100);

    // Convert minion percentages to counts (with difficulty scaling)
    for (const encounter of minionEncounters) {
        const scaledPercent = (encounter.percent || 0) * encounterMult * scale;
        const count = Math.floor(totalValidCells * scaledPercent / 100);
        if (count > 0) {
            result.minionPlacements.push({ minionId: encounter.minionId, count });
        }
    }

    // Convert trap percentages to counts (with difficulty scaling)
    for (const encounter of trapEncounters) {
        const scaledPercent = (encounter.percent || 0) * trapMult * scale;
        const count = Math.floor(totalValidCells * scaledPercent / 100);
        if (count > 0) {
            result.trapPlacements.push({ trapId: encounter.trapId, count });
        }
    }

    return result;
}

/**
 * Determine chest type based on profile settings
 */
function determineChestType(profile) {
    const roll = Math.random() * 100;
    if (roll < (profile.chestMimicPercent || 0)) return 'mimic';
    if (roll < (profile.chestMimicPercent || 0) + (profile.chestLockedPercent || 0)) return 'locked';
    return 'normal';
}

/**
 * Place tiles (chests and minions) on the maze based on profile configuration
 */
function placeTiles(grid, profile, size) {
    // Collect all valid cells (not start, not exit)
    const validCells = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if ((x === 0 && y === 0) || (x === size-1 && y === size-1)) continue;
            validCells.push({ x, y });
        }
    }

    // Shuffle valid cells
    shuffleArray(validCells);

    const distribution = normalizeTileDistribution(profile, validCells.length);
    let cellIndex = 0;

    // Place chests first
    for (let i = 0; i < distribution.chestCount && cellIndex < validCells.length; i++) {
        const cell = validCells[cellIndex++];
        const chestType = determineChestType(profile);
        grid[cell.y][cell.x].chest = { type: chestType, opened: false };
    }

    // Place minions
    const minionStartIndex = cellIndex;
    for (const placement of distribution.minionPlacements) {
        for (let i = 0; i < placement.count && cellIndex < validCells.length; i++) {
            const cell = validCells[cellIndex++];
            grid[cell.y][cell.x].minion = { minionId: placement.minionId, triggered: false };
        }
    }
    const minionCount = cellIndex - minionStartIndex;

    // Place traps
    const trapStartIndex = cellIndex;
    for (const placement of distribution.trapPlacements) {
        for (let i = 0; i < placement.count && cellIndex < validCells.length; i++) {
            const cell = validCells[cellIndex++];
            grid[cell.y][cell.x].trap = { trapId: placement.trapId, triggered: false };
        }
    }
    const trapCount = cellIndex - trapStartIndex;

    // Place portals (use remaining valid cells for random placement)
    const remainingCells = validCells.slice(cellIndex);
    const placedPortals = placePortals(grid, profile, size, remainingCells);

    console.log(`[MazeMaster] Placed ${distribution.chestCount} chests, ${minionCount} minions, ${trapCount} traps`);

    return { placedPortals: placedPortals || [] };
}

/**
 * Helper: Shuffle array in place (Fisher-Yates)
 */
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

/**
 * Helper: Get random element from array
 */
function getRandomFromArray(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Helper: Promise-based delay
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getCellSize(gridSize) {
    // Delegate to the current renderer
    return RendererRegistry.getRenderer().getCellSize(gridSize);
}

function startMaze(profileName) {
    const profile = getMazeProfile(profileName);
    if (!profile) {
        console.error(`[MazeMaster] Maze profile "${profileName}" not found`);
        return { error: `Profile "${profileName}" not found` };
    }

    const size = profile.gridSize || 10;
    const mapStyle = profile.mapStyle || 'maze';
    const totalFloors = Math.max(1, Math.min(10, profile.floors || 1));

    // Generate all floors
    const floors = [];
    const exitX = size - 1;
    const exitY = size - 1;
    for (let f = 0; f < totalFloors; f++) {
        const floorGrid = generateGridByStyle(size, mapStyle);
        placeTiles(floorGrid, profile, size);
        // v1.2.1: Generate room names for each cell
        generateRoomInfoForGrid(floorGrid, profile, size, exitX, exitY);
        floors.push(floorGrid);
    }

    // Add staircases between floors
    if (totalFloors > 1) {
        addStaircasesToFloors(floors, size, profile.requireFloorKey || false);
    }

    // Use first floor as active grid
    const grid = floors[0];

    // Get starting inventory config with difficulty scaling
    const baseStartInv = profile.startingInventory || { key: 0, stealth: 0, pow: 0, grandpow: 0 };
    const difficulty = getDifficultySettings(profile);
    const invMult = difficulty.inventoryStartMult || 1.0;
    const startInv = {
        key: Math.floor((baseStartInv.key || 0) * invMult),
        stealth: Math.floor((baseStartInv.stealth || 0) * invMult),
        pow: Math.floor((baseStartInv.pow || 0) * invMult),
        grandpow: Math.floor((baseStartInv.grandpow || 0) * invMult),
        // v1.2.0 new items
        floorKey: Math.floor((baseStartInv.floorKey || 0) * invMult),
        portalStone: Math.floor((baseStartInv.portalStone || 0) * invMult),
        minionBane: Math.floor((baseStartInv.minionBane || 0) * invMult),
        mapFragment: Math.floor((baseStartInv.mapFragment || 0) * invMult),
        timeShard: Math.floor((baseStartInv.timeShard || 0) * invMult),
        voidWalk: Math.floor((baseStartInv.voidWalk || 0) * invMult),
    };

    // Determine initial minion display (main story, main minion intro, or default)
    let initialMinion = getDefaultMinion();
    const mainMinion = profile.mainMinion ? getMinion(profile.mainMinion) : null;

    // Use main story if available, otherwise use main minion intro
    if (profile.storyConfig?.mainStory) {
        initialMinion = {
            name: mainMinion?.name || 'Story',
            role: 'Narrator',
            imagePath: mainMinion?.imagePath || '',
            message: profile.storyConfig.mainStory,
        };
    } else if (mainMinion) {
        initialMinion = {
            name: mainMinion.name,
            role: 'Main Minion',
            imagePath: mainMinion.imagePath,
            message: profile.mainMinionIntroMessage || 'Welcome to my maze...',
        };
    }

    currentMaze = {
        isOpen: true,
        profile: profile,
        profileName: profileName,
        grid: grid,
        size: size,
        playerX: 0,
        playerY: 0,
        exitX: size - 1,
        exitY: size - 1,
        visited: new Set(['0:0,0']),  // Format: "floor:x,y"
        isVictory: false,
        currentMinion: initialMinion,
        // Encounter system
        isPaused: false,
        pendingEncounter: null,
        exitEncounterDone: false,
        pendingConfirmation: null,
        pendingChest: null,
        // Inventory
        inventory: {
            key: startInv.key || 0,
            stealth: startInv.stealth || 0,
            pow: startInv.pow || 0,
            grandpow: startInv.grandpow || 0,
            // v1.2.0 new items
            floorKey: startInv.floorKey || 0,
            portalStone: startInv.portalStone || 0,
            minionBane: startInv.minionBane || 0,
            mapFragment: startInv.mapFragment || 0,
            timeShard: startInv.timeShard || 0,
            voidWalk: startInv.voidWalk || 0,
        },
        // Story milestones
        shownMilestones: new Set(),
        // Statistics tracking
        stats: initSessionStats(),
        explorationComplete: false,
        // Moving enemies
        moveCount: 0,
        movingMinions: [],
        // Teleport tiles
        portals: [],
        // Quest/Objective system
        objectiveProgress: initObjectives(profile),
        allObjectivesComplete: false,
        // v1.2.0 Multi-floor
        currentFloor: 0,
        totalFloors: totalFloors,
        floors: floors,
        voidWalkActive: false,
        messageLog: [],  // v1.2.1: Persistent message history
    };

    // Initialize moving minions after maze state is created
    currentMaze.movingMinions = initMovingMinions(grid, size);

    showMazeModal();
    renderMazeGrid();
    updatePlayerPosition(false); // Set initial position without animation
    updateMazeHero();
    updateRoomInfoBox();  // v1.2.1: Update room info display
    updateInventoryDisplay();
    updateStatsDisplay();
    updateObjectivesDisplay();
    startStatsTimer();

    // v1.2.0: Update multi-floor UI
    updateFloorIndicator();
    updateDpadFloorButtons();

    document.addEventListener('keydown', handleMazeKeydown, { capture: true });

    console.log(`[MazeMaster] Maze "${profileName}" started (${size}x${size}, ${totalFloors} floor${totalFloors > 1 ? 's' : ''})`);
    return { success: true };
}

function showMazeModal() {
    // Remove existing modal if any
    const existing = document.getElementById('mazemaster_maze_modal');
    if (existing) existing.remove();

    const cellSize = getCellSize(currentMaze.size);

    const modal = document.createElement('div');
    modal.id = 'mazemaster_maze_modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.95);';
    modal.innerHTML = `
        <div class="mazemaster-maze-overlay">
            <div class="mazemaster-maze-container">
                <!-- TOP PANEL: Info & Controls -->
                <div class="mazemaster-maze-top">
                    <!-- Left Column: Message Box, Stats, Inventory -->
                    <div class="mazemaster-maze-left-column">
                        <!-- Hero Section (Message Box) -->
                        <div class="mazemaster-maze-hero">
                            <div class="mazemaster-maze-hero-content">
                                <div class="mazemaster-maze-hero-avatar">
                                    <img id="maze_minion_img" src="" alt="" style="display: none;">
                                    <div id="maze_generating_indicator" class="maze-generating-indicator">
                                        <i class="fa-solid fa-comment-dots"></i>
                                    </div>
                                </div>
                                <div class="maze-hero-text">
                                    <div id="maze_minion_name" class="maze-minion-name"></div>
                                    <div id="maze_minion_role" class="maze-minion-role"></div>
                                    <div id="maze_message_log" class="maze-message-log"></div>
                                </div>
                            </div>
                        </div>

                    <!-- ROW 2: Stats and Inventory -->
                    <div class="mazemaster-maze-info-stack">
                        <!-- Stats Bar -->
                        <div class="mazemaster-maze-stats-bar">
                            <div class="stats-item" title="Moves">
                                <i class="fa-solid fa-shoe-prints"></i>
                                <span id="maze_stat_moves">0</span>
                            </div>
                            <div class="stats-item" title="Time Elapsed">
                                <i class="fa-solid fa-clock"></i>
                                <span id="maze_stat_time">0:00</span>
                            </div>
                            <div class="stats-item" title="Exploration">
                                <i class="fa-solid fa-map"></i>
                                <span id="maze_stat_explore">0%</span>
                            </div>
                            <div class="stats-item" title="Difficulty">
                                <i class="fa-solid fa-skull"></i>
                                <span id="maze_stat_difficulty">${getDifficultySettings(currentMaze.profile).name}</span>
                            </div>
                            <div class="stats-item maze-floor-indicator" title="Current Floor" style="${currentMaze.totalFloors <= 1 ? 'display:none;' : ''}">
                                <i class="fa-solid fa-layer-group"></i>
                                <span><span id="maze_floor_current">${currentMaze.currentFloor + 1}</span>/<span id="maze_floor_total">${currentMaze.totalFloors}</span></span>
                            </div>
                        </div>

                        <!-- Inventory (clickable to expand drawer) -->
                        <div class="mazemaster-maze-inventory" id="maze_inventory_bar">
                            <div class="inventory-item" title="Keys - Unlock locked chests">
                                <i class="fa-solid fa-key"></i>
                                <span id="maze_inv_key">${currentMaze.inventory.key}</span>
                            </div>
                            <div class="inventory-item" title="Stealth - Sneak past enemies">
                                <i class="fa-solid fa-user-ninja"></i>
                                <span id="maze_inv_stealth">${currentMaze.inventory.stealth}</span>
                            </div>
                            <div class="inventory-item" title="POW - Combat boost">
                                <i class="fa-solid fa-bolt"></i>
                                <span id="maze_inv_pow">${currentMaze.inventory.pow}</span>
                            </div>
                            <div class="inventory-item grandpow" title="GRANDPOW - Instant Win!">
                                <i class="fa-solid fa-star"></i>
                                <span id="maze_inv_grandpow">${currentMaze.inventory.grandpow}</span>
                            </div>
                            <div class="inventory-item floor-key" title="Floor Key - Unlock staircases">
                                <i class="fa-solid fa-stairs"></i>
                                <span id="maze_inv_floorKey">${currentMaze.inventory.floorKey}</span>
                            </div>
                            <div class="inventory-item portal-stone" title="Portal Stone - Teleport to any revealed portal" data-usable="true">
                                <i class="fa-solid fa-gem"></i>
                                <span id="maze_inv_portalStone">${currentMaze.inventory.portalStone}</span>
                            </div>
                            <div class="inventory-item minion-bane" title="Minion Bane - Auto-defeat next minion">
                                <i class="fa-solid fa-skull-crossbones"></i>
                                <span id="maze_inv_minionBane">${currentMaze.inventory.minionBane}</span>
                            </div>
                            <div class="inventory-item map-fragment" title="Map Fragment - Reveal 3x3 area (click to use)" data-usable="true">
                                <i class="fa-solid fa-scroll"></i>
                                <span id="maze_inv_mapFragment">${currentMaze.inventory.mapFragment}</span>
                            </div>
                            <div class="inventory-item time-shard" title="Time Shard - Slow next battlebar by 50%">
                                <i class="fa-solid fa-hourglass-half"></i>
                                <span id="maze_inv_timeShard">${currentMaze.inventory.timeShard}</span>
                            </div>
                            <div class="inventory-item void-walk" title="Void Walk - Phase through one wall (click to activate)" data-usable="true">
                                <i class="fa-solid fa-ghost"></i>
                                <span id="maze_inv_voidWalk">${currentMaze.inventory.voidWalk}</span>
                            </div>
                            <div class="inventory-expand-icon">
                                <i class="fa-solid fa-chevron-down"></i>
                            </div>
                        </div>

                        <!-- Inventory Drawer (expands on click) -->
                        <div id="maze_inventory_drawer" class="maze-inventory-drawer hidden">
                            <div class="inventory-drawer-content">
                                <!-- Populated dynamically -->
                            </div>
                        </div>
                    </div>

                    <!-- Objectives Section (if any) -->
                    <div class="maze-objectives-section ${(currentMaze.profile?.objectives?.length || 0) === 0 ? 'hidden' : ''}">
                        <div class="objectives-header">
                            <i class="fa-solid fa-list-check"></i>
                            <span>Objectives</span>
                        </div>
                        <div id="maze_objectives_list" class="objectives-list">
                            <!-- Populated by updateObjectivesDisplay() -->
                        </div>
                    </div>
                    </div>

                    <!-- ROOM INFO BOX (right side, full height) -->
                    <div class="mazemaster-maze-room-info" id="maze_room_info">
                        <div class="room-info-content">
                            <div class="room-info-name" id="room_info_name">Unknown Room</div>
                            <div class="room-info-desc" id="room_info_desc">...</div>
                            <div class="room-info-section">
                                <div class="room-info-label"><i class="fa-solid fa-compass"></i> Exits</div>
                                <div id="room_info_exits">None</div>
                            </div>
                            <div class="room-info-section">
                                <div class="room-info-label"><i class="fa-solid fa-users"></i> Occupants</div>
                                <div id="room_info_occupants">None</div>
                            </div>
                            <div class="room-info-section">
                                <div class="room-info-label"><i class="fa-solid fa-skull"></i> Defeated</div>
                                <div id="room_info_defeated">None</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Power Button (top right corner) -->
                <button id="maze_power_btn" class="maze-power-btn" title="Exit Maze">
                    <i class="fa-solid fa-power-off"></i>
                </button>

                <!-- Encounter Actions (shows when needed) -->
                <div id="maze_encounter_confirm" class="maze-action-buttons">
                    <!-- Populated dynamically when encounter happens -->
                </div>

                <!-- BOTTOM PANEL: Map Area -->
                <div class="mazemaster-maze-bottom">
                    <div class="mazemaster-maze-area">
                        <div id="maze_grid_container" class="mazemaster-maze-grid-wrapper" style="position: relative;">
                            <!-- Renderer inserts grid/canvas here -->
                        </div>
                    </div>
                </div>

                <!-- Circular D-Pad (floating) -->
                <div id="maze_dpad" class="maze-dpad ${extensionSettings.dpadConfig?.floating ? 'floating' : ''}"
                     style="${extensionSettings.dpadConfig?.position?.x ? `left: ${extensionSettings.dpadConfig.position.x}px; top: ${extensionSettings.dpadConfig.position.y}px;` : ''}">
                    <div class="dpad-ring">
                        <button class="dpad-btn dpad-up" data-dir="up" title="Move Up (Arrow Up)">
                            <i class="fa-solid fa-chevron-up"></i>
                        </button>
                        <button class="dpad-btn dpad-right" data-dir="right" title="Move Right (Arrow Right)">
                            <i class="fa-solid fa-chevron-right"></i>
                        </button>
                        <button class="dpad-btn dpad-down" data-dir="down" title="Move Down (Arrow Down)">
                            <i class="fa-solid fa-chevron-down"></i>
                        </button>
                        <button class="dpad-btn dpad-left" data-dir="left" title="Move Left (Arrow Left)">
                            <i class="fa-solid fa-chevron-left"></i>
                        </button>
                        <!-- Floor navigation buttons (shown when on staircase) -->
                        <button class="dpad-btn dpad-floor-up hidden" data-dir="floor-up" title="Go Up Floor (Shift+Up)">
                            <i class="fa-solid fa-arrow-up"></i><span>UP</span>
                        </button>
                        <button class="dpad-btn dpad-floor-down hidden" data-dir="floor-down" title="Go Down Floor (Shift+Down)">
                            <i class="fa-solid fa-arrow-down"></i><span>DN</span>
                        </button>
                    </div>
                    <div class="dpad-center"></div>
                    <div class="dpad-drag-handle" title="Drag to reposition">
                        <i class="fa-solid fa-grip"></i>
                    </div>
                </div>

                <!-- Close Button (shown on victory) -->
                <button id="maze_close_btn" class="menu_button menu_button_primary maze-close-btn" style="display: none;">
                    <i class="fa-solid fa-check"></i> Close
                </button>
            </div>
        </div>

        <style>
            .mazemaster-maze-overlay {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                height: 100%;
                overflow-y: auto;
                -webkit-overflow-scrolling: touch;
            }

            .mazemaster-maze-container {
                position: relative;
                display: flex;
                flex-direction: column;
                gap: 12px;
                padding: 15px;
                width: 90vw;
                max-width: 1200px;
                height: 94vh;
                max-height: 960px;
                margin: 10px;
                background: #1a1a2e;
                border-radius: 15px;
                border: 2px solid #333;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
                overflow: hidden;
            }

            /* Top Panel - Info & Controls */
            .mazemaster-maze-top {
                display: flex;
                flex-direction: row;
                gap: 16px;
                flex-shrink: 0;
                min-height: 240px;
                height: 280px;
            }

            /* Left Column - Message Box, Stats, Inventory stacked */
            .mazemaster-maze-left-column {
                display: flex;
                flex-direction: column;
                gap: 8px;
                width: 50.1%;
                flex-shrink: 0;
            }

            /* Info Stack - Stats and Inventory */
            .mazemaster-maze-info-stack {
                display: flex;
                flex-direction: column;
                gap: 8px;
                width: 100%;
                position: relative;
            }

            /* ROOM INFO BOX - right side, full height */
            .mazemaster-maze-room-info {
                flex: 1;
                margin-right: 46px; /* Space for power button */
                background: rgba(0, 0, 0, 0.3);
                border-radius: 8px;
                padding: 10px 12px;
                border: 1px solid #444;
                display: flex;
                flex-direction: column;
            }

            .room-info-content {
                flex: 1;
                display: flex;
                flex-direction: column;
                color: #aaa;
                font-size: 0.9em;
                gap: 8px;
                overflow-y: auto;
            }

            .room-info-name {
                font-size: 1.1em;
                font-weight: 600;
                color: #ecf0f1;
                margin-bottom: 2px;
            }

            .room-info-desc {
                font-style: italic;
                color: #bdc3c7;
                font-size: 0.9em;
                line-height: 1.3;
                padding-bottom: 8px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }

            .room-info-section {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .room-info-label {
                font-size: 0.75em;
                color: #7f8c8d;
                text-transform: uppercase;
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .room-info-label i {
                font-size: 0.9em;
                color: #3498db;
            }

            .room-info-section > div:last-child {
                color: #ecf0f1;
                font-size: 0.95em;
            }

            .maze-hero-text {
                display: flex;
                flex-direction: column;
                flex: 1;
                min-width: 0;
            }

            /* Power Button - Top Right Corner */
            .maze-power-btn {
                position: absolute;
                top: 16px;
                right: 10px;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                border: 2px solid #e94560;
                background: rgba(233, 69, 96, 0.2);
                color: #e94560;
                font-size: 18px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                z-index: 100;
            }

            .maze-power-btn:hover {
                background: #e94560;
                color: #fff;
                transform: scale(1.1);
            }

            /* Save Dialog */
            #maze_save_dialog {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 1000;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .maze-save-dialog-backdrop {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
            }

            .maze-save-dialog-content {
                position: relative;
                background: #1a1a2e;
                border: 2px solid #4a90d9;
                border-radius: 12px;
                padding: 24px 32px;
                text-align: center;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            }

            .maze-save-dialog-title {
                color: #fff;
                font-size: 18px;
                font-weight: 600;
                margin-bottom: 20px;
            }

            .maze-save-dialog-buttons {
                display: flex;
                gap: 12px;
                justify-content: center;
            }

            .maze-save-btn {
                padding: 10px 24px;
                border-radius: 6px;
                border: none;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .maze-save-yes {
                background: #27ae60;
                color: #fff;
            }

            .maze-save-yes:hover {
                background: #2ecc71;
            }

            .maze-save-no {
                background: #e74c3c;
                color: #fff;
            }

            .maze-save-no:hover {
                background: #c0392b;
            }

            .maze-save-cancel {
                background: #7f8c8d;
                color: #fff;
            }

            .maze-save-cancel:hover {
                background: #95a5a6;
            }

            /* Bottom Panel - Map Area */
            .mazemaster-maze-bottom {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: flex-end;
                flex: 1;
                min-height: 200px;
                padding-bottom: 15px;
                overflow: auto;
            }

            /* Hero Section - Minion Area (fills remaining height) */
            .mazemaster-maze-hero {
                display: flex;
                flex-direction: column;
                flex: 1;
                width: 100%;
                background: rgba(0, 0, 0, 0.3);
                border-radius: 8px;
                padding: 10px 12px;
                border: 1px solid #444;
                min-height: 80px;
            }

            .maze-minion-name {
                font-weight: bold;
                font-size: 1.2em;
                color: #e94560;
                flex-shrink: 0;
                margin-bottom: 0;
            }

            .maze-minion-role {
                font-size: 0.8em;
                color: #f1c40f;
                flex-shrink: 0;
                margin-bottom: 4px;
            }

            .mazemaster-maze-hero-content {
                display: flex;
                gap: 10px;
                align-items: flex-start;
                flex: 1;
            }

            .mazemaster-maze-hero-avatar {
                width: 72px;
                height: 72px;
                min-width: 72px;
                flex-shrink: 0;
                border-radius: 6px;
                overflow: hidden;
                background: #16213e;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
            }

            .mazemaster-maze-hero-avatar img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                object-position: center top;
                display: block;
            }

            /* LLM Generating Indicator - overlays the entire image */
            .maze-generating-indicator {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(52, 152, 219, 0.7);
                border-radius: 8px;
                display: none;
                align-items: center;
                justify-content: center;
                z-index: 10;
            }

            .maze-generating-indicator.active {
                display: flex;
            }

            .maze-generating-indicator i {
                color: #fff;
                font-size: 32px;
                animation: maze-pulse 1s ease-in-out infinite;
                text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
            }

            @keyframes maze-pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.2); opacity: 0.7; }
            }

            .maze-message-log {
                flex: 1;
                color: #eee;
                line-height: 1.4;
                font-size: 0.9em;
                overflow-y: auto;
                max-height: 120px;
                display: flex;
                flex-direction: column;
                gap: 4px;
                padding-right: 4px;
            }

            .maze-message-log::-webkit-scrollbar {
                width: 6px;
            }

            .maze-message-log::-webkit-scrollbar-track {
                background: rgba(0, 0, 0, 0.2);
                border-radius: 3px;
            }

            .maze-message-log::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.3);
                border-radius: 3px;
            }

            .maze-message-log::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.5);
            }

            .maze-message-entry {
                padding: 4px 8px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 6px;
                border-left: 3px solid rgba(52, 152, 219, 0.6);
            }

            .maze-message-entry:last-child {
                border-left-color: rgba(46, 204, 113, 0.8);
            }

            .maze-message-speaker {
                font-weight: 600;
                color: #3498db;
                font-size: 0.85em;
                margin-bottom: 2px;
            }

            .maze-message-text {
                font-style: italic;
                color: #ecf0f1;
            }

            /* Stats Bar */
            .mazemaster-maze-stats-bar {
                display: flex;
                justify-content: center;
                flex-wrap: wrap;
                gap: 12px;
                width: 100%;
                padding: 6px 12px;
                background: linear-gradient(135deg, rgba(52, 73, 94, 0.4) 0%, rgba(44, 62, 80, 0.4) 100%);
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            .stats-item {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 0.85em;
                color: #bdc3c7;
            }

            .stats-item i {
                color: #3498db;
                font-size: 0.9em;
            }

            .stats-item span {
                font-weight: 500;
                color: #ecf0f1;
            }

            /* Objectives Section */
            .maze-objectives-section {
                width: 550px;
                max-width: 95vw;
                padding: 8px 12px;
                background: linear-gradient(135deg, rgba(52, 73, 94, 0.4) 0%, rgba(44, 62, 80, 0.4) 100%);
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            .maze-objectives-section.hidden {
                display: none;
            }

            .maze-objectives-section .objectives-header {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 0.8em;
                color: #95a5a6;
                margin-bottom: 6px;
            }

            .maze-objectives-section .objectives-list {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .maze-objectives-section .objective-item {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 0.85em;
                padding: 4px 8px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 4px;
            }

            .maze-objectives-section .objective-item i {
                font-size: 0.9em;
            }

            .maze-objectives-section .objective-description {
                flex: 1;
            }

            .maze-objectives-section .objective-progress {
                font-weight: 500;
                font-size: 0.9em;
            }

            .maze-objectives-section .objective-required i {
                color: #e74c3c;
            }

            .maze-objectives-section .objective-optional i {
                color: #95a5a6;
            }

            .maze-objectives-section .objective-complete {
                opacity: 0.7;
            }

            .maze-objectives-section .objective-complete i {
                color: #27ae60 !important;
            }

            .maze-objectives-section.objectives-flash {
                animation: objectives-flash-anim 0.5s ease-out;
            }

            @keyframes objectives-flash-anim {
                0%, 100% {
                    border-color: rgba(255, 255, 255, 0.1);
                }
                50% {
                    border-color: #e74c3c;
                    box-shadow: 0 0 10px rgba(231, 76, 60, 0.5);
                }
            }

            /* Player Overlay for Smooth Movement Animation */
            .maze-player-overlay {
                position: absolute;
                top: 2px;
                left: 2px;
                pointer-events: none;
                z-index: 10;
                transition: transform 0.15s ease-out;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .maze-player-marker {
                width: 60%;
                height: 60%;
                background: radial-gradient(circle, #4ecdc4 0%, #2d8f8f 100%);
                border-radius: 50%;
                box-shadow: 0 0 10px rgba(78, 205, 196, 0.6), 0 0 20px rgba(78, 205, 196, 0.3);
                animation: player-pulse 1.5s ease-in-out infinite;
            }

            @keyframes player-pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.1); opacity: 0.9; }
            }

            .maze-player-overlay.teleporting .maze-player-marker {
                animation: teleport-flash 0.2s ease-out;
            }

            @keyframes teleport-flash {
                0% { opacity: 1; transform: scale(1); }
                50% { opacity: 0; transform: scale(0.2); }
                100% { opacity: 1; transform: scale(1); }
            }

            /* Control Bar */
            .maze-action-buttons {
                display: flex;
                gap: 6px;
                justify-content: center;
                flex-wrap: wrap;
            }

            .mazemaster-maze-inventory {
                display: flex;
                flex-wrap: wrap;
                justify-content: space-evenly;
                background: rgba(0, 0, 0, 0.3);
                padding: 8px 12px;
                border-radius: 6px;
            }

            .inventory-item {
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 0.9em;
            }

            /* Inventory item icon colors */
            .inventory-item i.fa-key { color: #f1c40f; }
            .inventory-item i.fa-user-ninja { color: #9b59b6; }
            .inventory-item i.fa-bolt { color: #e74c3c; }
            .inventory-item.grandpow i { color: #ffd700; text-shadow: 0 0 4px #ffd700; }
            .inventory-item.floor-key i { color: #3498db; }
            .inventory-item.portal-stone i { color: #9b59b6; }
            .inventory-item.minion-bane i { color: #c0392b; }
            .inventory-item.map-fragment i { color: #27ae60; }
            .inventory-item.time-shard i { color: #f39c12; }
            .inventory-item.void-walk i { color: #7f8c8d; }

            /* Inventory expand icon */
            .inventory-expand-icon {
                margin-left: auto;
                padding-left: 8px;
                color: #888;
                cursor: pointer;
                transition: transform 0.2s;
            }
            .mazemaster-maze-inventory.expanded .inventory-expand-icon {
                transform: rotate(180deg);
            }
            .mazemaster-maze-inventory {
                cursor: pointer;
            }

            /* Inventory Drawer */
            .maze-inventory-drawer {
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background: rgba(26, 26, 46, 0.98);
                border: 1px solid #444;
                border-top: none;
                border-radius: 0 0 8px 8px;
                padding: 10px 12px;
                z-index: 200;
                max-height: 300px;
                overflow-y: auto;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            }
            .maze-inventory-drawer.hidden {
                display: none;
            }
            .inventory-drawer-content {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .inventory-drawer-item {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 6px 8px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 4px;
            }
            .inventory-drawer-item.empty {
                opacity: 0.4;
            }
            .inventory-drawer-item i {
                width: 20px;
                text-align: center;
            }
            .inventory-drawer-item .item-name {
                flex: 1;
                font-size: 0.9em;
            }
            .inventory-drawer-item .item-count {
                font-weight: bold;
                min-width: 24px;
                text-align: right;
            }
            /* Drawer item icon colors - match the bar */
            .inventory-drawer-item i.fa-key { color: #f1c40f; }
            .inventory-drawer-item i.fa-user-ninja { color: #9b59b6; }
            .inventory-drawer-item i.fa-bolt { color: #e74c3c; }
            .inventory-drawer-item.grandpow i { color: #ffd700; text-shadow: 0 0 4px #ffd700; }
            .inventory-drawer-item.floor-key i { color: #3498db; }
            .inventory-drawer-item.portal-stone i { color: #9b59b6; }
            .inventory-drawer-item.minion-bane i { color: #c0392b; }
            .inventory-drawer-item.map-fragment i { color: #27ae60; }
            .inventory-drawer-item.time-shard i { color: #f39c12; }
            .inventory-drawer-item.void-walk i { color: #7f8c8d; }

            /* Usable items have click cursor and glow */
            .inventory-item[data-usable="true"] {
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
            }
            .inventory-item[data-usable="true"]:hover {
                transform: scale(1.1);
                text-shadow: 0 0 8px currentColor;
            }
            .inventory-item.hidden { display: none; }

            .mazemaster-maze-save-exit {
                display: flex;
                gap: 8px;
                justify-content: center;
                margin-top: auto;
                padding-top: 10px;
            }

            /* Maze Area */
            .mazemaster-maze-area {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                height: 100%;
                overflow: hidden;
                cursor: grab;
                user-select: none;
                background: #0a0a1a;
                border-radius: 8px;
            }

            .mazemaster-maze-grid-wrapper {
                flex: 1;
                display: flex;
                justify-content: center;
            }

            /* Circular D-Pad */
            .maze-dpad {
                position: absolute;
                bottom: 60px;
                right: 20px;
                width: 140px;
                height: 140px;
                z-index: 100;
            }

            .maze-dpad.floating {
                position: fixed;
                z-index: 10001;
                bottom: 20px;
                right: 20px;
            }

            .dpad-ring {
                position: relative;
                width: 100%;
                height: 100%;
                border-radius: 50%;
                background: radial-gradient(circle, #2c3e50 0%, #1a1a2e 100%);
                border: 3px solid var(--theme-primary, #3498db);
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
            }

            .dpad-btn {
                position: absolute;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: linear-gradient(to bottom, var(--theme-primary, #3498db), var(--theme-secondary, #2980b9));
                border: 2px solid var(--theme-accent, #5dade2);
                color: white;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.15s;
                font-size: 1em;
            }

            .dpad-btn:hover {
                transform: scale(1.1);
                filter: brightness(1.2);
            }

            .dpad-btn:active {
                transform: scale(0.95);
            }

            .dpad-up { top: 5px; left: 50%; transform: translateX(-50%); }
            .dpad-right { right: 5px; top: 50%; transform: translateY(-50%); }
            .dpad-down { bottom: 5px; left: 50%; transform: translateX(-50%); }
            .dpad-left { left: 5px; top: 50%; transform: translateY(-50%); }

            .dpad-center {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 30px;
                height: 30px;
                border-radius: 50%;
                background: #1a1a2e;
                border: 2px solid #34495e;
            }

            /* Floor navigation buttons */
            .dpad-floor-up, .dpad-floor-down {
                width: 50px;
                height: 36px;
                border-radius: 8px;
                font-size: 0.65em;
                background: linear-gradient(to bottom, #27ae60, #1e8449);
                border-color: #2ecc71;
                flex-direction: column;
                gap: 2px;
            }

            .dpad-floor-up { top: 50%; left: -58px; transform: translateY(-50%); }
            .dpad-floor-down { top: 50%; right: -58px; transform: translateY(-50%); }

            .dpad-floor-up.hidden, .dpad-floor-down.hidden {
                display: none;
            }

            .dpad-drag-handle {
                position: absolute;
                bottom: -22px;
                left: 50%;
                transform: translateX(-50%);
                padding: 3px 8px;
                background: rgba(0, 0, 0, 0.5);
                border-radius: 4px;
                color: #666;
                font-size: 0.75em;
                cursor: grab;
                display: none;
            }

            .maze-dpad.floating .dpad-drag-handle {
                display: block;
            }

            .maze-dpad:not(.floating) .dpad-drag-handle {
                display: none;
            }

            /* Void Walk active indicator */
            .maze-dpad.void-walk-active .dpad-ring {
                animation: void-walk-pulse 1s infinite;
                border-color: #7f8c8d;
            }
            .maze-dpad.void-walk-active .dpad-btn {
                background: linear-gradient(to bottom, #7f8c8d, #5d6d7e);
                border-color: #95a5a6;
            }
            @keyframes void-walk-pulse {
                0%, 100% { box-shadow: 0 4px 15px rgba(127, 140, 141, 0.5); }
                50% { box-shadow: 0 4px 25px rgba(127, 140, 141, 0.8); }
            }

            .mazemaster-maze-grid {
                display: grid;
                gap: 0;
                background: #333;
                padding: 2px;
                border-radius: 5px;
                border: 2px solid #555;
            }

            .maze-cell {
                width: ${cellSize}px;
                height: ${cellSize}px;
                background: #1a1a2e;
                position: relative;
                box-sizing: border-box;
            }

            .maze-cell.hidden {
                background: #0a0a0a;
            }

            .maze-cell.wall-top { border-top: 2px solid #fff; }
            .maze-cell.wall-right { border-right: 2px solid #fff; }
            .maze-cell.wall-bottom { border-bottom: 2px solid #fff; }
            .maze-cell.wall-left { border-left: 2px solid #fff; }

            /* Player marker now handled by .maze-player-overlay for smooth animation */
            .maze-cell.player {
                /* Player position cell styling - marker is in overlay */
            }

            .maze-cell.exit::before {
                content: '';
                position: absolute;
                top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                width: 70%; height: 70%;
                background: #27ae60;
                border-radius: 3px;
            }

            .maze-cell.visited:not(.hidden) {
                background: #1e2a4a;
            }

            /* Legacy arrow buttons (kept for backwards compatibility) */
            .maze-arrow-btn {
                display: none; /* Hide legacy buttons */
            }

            /* Action buttons */
            .maze-action-btn {
                padding: 8px 14px;
                font-size: 0.85em;
                border-radius: 5px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
            }

            .maze-exit-btn {
                background: linear-gradient(to bottom, #555, #444) !important;
            }

            .maze-close-btn {
                padding: 10px 28px;
                font-size: 1em;
            }

            .maze-cell.victory-glow {
                animation: victoryPulse 1s infinite;
            }

            @keyframes victoryPulse {
                0%, 100% { background: #27ae60; }
                50% { background: #2ecc71; }
            }

            /* =====================================================
               MOBILE / PORTRAIT LAYOUT (v1.2.0)
               ===================================================== */
            .layout-mobile .mazemaster-maze-container,
            #mazemaster_maze_modal.layout-mobile .mazemaster-maze-container {
                width: 100vw;
                height: 100vh;
                max-width: 100vw;
                max-height: 100vh;
                padding: 8px;
                gap: 6px;
                border-radius: 0;
                margin: 0;
            }

            .layout-mobile .mazemaster-maze-top {
                flex-direction: column;
                max-height: none;
                gap: 8px;
            }

            .layout-mobile .mazemaster-maze-hero {
                width: 100%;
                max-width: 100%;
                min-width: unset;
            }

            .layout-mobile .mazemaster-maze-info-col {
                width: 100%;
            }

            .layout-mobile .mazemaster-maze-buttons-col {
                flex-direction: row;
                width: 100%;
                justify-content: center;
            }

            .layout-mobile .mazemaster-maze-stats-bar {
                flex-wrap: wrap;
                gap: 6px;
                justify-content: center;
            }

            .layout-mobile .mazemaster-maze-inventory {
                flex-wrap: wrap;
                justify-content: center;
            }

            .layout-mobile .maze-action-buttons {
                flex-wrap: wrap;
                justify-content: center;
            }

            .layout-mobile .maze-dpad {
                position: fixed;
                bottom: 10px;
                right: 10px;
                z-index: 10000;
            }

            /* Make grid scrollable on mobile */
            .layout-mobile .maze-grid-area {
                overflow: auto;
                max-height: 50vh;
            }

            /* Larger touch targets on mobile */
            .layout-mobile .dpad-btn {
                min-width: 50px;
                min-height: 50px;
            }

            @media (max-width: 600px) {
                .mazemaster-maze-hero {
                    height: auto;
                    min-height: 80px;
                }

                .maze-message-log {
                    font-size: 0.85em;
                    max-height: 80px;
                }

                .stats-item {
                    font-size: 0.75em;
                    padding: 3px 6px;
                }

                .inventory-item {
                    padding: 4px 6px;
                    font-size: 0.85em;
                }
            }
        </style>
    `;

    document.body.appendChild(modal);

    // Initialize the renderer and insert grid/canvas into container
    const renderer = RendererRegistry.getRenderer();
    const gridContainer = document.getElementById('maze_grid_container');
    if (gridContainer) {
        // Insert renderer-specific grid HTML
        gridContainer.innerHTML = renderer.getGridHTML(currentMaze.size);
        // Add player overlay for CSS grid renderer (canvas renderers draw player on canvas)
        const overlayHTML = renderer.getPlayerOverlayHTML(cellSize);
        if (overlayHTML) {
            gridContainer.insertAdjacentHTML('beforeend', overlayHTML);
        }
        // Initialize renderer (gets canvas context for canvas-based renderers)
        renderer.init(gridContainer, currentMaze);
    }

    // Apply layout mode (responsive)
    applyLayoutMode();

    // Add D-Pad control handlers
    modal.querySelectorAll('.dpad-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const dir = btn.dataset.dir;
            if (dir === 'up') tryMazeMove(0, -1);
            else if (dir === 'down') tryMazeMove(0, 1);
            else if (dir === 'left') tryMazeMove(-1, 0);
            else if (dir === 'right') tryMazeMove(1, 0);
            else if (dir === 'floor-up') tryFloorChange('up');
            else if (dir === 'floor-down') tryFloorChange('down');
        });
        // Touch support for mobile
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            btn.click();
        });
    });

    // Initialize D-Pad drag functionality
    initDpadDrag();

    // Initialize pinch-zoom and pan/drag for the map
    initMapPanZoom();

    // Add click handlers for usable inventory items
    const mapFragmentItem = modal.querySelector('.inventory-item.map-fragment');
    if (mapFragmentItem) {
        mapFragmentItem.addEventListener('click', () => useMapFragment());
    }

    const portalStoneItem = modal.querySelector('.inventory-item.portal-stone');
    if (portalStoneItem) {
        portalStoneItem.addEventListener('click', () => usePortalStone());
    }

    const voidWalkItem = modal.querySelector('.inventory-item.void-walk');
    if (voidWalkItem) {
        voidWalkItem.addEventListener('click', (e) => {
            e.stopPropagation();
            activateVoidWalk();
        });
    }

    // Inventory drawer toggle
    const inventoryBar = document.getElementById('maze_inventory_bar');
    const inventoryDrawer = document.getElementById('maze_inventory_drawer');
    if (inventoryBar && inventoryDrawer) {
        inventoryBar.addEventListener('click', (e) => {
            // Don't toggle if clicking on a usable item
            if (e.target.closest('[data-usable="true"]')) return;

            const isExpanded = !inventoryDrawer.classList.contains('hidden');
            if (isExpanded) {
                inventoryDrawer.classList.add('hidden');
                inventoryBar.classList.remove('expanded');
            } else {
                populateInventoryDrawer();
                inventoryDrawer.classList.remove('hidden');
                inventoryBar.classList.add('expanded');
            }
        });
    }

    // Apply theme colors
    applyThemeColors(currentMaze.profile);

    // Close button handler
    const closeBtn = document.getElementById('maze_close_btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeMaze);
        closeBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            closeMaze();
        });
    }

    // Power button handler - shows custom save dialog with Yes/No/Cancel
    const powerHandler = () => {
        showSaveDialog();
    };
    document.getElementById('maze_power_btn')?.addEventListener('click', powerHandler);
}

/**
 * Show custom save dialog with Yes/No/Cancel buttons
 */
function showSaveDialog() {
    // Remove any existing dialog
    const existingDialog = document.getElementById('maze_save_dialog');
    if (existingDialog) existingDialog.remove();

    const dialog = document.createElement('div');
    dialog.id = 'maze_save_dialog';
    dialog.innerHTML = `
        <div class="maze-save-dialog-backdrop"></div>
        <div class="maze-save-dialog-content">
            <div class="maze-save-dialog-title">Do you wish to save?</div>
            <div class="maze-save-dialog-buttons">
                <button id="maze_save_yes" class="maze-save-btn maze-save-yes">Yes</button>
                <button id="maze_save_no" class="maze-save-btn maze-save-no">No</button>
                <button id="maze_save_cancel" class="maze-save-btn maze-save-cancel">Cancel</button>
            </div>
        </div>
    `;

    const modal = document.getElementById('mazemaster_maze_modal');
    if (modal) {
        modal.appendChild(dialog);
    } else {
        document.body.appendChild(dialog);
    }

    // Button handlers
    document.getElementById('maze_save_yes').addEventListener('click', () => {
        dialog.remove();
        saveMazeProgress();
        closeMaze();
        renderSavedGamesList();
    });

    document.getElementById('maze_save_no').addEventListener('click', () => {
        dialog.remove();
        closeMaze();
    });

    document.getElementById('maze_save_cancel').addEventListener('click', () => {
        dialog.remove();
    });

    // Backdrop click = cancel
    dialog.querySelector('.maze-save-dialog-backdrop').addEventListener('click', () => {
        dialog.remove();
    });
}

function closeMaze() {
    currentMaze.isOpen = false;
    document.removeEventListener('keydown', handleMazeKeydown, { capture: true });

    const modal = document.getElementById('mazemaster_maze_modal');
    if (modal) modal.remove();
}

function renderMazeGrid() {
    // Delegate to the pluggable renderer system
    const renderer = RendererRegistry.getRenderer();
    renderer.render(currentMaze);
}

/**
 * Add a message to the maze message log and render it
 * @param {string} speaker - Name of who's speaking
 * @param {string} message - The message text
 * @param {boolean} skipSave - If true, don't save to persistent log (for re-rendering)
 */
function addMazeMessage(speaker, message, skipSave = false) {
    if (!message) return;

    // Add to persistent log (unless we're just re-rendering)
    if (!skipSave) {
        currentMaze.messageLog.push({ speaker, message, timestamp: Date.now() });
    }

    // Render the message log
    renderMessageLog();
}

/**
 * Render the entire message log to the UI
 */
function renderMessageLog() {
    const logEl = document.getElementById('maze_message_log');
    if (!logEl) return;

    logEl.innerHTML = currentMaze.messageLog.map(entry => `
        <div class="maze-message-entry">
            <div class="maze-message-speaker">${escapeHtml(entry.speaker)}</div>
            <div class="maze-message-text">${escapeHtml(entry.message)}</div>
        </div>
    `).join('');

    // Auto-scroll to the latest message
    logEl.scrollTop = logEl.scrollHeight;
}

function updateMazeHero() {
    const { currentMinion, isVictory, profile, messageLog } = currentMaze;

    const imgEl = document.getElementById('maze_minion_img');
    const nameEl = document.getElementById('maze_minion_name');
    const roleEl = document.getElementById('maze_minion_role');

    if (isVictory) {
        // Victory state
        if (profile.winImage && imgEl) {
            imgEl.src = getExtensionImagePath(profile.winImage);
            imgEl.style.display = '';
        }
        if (nameEl) nameEl.textContent = 'Victory!';
        if (roleEl) roleEl.textContent = '';

        // Add victory message to log
        const victoryMessage = profile.winMessage || 'You escaped the maze!';
        const lastEntry = messageLog[messageLog.length - 1];
        if (!lastEntry || lastEntry.message !== victoryMessage) {
            addMazeMessage('Victory!', victoryMessage);
        }
    } else if (currentMinion) {
        // Normal minion display
        if (currentMinion.imagePath && imgEl) {
            imgEl.src = getExtensionImagePath(currentMinion.imagePath);
            imgEl.style.display = 'block';
        } else if (imgEl) {
            imgEl.style.display = 'none';
        }
        if (nameEl) nameEl.textContent = currentMinion.name || '';
        if (roleEl) roleEl.textContent = currentMinion.role || '';

        // Add message to log if it's new (avoid duplicating the same message)
        if (currentMinion.message) {
            const lastEntry = messageLog[messageLog.length - 1];
            if (!lastEntry || lastEntry.message !== currentMinion.message) {
                addMazeMessage(currentMinion.name || 'Unknown', currentMinion.message);
            }
        }
    }

    // Render the message log (in case we're restoring state)
    renderMessageLog();
}

/**
 * Show or hide the LLM generating indicator
 */
function showGeneratingIndicator(show) {
    const indicator = document.getElementById('maze_generating_indicator');
    if (indicator) {
        indicator.classList.toggle('active', show);
    }
}

/**
 * Update the room info box with current cell information
 */
function updateRoomInfoBox() {
    if (!currentMaze.isOpen) return;

    const { playerX, playerY, grid } = currentMaze;
    const cell = grid[playerY]?.[playerX];
    if (!cell) return;

    // Update name & description
    const nameEl = document.getElementById('room_info_name');
    const descEl = document.getElementById('room_info_desc');
    if (nameEl) nameEl.textContent = cell.roomInfo?.name || 'Unknown Room';
    if (descEl) descEl.textContent = cell.roomInfo?.description || '...';

    // Update exits based on walls
    const exitsEl = document.getElementById('room_info_exits');
    if (exitsEl) {
        const exits = [];
        if (!cell.walls.top) exits.push('North');
        if (!cell.walls.right) exits.push('East');
        if (!cell.walls.bottom) exits.push('South');
        if (!cell.walls.left) exits.push('West');
        exitsEl.textContent = exits.length ? exits.join(', ') : 'None';
    }

    // Update occupants (active minions)
    const occupantsEl = document.getElementById('room_info_occupants');
    if (occupantsEl) {
        const occupants = [];
        if (cell.minion && !cell.minion.defeated && !cell.minion.triggered) {
            const minion = getMinion(cell.minion.minionId);
            occupants.push(minion?.name || 'Unknown Entity');
        }
        if (cell.chest && !cell.chest.opened) {
            occupants.push(cell.chest.type === 'locked' ? 'Locked Chest' : 'Chest');
        }
        if (cell.trap && !cell.trap.triggered) {
            occupants.push('Something feels off...');
        }
        occupantsEl.textContent = occupants.length ? occupants.join(', ') : 'None';
    }

    // Update defeated list
    const defeatedEl = document.getElementById('room_info_defeated');
    if (defeatedEl) {
        const defeated = [];
        if (cell.minion?.defeated || cell.minion?.triggered) {
            const minion = getMinion(cell.minion.minionId);
            defeated.push(minion?.name || 'Unknown');
        }
        if (cell.chest?.opened) {
            defeated.push('Opened Chest');
        }
        if (cell.trap?.triggered) {
            defeated.push('Triggered Trap');
        }
        defeatedEl.textContent = defeated.length ? defeated.join(', ') : 'None';
    }
}

function handleMazeKeydown(e) {
    if (!currentMaze.isOpen || currentMaze.isVictory) return;

    // v1.2.0: SHIFT+Arrow for floor changes
    if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const floorDir = e.key === 'ArrowUp' ? 'up' : 'down';
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        tryFloorChange(floorDir);
        return;
    }

    let dx = 0, dy = 0;
    if (e.key === 'ArrowUp') dy = -1;
    else if (e.key === 'ArrowDown') dy = 1;
    else if (e.key === 'ArrowLeft') dx = -1;
    else if (e.key === 'ArrowRight') dx = 1;
    else return;

    // Block event from reaching ST's swipe handlers
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    tryMazeMove(dx, dy);
}

async function tryMazeMove(dx, dy) {
    if (!currentMaze.isOpen || currentMaze.isVictory) return;

    // Don't allow movement if paused (encounter in progress)
    if (currentMaze.isPaused) return;

    const { playerX, playerY, grid, size } = currentMaze;
    const newX = playerX + dx;
    const newY = playerY + dy;

    // Check bounds
    if (newX < 0 || newX >= size || newY < 0 || newY >= size) return;

    // Check walls (with Void Walk support)
    const currentCell = grid[playerY][playerX];
    let blockedByWall = false;
    if (dx === 1 && currentCell.walls.right) blockedByWall = true;
    if (dx === -1 && currentCell.walls.left) blockedByWall = true;
    if (dy === 1 && currentCell.walls.bottom) blockedByWall = true;
    if (dy === -1 && currentCell.walls.top) blockedByWall = true;

    // v1.2.0: Void Walk allows phasing through one wall
    if (blockedByWall) {
        if (currentMaze.voidWalkActive) {
            // Phase through the wall, consume the Void Walk
            await consumeVoidWalk();
            blockedByWall = false;
        } else {
            return; // Normal block
        }
    } else if (currentMaze.voidWalkActive) {
        // If Void Walk is active but no wall was encountered, cancel it
        cancelVoidWalk();
    }

    // Determine direction for hook
    const direction = dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up';

    // Move player
    currentMaze.playerX = newX;
    currentMaze.playerY = newY;
    currentMaze.visited.add(`${currentMaze.currentFloor}:${newX},${newY}`);
    currentMaze.moveCount++;

    // Track move stat
    await incrementStat('moves', 1);

    // Fire onMove hook
    await fireHook('onMove', { x: newX, y: newY, direction });

    // Update stats display
    updateStatsDisplay();

    // Check for exploration complete
    checkExplorationComplete();

    // Animate player movement
    updatePlayerPosition(true);

    // Update grid (fog of war, etc.)
    renderMazeGrid();

    // Check for exit (but don't win yet if boss exists)
    if (newX === currentMaze.exitX && newY === currentMaze.exitY) {
        handleExitReached();
        return;
    }

    const cell = grid[newY][newX];

    // Check for chest encounter (before minions)
    if (cell.chest && !cell.chest.opened) {
        triggerChestEncounter(cell.chest, newX, newY);
        return;
    }

    // Check for minion encounter
    if (cell.minion && !cell.minion.triggered) {
        triggerMinionEncounter(cell.minion.minionId, newX, newY);
        return;
    }

    // Check for trap encounter
    if (cell.trap && !cell.trap.triggered) {
        triggerTrapEncounter(cell.trap.trapId, newX, newY);
        return;
    }

    // Check for portal teleportation
    if (cell.portal) {
        const teleported = await handleTeleport(newX, newY, cell.portal);
        if (teleported) {
            // Re-render grid after teleport
            renderMazeGrid();
            // Check destination cell for encounters
            const destCell = grid[currentMaze.playerY][currentMaze.playerX];
            if (destCell.chest && !destCell.chest.opened) {
                triggerChestEncounter(destCell.chest, currentMaze.playerX, currentMaze.playerY);
                return;
            }
            if (destCell.minion && !destCell.minion.triggered) {
                triggerMinionEncounter(destCell.minion.minionId, currentMaze.playerX, currentMaze.playerY);
                return;
            }
            if (destCell.trap && !destCell.trap.triggered) {
                triggerTrapEncounter(destCell.trap.trapId, currentMaze.playerX, currentMaze.playerY);
                return;
            }
        }
    }

    // Check for main minion random message
    maybeShowMainMinionMessage();

    // Check story milestones
    checkStoryMilestones();

    // Process moving minions after player's move
    await processMinionMovement();

    // Re-render grid if minions moved
    if (currentMaze.movingMinions && currentMaze.movingMinions.length > 0) {
        renderMazeGrid();
    }
}

/**
 * Handle reaching the exit tile
 */
async function handleExitReached() {
    const profile = currentMaze.profile;

    // Check if all required objectives are complete
    if (!canWinMaze()) {
        // Show message that objectives need to be completed
        const mainMinion = profile.mainMinion ? getMinion(profile.mainMinion) : null;
        currentMaze.currentMinion = {
            name: mainMinion?.name || 'Exit',
            imagePath: mainMinion?.imagePath || '',
            message: "You haven't completed all required objectives yet! Explore the maze to find what you need.",
        };
        updateMazeHero();

        // Flash the objectives display
        const objectivesSection = document.querySelector('.maze-objectives-section');
        if (objectivesSection) {
            objectivesSection.classList.add('objectives-flash');
            setTimeout(() => objectivesSection.classList.remove('objectives-flash'), 500);
        }
        return;
    }

    // If no main minion or exit encounter already done, just win
    if (!profile.mainMinion || currentMaze.exitEncounterDone) {
        handleMazeWin();
        return;
    }

    const mainMinion = getMinion(profile.mainMinion);
    if (!mainMinion) {
        handleMazeWin();
        return;
    }

    // Pause for exit encounter
    currentMaze.isPaused = true;

    // Show main minion as final boss
    currentMaze.currentMinion = {
        name: mainMinion.name,
        imagePath: mainMinion.imagePath,
        message: "You've reached the exit... but first, face me!",
    };
    updateMazeHero();

    const exitType = profile.mainMinionExitType || 'messenger';
    const exitProfile = profile.mainMinionExitProfile;

    switch (exitType) {
        case 'messenger':
            await delay(2000);
            currentMaze.exitEncounterDone = true;
            currentMaze.isPaused = false;
            handleMazeWin();
            break;

        case 'battlebar':
            if (exitProfile) {
                currentMaze.pendingEncounter = { type: 'exit_battlebar', profile: exitProfile };
                startBattlebar(exitProfile);
            } else {
                // No profile configured, just win
                currentMaze.exitEncounterDone = true;
                currentMaze.isPaused = false;
                handleMazeWin();
            }
            break;

        case 'prizewheel':
            if (exitProfile) {
                currentMaze.pendingEncounter = { type: 'exit_wheel', profile: exitProfile };
                loadWheelFromProfile(exitProfile);
                showWheelModal();
            } else {
                // No profile configured, just win
                currentMaze.exitEncounterDone = true;
                currentMaze.isPaused = false;
                handleMazeWin();
            }
            break;

        default:
            handleMazeWin();
    }
}

/**
 * Trigger a minion encounter when stepping on a minion tile
 */
async function triggerMinionEncounter(minionId, x, y) {
    const minion = getMinion(minionId);
    if (!minion) {
        console.warn(`[MazeMaster] Minion "${minionId}" not found`);
        return;
    }

    // Double-check not already triggered (safety check)
    const cell = currentMaze.grid[y][x];
    if (cell.minion?.triggered) {
        console.log(`[MazeMaster] Minion at ${x},${y} already triggered, skipping`);
        return;
    }

    // Mark as triggered FIRST
    cell.minion.triggered = true;
    console.log(`[MazeMaster] Marked minion at ${x},${y} as triggered`);

    // v1.2.0: Check for Minion Bane - auto-defeat non-messenger minions
    const minionType = minion.type || 'messenger';
    if (minionType !== 'messenger' && currentMaze.inventory.minionBane > 0) {
        const baneUsed = await checkMinionBane();
        if (baneUsed) {
            // Auto-defeat the minion
            cell.minion.defeated = true;
            await incrementStat('encountersWon', 1);
            await updateObjectiveProgress('defeat', minionId, 1);
            renderMazeGrid();

            // Brief pause then resume
            setTimeout(() => {
                currentMaze.isPaused = false;
                resetMazeHero();
            }, 2000);
            return;
        }
    }

    // Track encounter stat
    await incrementStat('encountersTotal', 1);

    // Update defeat objective (counts when encountered - for battlebar types, this may be premature but we track the encounter)
    await updateObjectiveProgress('defeat', minionId, 1);

    // Pause maze
    currentMaze.isPaused = true;

    // Show minion with placeholder immediately
    currentMaze.currentMinion = {
        name: minion.name,
        imagePath: minion.imagePath,
        message: '...',
    };
    updateMazeHero();
    renderMazeGrid();

    // Get base message
    const baseMessage = getRandomFromArray(minion.messages) || `You encountered ${minion.name}!`;

    // Show generating indicator
    showGeneratingIndicator(true);

    // Generate LLM message if enabled
    let message = baseMessage;
    try {
        message = await generateMinionMessage({
            minionName: minion.name,
            minionDescription: minion.description,
            baseMessage: baseMessage,
            mainStory: getMainStory(),
            currentMilestone: getCurrentMilestone(),
            minionType: minion.type || 'messenger',
        });
    } catch (error) {
        console.error('[MazeMaster] LLM generation error:', error);
    }

    // Hide generating indicator
    showGeneratingIndicator(false);

    // Update with actual message
    currentMaze.currentMinion.message = message;
    updateMazeHero();

    // Execute encounter script if present
    if (minion.encounterScript && minion.encounterScript.trim()) {
        console.log(`[MazeMaster] Executing encounter script for ${minion.name}`);
        await executeWithTimeout(minion.encounterScript);
    }

    // Show confirmation buttons instead of auto-triggering (minionType already defined above)
    showEncounterConfirmation(minionId, x, y, minion.type || 'messenger');
}

/**
 * Trigger a trap encounter when stepping on a trap tile
 */
async function triggerTrapEncounter(trapId, x, y) {
    const trap = getTrap(trapId);
    if (!trap) {
        console.warn(`[MazeMaster] Trap "${trapId}" not found`);
        return;
    }

    // Mark as triggered
    currentMaze.grid[y][x].trap.triggered = true;
    renderMazeGrid();

    // Track trap stat
    await incrementStat('trapsTriggered', 1);

    // Pause maze
    currentMaze.isPaused = true;

    // Show trap in hero section with placeholder
    currentMaze.currentMinion = {
        name: trap.name,
        imagePath: trap.imagePath,
        message: '...',
    };
    updateMazeHero();

    // Show generating indicator
    showGeneratingIndicator(true);

    // Generate LLM message for trap
    const baseMessage = trap.message || 'You triggered a trap!';
    let message = baseMessage;
    try {
        message = await generateTrapMessage({
            trapName: trap.name,
            baseMessage: baseMessage,
            mainStory: getMainStory(),
        });
    } catch (error) {
        console.error('[MazeMaster] Trap LLM generation error:', error);
    }

    // Hide generating indicator
    showGeneratingIndicator(false);

    // Update with actual message
    currentMaze.currentMinion.message = message;
    updateMazeHero();

    // Execute trap script if present
    if (trap.script && trap.script.trim()) {
        console.log(`[MazeMaster] Executing trap script for ${trap.name}`);
        await executeWithTimeout(trap.script);
    }

    // Show a continue button
    showTrapContinueButton(x, y);
}

/**
 * Show continue button after trap encounter
 */
function showTrapContinueButton(x, y) {
    const confirmContainer = document.getElementById('maze_encounter_confirm');
    if (!confirmContainer) return;

    confirmContainer.innerHTML = `
        <button id="maze_trap_continue" class="menu_button maze-confirm-btn">Continue</button>
    `;
    confirmContainer.style.display = 'flex';

    document.getElementById('maze_trap_continue')?.addEventListener('click', () => {
        confirmContainer.style.display = 'none';
        confirmContainer.innerHTML = '';
        resumeMaze();
    });
}

/**
 * Resume maze after an encounter completes
 */
function resumeMaze() {
    currentMaze.isPaused = false;
    currentMaze.pendingEncounter = null;

    // Clear action buttons
    const confirmEl = document.getElementById('maze_encounter_confirm');
    if (confirmEl) {
        confirmEl.innerHTML = '';
        confirmEl.style.display = 'none';
    }

    // Restore main minion display if configured
    const profile = currentMaze.profile;
    if (profile.mainMinion) {
        const mainMinion = getMinion(profile.mainMinion);
        if (mainMinion) {
            currentMaze.currentMinion = {
                name: mainMinion.name,
                imagePath: mainMinion.imagePath,
                message: 'Continue onward...',
            };
            updateMazeHero();
            return;
        }
    }

    // Otherwise restore default
    currentMaze.currentMinion = getDefaultMinion();
    updateMazeHero();
}

/**
 * Populate the inventory drawer with themed item names
 */
function populateInventoryDrawer() {
    const drawer = document.querySelector('.inventory-drawer-content');
    if (!drawer) return;

    const profile = currentMaze.profile;
    const inv = currentMaze.inventory;

    const items = [
        { id: 'key', icon: 'fa-key', colorClass: '' },
        { id: 'stealth', icon: 'fa-user-ninja', colorClass: '' },
        { id: 'pow', icon: 'fa-bolt', colorClass: '' },
        { id: 'grandpow', icon: 'fa-star', colorClass: 'grandpow' },
        { id: 'floorKey', icon: 'fa-stairs', colorClass: 'floor-key' },
        { id: 'portalStone', icon: 'fa-gem', colorClass: 'portal-stone' },
        { id: 'minionBane', icon: 'fa-skull-crossbones', colorClass: 'minion-bane' },
        { id: 'mapFragment', icon: 'fa-scroll', colorClass: 'map-fragment' },
        { id: 'timeShard', icon: 'fa-hourglass-half', colorClass: 'time-shard' },
        { id: 'voidWalk', icon: 'fa-ghost', colorClass: 'void-walk' },
    ];

    drawer.innerHTML = items.map(item => {
        const count = inv[item.id] || 0;
        const themedName = getThemedItemName(item.id, profile);
        const emptyClass = count === 0 ? 'empty' : '';
        return `
            <div class="inventory-drawer-item ${item.colorClass} ${emptyClass}">
                <i class="fa-solid ${item.icon}"></i>
                <span class="item-name">${themedName}</span>
                <span class="item-count">x${count}</span>
            </div>
        `;
    }).join('');
}

/**
 * Update the inventory display in the maze modal
 */
function updateInventoryDisplay() {
    const keyEl = document.getElementById('maze_inv_key');
    const stealthEl = document.getElementById('maze_inv_stealth');
    const powEl = document.getElementById('maze_inv_pow');
    const grandpowEl = document.getElementById('maze_inv_grandpow');

    if (keyEl) keyEl.textContent = currentMaze.inventory.key;
    if (stealthEl) stealthEl.textContent = currentMaze.inventory.stealth;
    if (powEl) powEl.textContent = currentMaze.inventory.pow;
    if (grandpowEl) grandpowEl.textContent = currentMaze.inventory.grandpow || 0;

    // v1.2.0 new items - update values
    const newItems = ['floorKey', 'portalStone', 'minionBane', 'mapFragment', 'timeShard', 'voidWalk'];
    for (const item of newItems) {
        const el = document.getElementById(`maze_inv_${item}`);
        if (el) {
            el.textContent = currentMaze.inventory[item] || 0;
        }
    }
}

/**
 * Add items to inventory
 */
async function addToInventory(item, amount = 1) {
    if (currentMaze.inventory[item] !== undefined) {
        currentMaze.inventory[item] += amount;
        updateInventoryDisplay();

        // Track item collection stats
        if (currentMaze.stats?.itemsCollected?.[item] !== undefined) {
            currentMaze.stats.itemsCollected[item] += amount;
        }

        // Fire hook
        await fireHook('onItemAdd', {
            item,
            count: amount,
            total: currentMaze.inventory[item]
        });

        // Update collect objectives
        await updateObjectiveProgress('collect', item, amount);
    }
}

/**
 * Remove items from inventory
 */
async function removeFromInventory(item, amount = 1) {
    if (currentMaze.inventory[item] !== undefined) {
        const prevAmount = currentMaze.inventory[item];
        currentMaze.inventory[item] = Math.max(0, prevAmount - amount);
        updateInventoryDisplay();

        // Fire hook
        await fireHook('onItemRemove', {
            item,
            count: Math.min(prevAmount, amount),
            total: currentMaze.inventory[item]
        });
    }
}

/**
 * Trigger a chest encounter - show Open/Ignore buttons
 */
async function triggerChestEncounter(chestData, x, y) {
    currentMaze.isPaused = true;

    // Store pending chest for button handlers
    currentMaze.pendingChest = { chestData, x, y };

    // Show chest in hero section
    const isLocked = chestData.type === 'locked';
    const hasKey = currentMaze.inventory.key > 0;

    // Get base message
    const baseMessage = isLocked
        ? (hasKey ? 'A locked chest! Use a key to open it?' : 'A locked chest! You need a Key to open it.')
        : 'You found a chest!';

    // Set initial display with base message
    currentMaze.currentMinion = {
        name: isLocked ? 'Locked Chest' : 'Chest',
        imagePath: '',
        message: baseMessage,
    };
    updateMazeHero();

    // Generate LLM message
    const mainStory = currentMaze.profile?.storyConfig?.mainStory || '';
    showGeneratingIndicator(true);

    try {
        const generatedMessage = await generateChestMessage({
            chestType: isLocked ? 'locked' : 'normal',
            baseMessage,
            mainStory,
            hasKey,
        });

        currentMaze.currentMinion.message = generatedMessage;
        updateMazeHero();
    } catch (error) {
        console.error('[MazeMaster] Chest message generation failed:', error);
    } finally {
        showGeneratingIndicator(false);
    }

    // Show buttons
    showChestConfirmation(isLocked, hasKey);
}

/**
 * Show chest confirmation buttons
 */
function showChestConfirmation(isLocked, hasKey) {
    const confirmContainer = document.getElementById('maze_encounter_confirm');
    if (!confirmContainer) return;

    let buttons = '';
    if (isLocked) {
        if (hasKey) {
            buttons = `
                <button id="maze_chest_unlock" class="menu_button maze-confirm-btn">Unlock</button>
                <button id="maze_chest_ignore" class="menu_button maze-confirm-btn">Ignore</button>
            `;
        } else {
            buttons = `
                <button id="maze_chest_ignore" class="menu_button maze-confirm-btn">Continue</button>
            `;
        }
    } else {
        buttons = `
            <button id="maze_chest_open" class="menu_button maze-confirm-btn">Open</button>
            <button id="maze_chest_ignore" class="menu_button maze-confirm-btn">Ignore</button>
        `;
    }

    confirmContainer.innerHTML = buttons;
    confirmContainer.style.display = 'flex';

    // Attach handlers
    document.getElementById('maze_chest_open')?.addEventListener('click', handleChestOpen);
    document.getElementById('maze_chest_unlock')?.addEventListener('click', handleChestUnlock);
    document.getElementById('maze_chest_ignore')?.addEventListener('click', handleChestIgnore);
}

/**
 * Handle opening a normal chest
 */
function handleChestOpen() {
    const confirmContainer = document.getElementById('maze_encounter_confirm');
    if (confirmContainer) {
        confirmContainer.style.display = 'none';
        confirmContainer.innerHTML = '';
    }

    const { chestData, x, y } = currentMaze.pendingChest || {};
    if (!chestData) return;

    // Mark as opened
    currentMaze.grid[y][x].chest.opened = true;
    renderMazeGrid();

    // Check for mimic
    if (chestData.type === 'mimic') {
        triggerMimicEncounter(x, y);
        return;
    }

    // Normal chest - give loot
    openNormalChest(x, y);
}

/**
 * Handle unlocking a locked chest
 */
function handleChestUnlock() {
    const confirmContainer = document.getElementById('maze_encounter_confirm');
    if (confirmContainer) {
        confirmContainer.style.display = 'none';
        confirmContainer.innerHTML = '';
    }

    const { chestData, x, y } = currentMaze.pendingChest || {};
    if (!chestData) return;

    // Use key
    removeFromInventory('key');

    // Mark as opened
    currentMaze.grid[y][x].chest.opened = true;
    renderMazeGrid();

    // Check for mimic (locked chests can be mimics too)
    if (chestData.type === 'mimic') {
        triggerMimicEncounter(x, y);
        return;
    }

    // Give locked chest loot
    openLockedChest(x, y);
}

/**
 * Handle ignoring a chest
 */
function handleChestIgnore() {
    const confirmContainer = document.getElementById('maze_encounter_confirm');
    if (confirmContainer) {
        confirmContainer.style.display = 'none';
        confirmContainer.innerHTML = '';
    }

    currentMaze.pendingChest = null;
    resumeMaze();
}

/**
 * Open a normal chest
 */
async function openNormalChest(x, y) {
    currentMaze.pendingChest = null;
    const profile = currentMaze.profile;
    const loot = generateChestLoot(profile, false);
    awardLoot(loot);
    showChestLootMessage(loot, "Chest");

    // Track stats and fire hook
    await incrementStat('chestsOpened', 1);
    await fireHook('onChestOpen', {
        type: 'normal',
        loot: JSON.stringify(loot),
        x, y
    });
}

/**
 * Open a locked chest
 */
async function openLockedChest(x, y) {
    currentMaze.pendingChest = null;
    const profile = currentMaze.profile;
    const loot = generateChestLoot(profile, true);
    awardLoot(loot);
    showChestLootMessage(loot, "Locked Chest");

    // Track stats and fire hook
    await incrementStat('chestsOpened', 1);
    await fireHook('onChestOpen', {
        type: 'locked',
        loot: JSON.stringify(loot),
        x, y
    });
}

/**
 * Generate loot for a chest
 * Applies difficulty scaling to loot chances
 */
function generateChestLoot(profile, isLocked) {
    const loot = {
        key: 0, pow: 0, stealth: 0, grandpow: 0,
        // v1.2.0 new items
        floorKey: 0, portalStone: 0, minionBane: 0, mapFragment: 0, timeShard: 0, voidWalk: 0
    };
    const min = profile.chestLootMin || 1;
    const max = profile.chestLootMax || 2;
    const itemCount = min + Math.floor(Math.random() * (max - min + 1));

    // Get difficulty scaling for loot
    const difficulty = getDifficultySettings(profile);
    const lootMult = difficulty.chestLootMult || 1.0;

    // Base chances for original items
    const chances = isLocked ? {
        key: (profile.lockedChestKeyChance || 40) * lootMult,
        pow: (profile.lockedChestPowChance || 60) * lootMult,
        stealth: (profile.lockedChestStealthChance || 30) * lootMult,
        grandpow: (profile.lockedChestGrandpowChance || 5) * lootMult,
    } : {
        key: (profile.chestKeyChance || 30) * lootMult,
        pow: (profile.chestPowChance || 50) * lootMult,
        stealth: (profile.chestStealthChance || 0) * lootMult,
        grandpow: (profile.chestGrandpowChance || 0) * lootMult,
    };

    // v1.2.0 new item chances (rarer, locked chests give better odds)
    const newItemChances = {
        floorKey: (isLocked ? 20 : 10) * lootMult,      // Floor key for multi-floor maps
        portalStone: (isLocked ? 15 : 8) * lootMult,    // Teleport to revealed portals
        minionBane: (isLocked ? 12 : 5) * lootMult,     // Auto-defeat next minion
        mapFragment: (isLocked ? 25 : 15) * lootMult,   // Reveal 3x3 area
        timeShard: (isLocked ? 10 : 5) * lootMult,      // Slow battlebar by 50%
        voidWalk: (isLocked ? 8 : 3) * lootMult,        // Phase through one wall
    };

    // Apply locked bonus multiplier
    if (isLocked) {
        const bonus = 1 + (profile.chestLockedBonusPercent || 50) / 100;
        chances.key = Math.min(100, chances.key * bonus);
        chances.pow = Math.min(100, chances.pow * bonus);
        chances.stealth = Math.min(100, chances.stealth * bonus);
        chances.grandpow = Math.min(100, chances.grandpow * bonus);
        // Apply bonus to new items too
        for (const item of Object.keys(newItemChances)) {
            newItemChances[item] = Math.min(100, newItemChances[item] * bonus);
        }
    }

    for (let i = 0; i < itemCount; i++) {
        // Roll for each item type
        if (Math.random() * 100 < chances.key) loot.key++;
        if (Math.random() * 100 < chances.pow) loot.pow++;
        if (Math.random() * 100 < chances.stealth) loot.stealth++;
        if (Math.random() * 100 < chances.grandpow) loot.grandpow++;
        // Roll for new items
        if (Math.random() * 100 < newItemChances.floorKey) loot.floorKey++;
        if (Math.random() * 100 < newItemChances.portalStone) loot.portalStone++;
        if (Math.random() * 100 < newItemChances.minionBane) loot.minionBane++;
        if (Math.random() * 100 < newItemChances.mapFragment) loot.mapFragment++;
        if (Math.random() * 100 < newItemChances.timeShard) loot.timeShard++;
        if (Math.random() * 100 < newItemChances.voidWalk) loot.voidWalk++;
    }

    return loot;
}

/**
 * Award loot to player
 */
function awardLoot(loot) {
    if (loot.key > 0) addToInventory('key', loot.key);
    if (loot.pow > 0) addToInventory('pow', loot.pow);
    if (loot.stealth > 0) addToInventory('stealth', loot.stealth);
    if (loot.grandpow > 0) addToInventory('grandpow', loot.grandpow);
    // v1.2.0 new items
    if (loot.floorKey > 0) addToInventory('floorKey', loot.floorKey);
    if (loot.portalStone > 0) addToInventory('portalStone', loot.portalStone);
    if (loot.minionBane > 0) addToInventory('minionBane', loot.minionBane);
    if (loot.mapFragment > 0) addToInventory('mapFragment', loot.mapFragment);
    if (loot.timeShard > 0) addToInventory('timeShard', loot.timeShard);
    if (loot.voidWalk > 0) addToInventory('voidWalk', loot.voidWalk);
}

/**
 * Show a chest message in the hero section
 */
function showChestMessage(message, chestType) {
    currentMaze.currentMinion = {
        name: chestType,
        imagePath: '',
        message: message,
    };
    updateMazeHero();
}

/**
 * Show loot message from a chest
 */
function showChestLootMessage(loot, chestType) {
    const items = [];
    // Original items
    if (loot.key > 0) items.push(`${loot.key} Key${loot.key > 1 ? 's' : ''}`);
    if (loot.pow > 0) items.push(`${loot.pow} POW${loot.pow > 1 ? 's' : ''}`);
    if (loot.stealth > 0) items.push(`${loot.stealth} Stealth${loot.stealth > 1 ? 's' : ''}`);
    if (loot.grandpow > 0) items.push(`${loot.grandpow} GRANDPOW!`);
    // v1.2.0 new items
    if (loot.floorKey > 0) items.push(`${loot.floorKey} Floor Key${loot.floorKey > 1 ? 's' : ''}`);
    if (loot.portalStone > 0) items.push(`${loot.portalStone} Portal Stone${loot.portalStone > 1 ? 's' : ''}`);
    if (loot.minionBane > 0) items.push(`${loot.minionBane} Minion Bane${loot.minionBane > 1 ? 's' : ''}`);
    if (loot.mapFragment > 0) items.push(`${loot.mapFragment} Map Fragment${loot.mapFragment > 1 ? 's' : ''}`);
    if (loot.timeShard > 0) items.push(`${loot.timeShard} Time Shard${loot.timeShard > 1 ? 's' : ''}`);
    if (loot.voidWalk > 0) items.push(`${loot.voidWalk} Void Walk${loot.voidWalk > 1 ? 's' : ''}`);

    const message = items.length > 0
        ? `You found: ${items.join(', ')}!`
        : 'The chest was empty!';

    showChestMessage(message, chestType);
    setTimeout(() => resumeMaze(), 2000);
}

/**
 * Trigger a mimic encounter (random battlebar)
 */
function triggerMimicEncounter(x, y) {
    // Clear pending chest since we've opened it
    currentMaze.pendingChest = null;

    const bbProfiles = getBattlebarProfileNames();
    if (bbProfiles.length > 0) {
        const randomProfile = bbProfiles[Math.floor(Math.random() * bbProfiles.length)];
        currentMaze.pendingEncounter = { type: 'mimic_battlebar', profile: randomProfile };

        // Show mimic message first
        currentMaze.currentMinion = {
            name: 'Mimic!',
            imagePath: '',
            message: 'The chest was a mimic! Prepare to fight!',
        };
        updateMazeHero();

        setTimeout(() => {
            startBattlebar(randomProfile);
        }, 1000);
    } else {
        // No battlebar profiles - just resume
        showChestMessage("The chest was empty... and creepy.", "Mimic");
        setTimeout(() => resumeMaze(), 1500);
    }
}

/**
 * Show encounter confirmation buttons
 */
function showEncounterConfirmation(minionId, x, y, encounterType) {
    const minion = getMinion(minionId);
    const canSlipAway = encounterType !== 'messenger' && encounterType !== 'merchant' && currentMaze.inventory.stealth > 0;

    currentMaze.pendingConfirmation = { type: encounterType, minionId, x, y, canSlipAway };

    // Show confirmation buttons in dedicated confirm area
    const confirmEl = document.getElementById('maze_encounter_confirm');
    if (!confirmEl) return;

    let buttons = '';
    if (encounterType === 'messenger') {
        buttons = `<button id="maze_confirm_ok" class="menu_button maze-confirm-btn">OK</button>`;
    } else if (encounterType === 'merchant') {
        // Calculate random item count for this merchant
        const merchantConfig = minion.merchantItemCount || { min: 1, max: 3 };
        const itemCount = merchantConfig.min + Math.floor(Math.random() * (merchantConfig.max - merchantConfig.min + 1));
        currentMaze.pendingConfirmation.merchantItemCount = itemCount;

        // Update message with trade offer
        const tradeMessage = `I'll give you a GRANDPOW for ${itemCount} of your items...`;
        currentMaze.currentMinion.message = tradeMessage;
        updateMazeHero();

        buttons = `
            <button id="maze_confirm_accept" class="menu_button maze-confirm-btn maze-accept-btn">Accept</button>
            <button id="maze_confirm_decline" class="menu_button maze-confirm-btn">Decline</button>
        `;
    } else {
        const actionText = encounterType === 'battlebar' ? 'Fight!' : 'Spin!';
        buttons = `<button id="maze_confirm_action" class="menu_button maze-confirm-btn">${actionText}</button>`;
        if (canSlipAway) {
            buttons += `<button id="maze_confirm_slip" class="menu_button maze-confirm-btn maze-slip-btn">Slip Away</button>`;
        }
    }

    // Show buttons in confirm area
    confirmEl.innerHTML = buttons;
    confirmEl.style.display = 'flex';

    // Attach handlers
    document.getElementById('maze_confirm_ok')?.addEventListener('click', handleConfirmOk);
    document.getElementById('maze_confirm_action')?.addEventListener('click', handleConfirmAction);
    document.getElementById('maze_confirm_slip')?.addEventListener('click', handleConfirmSlipAway);
    document.getElementById('maze_confirm_accept')?.addEventListener('click', handleMerchantAccept);
    document.getElementById('maze_confirm_decline')?.addEventListener('click', handleMerchantDecline);
}

/**
 * Handle OK confirmation (messenger encounters)
 */
function handleConfirmOk() {
    currentMaze.pendingConfirmation = null;
    resumeMaze();
}

/**
 * Handle action confirmation (battlebar/prizewheel encounters)
 */
function handleConfirmAction() {
    const conf = currentMaze.pendingConfirmation;
    if (!conf) return;

    const minion = getMinion(conf.minionId);
    currentMaze.pendingConfirmation = null;

    // Trigger the actual encounter
    if (conf.type === 'battlebar') {
        const bbProfile = getRandomFromArray(minion.battlebarProfiles);
        if (bbProfile) {
            currentMaze.pendingEncounter = { type: 'battlebar', profile: bbProfile };
            startBattlebar(bbProfile);
        } else {
            resumeMaze();
        }
    } else if (conf.type === 'prizewheel') {
        const wheelProfile = getRandomFromArray(minion.wheelProfiles);
        if (wheelProfile) {
            currentMaze.pendingEncounter = { type: 'wheel', profile: wheelProfile };
            loadWheelFromProfile(wheelProfile);
            showWheelModal();
        } else {
            resumeMaze();
        }
    }
}

/**
 * Handle slip away (uses stealth to skip encounter)
 */
function handleConfirmSlipAway() {
    if (currentMaze.inventory.stealth > 0) {
        removeFromInventory('stealth');
        currentMaze.pendingConfirmation = null;
        resumeMaze();
    }
}

/**
 * Handle merchant accept - trade items for grandpow
 */
function handleMerchantAccept() {
    const conf = currentMaze.pendingConfirmation;
    if (!conf || conf.type !== 'merchant') return;

    const itemsNeeded = conf.merchantItemCount || 1;

    // Count total tradeable items (not grandpow)
    const totalItems = (currentMaze.inventory.key || 0) +
                       (currentMaze.inventory.stealth || 0) +
                       (currentMaze.inventory.pow || 0);

    if (totalItems < itemsNeeded) {
        // Not enough items
        currentMaze.currentMinion.message = `You don't have enough items! You need ${itemsNeeded} but only have ${totalItems}.`;
        updateMazeHero();

        // Show decline button in control bar
        const confirmEl = document.getElementById('maze_encounter_confirm');
        if (confirmEl) {
            confirmEl.innerHTML = `<button id="maze_confirm_decline" class="menu_button maze-confirm-btn">OK</button>`;
            confirmEl.style.display = 'flex';
            document.getElementById('maze_confirm_decline')?.addEventListener('click', handleMerchantDecline);
        }
        return;
    }

    // Remove random items
    let itemsToRemove = itemsNeeded;
    const itemTypes = ['key', 'stealth', 'pow'];

    while (itemsToRemove > 0) {
        // Build list of available item types
        const available = itemTypes.filter(type => currentMaze.inventory[type] > 0);
        if (available.length === 0) break;

        // Pick random type
        const randomType = available[Math.floor(Math.random() * available.length)];
        removeFromInventory(randomType);
        itemsToRemove--;
    }

    // Give grandpow
    addToInventory('grandpow');

    // Show success message
    currentMaze.currentMinion.message = "Pleasure doing business with you! Here's your GRANDPOW!";
    updateMazeHero();

    // Show OK to continue in the confirm area
    const confirmEl = document.getElementById('maze_encounter_confirm');
    if (confirmEl) {
        confirmEl.innerHTML = `<button id="maze_confirm_ok" class="menu_button maze-confirm-btn">OK</button>`;
        confirmEl.style.display = 'flex';
        document.getElementById('maze_confirm_ok')?.addEventListener('click', handleConfirmOk);
    }
}

/**
 * Handle merchant decline - skip trade
 */
function handleMerchantDecline() {
    currentMaze.pendingConfirmation = null;
    resumeMaze();
}

/**
 * Maybe show a random message from the main minion
 */
async function maybeShowMainMinionMessage() {
    const profile = currentMaze.profile;
    if (!profile.mainMinion) return;
    if (!profile.mainMinionRandomChance) return;
    if (!profile.mainMinionRandomMessages || profile.mainMinionRandomMessages.length === 0) return;

    // Roll random chance (0-100)
    if (Math.random() * 100 > profile.mainMinionRandomChance) return;

    const mainMinion = getMinion(profile.mainMinion);
    if (!mainMinion) return;

    const baseMessage = getRandomFromArray(profile.mainMinionRandomMessages);
    if (!baseMessage) return;

    // Show placeholder immediately
    currentMaze.currentMinion = {
        name: mainMinion.name,
        imagePath: mainMinion.imagePath,
        message: '...',
    };
    updateMazeHero();

    // Show generating indicator
    showGeneratingIndicator(true);

    // Generate LLM message
    let message = baseMessage;
    try {
        message = await generateMinionMessage({
            minionName: mainMinion.name,
            minionDescription: mainMinion.description,
            baseMessage: baseMessage,
            mainStory: getMainStory(),
            currentMilestone: getCurrentMilestone(),
            minionType: mainMinion.type || 'messenger',
        });
    } catch (error) {
        console.error('[MazeMaster] Random message LLM generation error:', error);
    }

    // Hide generating indicator
    showGeneratingIndicator(false);

    // Update with actual message
    currentMaze.currentMinion.message = message;
    updateMazeHero();
}

/**
 * Check and trigger story milestones based on maze progress
 */
function checkStoryMilestones() {
    const profile = currentMaze.profile;
    if (!profile.storyConfig || !profile.storyConfig.milestones || profile.storyConfig.milestones.length === 0) return;

    // Calculate progress percentage
    const totalCells = currentMaze.size * currentMaze.size;
    const visitedCount = currentMaze.visited.size;
    const percentComplete = Math.floor((visitedCount / totalCells) * 100);

    // Check each milestone
    for (const milestone of profile.storyConfig.milestones) {
        if (percentComplete >= milestone.percent && !currentMaze.shownMilestones.has(milestone.percent)) {
            // Mark as shown
            currentMaze.shownMilestones.add(milestone.percent);

            // Show milestone message
            const mainMinion = profile.mainMinion ? getMinion(profile.mainMinion) : null;
            currentMaze.currentMinion = {
                name: mainMinion?.name || 'Story',
                imagePath: mainMinion?.imagePath || '',
                message: milestone.storyUpdate,
            };
            updateMazeHero();

            // Only show one milestone at a time
            return;
        }
    }
}

/**
 * Handle maze loss (from battlebar defeat)
 */
function handleMazeLoss() {
    currentMaze.isVictory = false;
    currentMaze.isPaused = true;

    // Stop stats timer
    stopStatsTimer();

    // Save persistent stats
    savePersistentStats('lose');

    // Record result
    lastResults.maze[currentMaze.profileName] = {
        result: 'lose',
        timestamp: Date.now(),
    };

    // Show loss screen in hero section
    document.getElementById('maze_minion_name').textContent = 'Defeat!';
    addMazeMessage('Defeat!', 'You have been defeated...');

    // Hide minion image on loss
    const minionImg = document.getElementById('maze_minion_img');
    if (minionImg) minionImg.style.display = 'none';

    // Show close button
    const closeBtn = document.getElementById('maze_close_btn');
    if (closeBtn) closeBtn.style.display = '';

    // Execute loss command if exists
    if (currentMaze.profile.loseCommand) {
        executeWithTimeout(currentMaze.profile.loseCommand);
    }

    document.removeEventListener('keydown', handleMazeKeydown, { capture: true });
}

/**
 * Respawn player at start position
 */
function respawnPlayer() {
    currentMaze.playerX = 0;
    currentMaze.playerY = 0;
    currentMaze.isPaused = false;
    currentMaze.pendingEncounter = null;
    renderMazeGrid();

    // Show respawn message from main minion
    const profile = currentMaze.profile;
    if (profile.mainMinion) {
        const mainMinion = getMinion(profile.mainMinion);
        if (mainMinion) {
            currentMaze.currentMinion = {
                name: mainMinion.name,
                imagePath: mainMinion.imagePath,
                message: 'Back to the beginning with you!',
            };
            updateMazeHero();
            return;
        }
    }

    // Otherwise show default
    currentMaze.currentMinion = getDefaultMinion();
    updateMazeHero();
}

async function handleMazeWin() {
    currentMaze.isVictory = true;

    // Stop stats timer
    stopStatsTimer();

    // Save persistent stats
    savePersistentStats('win');

    // Record result
    lastResults.maze[currentMaze.profileName] = {
        result: 'win',
        timestamp: Date.now(),
    };

    // Update UI
    updateMazeHero();
    renderMazeGrid();

    // Show close button
    const closeBtn = document.getElementById('maze_close_btn');
    if (closeBtn) closeBtn.style.display = '';

    // Hide mobile controls
    const controls = document.querySelector('.mazemaster-maze-controls');
    if (controls) controls.style.display = 'none';

    // Remove keyboard listener
    document.removeEventListener('keydown', handleMazeKeydown, { capture: true });

    // Execute win command
    if (currentMaze.profile.winCommand) {
        await executeWithTimeout(currentMaze.profile.winCommand);
    }

    console.log(`[MazeMaster] Maze "${currentMaze.profileName}" completed!`);
}

// =============================================================================
// CONFIG PANEL UI
// =============================================================================

function getPanelHtml() {
    const wheelProfiles = getProfileNames();
    const currentWheelProfile = extensionSettings.currentProfile || 'default';
    const bbProfiles = getBattlebarProfileNames();
    const currentBbProfile = extensionSettings.currentBattlebarProfile || 'default';
    const currentBb = getBattlebarProfile(currentBbProfile) || {};
    const mazeProfiles = getMazeProfileNames();
    const currentMazeProfileName = extensionSettings.currentMazeProfile || 'default';
    const currentMazeData = getMazeProfile(currentMazeProfileName) || {};
    const minionsList = getMinionNames();
    const activeGame = extensionSettings.activeGameConfig || 'wheel';

    return `
        <div class="mazemaster-panel">
            <div class="mazemaster-panel-header">
                <h2><i class="fa-solid fa-gamepad"></i> MazeMaster</h2>
            </div>
            <div class="mazemaster-tabs">
                <button class="mazemaster-tab" data-tab="game">Game</button>
                <button class="mazemaster-tab active" data-tab="config">Config</button>
            </div>
            <div class="mazemaster-panel-content">
                <!-- GAME TAB -->
                <div class="mazemaster-tab-content" id="mazemaster-tab-game">
                    <div class="mazemaster-game-launch">
                        <div class="mazemaster-section">
                            <label class="mazemaster-label">Maze Profile</label>
                            <select id="mazemaster_play_profile" class="mazemaster-select">
                                ${mazeProfiles.length === 0 ? '<option value="">No profiles</option>' : ''}
                                ${mazeProfiles.map(p => `<option value="${escapeHtml(p)}" ${p === currentMazeProfileName ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
                            </select>
                        </div>
                        <button id="mazemaster_play_maze" class="menu_button menu_button_primary mazemaster-play-btn">
                            <i class="fa-solid fa-play"></i> Play Maze
                        </button>
                    </div>

                    <!-- LLM Generation Settings -->
                    <div class="mazemaster-section">
                        <label class="mazemaster-label"><i class="fa-solid fa-brain"></i> LLM Message Generation</label>
                        <div class="mazemaster-form-group">
                            <label>Generation Preset</label>
                            <select id="mazemaster_llm_preset" class="mazemaster-select">
                                <option value="">(Use Current)</option>
                                <!-- Presets populated dynamically -->
                            </select>
                        </div>
                        <label class="mazemaster-checkbox-label">
                            <input type="checkbox" id="mazemaster_llm_enabled" ${extensionSettings.llmEnabled !== false ? 'checked' : ''}>
                            Enable LLM message generation
                        </label>
                    </div>

                    <!-- D-Pad Settings -->
                    <div class="mazemaster-section">
                        <label class="mazemaster-label"><i class="fa-solid fa-gamepad"></i> D-Pad Controls</label>
                        <label class="mazemaster-checkbox-label">
                            <input type="checkbox" id="mazemaster_dpad_enabled" ${extensionSettings.dpadConfig?.enabled !== false ? 'checked' : ''}>
                            Enable D-Pad controls
                        </label>
                        <label class="mazemaster-checkbox-label">
                            <input type="checkbox" id="mazemaster_dpad_floating" ${extensionSettings.dpadConfig?.floating !== false ? 'checked' : ''}>
                            Floating D-Pad (draggable position)
                        </label>
                        <button id="mazemaster_dpad_reset" class="menu_button" style="margin-top: 6px;">
                            <i class="fa-solid fa-rotate-left"></i> Reset D-Pad Position
                        </button>
                    </div>

                    <!-- Renderer Settings -->
                    <div class="mazemaster-section">
                        <label class="mazemaster-label"><i class="fa-solid fa-cube"></i> Renderer</label>
                        <select id="mazemaster_renderer_type" class="mazemaster-select">
                            <option value="css-grid" ${(extensionSettings.rendererType || 'css-grid') === 'css-grid' ? 'selected' : ''}>Classic (CSS Grid)</option>
                            <option value="isometric" ${extensionSettings.rendererType === 'isometric' ? 'selected' : ''}>Isometric 2.5D</option>
                            <option value="canvas" ${extensionSettings.rendererType === 'canvas' ? 'selected' : ''}>Canvas (Experimental)</option>
                        </select>
                        <div class="mazemaster-help-small"><small>Isometric gives a 3D-like view. Requires restart of active maze.</small></div>
                    </div>

                    <!-- Layout Mode -->
                    <div class="mazemaster-section">
                        <label class="mazemaster-label"><i class="fa-solid fa-mobile-screen"></i> Layout Mode</label>
                        <select id="mazemaster_layout_mode" class="mazemaster-select">
                            <option value="auto" ${(extensionSettings.layoutMode || 'auto') === 'auto' ? 'selected' : ''}>Auto-detect</option>
                            <option value="desktop" ${extensionSettings.layoutMode === 'desktop' ? 'selected' : ''}>Desktop (Horizontal)</option>
                            <option value="mobile" ${extensionSettings.layoutMode === 'mobile' ? 'selected' : ''}>Mobile (Vertical)</option>
                        </select>
                        <div class="mazemaster-help-small"><small>Mobile layout stacks UI vertically for portrait screens.</small></div>
                    </div>

                    <!-- Saved Games in Game Tab -->
                    <div class="mazemaster-section">
                        <label class="mazemaster-label"><i class="fa-solid fa-floppy-disk"></i> Saved Games</label>
                        <div id="mazemaster_game_tab_saves" class="mazemaster-saved-games-list">
                            <!-- Saved games rendered here -->
                        </div>
                    </div>
                </div>

                <!-- CONFIG TAB -->
                <div class="mazemaster-tab-content active" id="mazemaster-tab-config">
                    <!-- Game Selector -->
                    <div class="mazemaster-game-selector">
                        <button id="mazemaster_show_wheel" class="menu_button mazemaster-game-btn ${activeGame === 'wheel' ? 'active' : ''}">
                            <i class="fa-solid fa-dharmachakra"></i> Wheel
                        </button>
                        <button id="mazemaster_show_battlebar" class="menu_button mazemaster-game-btn ${activeGame === 'battlebar' ? 'active' : ''}">
                            <i class="fa-solid fa-bars-progress"></i> Battlebar
                        </button>
                        <button id="mazemaster_show_maze" class="menu_button mazemaster-game-btn ${activeGame === 'maze' ? 'active' : ''}">
                            <i class="fa-solid fa-border-all"></i> Maze
                        </button>
                        <button id="mazemaster_show_minions" class="menu_button mazemaster-game-btn ${activeGame === 'minions' ? 'active' : ''}">
                            <i class="fa-solid fa-ghost"></i> Minions
                        </button>
                        <button id="mazemaster_show_traps" class="menu_button mazemaster-game-btn ${activeGame === 'traps' ? 'active' : ''}">
                            <i class="fa-solid fa-dungeon"></i> Traps
                        </button>
                    </div>

                    <!-- WHEEL CONFIG -->
                    <div id="mazemaster_wheel_config" class="mazemaster-game-config" style="${activeGame === 'wheel' ? '' : 'display: none;'}">
                        <div class="mazemaster-section">
                            <label class="mazemaster-label">Wheel Profile</label>
                            <div class="mazemaster-profile-row">
                                <select id="mazemaster_profile_select" class="mazemaster-select">
                                    ${wheelProfiles.length === 0 ? '<option value="">No profiles</option>' : ''}
                                    ${wheelProfiles.map(p => `<option value="${escapeHtml(p)}" ${p === currentWheelProfile ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
                                </select>
                                <button id="mazemaster_new_profile_btn" class="menu_button menu_button_icon" title="New Profile">
                                    <i class="fa-solid fa-plus"></i>
                                </button>
                                <button id="mazemaster_delete_profile_btn" class="menu_button menu_button_icon" title="Delete Profile">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                                <button id="mazemaster_rename_profile_btn" class="menu_button menu_button_icon" title="Rename Profile">
                                    <i class="fa-solid fa-pen"></i>
                                </button>
                                <button id="mazemaster_export_btn" class="menu_button menu_button_icon" title="Export Profile">
                                    <i class="fa-solid fa-download"></i>
                                </button>
                                <button id="mazemaster_import_btn" class="menu_button menu_button_icon" title="Import Profile">
                                    <i class="fa-solid fa-upload"></i>
                                </button>
                                <input type="file" id="mazemaster_import_file" accept=".json" style="display: none;">
                                <button id="mazemaster_preview_wheel_btn" class="menu_button menu_button_icon" title="Preview Wheel">
                                    <i class="fa-solid fa-eye"></i>
                                </button>
                            </div>
                        </div>

                        <div class="mazemaster-section mazemaster-profile-settings">
                            <div class="mazemaster-profile-options">
                                <label class="mazemaster-checkbox-label">
                                    <input type="checkbox" id="mazemaster_randomize" ${getProfile(currentWheelProfile)?.randomize ? 'checked' : ''}>
                                    Randomize segment positions
                                </label>
                                <div class="mazemaster-difficulty-row">
                                    <label>Difficulty:</label>
                                    <select id="mazemaster_difficulty" class="mazemaster-select-small">
                                        ${[1,2,3,4,5].map(n => `<option value="${n}" ${(getProfile(currentWheelProfile)?.difficulty || 1) === n ? 'selected' : ''}>${n}</option>`).join('')}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="mazemaster-section">
                            <label class="mazemaster-label">Segments</label>
                            <div id="mazemaster_segments_list" class="mazemaster-segments-list">
                                <!-- Segments rendered here -->
                            </div>
                            <button id="mazemaster_add_segment_btn" class="menu_button mazemaster-add-btn">
                                <i class="fa-solid fa-plus"></i> Add Segment
                            </button>
                        </div>

                        <div class="mazemaster-section">
                            <button id="mazemaster_save_btn" class="menu_button menu_button_primary mazemaster-save-btn">
                                <i class="fa-solid fa-save"></i> Save Profile
                            </button>
                        </div>

                        <div class="mazemaster-section">
                            <div class="mazemaster-help">
                                <div class="mazemaster-help-title">Usage:</div>
                                <code>/wheel profile="profileName"</code>
                                <div class="mazemaster-help-title">Sizes:</div>
                                <ul>
                                    <li><code>fraction</code> - Normal (1x)</li>
                                    <li><code>halfseg</code> - Half (0.5x)</li>
                                    <li><code>doubleseg</code> - Double (2x)</li>
                                </ul>
                                <small>halfseg count must equal doubleseg count</small>
                            </div>
                        </div>
                    </div>

                    <!-- BATTLEBAR CONFIG -->
                    <div id="mazemaster_battlebar_config" class="mazemaster-game-config" style="${activeGame === 'battlebar' ? '' : 'display: none;'}">
                        <div class="mazemaster-section">
                            <label class="mazemaster-label">Battlebar Profile</label>
                            <div class="mazemaster-profile-row">
                                <select id="mazemaster_bb_profile_select" class="mazemaster-select">
                                    ${bbProfiles.length === 0 ? '<option value="">No profiles</option>' : ''}
                                    ${bbProfiles.map(p => `<option value="${escapeHtml(p)}" ${p === currentBbProfile ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
                                </select>
                                <button id="mazemaster_bb_new_profile_btn" class="menu_button menu_button_icon" title="New Profile">
                                    <i class="fa-solid fa-plus"></i>
                                </button>
                                <button id="mazemaster_bb_delete_profile_btn" class="menu_button menu_button_icon" title="Delete Profile">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                                <button id="mazemaster_bb_rename_profile_btn" class="menu_button menu_button_icon" title="Rename Profile">
                                    <i class="fa-solid fa-pen"></i>
                                </button>
                                <button id="mazemaster_bb_export_btn" class="menu_button menu_button_icon" title="Export Profile">
                                    <i class="fa-solid fa-download"></i>
                                </button>
                                <button id="mazemaster_bb_import_btn" class="menu_button menu_button_icon" title="Import Profile">
                                    <i class="fa-solid fa-upload"></i>
                                </button>
                                <input type="file" id="mazemaster_bb_import_file" accept=".json" style="display: none;">
                                <button id="mazemaster_preview_battlebar_btn" class="menu_button menu_button_icon" title="Preview Battlebar">
                                    <i class="fa-solid fa-eye"></i>
                                </button>
                            </div>
                        </div>

                        <div class="mazemaster-section mazemaster-profile-settings">
                            <div class="mazemaster-bb-settings">
                                <div class="mazemaster-bb-row">
                                    <div class="mazemaster-bb-field">
                                        <label>Difficulty</label>
                                        <select id="mazemaster_bb_difficulty" class="mazemaster-select">
                                            ${[1,2,3,4,5].map(n => `<option value="${n}" ${(currentBb.difficulty || 3) === n ? 'selected' : ''}>${n}</option>`).join('')}
                                        </select>
                                    </div>
                                    <div class="mazemaster-bb-field">
                                        <label>Hits to Win</label>
                                        <input type="number" id="mazemaster_bb_hits" min="1" max="20" value="${currentBb.hitsToWin || 5}">
                                    </div>
                                    <div class="mazemaster-bb-field">
                                        <label>Misses to Lose</label>
                                        <input type="number" id="mazemaster_bb_misses" min="1" max="20" value="${currentBb.missesToLose || 3}">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="mazemaster-section">
                            <label class="mazemaster-label">Main Title</label>
                            <input type="text" id="mazemaster_bb_main_title" class="mazemaster-input" placeholder="e.g. Boss Battle!" value="${escapeHtml(currentBb.mainTitle || '')}">
                        </div>

                        <div class="mazemaster-section">
                            <label class="mazemaster-label">Commands</label>
                            <div class="mazemaster-bb-commands">
                                <div class="mazemaster-bb-command">
                                    <label>On Hit:</label>
                                    <textarea id="mazemaster_bb_hit_cmd" placeholder="/echo Hit!">${escapeHtml(currentBb.hitCommand || '')}</textarea>
                                </div>
                                <div class="mazemaster-bb-command">
                                    <label>On Miss:</label>
                                    <textarea id="mazemaster_bb_miss_cmd" placeholder="/echo Miss!">${escapeHtml(currentBb.missCommand || '')}</textarea>
                                </div>
                                <div class="mazemaster-bb-command">
                                    <label>On Win:</label>
                                    <textarea id="mazemaster_bb_win_cmd" placeholder="/echo Victory!">${escapeHtml(currentBb.winCommand || '')}</textarea>
                                </div>
                                <div class="mazemaster-bb-command">
                                    <label>On Lose:</label>
                                    <textarea id="mazemaster_bb_lose_cmd" placeholder="/echo Defeat!">${escapeHtml(currentBb.loseCommand || '')}</textarea>
                                </div>
                            </div>
                        </div>

                        <div class="mazemaster-section">
                            <label class="mazemaster-label">Stages (click image to edit message)</label>
                            <div id="mazemaster_bb_images_list" class="mazemaster-bb-images-list">
                                <!-- Images rendered here -->
                            </div>
                            <button id="mazemaster_bb_add_image_btn" class="menu_button mazemaster-add-btn">
                                <i class="fa-solid fa-plus"></i> Add Image
                            </button>
                            <input type="file" id="mazemaster_bb_image_file" accept="image/*" style="display: none;">
                        </div>

                        <div class="mazemaster-section">
                            <label class="mazemaster-label">Item Drops on Win (Maze Only)</label>
                            <div class="mazemaster-row">
                                <label>Key %</label>
                                <input type="number" id="mazemaster_bb_key_drop" class="mazemaster-input-small" min="0" max="100" value="${currentBb.keyDropChance ?? 40}">
                            </div>
                            <div class="mazemaster-row">
                                <label>POW %</label>
                                <input type="number" id="mazemaster_bb_pow_drop" class="mazemaster-input-small" min="0" max="100" value="${currentBb.powDropChance ?? 20}">
                            </div>
                            <div class="mazemaster-row">
                                <label>Stealth %</label>
                                <input type="number" id="mazemaster_bb_stealth_drop" class="mazemaster-input-small" min="0" max="100" value="${currentBb.stealthDropChance ?? 10}">
                            </div>
                        </div>

                        <div class="mazemaster-section">
                            <button id="mazemaster_bb_save_btn" class="menu_button menu_button_primary mazemaster-save-btn">
                                <i class="fa-solid fa-save"></i> Save Profile
                            </button>
                        </div>

                        <div class="mazemaster-section">
                            <div class="mazemaster-help">
                                <div class="mazemaster-help-title">Usage:</div>
                                <code>/battlebar profile="profileName"</code>
                                <div class="mazemaster-help-title">Difficulty:</div>
                                <ul>
                                    <li><code>1</code> - Easy (large zone, slow)</li>
                                    <li><code>3</code> - Medium</li>
                                    <li><code>5</code> - Hard (small zone, fast)</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <!-- MAZE CONFIG -->
                    <div id="mazemaster_maze_config" class="mazemaster-game-config" style="${activeGame === 'maze' ? '' : 'display: none;'}">
                        <!-- Profile Selection -->
                        <div class="mazemaster-section">
                            <label class="mazemaster-label">Maze Profile</label>
                            <div class="mazemaster-profile-row">
                                <select id="mazemaster_maze_profile_select" class="mazemaster-select">
                                    ${mazeProfiles.length === 0 ? '<option value="">No profiles</option>' : ''}
                                    ${mazeProfiles.map(p => `<option value="${escapeHtml(p)}" ${p === currentMazeProfileName ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
                                </select>
                                <button id="mazemaster_maze_new_profile_btn" class="menu_button menu_button_icon" title="New Profile">
                                    <i class="fa-solid fa-plus"></i>
                                </button>
                                <button id="mazemaster_maze_delete_profile_btn" class="menu_button menu_button_icon" title="Delete Profile">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                                <button id="mazemaster_maze_rename_profile_btn" class="menu_button menu_button_icon" title="Rename Profile">
                                    <i class="fa-solid fa-pen"></i>
                                </button>
                            </div>
                        </div>

                        <!-- Grid Size and Difficulty -->
                        <div class="mazemaster-inline-row">
                            <div class="mazemaster-section mazemaster-flex-1">
                                <label class="mazemaster-label">Grid Size</label>
                                <select id="mazemaster_maze_size" class="mazemaster-select">
                                    <option value="7" ${(currentMazeData.gridSize || 10) === 7 ? 'selected' : ''}>7x7</option>
                                    <option value="10" ${(currentMazeData.gridSize || 10) === 10 ? 'selected' : ''}>10x10</option>
                                    <option value="15" ${(currentMazeData.gridSize || 10) === 15 ? 'selected' : ''}>15x15</option>
                                    <option value="20" ${(currentMazeData.gridSize || 10) === 20 ? 'selected' : ''}>20x20</option>
                                </select>
                            </div>
                            <div class="mazemaster-section mazemaster-flex-1">
                                <label class="mazemaster-label">Difficulty</label>
                                <select id="mazemaster_maze_difficulty" class="mazemaster-select">
                                    <option value="easy" ${(currentMazeData.difficulty || 'normal') === 'easy' ? 'selected' : ''}>Easy</option>
                                    <option value="normal" ${(currentMazeData.difficulty || 'normal') === 'normal' ? 'selected' : ''}>Normal</option>
                                    <option value="hard" ${(currentMazeData.difficulty || 'normal') === 'hard' ? 'selected' : ''}>Hard</option>
                                    <option value="nightmare" ${(currentMazeData.difficulty || 'normal') === 'nightmare' ? 'selected' : ''}>Nightmare</option>
                                </select>
                            </div>
                        </div>
                        <div class="mazemaster-help-small"><small>Difficulty affects encounter density, trap frequency, loot, and starting inventory</small></div>

                        <div class="mazemaster-flex-row">
                            <div class="mazemaster-section mazemaster-flex-1">
                                <label class="mazemaster-label">Theme</label>
                                <select id="mazemaster_maze_theme" class="mazemaster-select">
                                    <option value="fantasy" ${(currentMazeData.theme || 'fantasy') === 'fantasy' ? 'selected' : ''}>Fantasy</option>
                                    <option value="horror" ${(currentMazeData.theme || 'fantasy') === 'horror' ? 'selected' : ''}>Horror</option>
                                    <option value="scifi" ${(currentMazeData.theme || 'fantasy') === 'scifi' ? 'selected' : ''}>Sci-Fi</option>
                                    <option value="action" ${(currentMazeData.theme || 'fantasy') === 'action' ? 'selected' : ''}>Action</option>
                                    <option value="cyberpunk" ${(currentMazeData.theme || 'fantasy') === 'cyberpunk' ? 'selected' : ''}>Cyberpunk</option>
                                    <option value="noir" ${(currentMazeData.theme || 'fantasy') === 'noir' ? 'selected' : ''}>Noir</option>
                                    <option value="postapoc" ${(currentMazeData.theme || 'fantasy') === 'postapoc' ? 'selected' : ''}>Post-Apocalyptic</option>
                                    <option value="comedy" ${(currentMazeData.theme || 'fantasy') === 'comedy' ? 'selected' : ''}>Comedy</option>
                                    <option value="western" ${(currentMazeData.theme || 'fantasy') === 'western' ? 'selected' : ''}>Western</option>
                                </select>
                            </div>
                            <div class="mazemaster-section mazemaster-flex-1">
                                <label class="mazemaster-label">Map Style</label>
                                <select id="mazemaster_maze_mapstyle" class="mazemaster-select">
                                    <option value="maze" ${(currentMazeData.mapStyle || 'maze') === 'maze' ? 'selected' : ''}>Classic Maze</option>
                                    <option value="dungeon" ${(currentMazeData.mapStyle || 'maze') === 'dungeon' ? 'selected' : ''}>Dungeon</option>
                                    <option value="city" ${(currentMazeData.mapStyle || 'maze') === 'city' ? 'selected' : ''}>City Streets</option>
                                    <option value="forest" ${(currentMazeData.mapStyle || 'maze') === 'forest' ? 'selected' : ''}>Forest</option>
                                    <option value="outpost" ${(currentMazeData.mapStyle || 'maze') === 'outpost' ? 'selected' : ''}>Outpost</option>
                                    <option value="spacestation" ${(currentMazeData.mapStyle || 'maze') === 'spacestation' ? 'selected' : ''}>Space Station</option>
                                    <option value="college" ${(currentMazeData.mapStyle || 'maze') === 'college' ? 'selected' : ''}>College Campus</option>
                                    <option value="apartment" ${(currentMazeData.mapStyle || 'maze') === 'apartment' ? 'selected' : ''}>Apartment Complex</option>
                                    <option value="neotokyo" ${(currentMazeData.mapStyle || 'maze') === 'neotokyo' ? 'selected' : ''}>Neo Tokyo</option>
                                    <option value="arena" ${(currentMazeData.mapStyle || 'maze') === 'arena' ? 'selected' : ''}>Battle Arena</option>
                                    <option value="hospital" ${(currentMazeData.mapStyle || 'maze') === 'hospital' ? 'selected' : ''}>Hospital</option>
                                    <option value="highrise" ${(currentMazeData.mapStyle || 'maze') === 'highrise' ? 'selected' : ''}>Abandoned Highrise</option>
                                </select>
                            </div>
                            <div class="mazemaster-section mazemaster-flex-1">
                                <label class="mazemaster-label">Floors</label>
                                <select id="mazemaster_maze_floors" class="mazemaster-select">
                                    <option value="1" ${(currentMazeData.floors || 1) === 1 ? 'selected' : ''}>1 Floor</option>
                                    <option value="2" ${(currentMazeData.floors || 1) === 2 ? 'selected' : ''}>2 Floors</option>
                                    <option value="3" ${(currentMazeData.floors || 1) === 3 ? 'selected' : ''}>3 Floors</option>
                                    <option value="4" ${(currentMazeData.floors || 1) === 4 ? 'selected' : ''}>4 Floors</option>
                                    <option value="5" ${(currentMazeData.floors || 1) === 5 ? 'selected' : ''}>5 Floors</option>
                                </select>
                            </div>
                        </div>
                        <div class="mazemaster-help-small"><small>Theme affects flavor text and item names. Map style changes the generation algorithm. Floors adds vertical navigation with staircases.</small></div>

                        <div class="mazemaster-row" style="margin-top: 8px;">
                            <label class="mazemaster-checkbox-label">
                                <input type="checkbox" id="mazemaster_maze_fog_of_war" ${currentMazeData.fogOfWar ? 'checked' : ''}>
                                <span>Enable Fog of War</span>
                            </label>
                        </div>

                        <!-- COLLAPSIBLE: Teleport Portals -->
                        <div class="mazemaster-collapsible ${(currentMazeData.portals && currentMazeData.portals.length > 0) ? 'expanded' : ''}">
                            <button class="mazemaster-collapsible-header" data-target="portals_section">
                                <i class="fa-solid fa-chevron-right mazemaster-collapse-icon"></i>
                                <span>Teleport Portals</span>
                                <span class="mazemaster-collapse-hint">(${(currentMazeData.portals || []).length} portal pairs)</span>
                            </button>
                            <div id="portals_section" class="mazemaster-collapsible-content" style="display: ${(currentMazeData.portals && currentMazeData.portals.length > 0) ? 'block' : 'none'};">
                                <div class="mazemaster-section">
                                    <div class="mazemaster-help-small"><small>Add portals that teleport the player between two points. Leave coordinates blank for random placement.</small></div>
                                    <div id="mazemaster_portals_list" class="mazemaster-portals-list">
                                        ${(currentMazeData.portals || []).map((portal, idx) => `
                                            <div class="mazemaster-portal-item" data-portal-index="${idx}">
                                                <div class="portal-header">
                                                    <span class="portal-color" style="background: ${portal.color || '#9b59b6'}"></span>
                                                    <span class="portal-name">${escapeHtml(portal.id || 'Portal ' + (idx + 1))}</span>
                                                    <button class="menu_button remove-portal-btn" data-index="${idx}" title="Remove Portal">
                                                        <i class="fa-solid fa-trash"></i>
                                                    </button>
                                                </div>
                                                <div class="portal-details">
                                                    <div class="portal-row">
                                                        <label>ID:</label>
                                                        <input type="text" class="portal-id mazemaster-input" value="${escapeHtml(portal.id || '')}" placeholder="portal1">
                                                    </div>
                                                    <div class="portal-row">
                                                        <label>Color:</label>
                                                        <input type="color" class="portal-color-input" value="${portal.color || '#9b59b6'}">
                                                    </div>
                                                    <div class="portal-row">
                                                        <label>Bidirectional:</label>
                                                        <input type="checkbox" class="portal-bidirectional" ${portal.bidirectional !== false ? 'checked' : ''}>
                                                    </div>
                                                    <div class="portal-row coords-row">
                                                        <span>Start: X</span>
                                                        <input type="number" class="portal-start-x mazemaster-input" value="${portal.startX ?? ''}" placeholder="auto" min="0">
                                                        <span>Y</span>
                                                        <input type="number" class="portal-start-y mazemaster-input" value="${portal.startY ?? ''}" placeholder="auto" min="0">
                                                    </div>
                                                    <div class="portal-row coords-row">
                                                        <span>End: X</span>
                                                        <input type="number" class="portal-end-x mazemaster-input" value="${portal.endX ?? ''}" placeholder="auto" min="0">
                                                        <span>Y</span>
                                                        <input type="number" class="portal-end-y mazemaster-input" value="${portal.endY ?? ''}" placeholder="auto" min="0">
                                                    </div>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                    <button id="mazemaster_add_portal_btn" class="menu_button">
                                        <i class="fa-solid fa-plus"></i> Add Portal Pair
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- COLLAPSIBLE: Objectives -->
                        <div class="mazemaster-collapsible ${(currentMazeData.objectives && currentMazeData.objectives.length > 0) ? 'expanded' : ''}">
                            <button class="mazemaster-collapsible-header" data-target="objectives_section">
                                <i class="fa-solid fa-chevron-right mazemaster-collapse-icon"></i>
                                <span>Objectives</span>
                                <span class="mazemaster-collapse-hint">(${(currentMazeData.objectives || []).length} objectives)</span>
                            </button>
                            <div id="objectives_section" class="mazemaster-collapsible-content" style="display: ${(currentMazeData.objectives && currentMazeData.objectives.length > 0) ? 'block' : 'none'};">
                                <div class="mazemaster-section">
                                    <div class="mazemaster-help-small"><small>Define objectives the player must complete. Required objectives must be done before exiting.</small></div>
                                    <div id="mazemaster_objectives_list" class="mazemaster-objectives-list">
                                        ${(currentMazeData.objectives || []).map((obj, idx) => `
                                            <div class="mazemaster-objective-item" data-objective-index="${idx}">
                                                <div class="objective-config-header">
                                                    <span class="objective-name">${escapeHtml(obj.description || obj.id || 'Objective ' + (idx + 1))}</span>
                                                    <button class="menu_button remove-objective-btn" data-index="${idx}" title="Remove Objective">
                                                        <i class="fa-solid fa-trash"></i>
                                                    </button>
                                                </div>
                                                <div class="objective-config-details">
                                                    <div class="objective-config-row">
                                                        <label>ID:</label>
                                                        <input type="text" class="objective-id mazemaster-input" value="${escapeHtml(obj.id || '')}" placeholder="obj1">
                                                    </div>
                                                    <div class="objective-config-row">
                                                        <label>Type:</label>
                                                        <select class="objective-type mazemaster-select">
                                                            <option value="collect" ${obj.type === 'collect' ? 'selected' : ''}>Collect Item</option>
                                                            <option value="defeat" ${obj.type === 'defeat' ? 'selected' : ''}>Defeat Minion</option>
                                                            <option value="explore" ${obj.type === 'explore' ? 'selected' : ''}>Explore %</option>
                                                        </select>
                                                    </div>
                                                    <div class="objective-config-row objective-target-row" style="display: ${obj.type !== 'explore' ? 'flex' : 'none'};">
                                                        <label>Target:</label>
                                                        <input type="text" class="objective-target mazemaster-input" value="${escapeHtml(obj.target || '')}" placeholder="${obj.type === 'collect' ? 'key, pow, stealth...' : 'minion ID'}">
                                                    </div>
                                                    <div class="objective-config-row">
                                                        <label>Count:</label>
                                                        <input type="number" class="objective-count mazemaster-input" value="${obj.count || 1}" min="1" placeholder="${obj.type === 'explore' ? '% to explore' : 'amount'}">
                                                    </div>
                                                    <div class="objective-config-row">
                                                        <label>Description:</label>
                                                        <input type="text" class="objective-description mazemaster-input" value="${escapeHtml(obj.description || '')}" placeholder="Find 3 Keys">
                                                    </div>
                                                    <div class="objective-config-row">
                                                        <label>Required:</label>
                                                        <input type="checkbox" class="objective-required" ${obj.required ? 'checked' : ''}>
                                                    </div>
                                                    <div class="objective-config-row">
                                                        <label>Reward Script:</label>
                                                        <input type="text" class="objective-reward mazemaster-input" value="${escapeHtml(obj.reward || '')}" placeholder="/echo Objective complete!">
                                                    </div>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                    <button id="mazemaster_add_objective_btn" class="menu_button">
                                        <i class="fa-solid fa-plus"></i> Add Objective
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- COLLAPSIBLE: Main Minion -->
                        <div class="mazemaster-collapsible ${currentMazeData.mainMinion ? 'expanded' : ''}">
                            <button class="mazemaster-collapsible-header" data-target="main_minion_section">
                                <i class="fa-solid fa-chevron-right mazemaster-collapse-icon"></i>
                                <span>Main Minion</span>
                                <span class="mazemaster-collapse-hint">(narrator/boss)</span>
                            </button>
                            <div id="main_minion_section" class="mazemaster-collapsible-content" style="display: ${currentMazeData.mainMinion ? 'block' : 'none'};">
                                <div class="mazemaster-section">
                                    <select id="mazemaster_maze_main_minion" class="mazemaster-select">
                                        <option value="">None</option>
                                        ${minionsList.map(id => {
                                            const m = getMinion(id);
                                            return `<option value="${escapeHtml(id)}" ${currentMazeData.mainMinion === id ? 'selected' : ''}>${escapeHtml(m?.name || id)}</option>`;
                                        }).join('')}
                                    </select>
                                    <div class="mazemaster-help-small"><small>The main minion narrates the maze and guards the exit</small></div>
                                </div>

                                <div id="mazemaster_main_minion_settings" class="mazemaster-subsection" style="display: ${currentMazeData.mainMinion ? 'block' : 'none'};">
                                    <div class="mazemaster-section">
                                        <label class="mazemaster-label">Intro Message</label>
                                        <input type="text" id="mazemaster_maze_intro_message" class="mazemaster-input" placeholder="Welcome to my maze..." value="${escapeHtml(currentMazeData.mainMinionIntroMessage || '')}">
                                    </div>

                                    <div class="mazemaster-inline-row">
                                        <div class="mazemaster-section mazemaster-flex-1">
                                            <label class="mazemaster-label">Random Msg %</label>
                                            <input type="number" id="mazemaster_maze_random_chance" class="mazemaster-input" min="0" max="100" value="${currentMazeData.mainMinionRandomChance || 15}">
                                        </div>
                                    </div>

                                    <div class="mazemaster-section">
                                        <label class="mazemaster-label">Random Messages (one per line)</label>
                                        <textarea id="mazemaster_maze_random_messages" class="mazemaster-textarea" rows="2" placeholder="You're still here?&#10;Getting lost yet?">${escapeHtml((currentMazeData.mainMinionRandomMessages || []).join('\n'))}</textarea>
                                    </div>

                                    <div class="mazemaster-section">
                                        <label class="mazemaster-label">Exit Encounter</label>
                                        <div class="mazemaster-help-small"><small>What happens when the player reaches the exit</small></div>
                                        <select id="mazemaster_maze_exit_type" class="mazemaster-select">
                                            <option value="messenger" ${(currentMazeData.mainMinionExitType || 'messenger') === 'messenger' ? 'selected' : ''}>Message Only (no challenge)</option>
                                            <option value="battlebar" ${currentMazeData.mainMinionExitType === 'battlebar' ? 'selected' : ''}>Battlebar Fight</option>
                                            <option value="prizewheel" ${currentMazeData.mainMinionExitType === 'prizewheel' ? 'selected' : ''}>Prize Wheel</option>
                                        </select>
                                    </div>

                                    <div id="mazemaster_exit_profile_section" class="mazemaster-section" style="display: ${currentMazeData.mainMinionExitType && currentMazeData.mainMinionExitType !== 'messenger' ? 'block' : 'none'};">
                                        <label class="mazemaster-label">Exit Game Profile</label>
                                        <div class="mazemaster-help-small"><small>Which Battlebar/Wheel profile to use for the exit boss</small></div>
                                        <select id="mazemaster_maze_exit_profile" class="mazemaster-select">
                                            <option value="">Select...</option>
                                        </select>
                                    </div>

                                    <div class="mazemaster-section">
                                        <button id="mazemaster_maze_story_btn" class="menu_button">
                                            <i class="fa-solid fa-book"></i> Story Milestones
                                        </button>
                                        <div class="mazemaster-help-small"><small>Configure story text shown as player progresses</small></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- COLLAPSIBLE: Encounters -->
                        <div class="mazemaster-collapsible expanded">
                            <button class="mazemaster-collapsible-header" data-target="encounters_section">
                                <i class="fa-solid fa-chevron-right mazemaster-collapse-icon"></i>
                                <span>Encounters</span>
                                <span class="mazemaster-collapse-hint">(minions & traps)</span>
                            </button>
                            <div id="encounters_section" class="mazemaster-collapsible-content" style="display: block;">
                                <div class="mazemaster-section">
                                    <label class="mazemaster-label">Minion Encounters</label>
                                    <div id="mazemaster_maze_encounters_list" class="mazemaster-encounters-list">
                                        <!-- Encounter rows rendered here -->
                                    </div>
                                    <button id="mazemaster_add_encounter_btn" class="menu_button mazemaster-add-btn">
                                        <i class="fa-solid fa-plus"></i> Add Minion
                                    </button>
                                </div>

                                <div class="mazemaster-section">
                                    <label class="mazemaster-label">Trap Tiles</label>
                                    <div id="mazemaster_maze_traps_list" class="mazemaster-encounters-list">
                                        <!-- Trap encounter rows rendered here -->
                                    </div>
                                    <button id="mazemaster_add_trap_encounter_btn" class="menu_button mazemaster-add-btn">
                                        <i class="fa-solid fa-plus"></i> Add Trap
                                    </button>
                                </div>

                                <div class="mazemaster-section">
                                    <button id="mazemaster_intelligent_distribute" class="menu_button mazemaster-distribute-btn">
                                        <i class="fa-solid fa-wand-magic-sparkles"></i> Intelligent Distribute
                                    </button>
                                    <div class="mazemaster-help-small">
                                        <small>Auto-sets tile percentages based on minion types</small>
                                    </div>
                                </div>

                                <div class="mazemaster-section">
                                    <label class="mazemaster-label">On Battlebar Loss</label>
                                    <select id="mazemaster_maze_loss_action" class="mazemaster-select">
                                        <option value="continue" ${(currentMazeData.onBattlebarLoss || 'continue') === 'continue' ? 'selected' : ''}>Continue (skip encounter)</option>
                                        <option value="respawn" ${currentMazeData.onBattlebarLoss === 'respawn' ? 'selected' : ''}>Respawn at Start</option>
                                        <option value="gameover" ${currentMazeData.onBattlebarLoss === 'gameover' ? 'selected' : ''}>Game Over</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- COLLAPSIBLE: Chests & Loot -->
                        <div class="mazemaster-collapsible">
                            <button class="mazemaster-collapsible-header" data-target="chests_section">
                                <i class="fa-solid fa-chevron-right mazemaster-collapse-icon"></i>
                                <span>Chests & Loot</span>
                            </button>
                            <div id="chests_section" class="mazemaster-collapsible-content" style="display: none;">
                                <div class="mazemaster-section">
                                    <label class="mazemaster-label">Chest Image</label>
                                    <div class="mazemaster-row" style="gap: 10px; align-items: center;">
                                        <div class="mazemaster-chest-preview" style="width: 50px; height: 50px; border-radius: 5px; overflow: hidden; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
                                            ${currentMazeData.chestImage ? `<img id="mazemaster_chest_preview_img" src="${getExtensionImagePath(currentMazeData.chestImage)}" style="width: 100%; height: 100%; object-fit: cover;">` : '<i id="mazemaster_chest_preview_icon" class="fa-solid fa-box" style="color: #888;"></i>'}
                                        </div>
                                        <button id="mazemaster_chest_image_btn" class="menu_button menu_button_icon" title="Upload Chest Image">
                                            <i class="fa-solid fa-upload"></i>
                                        </button>
                                        <input type="file" id="mazemaster_chest_image_file" accept="image/*" style="display: none;">
                                        <small style="color: #888;">Custom chest appearance</small>
                                    </div>
                                </div>

                                <div class="mazemaster-section">
                                    <label class="mazemaster-label">Chest Distribution</label>
                                    <div class="mazemaster-grid-2col">
                                        <div class="mazemaster-row">
                                            <label>Chest Tiles %</label>
                                            <input type="number" id="mazemaster_maze_chest_percent" class="mazemaster-input-small" min="0" max="50" value="${currentMazeData.chestTilePercent || 10}">
                                        </div>
                                        <div class="mazemaster-row">
                                            <label>Locked %</label>
                                            <input type="number" id="mazemaster_maze_locked_percent" class="mazemaster-input-small" min="0" max="100" value="${currentMazeData.chestLockedPercent || 30}">
                                        </div>
                                        <div class="mazemaster-row">
                                            <label>Locked Bonus %</label>
                                            <input type="number" id="mazemaster_maze_locked_bonus" class="mazemaster-input-small" min="0" max="200" value="${currentMazeData.chestLockedBonusPercent || 50}">
                                        </div>
                                        <div class="mazemaster-row">
                                            <label>Mimic %</label>
                                            <input type="number" id="mazemaster_maze_mimic_percent" class="mazemaster-input-small" min="0" max="100" value="${currentMazeData.chestMimicPercent || 15}">
                                        </div>
                                    </div>
                                </div>

                                <div class="mazemaster-section">
                                    <label class="mazemaster-label">Loot per Chest</label>
                                    <div class="mazemaster-row">
                                        <input type="number" id="mazemaster_maze_loot_min" class="mazemaster-input-small" min="1" max="10" value="${currentMazeData.chestLootMin || 1}" style="width:50px">
                                        <span>to</span>
                                        <input type="number" id="mazemaster_maze_loot_max" class="mazemaster-input-small" min="1" max="10" value="${currentMazeData.chestLootMax || 2}" style="width:50px">
                                        <span>items</span>
                                    </div>
                                </div>

                                <div class="mazemaster-section">
                                    <label class="mazemaster-label">Regular Chest Loot %</label>
                                    <div class="mazemaster-grid-4col">
                                        <div class="mazemaster-row"><label>Key</label><input type="number" id="mazemaster_maze_chest_key" class="mazemaster-input-small" min="0" max="100" value="${currentMazeData.chestKeyChance || 30}"></div>
                                        <div class="mazemaster-row"><label>POW</label><input type="number" id="mazemaster_maze_chest_pow" class="mazemaster-input-small" min="0" max="100" value="${currentMazeData.chestPowChance || 50}"></div>
                                        <div class="mazemaster-row"><label>Stealth</label><input type="number" id="mazemaster_maze_chest_stealth" class="mazemaster-input-small" min="0" max="100" value="${currentMazeData.chestStealthChance || 0}"></div>
                                        <div class="mazemaster-row"><label>G-POW</label><input type="number" id="mazemaster_maze_chest_grandpow" class="mazemaster-input-small" min="0" max="100" value="${currentMazeData.chestGrandpowChance || 0}"></div>
                                    </div>
                                </div>

                                <div class="mazemaster-section">
                                    <label class="mazemaster-label">Locked Chest Loot %</label>
                                    <div class="mazemaster-grid-4col">
                                        <div class="mazemaster-row"><label>Key</label><input type="number" id="mazemaster_maze_locked_key" class="mazemaster-input-small" min="0" max="100" value="${currentMazeData.lockedChestKeyChance || 40}"></div>
                                        <div class="mazemaster-row"><label>POW</label><input type="number" id="mazemaster_maze_locked_pow" class="mazemaster-input-small" min="0" max="100" value="${currentMazeData.lockedChestPowChance || 60}"></div>
                                        <div class="mazemaster-row"><label>Stealth</label><input type="number" id="mazemaster_maze_locked_stealth" class="mazemaster-input-small" min="0" max="100" value="${currentMazeData.lockedChestStealthChance || 30}"></div>
                                        <div class="mazemaster-row"><label>G-POW</label><input type="number" id="mazemaster_maze_locked_grandpow" class="mazemaster-input-small" min="0" max="100" value="${currentMazeData.lockedChestGrandpowChance || 5}"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- COLLAPSIBLE: Victory & Loss -->
                        <div class="mazemaster-collapsible">
                            <button class="mazemaster-collapsible-header" data-target="victory_section">
                                <i class="fa-solid fa-chevron-right mazemaster-collapse-icon"></i>
                                <span>Victory & Loss</span>
                            </button>
                            <div id="victory_section" class="mazemaster-collapsible-content" style="display: none;">
                                <div class="mazemaster-section">
                                    <label class="mazemaster-label">Victory Message</label>
                                    <input type="text" id="mazemaster_maze_win_message" class="mazemaster-input" placeholder="You escaped the maze!" value="${escapeHtml(currentMazeData.winMessage || '')}">
                                </div>

                                <div class="mazemaster-section">
                                    <label class="mazemaster-label">Victory Image</label>
                                    <div class="mazemaster-maze-win-image-row">
                                        <div class="mazemaster-maze-win-image-preview">
                                            ${currentMazeData.winImage ? `<img id="maze_win_image_preview" src="${escapeHtml(currentMazeData.winImage)}" alt="Victory">` : '<div id="maze_win_image_preview" class="no-image">No image</div>'}
                                        </div>
                                        <button id="mazemaster_maze_win_image_btn" class="menu_button">
                                            <i class="fa-solid fa-upload"></i> Upload
                                        </button>
                                    </div>
                                    <input type="file" id="mazemaster_maze_win_image_file" accept="image/*" style="display: none;">
                                </div>

                                <div class="mazemaster-section">
                                    <label class="mazemaster-label">Win Command</label>
                                    <textarea id="mazemaster_maze_win_cmd" class="mazemaster-textarea" rows="2" placeholder="/echo Victory!">${escapeHtml(currentMazeData.winCommand || '')}</textarea>
                                </div>

                                <div class="mazemaster-section">
                                    <label class="mazemaster-label">Lose Command</label>
                                    <textarea id="mazemaster_maze_lose_cmd" class="mazemaster-textarea" rows="2" placeholder="/echo Defeated...">${escapeHtml(currentMazeData.loseCommand || '')}</textarea>
                                </div>
                            </div>
                        </div>

                        <!-- COLLAPSIBLE: Starting Inventory -->
                        <div class="mazemaster-collapsible">
                            <button class="mazemaster-collapsible-header" data-target="starting_inv_section">
                                <i class="fa-solid fa-chevron-right mazemaster-collapse-icon"></i>
                                <span>Starting Inventory</span>
                            </button>
                            <div id="starting_inv_section" class="mazemaster-collapsible-content" style="display: none;">
                                <div class="mazemaster-section">
                                    <div class="mazemaster-grid-4col">
                                        <div class="mazemaster-row"><label><i class="fa-solid fa-key"></i> Keys</label><input type="number" id="mazemaster_start_key" class="mazemaster-input-small" min="0" max="99" value="${currentMazeData.startingInventory?.key || 0}"></div>
                                        <div class="mazemaster-row"><label><i class="fa-solid fa-bolt"></i> POW</label><input type="number" id="mazemaster_start_pow" class="mazemaster-input-small" min="0" max="99" value="${currentMazeData.startingInventory?.pow || 0}"></div>
                                        <div class="mazemaster-row"><label><i class="fa-solid fa-user-ninja"></i> Stealth</label><input type="number" id="mazemaster_start_stealth" class="mazemaster-input-small" min="0" max="99" value="${currentMazeData.startingInventory?.stealth || 0}"></div>
                                        <div class="mazemaster-row"><label><i class="fa-solid fa-star"></i> G-POW</label><input type="number" id="mazemaster_start_grandpow" class="mazemaster-input-small" min="0" max="99" value="${currentMazeData.startingInventory?.grandpow || 0}"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- COLLAPSIBLE: STScript Hooks -->
                        <div class="mazemaster-collapsible">
                            <button class="mazemaster-collapsible-header" data-target="hooks_section">
                                <i class="fa-solid fa-chevron-right mazemaster-collapse-icon"></i>
                                <span>STScript Hooks</span>
                                <span class="mazemaster-collapse-hint">(advanced)</span>
                            </button>
                            <div id="hooks_section" class="mazemaster-collapsible-content" style="display: none;">
                                <div class="mazemaster-help-small"><small>Run STScript commands when events occur. Use {{variable}} placeholders for event data.</small></div>

                                <div class="mazemaster-hooks-group">
                                    <label class="mazemaster-hooks-label">Movement</label>
                                    <div class="mazemaster-hooks-items">
                                        <div class="hook-item">
                                            <label>On Move</label>
                                            <input type="text" id="mazemaster_hook_onMove" class="mazemaster-input" value="${escapeHtml(currentMazeData.onMove || '')}" placeholder="{{x}}, {{y}}, {{direction}}">
                                        </div>
                                        <div class="hook-item">
                                            <label>On Milestone</label>
                                            <input type="text" id="mazemaster_hook_onMilestone" class="mazemaster-input" value="${escapeHtml(currentMazeData.onMilestone || '')}" placeholder="{{percentage}}">
                                        </div>
                                        <div class="hook-item">
                                            <label>On Explore Complete</label>
                                            <input type="text" id="mazemaster_hook_onExploreComplete" class="mazemaster-input" value="${escapeHtml(currentMazeData.onExploreComplete || '')}" placeholder="Fires at 100%">
                                        </div>
                                    </div>
                                </div>

                                <div class="mazemaster-hooks-group">
                                    <label class="mazemaster-hooks-label">Items</label>
                                    <div class="mazemaster-hooks-items">
                                        <div class="hook-item">
                                            <label>On Item Add</label>
                                            <input type="text" id="mazemaster_hook_onItemAdd" class="mazemaster-input" value="${escapeHtml(currentMazeData.onItemAdd || '')}" placeholder="{{item}}, {{count}}, {{total}}">
                                        </div>
                                        <div class="hook-item">
                                            <label>On Item Remove</label>
                                            <input type="text" id="mazemaster_hook_onItemRemove" class="mazemaster-input" value="${escapeHtml(currentMazeData.onItemRemove || '')}" placeholder="{{item}}, {{count}}, {{remaining}}">
                                        </div>
                                        <div class="hook-item">
                                            <label>On Chest Open</label>
                                            <input type="text" id="mazemaster_hook_onChestOpen" class="mazemaster-input" value="${escapeHtml(currentMazeData.onChestOpen || '')}" placeholder="{{type}}, {{loot}}">
                                        </div>
                                        <div class="hook-item">
                                            <label>On Trade</label>
                                            <input type="text" id="mazemaster_hook_onTrade" class="mazemaster-input" value="${escapeHtml(currentMazeData.onTrade || '')}" placeholder="{{given}}, {{received}}">
                                        </div>
                                    </div>
                                </div>

                                <div class="mazemaster-hooks-group">
                                    <label class="mazemaster-hooks-label">Special Tiles</label>
                                    <div class="mazemaster-hooks-items">
                                        <div class="hook-item">
                                            <label>On Enemy Move</label>
                                            <input type="text" id="mazemaster_hook_onEnemyMove" class="mazemaster-input" value="${escapeHtml(currentMazeData.onEnemyMove || '')}" placeholder="{{minionId}}, {{fromX}}, {{fromY}}, {{toX}}, {{toY}}">
                                        </div>
                                        <div class="hook-item">
                                            <label>On Teleport</label>
                                            <input type="text" id="mazemaster_hook_onTeleport" class="mazemaster-input" value="${escapeHtml(currentMazeData.onTeleport || '')}" placeholder="{{portalId}}, {{fromX}}, {{fromY}}, {{toX}}, {{toY}}">
                                        </div>
                                    </div>
                                </div>

                                <div class="mazemaster-hooks-group">
                                    <label class="mazemaster-hooks-label">Objectives</label>
                                    <div class="mazemaster-hooks-items">
                                        <div class="hook-item">
                                            <label>On Progress</label>
                                            <input type="text" id="mazemaster_hook_onObjectiveProgress" class="mazemaster-input" value="${escapeHtml(currentMazeData.onObjectiveProgress || '')}" placeholder="{{objectiveId}}, {{current}}, {{target}}">
                                        </div>
                                        <div class="hook-item">
                                            <label>On Complete</label>
                                            <input type="text" id="mazemaster_hook_onObjectiveComplete" class="mazemaster-input" value="${escapeHtml(currentMazeData.onObjectiveComplete || '')}" placeholder="{{objectiveId}}">
                                        </div>
                                        <div class="hook-item">
                                            <label>On All Complete</label>
                                            <input type="text" id="mazemaster_hook_onAllObjectivesComplete" class="mazemaster-input" value="${escapeHtml(currentMazeData.onAllObjectivesComplete || '')}" placeholder="All required done">
                                        </div>
                                    </div>
                                </div>

                                <div class="mazemaster-hooks-group">
                                    <label class="mazemaster-hooks-label">Stats</label>
                                    <div class="mazemaster-hooks-items">
                                        <div class="hook-item">
                                            <label>On Stat Update</label>
                                            <input type="text" id="mazemaster_hook_onStatUpdate" class="mazemaster-input" value="${escapeHtml(currentMazeData.onStatUpdate || '')}" placeholder="{{statName}}, {{value}}">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Save Button -->
                        <div class="mazemaster-section">
                            <button id="mazemaster_maze_save_btn" class="menu_button menu_button_primary mazemaster-save-btn">
                                <i class="fa-solid fa-save"></i> Save Profile
                            </button>
                        </div>

                        <!-- Saved Games -->
                        <div class="mazemaster-collapsible">
                            <button class="mazemaster-collapsible-header" data-target="saved_games_section">
                                <i class="fa-solid fa-chevron-right mazemaster-collapse-icon"></i>
                                <span>Saved Games</span>
                            </button>
                            <div id="saved_games_section" class="mazemaster-collapsible-content" style="display: none;">
                                <div id="mazemaster_saved_games_list" class="mazemaster-saved-games-list">
                                    <!-- Saved games rendered here -->
                                </div>
                            </div>
                        </div>

                        <!-- Usage Help -->
                        <div class="mazemaster-section">
                            <div class="mazemaster-help">
                                <div class="mazemaster-help-title">Usage:</div>
                                <code>/maze profile="profileName"</code>
                            </div>
                        </div>
                    </div>

                    <!-- MINIONS CONFIG -->
                    <div id="mazemaster_minions_config" class="mazemaster-game-config" style="${activeGame === 'minions' ? '' : 'display: none;'}">
                        <div class="mazemaster-section">
                            <label class="mazemaster-label">Minion Profile</label>
                            <div class="mazemaster-profile-row">
                                <select id="mazemaster_minion_profile_select" class="mazemaster-select">
                                    <option value="">(Current Minions)</option>
                                    ${Object.keys(extensionSettings.minionProfiles || {}).map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('')}
                                </select>
                                <button id="mazemaster_minion_profile_save_btn" class="menu_button menu_button_icon" title="Save Current as Profile">
                                    <i class="fa-solid fa-floppy-disk"></i>
                                </button>
                                <button id="mazemaster_minion_profile_load_btn" class="menu_button menu_button_icon" title="Load Profile">
                                    <i class="fa-solid fa-folder-open"></i>
                                </button>
                                <button id="mazemaster_minion_profile_delete_btn" class="menu_button menu_button_icon" title="Delete Profile">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                            <div class="mazemaster-help-small"><small>Save/load sets of minions as profiles</small></div>
                        </div>

                        <div class="mazemaster-section">
                            <label class="mazemaster-label">Minions</label>
                            <div id="mazemaster_minions_list" class="mazemaster-minions-list">
                                <!-- Minions rendered here -->
                            </div>
                            <button id="mazemaster_add_minion_btn" class="menu_button mazemaster-add-btn">
                                <i class="fa-solid fa-plus"></i> Add Minion
                            </button>
                            <input type="file" id="mazemaster_minion_image_file" accept="image/*" style="display: none;">
                        </div>

                        <div class="mazemaster-section">
                            <div class="mazemaster-help">
                                <div class="mazemaster-help-title">Usage:</div>
                                <code>/mazeminion name="MinionName" message="Hello!"</code>
                                <p><small>Sets the minion display in an active maze game.</small></p>
                            </div>
                        </div>
                    </div>

                    <!-- TRAPS CONFIG -->
                    <div id="mazemaster_traps_config" class="mazemaster-game-config" style="${activeGame === 'traps' ? '' : 'display: none;'}">
                        <div class="mazemaster-section">
                            <label class="mazemaster-label">Trap Profile</label>
                            <div class="mazemaster-profile-row">
                                <select id="mazemaster_trap_profile_select" class="mazemaster-select">
                                    <option value="">(Current Traps)</option>
                                    ${Object.keys(extensionSettings.trapProfiles || {}).map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('')}
                                </select>
                                <button id="mazemaster_trap_profile_save_btn" class="menu_button menu_button_icon" title="Save Current as Profile">
                                    <i class="fa-solid fa-floppy-disk"></i>
                                </button>
                                <button id="mazemaster_trap_profile_load_btn" class="menu_button menu_button_icon" title="Load Profile">
                                    <i class="fa-solid fa-folder-open"></i>
                                </button>
                                <button id="mazemaster_trap_profile_delete_btn" class="menu_button menu_button_icon" title="Delete Profile">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                            <div class="mazemaster-help-small"><small>Save/load sets of traps as profiles</small></div>
                        </div>

                        <div class="mazemaster-section">
                            <label class="mazemaster-label">Traps</label>
                            <div id="mazemaster_traps_list" class="mazemaster-traps-list">
                                <!-- Traps rendered here -->
                            </div>
                            <button id="mazemaster_add_trap_btn" class="menu_button mazemaster-add-btn">
                                <i class="fa-solid fa-plus"></i> Add Trap
                            </button>
                            <input type="file" id="mazemaster_trap_image_file" accept="image/*" style="display: none;">
                        </div>

                        <div class="mazemaster-section">
                            <div class="mazemaster-help">
                                <div class="mazemaster-help-title">Traps:</div>
                                <p><small>Traps can be placed on maze tiles. When a player steps on a trap, it shows the image/message and runs the script.</small></p>
                                <p><small>Add traps to maze profiles in the Maze tab under "Trap Tiles".</small></p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <style>
            .mazemaster-panel {
                display: flex;
                flex-direction: column;
                height: 100%;
            }

            .mazemaster-panel-header {
                padding: 10px 15px;
                border-bottom: 1px solid var(--SmartThemeBorderColor, #555);
            }

            .mazemaster-panel-header h2 {
                margin: 0;
                font-size: 1.2em;
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .mazemaster-tabs {
                display: flex;
                border-bottom: 1px solid var(--SmartThemeBorderColor, #555);
                padding: 0 10px;
            }

            .mazemaster-tab {
                padding: 8px 16px;
                background: transparent;
                border: none;
                border-bottom: 2px solid transparent;
                cursor: pointer;
                color: var(--SmartThemeBodyColor);
                font-size: 0.9em;
            }

            .mazemaster-tab:hover {
                background: rgba(255, 255, 255, 0.05);
            }

            .mazemaster-tab.active {
                border-bottom-color: var(--SmartThemeQuoteColor, #4a7c59);
                color: var(--SmartThemeQuoteColor, #4a7c59);
            }

            .mazemaster-panel-content {
                flex: 1;
                overflow-y: auto;
                padding: 15px;
            }

            .mazemaster-tab-content {
                display: none;
            }

            .mazemaster-tab-content.active {
                display: block;
            }

            .mazemaster-section {
                margin-bottom: 15px;
            }

            .mazemaster-label {
                display: block;
                font-weight: bold;
                margin-bottom: 5px;
                font-size: 0.9em;
            }

            .mazemaster-profile-row {
                display: flex;
                gap: 5px;
            }

            .mazemaster-profile-row select {
                flex: 1;
            }

            .mazemaster-select {
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 4px;
                padding: 6px 8px;
                color: var(--SmartThemeBodyColor);
            }

            .mazemaster-segments-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-bottom: 10px;
                max-height: 300px;
                overflow-y: auto;
            }

            .mazemaster-segment-item {
                background: rgba(0, 0, 0, 0.2);
                border-radius: 5px;
                padding: 10px;
            }

            .mazemaster-segment-row {
                display: flex;
                gap: 8px;
                margin-bottom: 8px;
                align-items: center;
            }

            .mazemaster-segment-row:last-child {
                margin-bottom: 0;
            }

            .mazemaster-segment-field {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .mazemaster-segment-field label {
                font-size: 0.7em;
                opacity: 0.7;
            }

            .mazemaster-segment-field input:not([type="checkbox"]),
            .mazemaster-segment-field select,
            .mazemaster-segment-field textarea {
                width: 100%;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 4px;
                padding: 5px 8px;
                color: var(--SmartThemeBodyColor);
                font-size: 0.85em;
            }

            .mazemaster-segment-field textarea {
                min-height: 40px;
                resize: vertical;
                font-family: monospace;
            }

            .mazemaster-segment-field.small {
                flex: 0 0 80px;
            }

            .mazemaster-segment-field.tiny {
                flex: 0 0 100px;
                overflow: visible;
            }

            .mazemaster-segment-checkbox {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 0.85em;
                cursor: pointer;
                white-space: nowrap;
                padding: 5px;
                margin: 0;
            }

            .mazemaster-segment-checkbox input[type="checkbox"] {
                width: 18px;
                height: 18px;
                min-width: 18px;
                min-height: 18px;
                cursor: pointer;
                pointer-events: auto;
                margin: 0;
                flex-shrink: 0;
            }

            .mazemaster-profile-settings {
                background: rgba(0, 0, 0, 0.15);
                padding: 10px;
                border-radius: 5px;
            }

            .mazemaster-profile-options {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .mazemaster-checkbox-label {
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                font-size: 0.9em;
            }

            .mazemaster-checkbox-label input[type="checkbox"] {
                width: 16px;
                height: 16px;
                cursor: pointer;
            }

            .mazemaster-difficulty-row {
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 0.9em;
            }

            .mazemaster-select-small {
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 4px;
                padding: 4px 8px;
                color: var(--SmartThemeBodyColor);
                width: 60px;
            }

            .mazemaster-segment-delete {
                padding: 5px 8px;
            }

            .mazemaster-add-btn,
            .mazemaster-save-btn {
                width: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
            }

            .mazemaster-distribute-btn {
                width: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                background: linear-gradient(135deg, #9b59b6, #8e44ad) !important;
                color: #fff !important;
            }

            .mazemaster-distribute-btn:hover {
                background: linear-gradient(135deg, #8e44ad, #7d3c98) !important;
            }

            .mazemaster-help-small {
                margin-top: 5px;
                color: #888;
                text-align: center;
            }

            .menu_button_primary {
                background: var(--SmartThemeQuoteColor, #4a7c59) !important;
            }

            .mazemaster-help {
                background: rgba(0, 0, 0, 0.2);
                padding: 10px;
                border-radius: 5px;
                font-size: 0.85em;
            }

            .mazemaster-help-title {
                font-weight: bold;
                margin-bottom: 5px;
                margin-top: 10px;
            }

            .mazemaster-help-title:first-child {
                margin-top: 0;
            }

            .mazemaster-help code {
                background: rgba(0, 0, 0, 0.3);
                padding: 2px 6px;
                border-radius: 3px;
                font-family: monospace;
                font-size: 0.9em;
            }

            .mazemaster-help ul {
                margin: 5px 0;
                padding-left: 20px;
            }

            .mazemaster-help li {
                margin: 3px 0;
            }

            .mazemaster-help small {
                opacity: 0.7;
                display: block;
                margin-top: 5px;
            }

            .mazemaster-empty-state {
                text-align: center;
                padding: 15px;
                opacity: 0.6;
            }

            /* Game Selector */
            .mazemaster-game-selector {
                display: flex;
                gap: 10px;
                margin-bottom: 15px;
            }

            .mazemaster-game-btn {
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 10px;
                border-radius: 5px;
                transition: all 0.2s;
            }

            .mazemaster-game-btn.active {
                background: var(--SmartThemeQuoteColor, #4a7c59) !important;
                color: white;
            }

            .mazemaster-game-config {
                animation: fadeIn 0.2s ease;
            }

            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            /* Battlebar Styles */
            .mazemaster-bb-settings {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .mazemaster-bb-row {
                display: flex;
                gap: 10px;
            }

            .mazemaster-bb-field {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .mazemaster-bb-field label {
                font-size: 0.8em;
                opacity: 0.8;
            }

            .mazemaster-bb-field input,
            .mazemaster-bb-field select {
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 4px;
                padding: 6px 8px;
                color: var(--SmartThemeBodyColor);
            }

            .mazemaster-bb-commands {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .mazemaster-bb-command {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .mazemaster-bb-command label {
                font-size: 0.85em;
                font-weight: bold;
            }

            .mazemaster-bb-command textarea {
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 4px;
                padding: 8px;
                color: var(--SmartThemeBodyColor);
                font-family: monospace;
                font-size: 0.85em;
                min-height: 40px;
                resize: vertical;
            }

            .mazemaster-bb-images-list {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin-bottom: 10px;
            }

            .mazemaster-input {
                width: 100%;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 4px;
                padding: 8px 10px;
                color: var(--SmartThemeBodyColor, #fff);
                font-size: 1em;
            }

            .mazemaster-input::placeholder {
                color: var(--SmartThemeBodyColor, #888);
                opacity: 0.6;
            }

            .mazemaster-bb-image-item {
                position: relative;
                width: 120px;
                display: flex;
                flex-direction: column;
                border-radius: 5px;
                overflow: hidden;
                border: 2px solid var(--SmartThemeBorderColor, #444);
                cursor: pointer;
                background: rgba(0, 0, 0, 0.2);
            }

            .mazemaster-bb-image-item:hover {
                border-color: var(--SmartThemeQuoteColor, #888);
            }

            .mazemaster-bb-image-item img {
                width: 100%;
                height: 80px;
                object-fit: cover;
            }

            .mazemaster-bb-image-item .bb-image-index {
                position: absolute;
                top: 2px;
                left: 2px;
                background: rgba(0, 0, 0, 0.7);
                color: white;
                font-size: 0.7em;
                padding: 2px 5px;
                border-radius: 3px;
            }

            .mazemaster-bb-image-item .bb-image-message {
                padding: 4px 6px;
                font-size: 0.7em;
                color: var(--SmartThemeBodyColor, #aaa);
                text-align: center;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-height: 20px;
            }

            .mazemaster-bb-image-item .bb-image-delete {
                position: absolute;
                top: 2px;
                right: 2px;
                background: rgba(231, 76, 60, 0.9);
                color: white;
                border: none;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.7em;
            }

            .mazemaster-bb-image-item .bb-image-delete:hover {
                background: #c0392b;
            }

            /* Game Tab Styles */
            .mazemaster-game-launch {
                display: flex;
                flex-direction: column;
                gap: 15px;
                padding: 10px 0;
            }

            .mazemaster-play-btn {
                width: 100%;
                padding: 15px 20px;
                font-size: 1.2em;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
            }

            /* Maze Config Styles */
            .mazemaster-textarea {
                width: 100%;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 4px;
                padding: 8px 10px;
                color: var(--SmartThemeBodyColor, #fff);
                font-family: monospace;
                font-size: 0.9em;
                min-height: 60px;
                resize: vertical;
            }

            .mazemaster-maze-win-image-row {
                display: flex;
                gap: 10px;
                align-items: flex-start;
            }

            .mazemaster-maze-win-image-preview {
                width: 80px;
                height: 80px;
                border-radius: 5px;
                border: 2px solid var(--SmartThemeBorderColor, #444);
                overflow: hidden;
                background: rgba(0, 0, 0, 0.2);
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .mazemaster-maze-win-image-preview img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .mazemaster-maze-win-image-preview .no-image {
                font-size: 0.7em;
                opacity: 0.5;
                text-align: center;
            }

            /* Maze Subsection Styles */
            .mazemaster-subsection {
                background: rgba(0, 0, 0, 0.15);
                border-left: 3px solid var(--SmartThemeQuoteColor, #666);
                padding: 10px;
                margin: 10px 0;
                border-radius: 0 5px 5px 0;
            }

            /* Encounters List Styles */
            .mazemaster-encounters-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-bottom: 10px;
            }

            .mazemaster-encounter-row {
                display: flex;
                gap: 8px;
                align-items: center;
            }

            .mazemaster-encounter-row select {
                flex: 1;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 4px;
                padding: 6px 8px;
                color: var(--SmartThemeBodyColor);
            }

            .mazemaster-encounter-row input[type="number"] {
                width: 60px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 4px;
                padding: 6px 8px;
                color: var(--SmartThemeBodyColor);
                text-align: center;
            }

            .mazemaster-encounter-row .encounter-remove-btn {
                padding: 5px 8px;
            }

            /* Maze Cell Minion Indicators */
            .maze-cell.has-minion:not(.hidden)::before {
                content: '?';
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 0.7em;
                color: #f39c12;
                font-weight: bold;
                z-index: 1;
            }

            .maze-cell.minion-triggered:not(.hidden)::before {
                content: '\\2713';
                color: #27ae60;
            }

            /* Moving Minion Indicators */
            .maze-cell.minion-moving:not(.hidden):not(.minion-triggered)::before {
                animation: minion-move-pulse 0.8s ease-in-out infinite;
            }

            .maze-cell.minion-chase:not(.hidden):not(.minion-triggered)::before {
                content: '\\f06d';
                font-family: 'Font Awesome 6 Free';
                font-weight: 900;
                color: #e74c3c;
            }

            .maze-cell.minion-patrol:not(.hidden):not(.minion-triggered)::before {
                content: '\\f554';
                font-family: 'Font Awesome 6 Free';
                font-weight: 900;
                color: #9b59b6;
            }

            @keyframes minion-move-pulse {
                0%, 100% {
                    transform: translate(-50%, -50%) scale(1);
                    opacity: 1;
                }
                50% {
                    transform: translate(-50%, -50%) scale(1.15);
                    opacity: 0.8;
                }
            }

            /* Maze Cell Chest Indicators */
            .maze-cell.has-chest:not(.hidden)::before {
                content: '\\f187';
                font-family: 'Font Awesome 6 Free';
                font-weight: 900;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 0.6em;
                color: #f39c12;
                z-index: 1;
            }

            .maze-cell.chest-locked:not(.hidden)::before {
                color: #95a5a6;
            }

            .maze-cell.chest-opened:not(.hidden)::before {
                color: #666;
                opacity: 0.5;
            }

            /* Hide default icon when custom chest image is used */
            .maze-cell.has-custom-chest::before {
                display: none !important;
            }

            /* Maze Cell Trap Indicators */
            .maze-cell.has-trap:not(.hidden)::before {
                content: '\\f6e2';
                font-family: 'Font Awesome 6 Free';
                font-weight: 900;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 0.6em;
                color: #e74c3c;
                z-index: 1;
            }

            .maze-cell.trap-triggered:not(.hidden)::before {
                color: #666;
                opacity: 0.5;
            }

            /* Portal Indicators */
            .maze-cell.has-portal:not(.hidden)::before {
                content: '\\f111';
                font-family: 'Font Awesome 6 Free';
                font-weight: 900;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 0.7em;
                color: var(--portal-color, #9b59b6);
                z-index: 1;
                animation: portal-pulse 1.2s ease-in-out infinite;
                text-shadow: 0 0 8px var(--portal-color, #9b59b6);
            }

            .maze-cell.portal-exit-only:not(.hidden)::before {
                opacity: 0.5;
                animation: none;
            }

            .maze-cell.portal-flash {
                animation: teleport-flash 0.3s ease-out;
            }

            @keyframes portal-pulse {
                0%, 100% {
                    opacity: 0.7;
                    transform: translate(-50%, -50%) scale(1);
                }
                50% {
                    opacity: 1;
                    transform: translate(-50%, -50%) scale(1.2);
                }
            }

            @keyframes teleport-flash {
                0% {
                    background: rgba(155, 89, 182, 0.8);
                    box-shadow: 0 0 20px rgba(155, 89, 182, 0.8);
                }
                100% {
                    background: rgba(0, 0, 0, 0.4);
                    box-shadow: none;
                }
            }

            /* Staircase Indicators (v1.2.0) */
            .maze-cell.has-staircase:not(.hidden)::before {
                content: '\\f54b';
                font-family: 'Font Awesome 6 Free';
                font-weight: 900;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 0.8em;
                color: #3498db;
                z-index: 1;
                text-shadow: 0 0 4px rgba(52, 152, 219, 0.6);
            }

            .maze-cell.staircase-up:not(.hidden)::before {
                content: '\\f148';
                color: #27ae60;
                text-shadow: 0 0 4px rgba(39, 174, 96, 0.6);
            }

            .maze-cell.staircase-down:not(.hidden)::before {
                content: '\\f149';
                color: #e67e22;
                text-shadow: 0 0 4px rgba(230, 126, 34, 0.6);
            }

            .maze-cell.staircase-locked:not(.hidden)::after {
                content: '\\f023';
                font-family: 'Font Awesome 6 Free';
                font-weight: 900;
                position: absolute;
                top: 2px;
                right: 2px;
                font-size: 0.45em;
                color: #e74c3c;
                z-index: 2;
            }

            /* Inventory Display */
            .mazemaster-maze-inventory {
                display: flex;
                justify-content: center;
                gap: 12px;
                padding: 6px 12px;
                background: rgba(0, 0, 0, 0.4);
                border-radius: 6px;
                margin-bottom: 8px;
            }

            .inventory-item {
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 0.85em;
                color: #fff;
            }

            .inventory-item i { font-size: 0.9em; }
            .inventory-item i.fa-key { color: #f1c40f; }
            .inventory-item i.fa-user-ninja { color: #9b59b6; }
            .inventory-item i.fa-bolt { color: #e74c3c; }
            .inventory-item.grandpow i.fa-star { color: #ffd700; text-shadow: 0 0 5px #ffd700; }
            .inventory-item.grandpow { font-weight: bold; }

            /* Encounter Confirmation Buttons */
            .maze-confirm-buttons {
                margin-top: 8px;
                display: flex;
                gap: 8px;
                justify-content: center;
            }

            .maze-confirm-btn {
                padding: 8px 16px;
                font-size: 0.9em;
                font-weight: bold;
                border-radius: 6px;
                background: linear-gradient(to bottom, #3498db, #2980b9);
                color: #fff;
                border: 2px solid #5dade2;
                box-shadow: 0 2px 8px rgba(52, 152, 219, 0.4);
                transition: all 0.2s;
            }

            .maze-confirm-btn:hover {
                background: linear-gradient(to bottom, #5dade2, #3498db);
                transform: scale(1.05);
                box-shadow: 0 4px 12px rgba(52, 152, 219, 0.6);
            }

            .maze-slip-btn {
                background: linear-gradient(to bottom, #9b59b6, #8e44ad);
                border-color: #bb8fce;
                box-shadow: 0 2px 8px rgba(155, 89, 182, 0.4);
            }

            .maze-slip-btn:hover {
                background: linear-gradient(to bottom, #bb8fce, #9b59b6);
                box-shadow: 0 4px 12px rgba(155, 89, 182, 0.6);
            }

            .maze-accept-btn {
                background: linear-gradient(to bottom, #27ae60, #1e8449);
                border-color: #58d68d;
                box-shadow: 0 2px 8px rgba(39, 174, 96, 0.4);
            }

            .maze-accept-btn:hover {
                background: linear-gradient(to bottom, #58d68d, #27ae60);
                box-shadow: 0 4px 12px rgba(39, 174, 96, 0.6);
            }

            /* Battlebar Action Buttons */
            .mazemaster-bb-action-buttons {
                display: flex;
                gap: 10px;
                justify-content: center;
                flex-wrap: wrap;
                width: 100%;
                max-width: 400px;
            }

            .mazemaster-bb-pow-btn,
            .mazemaster-bb-grandpow-btn {
                flex: 1;
                min-width: 120px;
                max-width: 180px;
                padding: 12px 15px;
                font-size: 1em;
                border-radius: 10px;
                cursor: pointer;
                font-weight: bold;
                border: none;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                transition: transform 0.1s, box-shadow 0.1s;
            }

            .mazemaster-bb-pow-btn {
                background: linear-gradient(to bottom, #e74c3c, #c0392b);
                color: #fff;
                box-shadow: 0 4px 10px rgba(231, 76, 60, 0.3);
            }

            .mazemaster-bb-pow-btn:hover {
                background: linear-gradient(to bottom, #c0392b, #a93226);
                transform: scale(1.02);
            }

            .mazemaster-bb-grandpow-btn {
                background: linear-gradient(135deg, #ffd700, #ffaa00);
                color: #000;
                text-shadow: 0 1px 0 rgba(255,255,255,0.5);
                box-shadow: 0 4px 15px rgba(255, 215, 0, 0.4);
            }

            .mazemaster-bb-grandpow-btn:hover {
                background: linear-gradient(135deg, #ffea00, #ffc400);
                box-shadow: 0 4px 20px rgba(255, 215, 0, 0.6);
                transform: scale(1.02);
            }

            /* Encounter Percent Label */
            .encounter-percent-label {
                font-size: 0.9em;
                color: #888;
            }

            .encounter-percent-input {
                width: 50px;
            }

            /* Small input for config rows */
            .mazemaster-input-small {
                width: 60px;
                padding: 4px 8px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 4px;
                color: var(--SmartThemeBodyColor);
            }

            /* Grid layout for config rows */
            .mazemaster-row {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 6px;
            }

            .mazemaster-row label {
                min-width: 90px;
                font-size: 0.85em;
                color: var(--SmartThemeBodyColor);
                opacity: 0.9;
            }

            /* Two-column grid for percentage fields */
            .mazemaster-grid-2col {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px 16px;
            }

            .mazemaster-grid-2col .mazemaster-row {
                margin-bottom: 0;
            }

            .mazemaster-grid-2col .mazemaster-row label {
                min-width: 80px;
            }

            /* Three-column grid for loot percentages */
            .mazemaster-grid-3col {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 8px;
            }

            .mazemaster-grid-3col .mazemaster-row {
                flex-direction: column;
                align-items: flex-start;
                gap: 4px;
                margin-bottom: 0;
            }

            .mazemaster-grid-3col .mazemaster-row label {
                min-width: auto;
                font-size: 0.8em;
                opacity: 0.8;
            }

            .mazemaster-grid-3col .mazemaster-input-small {
                width: 100%;
            }

            /* 4-column grid */
            .mazemaster-grid-4col {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 8px;
            }

            .mazemaster-grid-4col .mazemaster-row {
                flex-direction: column;
                align-items: flex-start;
                gap: 2px;
                margin-bottom: 0;
            }

            .mazemaster-grid-4col .mazemaster-row label {
                min-width: auto;
                font-size: 0.75em;
                opacity: 0.8;
            }

            .mazemaster-grid-4col .mazemaster-input-small {
                width: 100%;
            }

            /* Collapsible Sections */
            .mazemaster-collapsible {
                margin-bottom: 8px;
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 6px;
                overflow: hidden;
            }

            .mazemaster-collapsible-header {
                width: 100%;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 12px;
                background: rgba(0, 0, 0, 0.2);
                border: none;
                cursor: pointer;
                text-align: left;
                font-size: 0.95em;
                font-weight: 500;
                color: inherit;
                transition: background 0.2s;
            }

            .mazemaster-collapsible-header:hover {
                background: rgba(0, 0, 0, 0.3);
            }

            .mazemaster-collapse-icon {
                font-size: 0.8em;
                transition: transform 0.2s;
            }

            .mazemaster-collapsible.expanded .mazemaster-collapse-icon {
                transform: rotate(90deg);
            }

            .mazemaster-collapse-hint {
                font-size: 0.8em;
                opacity: 0.6;
                margin-left: auto;
            }

            .mazemaster-collapsible-content {
                padding: 12px;
                border-top: 1px solid var(--SmartThemeBorderColor, #444);
                background: rgba(0, 0, 0, 0.1);
            }

            .mazemaster-collapsible-content .mazemaster-section:last-child {
                margin-bottom: 0;
            }

            /* Portal Config List */
            .mazemaster-portals-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-bottom: 10px;
            }

            .mazemaster-portal-item {
                background: rgba(0, 0, 0, 0.2);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 6px;
                overflow: hidden;
            }

            .mazemaster-portal-item .portal-header {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 10px;
                background: rgba(0, 0, 0, 0.2);
                border-bottom: 1px solid var(--SmartThemeBorderColor, #444);
            }

            .mazemaster-portal-item .portal-color {
                width: 16px;
                height: 16px;
                border-radius: 50%;
                flex-shrink: 0;
            }

            .mazemaster-portal-item .portal-name {
                flex: 1;
                font-weight: 500;
            }

            .mazemaster-portal-item .portal-details {
                padding: 10px;
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .mazemaster-portal-item .portal-row {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .mazemaster-portal-item .portal-row label {
                width: 90px;
                font-size: 0.85em;
                color: var(--SmartThemeBodyColor, #ccc);
            }

            .mazemaster-portal-item .portal-row input[type="text"],
            .mazemaster-portal-item .portal-row input[type="number"] {
                flex: 1;
                max-width: 80px;
            }

            .mazemaster-portal-item .coords-row {
                gap: 4px;
            }

            .mazemaster-portal-item .coords-row span {
                font-size: 0.8em;
                color: var(--SmartThemeBodyColor, #999);
            }

            .mazemaster-portal-item .coords-row input {
                width: 50px !important;
                max-width: 50px !important;
            }

            .mazemaster-portal-item .portal-color-input {
                width: 32px;
                height: 24px;
                padding: 0;
                border: 1px solid var(--SmartThemeBorderColor, #444);
                cursor: pointer;
            }

            .mazemaster-portal-item .remove-portal-btn {
                padding: 4px 8px;
                font-size: 0.8em;
            }

            /* Objectives Config List */
            .mazemaster-objectives-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-bottom: 10px;
            }

            .mazemaster-objective-item {
                background: rgba(0, 0, 0, 0.2);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 6px;
                overflow: hidden;
            }

            .mazemaster-objective-item .objective-config-header {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 10px;
                background: rgba(0, 0, 0, 0.2);
                border-bottom: 1px solid var(--SmartThemeBorderColor, #444);
            }

            .mazemaster-objective-item .objective-name {
                flex: 1;
                font-weight: 500;
            }

            .mazemaster-objective-item .objective-config-details {
                padding: 10px;
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .mazemaster-objective-item .objective-config-row {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .mazemaster-objective-item .objective-config-row label {
                width: 100px;
                font-size: 0.85em;
                color: var(--SmartThemeBodyColor, #ccc);
            }

            .mazemaster-objective-item .objective-config-row input[type="text"],
            .mazemaster-objective-item .objective-config-row input[type="number"],
            .mazemaster-objective-item .objective-config-row select {
                flex: 1;
            }

            .mazemaster-objective-item .remove-objective-btn {
                padding: 4px 8px;
                font-size: 0.8em;
            }

            /* STScript Hooks Config */
            .mazemaster-hooks-group {
                margin-top: 12px;
            }

            .mazemaster-hooks-group:first-of-type {
                margin-top: 8px;
            }

            .mazemaster-hooks-label {
                display: block;
                font-size: 0.85em;
                font-weight: 500;
                color: #3498db;
                margin-bottom: 6px;
                padding-bottom: 4px;
                border-bottom: 1px solid rgba(52, 152, 219, 0.3);
            }

            .mazemaster-hooks-items {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .mazemaster-hooks-items .hook-item {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .mazemaster-hooks-items .hook-item > label {
                width: 120px;
                flex-shrink: 0;
                font-size: 0.85em;
                color: var(--SmartThemeBodyColor, #ccc);
            }

            .mazemaster-hooks-items .hook-item input {
                flex: 1;
            }

            /* Inline row */
            .mazemaster-inline-row {
                display: flex;
                gap: 12px;
            }

            .mazemaster-flex-1 {
                flex: 1;
            }

            /* Saved Games */
            .mazemaster-saved-games-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .mazemaster-saved-game {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 4px;
            }

            .mazemaster-saved-game-info {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .mazemaster-saved-game-name {
                font-weight: 500;
            }

            .mazemaster-saved-game-details {
                font-size: 0.8em;
                opacity: 0.7;
            }

            .mazemaster-saved-game-actions {
                display: flex;
                gap: 6px;
            }

            .mazemaster-no-saves {
                text-align: center;
                opacity: 0.6;
                padding: 12px;
                font-style: italic;
            }

            /* Side-by-side sections */
            .mazemaster-section-row {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px;
            }

            .mazemaster-section-row .mazemaster-section {
                margin-bottom: 0;
            }

            /* Minions Config Styles */
            .mazemaster-minions-list {
                display: flex;
                flex-direction: column;
                gap: 10px;
                margin-bottom: 10px;
            }

            .mazemaster-minion-card {
                display: flex;
                gap: 10px;
                align-items: center;
                padding: 10px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 5px;
                border: 1px solid var(--SmartThemeBorderColor, #444);
            }

            .mazemaster-minion-card .minion-image {
                width: 50px;
                height: 50px;
                border-radius: 5px;
                overflow: hidden;
                background: rgba(0, 0, 0, 0.3);
                flex-shrink: 0;
                position: relative;
                cursor: pointer;
            }

            .mazemaster-minion-card .minion-image img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .mazemaster-minion-card .minion-image:hover {
                outline: 2px solid var(--SmartThemeQuoteColor, #e74c3c);
                outline-offset: 2px;
            }

            .mazemaster-minion-card .minion-image::after {
                content: '\\f030';
                font-family: 'Font Awesome 6 Free';
                font-weight: 900;
                position: absolute;
                bottom: 2px;
                right: 2px;
                font-size: 10px;
                color: white;
                background: rgba(0, 0, 0, 0.6);
                padding: 2px 4px;
                border-radius: 3px;
                opacity: 0;
                transition: opacity 0.2s;
            }

            .mazemaster-minion-card .minion-image:hover::after {
                opacity: 1;
            }

            .mazemaster-minion-card .minion-info {
                flex: 1;
            }

            .mazemaster-minion-card .minion-row {
                display: flex;
                gap: 8px;
                margin-bottom: 8px;
            }

            .mazemaster-minion-card .minion-name-input {
                flex: 1;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 4px;
                padding: 6px 8px;
                color: var(--SmartThemeBodyColor);
            }

            .mazemaster-minion-card .minion-type-select {
                width: 110px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 4px;
                padding: 6px 8px;
                color: var(--SmartThemeBodyColor);
            }

            .mazemaster-minion-card .minion-profiles {
                margin-top: 8px;
            }

            .mazemaster-minion-card .minion-profiles label {
                display: block;
                font-size: 0.85em;
                color: var(--SmartThemeQuoteColor);
                margin-bottom: 4px;
            }

            .mazemaster-minion-card .minion-profiles select {
                width: 100%;
                min-height: 60px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 4px;
                padding: 4px;
                color: var(--SmartThemeBodyColor);
            }

            .mazemaster-minion-card .minion-profiles textarea {
                width: 100%;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 4px;
                padding: 6px 8px;
                color: var(--SmartThemeBodyColor);
                resize: vertical;
            }

            .mazemaster-minion-card .merchant-range-row {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .mazemaster-minion-card .merchant-range-row span {
                color: var(--SmartThemeBodyColor);
                opacity: 0.8;
            }

            .mazemaster-minion-card .minion-encounter-script {
                margin-top: 10px;
                padding-top: 10px;
                border-top: 1px solid var(--SmartThemeBorderColor, #333);
            }

            .mazemaster-minion-card .minion-encounter-script label {
                display: block;
                font-size: 0.85em;
                color: var(--SmartThemeQuoteColor);
                margin-bottom: 4px;
            }

            .mazemaster-minion-card .minion-encounter-script textarea {
                width: 100%;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 4px;
                padding: 6px 8px;
                color: var(--SmartThemeBodyColor);
                resize: vertical;
                font-family: monospace;
            }

            .mazemaster-minion-card .minion-delete-btn {
                padding: 5px 8px;
                flex-shrink: 0;
                align-self: flex-start;
            }

            /* Minion Movement Settings */
            .mazemaster-minion-card .minion-movement-settings {
                margin-top: 8px;
                padding-top: 8px;
                border-top: 1px solid var(--SmartThemeBorderColor, #444);
            }

            .mazemaster-minion-card .minion-movement-settings > label {
                display: block;
                font-size: 0.85em;
                color: var(--SmartThemeBodyColor, #999);
                margin-bottom: 4px;
            }

            .mazemaster-minion-card .movement-row {
                display: flex;
                gap: 8px;
                margin-bottom: 6px;
            }

            .mazemaster-minion-card .minion-movement-type {
                flex: 1;
            }

            .mazemaster-minion-card .movement-params {
                display: flex;
                gap: 12px;
                flex-wrap: wrap;
            }

            .mazemaster-minion-card .movement-param {
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 0.85em;
            }

            .mazemaster-minion-card .movement-param span {
                color: var(--SmartThemeBodyColor, #999);
            }

            .mazemaster-minion-card .movement-param input {
                width: 50px;
            }

            /* TRAP CARD STYLES */
            .mazemaster-traps-list {
                display: flex;
                flex-direction: column;
                gap: 10px;
                margin-bottom: 10px;
                max-height: 400px;
                overflow-y: auto;
            }

            .mazemaster-trap-card {
                display: flex;
                gap: 10px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 8px;
                padding: 10px;
                align-items: flex-start;
            }

            .mazemaster-trap-card .trap-image {
                width: 80px;
                height: 80px;
                flex-shrink: 0;
                border-radius: 6px;
                overflow: hidden;
                background: rgba(0, 0, 0, 0.3);
                position: relative;
                cursor: pointer;
            }

            .mazemaster-trap-card .trap-image img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .mazemaster-trap-card .trap-image:hover {
                outline: 2px solid var(--SmartThemeQuoteColor, #e74c3c);
                outline-offset: 2px;
            }

            .mazemaster-trap-card .trap-image::after {
                content: '\\f030';
                font-family: 'Font Awesome 6 Free';
                font-weight: 900;
                position: absolute;
                bottom: 4px;
                right: 4px;
                font-size: 12px;
                color: white;
                background: rgba(0, 0, 0, 0.6);
                padding: 3px 5px;
                border-radius: 3px;
                opacity: 0;
                transition: opacity 0.2s;
            }

            .mazemaster-trap-card .trap-image:hover::after {
                opacity: 1;
            }

            .mazemaster-trap-card .trap-no-image {
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--SmartThemeBodyColor);
                opacity: 0.5;
                font-size: 24px;
            }

            .mazemaster-trap-card .trap-info {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .mazemaster-trap-card .trap-row {
                display: flex;
                gap: 8px;
            }

            .mazemaster-trap-card .trap-name-input {
                flex: 1;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 4px;
                padding: 6px 8px;
                color: var(--SmartThemeBodyColor);
            }

            .mazemaster-trap-card .trap-message-row,
            .mazemaster-trap-card .trap-script-row {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .mazemaster-trap-card .trap-message-row label,
            .mazemaster-trap-card .trap-script-row label {
                font-size: 0.75em;
                opacity: 0.7;
            }

            .mazemaster-trap-card .trap-message-input,
            .mazemaster-trap-card .trap-script-input {
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 4px;
                padding: 6px 8px;
                color: var(--SmartThemeBodyColor);
                resize: vertical;
                font-family: inherit;
            }

            .mazemaster-trap-card .trap-delete-btn {
                padding: 5px 8px;
                flex-shrink: 0;
                align-self: flex-start;
            }

            /* Story Milestones Modal */
            .mazemaster-story-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            }

            .mazemaster-story-modal-content {
                background: var(--SmartThemeBlurTintColor, #1a1a1a);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 10px;
                padding: 20px;
                width: 90%;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
            }

            .mazemaster-story-modal-content h3 {
                margin: 0 0 15px 0;
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .mazemaster-story-textarea {
                width: 100%;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 4px;
                padding: 8px;
                color: var(--SmartThemeBodyColor);
                resize: vertical;
                font-family: inherit;
            }

            .mazemaster-milestones-list {
                display: flex;
                flex-direction: column;
                gap: 10px;
                margin-bottom: 10px;
                max-height: 200px;
                overflow-y: auto;
            }

            .mazemaster-milestone-row {
                display: flex;
                gap: 10px;
                align-items: flex-start;
                background: rgba(0, 0, 0, 0.2);
                padding: 10px;
                border-radius: 6px;
            }

            .milestone-percent {
                display: flex;
                align-items: center;
                gap: 4px;
                flex-shrink: 0;
            }

            .milestone-percent-input {
                width: 50px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 4px;
                padding: 6px;
                color: var(--SmartThemeBodyColor);
                text-align: center;
            }

            .milestone-text-input {
                flex: 1;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 4px;
                padding: 6px;
                color: var(--SmartThemeBodyColor);
                resize: vertical;
                font-family: inherit;
            }

            .mazemaster-story-modal-buttons {
                display: flex;
                gap: 10px;
                justify-content: flex-end;
                margin-top: 15px;
            }
        </style>
    `;
}

function updateProfileSettings() {
    const profileName = document.getElementById('mazemaster_profile_select')?.value;
    const profile = getProfile(profileName);

    const randomizeCheckbox = document.getElementById('mazemaster_randomize');
    if (randomizeCheckbox) {
        randomizeCheckbox.checked = profile?.randomize || false;
    }

    const difficultySelect = document.getElementById('mazemaster_difficulty');
    if (difficultySelect) {
        difficultySelect.value = profile?.difficulty || 1;
    }
}

function renderSegmentsList() {
    const list = document.getElementById('mazemaster_segments_list');
    if (!list) return;

    const profileName = document.getElementById('mazemaster_profile_select')?.value;
    const profile = getProfile(profileName);
    const segments = profile?.segments || [];

    if (segments.length === 0) {
        list.innerHTML = '<div class="mazemaster-empty-state">No segments. Click "Add Segment" to create one.</div>';
        return;
    }

    list.innerHTML = segments.map((seg, index) => `
        <div class="mazemaster-segment-item" data-index="${index}">
            <div class="mazemaster-segment-row">
                <div class="mazemaster-segment-field small">
                    <label>Trigger</label>
                    <input type="text" class="seg-trigger" value="${escapeHtml(seg.trigger || '')}" placeholder="com1">
                </div>
                <div class="mazemaster-segment-field">
                    <label>Display Text</label>
                    <input type="text" class="seg-text" value="${escapeHtml(seg.text || '')}" placeholder="Prize name">
                </div>
                <div class="mazemaster-segment-field small">
                    <label>Size</label>
                    <select class="seg-size">
                        ${SIZE_OPTIONS.map(s => `<option value="${s}" ${seg.size === s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </div>
                <button class="menu_button menu_button_icon mazemaster-segment-delete" title="Delete">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            <div class="mazemaster-segment-row">
                <div class="mazemaster-segment-field">
                    <label>STScript Command</label>
                    <textarea class="seg-command" placeholder="/echo You won!">${escapeHtml(seg.command || '')}</textarea>
                </div>
                <div class="mazemaster-segment-field tiny">
                    <label>&nbsp;</label>
                    <label class="mazemaster-segment-checkbox">
                        <input type="checkbox" class="seg-respin" ${seg.respin ? 'checked' : ''}>
                        Respin
                    </label>
                </div>
            </div>
        </div>
    `).join('');

    // Add delete handlers
    list.querySelectorAll('.mazemaster-segment-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.mazemaster-segment-item').remove();
        });
    });
}

function collectSegmentsFromUI() {
    const items = document.querySelectorAll('.mazemaster-segment-item');
    const segments = [];

    items.forEach(item => {
        const trigger = item.querySelector('.seg-trigger').value.trim();
        const text = item.querySelector('.seg-text').value.trim();
        const command = item.querySelector('.seg-command').value.trim();
        const size = item.querySelector('.seg-size').value;
        const respin = item.querySelector('.seg-respin').checked;

        if (trigger || text) {
            segments.push({ trigger, text, command, size, respin });
        }
    });

    return segments;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

function exportProfile(profileName) {
    const profile = getProfile(profileName);
    if (!profile) {
        alert(`Profile "${profileName}" not found`);
        return;
    }

    const exportData = {
        name: profileName,
        profile: profile,
        exportedAt: new Date().toISOString(),
        version: '1.0',
    };

    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `mazemaster-${profileName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`[MazeMaster] Exported profile "${profileName}"`);
}

function importProfile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                if (!data.profile || !data.name) {
                    reject(new Error('Invalid profile format: missing name or profile data'));
                    return;
                }

                let profileName = data.name;

                // If profile already exists, ask for new name
                if (extensionSettings.profiles[profileName]) {
                    const newName = prompt(`Profile "${profileName}" already exists. Enter a new name:`, `${profileName}_imported`);
                    if (!newName || !newName.trim()) {
                        reject(new Error('Import cancelled'));
                        return;
                    }
                    profileName = newName.trim();
                }

                // Validate profile structure
                const profile = data.profile;
                if (!profile.segments || !Array.isArray(profile.segments)) {
                    profile.segments = [];
                }
                if (typeof profile.randomize !== 'boolean') {
                    profile.randomize = false;
                }
                if (typeof profile.difficulty !== 'number' || profile.difficulty < 1 || profile.difficulty > 5) {
                    profile.difficulty = 1;
                }

                // Save the imported profile
                extensionSettings.profiles[profileName] = profile;
                extensionSettings.currentProfile = profileName;
                saveSettingsDebounced();

                console.log(`[MazeMaster] Imported profile "${profileName}":`, profile);
                resolve(profileName);
            } catch (err) {
                reject(new Error(`Failed to parse JSON: ${err.message}`));
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

// =============================================================================
// BATTLEBAR UI HELPERS
// =============================================================================

function updateBattlebarSettings() {
    const profileName = document.getElementById('mazemaster_bb_profile_select')?.value;
    const profile = getBattlebarProfile(profileName) || {};

    const difficultySelect = document.getElementById('mazemaster_bb_difficulty');
    if (difficultySelect) difficultySelect.value = profile.difficulty || 3;

    const hitsInput = document.getElementById('mazemaster_bb_hits');
    if (hitsInput) hitsInput.value = profile.hitsToWin || 5;

    const missesInput = document.getElementById('mazemaster_bb_misses');
    if (missesInput) missesInput.value = profile.missesToLose || 3;

    const hitCmd = document.getElementById('mazemaster_bb_hit_cmd');
    if (hitCmd) hitCmd.value = profile.hitCommand || '';

    const missCmd = document.getElementById('mazemaster_bb_miss_cmd');
    if (missCmd) missCmd.value = profile.missCommand || '';

    const winCmd = document.getElementById('mazemaster_bb_win_cmd');
    if (winCmd) winCmd.value = profile.winCommand || '';

    const loseCmd = document.getElementById('mazemaster_bb_lose_cmd');
    if (loseCmd) loseCmd.value = profile.loseCommand || '';

    const mainTitle = document.getElementById('mazemaster_bb_main_title');
    if (mainTitle) mainTitle.value = profile.mainTitle || '';
}

function renderBattlebarImages() {
    const list = document.getElementById('mazemaster_bb_images_list');
    if (!list) return;

    const profileName = document.getElementById('mazemaster_bb_profile_select')?.value;
    if (!profileName) {
        list.innerHTML = '<div class="mazemaster-empty-state">Select or create a profile first.</div>';
        return;
    }

    const profile = getBattlebarProfile(profileName) || {};
    const images = profile.images || [];

    if (images.length === 0) {
        list.innerHTML = '<div class="mazemaster-empty-state">No stages. Add images to create stages.</div>';
        return;
    }

    list.innerHTML = images.map((img, index) => `
        <div class="mazemaster-bb-image-item" data-index="${index}" title="Click to edit stage message">
            <img src="/${img.path}" alt="${escapeHtml(img.stageMessage || '')}">
            <span class="bb-image-index">${index}</span>
            <div class="bb-image-message">${escapeHtml(img.stageMessage || '(no message)')}</div>
            <button class="bb-image-delete" title="Delete">
                <i class="fa-solid fa-times"></i>
            </button>
        </div>
    `).join('');

    // Add click handler to edit stage message
    list.querySelectorAll('.mazemaster-bb-image-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            // Don't trigger if clicking delete button
            if (e.target.closest('.bb-image-delete')) return;

            const index = parseInt(item.dataset.index);
            const profile = getBattlebarProfile(profileName) || {};
            const images = profile.images || [];
            const currentMessage = images[index]?.stageMessage || '';

            const newMessage = await callGenericPopup(
                `Stage ${index} Message:`,
                POPUP_TYPE.INPUT,
                currentMessage
            );

            if (newMessage !== null && newMessage !== undefined) {
                images[index].stageMessage = newMessage;
                saveBattlebarProfile(profileName, profile);
                renderBattlebarImages();
            }
        });
    });

    // Add delete handlers
    list.querySelectorAll('.bb-image-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const item = e.target.closest('.mazemaster-bb-image-item');
            const index = parseInt(item.dataset.index);

            const confirmed = await callGenericPopup(`Delete stage ${index}?`, POPUP_TYPE.CONFIRM);
            if (!confirmed) return;

            const profile = getBattlebarProfile(profileName) || {};
            profile.images = (profile.images || []).filter((_, i) => i !== index);
            saveBattlebarProfile(profileName, profile);
            renderBattlebarImages();
        });
    });
}

function collectBattlebarDataFromUI() {
    const profileName = document.getElementById('mazemaster_bb_profile_select')?.value;
    const existingProfile = getBattlebarProfile(profileName) || {};

    return {
        difficulty: parseInt(document.getElementById('mazemaster_bb_difficulty')?.value) || 3,
        hitsToWin: parseInt(document.getElementById('mazemaster_bb_hits')?.value) || 5,
        missesToLose: parseInt(document.getElementById('mazemaster_bb_misses')?.value) || 3,
        mainTitle: document.getElementById('mazemaster_bb_main_title')?.value || '',
        hitCommand: document.getElementById('mazemaster_bb_hit_cmd')?.value || '',
        missCommand: document.getElementById('mazemaster_bb_miss_cmd')?.value || '',
        winCommand: document.getElementById('mazemaster_bb_win_cmd')?.value || '',
        loseCommand: document.getElementById('mazemaster_bb_lose_cmd')?.value || '',
        // Preserve images with their stageMessages (edited via click)
        images: existingProfile.images || [],
        // Item drops (maze only)
        keyDropChance: parseInt(document.getElementById('mazemaster_bb_key_drop')?.value) ?? 40,
        powDropChance: parseInt(document.getElementById('mazemaster_bb_pow_drop')?.value) ?? 20,
        stealthDropChance: parseInt(document.getElementById('mazemaster_bb_stealth_drop')?.value) ?? 10,
    };
}

function exportBattlebarProfile(profileName) {
    const profile = getBattlebarProfile(profileName);
    if (!profile) {
        alert(`Battlebar profile "${profileName}" not found`);
        return;
    }

    const exportData = {
        name: profileName,
        type: 'battlebar',
        profile: profile,
        exportedAt: new Date().toISOString(),
        version: '1.0',
    };

    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `mazemaster-battlebar-${profileName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`[MazeMaster] Exported battlebar profile "${profileName}"`);
}

function importBattlebarProfile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                if (!data.profile || !data.name) {
                    reject(new Error('Invalid profile format: missing name or profile data'));
                    return;
                }

                let profileName = data.name;

                if (extensionSettings.battlebarProfiles[profileName]) {
                    const newName = prompt(`Battlebar profile "${profileName}" already exists. Enter a new name:`, `${profileName}_imported`);
                    if (!newName || !newName.trim()) {
                        reject(new Error('Import cancelled'));
                        return;
                    }
                    profileName = newName.trim();
                }

                saveBattlebarProfile(profileName, data.profile);
                extensionSettings.currentBattlebarProfile = profileName;
                saveSettingsDebounced();

                console.log(`[MazeMaster] Imported battlebar profile "${profileName}":`, data.profile);
                resolve(profileName);
            } catch (err) {
                reject(new Error(`Failed to parse JSON: ${err.message}`));
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

async function uploadBattlebarImage(file, profileName) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const base64 = e.target.result.split(',')[1];
                const ext = file.name.split('.').pop().toLowerCase();
                const timestamp = Date.now();
                const filename = `battlebar_${profileName}_${timestamp}`;

                const response = await fetch('/api/images/upload', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({
                        image: base64,
                        ch_name: 'MazeMaster',
                        filename: filename,
                        format: ext,
                    }),
                });

                if (response.ok) {
                    resolve(`user/images/MazeMaster/${filename}.${ext}`);
                } else {
                    const error = await response.json().catch(() => ({}));
                    reject(new Error(error.error || 'Upload failed'));
                }
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

// =============================================================================
// MAZE UI HELPERS
// =============================================================================

function updateMazeSettings() {
    const profileName = document.getElementById('mazemaster_maze_profile_select')?.value;
    const profile = getMazeProfile(profileName) || {};

    const sizeSelect = document.getElementById('mazemaster_maze_size');
    if (sizeSelect) sizeSelect.value = profile.gridSize || 10;

    const winCmd = document.getElementById('mazemaster_maze_win_cmd');
    if (winCmd) winCmd.value = profile.winCommand || '';

    const loseCmd = document.getElementById('mazemaster_maze_lose_cmd');
    if (loseCmd) loseCmd.value = profile.loseCommand || '';

    const winMessage = document.getElementById('mazemaster_maze_win_message');
    if (winMessage) winMessage.value = profile.winMessage || '';

    // Main minion settings - repopulate options first
    const mainMinionSelect = document.getElementById('mazemaster_maze_main_minion');
    if (mainMinionSelect) {
        const minionNames = getMinionNames();
        mainMinionSelect.innerHTML = '<option value="">None</option>' +
            minionNames.map(id => {
                const m = getMinion(id);
                return `<option value="${escapeHtml(id)}" ${profile.mainMinion === id ? 'selected' : ''}>${escapeHtml(m?.name || id)}</option>`;
            }).join('');
    }

    const mainMinionSettings = document.getElementById('mazemaster_main_minion_settings');
    if (mainMinionSettings) mainMinionSettings.style.display = profile.mainMinion ? 'block' : 'none';

    const introMessage = document.getElementById('mazemaster_maze_intro_message');
    if (introMessage) introMessage.value = profile.mainMinionIntroMessage || '';

    const randomChance = document.getElementById('mazemaster_maze_random_chance');
    if (randomChance) randomChance.value = profile.mainMinionRandomChance || 15;

    const randomMessages = document.getElementById('mazemaster_maze_random_messages');
    if (randomMessages) randomMessages.value = (profile.mainMinionRandomMessages || []).join('\n');

    const exitType = document.getElementById('mazemaster_maze_exit_type');
    if (exitType) exitType.value = profile.mainMinionExitType || 'messenger';

    // Update exit profile dropdown
    updateExitProfileDropdown(profile.mainMinionExitType || 'messenger', profile.mainMinionExitProfile);

    // Loss action
    const lossAction = document.getElementById('mazemaster_maze_loss_action');
    if (lossAction) lossAction.value = profile.onBattlebarLoss || 'continue';

    // Update win image preview
    const previewContainer = document.querySelector('.mazemaster-maze-win-image-preview');
    if (previewContainer) {
        if (profile.winImage) {
            previewContainer.innerHTML = `<img id="maze_win_image_preview" src="${profile.winImage}" alt="Victory">`;
        } else {
            previewContainer.innerHTML = '<div id="maze_win_image_preview" class="no-image">No image</div>';
        }
    }

    // Chest distribution settings
    const chestPercent = document.getElementById('mazemaster_maze_chest_percent');
    if (chestPercent) chestPercent.value = profile.chestTilePercent || 10;

    const lockedPercent = document.getElementById('mazemaster_maze_locked_percent');
    if (lockedPercent) lockedPercent.value = profile.chestLockedPercent || 30;

    const lockedBonus = document.getElementById('mazemaster_maze_locked_bonus');
    if (lockedBonus) lockedBonus.value = profile.chestLockedBonusPercent || 50;

    const mimicPercent = document.getElementById('mazemaster_maze_mimic_percent');
    if (mimicPercent) mimicPercent.value = profile.chestMimicPercent || 15;

    // Loot per chest
    const lootMin = document.getElementById('mazemaster_maze_loot_min');
    if (lootMin) lootMin.value = profile.chestLootMin || 1;

    const lootMax = document.getElementById('mazemaster_maze_loot_max');
    if (lootMax) lootMax.value = profile.chestLootMax || 2;

    // Regular chest loot chances
    const chestKey = document.getElementById('mazemaster_maze_chest_key');
    if (chestKey) chestKey.value = profile.chestKeyChance || 30;

    const chestPow = document.getElementById('mazemaster_maze_chest_pow');
    if (chestPow) chestPow.value = profile.chestPowChance || 50;

    const chestStealth = document.getElementById('mazemaster_maze_chest_stealth');
    if (chestStealth) chestStealth.value = profile.chestStealthChance || 0;

    const chestGrandpow = document.getElementById('mazemaster_maze_chest_grandpow');
    if (chestGrandpow) chestGrandpow.value = profile.chestGrandpowChance || 0;

    // Locked chest loot chances
    const lockedKey = document.getElementById('mazemaster_maze_locked_key');
    if (lockedKey) lockedKey.value = profile.lockedChestKeyChance || 40;

    const lockedPow = document.getElementById('mazemaster_maze_locked_pow');
    if (lockedPow) lockedPow.value = profile.lockedChestPowChance || 60;

    const lockedStealth = document.getElementById('mazemaster_maze_locked_stealth');
    if (lockedStealth) lockedStealth.value = profile.lockedChestStealthChance || 30;

    const lockedGrandpow = document.getElementById('mazemaster_maze_locked_grandpow');
    if (lockedGrandpow) lockedGrandpow.value = profile.lockedChestGrandpowChance || 5;

    // Starting inventory - use defaults if empty/zero
    let startInv = profile.startingInventory || {};

    // If startingInventory is empty/zero and we have defaults, use them
    const isEmptyInventory = !startInv.key && !startInv.stealth && !startInv.pow && !startInv.grandpow;
    if (isEmptyInventory && DEFAULT_MAZE_PROFILE[profileName]?.startingInventory) {
        startInv = DEFAULT_MAZE_PROFILE[profileName].startingInventory;
        profile.startingInventory = JSON.parse(JSON.stringify(startInv));
        saveSettingsDebounced();
    }

    const startKey = document.getElementById('mazemaster_start_key');
    if (startKey) startKey.value = startInv.key || 0;

    const startStealth = document.getElementById('mazemaster_start_stealth');
    if (startStealth) startStealth.value = startInv.stealth || 0;

    const startPow = document.getElementById('mazemaster_start_pow');
    if (startPow) startPow.value = startInv.pow || 0;

    const startGrandpow = document.getElementById('mazemaster_start_grandpow');
    if (startGrandpow) startGrandpow.value = startInv.grandpow || 0;

    // Render encounters list - use defaults from DEFAULT_MAZE_PROFILE if empty
    let minionEncounters = profile.minionEncounters || [];
    let trapEncounters = profile.trapEncounters || [];

    // If encounters are empty and we have defaults for this profile, use them
    if (minionEncounters.length === 0 && DEFAULT_MAZE_PROFILE[profileName]?.minionEncounters) {
        minionEncounters = DEFAULT_MAZE_PROFILE[profileName].minionEncounters;
        // Also update the profile so it persists
        profile.minionEncounters = JSON.parse(JSON.stringify(minionEncounters));
        saveSettingsDebounced();
    }
    if (trapEncounters.length === 0 && DEFAULT_MAZE_PROFILE[profileName]?.trapEncounters) {
        trapEncounters = DEFAULT_MAZE_PROFILE[profileName].trapEncounters;
        // Also update the profile so it persists
        profile.trapEncounters = JSON.parse(JSON.stringify(trapEncounters));
        saveSettingsDebounced();
    }

    renderMazeEncountersList(minionEncounters);
    renderMazeTrapEncountersList(trapEncounters);
}

function updateExitProfileDropdown(exitType, selectedProfile) {
    const profileSection = document.getElementById('mazemaster_exit_profile_section');
    const profileSelect = document.getElementById('mazemaster_maze_exit_profile');

    if (!profileSection || !profileSelect) return;

    if (exitType === 'messenger') {
        profileSection.style.display = 'none';
        return;
    }

    profileSection.style.display = 'block';

    // Populate with appropriate profiles - use defaults if empty
    let profiles = [];
    if (exitType === 'battlebar') {
        profiles = getBattlebarProfileNames();
        // Fallback to defaults if empty
        if (profiles.length === 0) {
            profiles = Object.keys(DEFAULT_BATTLEBAR_PROFILES);
        }
    } else if (exitType === 'prizewheel') {
        profiles = getProfileNames();
        // Fallback to defaults if empty
        if (profiles.length === 0) {
            profiles = Object.keys(DEFAULT_WHEEL_PROFILES);
        }
    }

    profileSelect.innerHTML = '<option value="">Select...</option>' +
        profiles.map(p => `<option value="${escapeHtml(p)}" ${p === selectedProfile ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('');
}

function renderMazeEncountersList(encounters) {
    const list = document.getElementById('mazemaster_maze_encounters_list');
    if (!list) return;

    const minionNames = getMinionNames();

    if (encounters.length === 0) {
        list.innerHTML = '<div class="mazemaster-empty-state" style="font-size: 0.85em;">No encounters. Minions will be randomly placed in the maze.</div>';
        return;
    }

    list.innerHTML = encounters.map((enc, index) => {
        const minion = getMinion(enc.minionId);
        return `
            <div class="mazemaster-encounter-row" data-index="${index}">
                <select class="encounter-minion-select">
                    ${minionNames.map(id => {
                        const m = getMinion(id);
                        return `<option value="${escapeHtml(id)}" ${enc.minionId === id ? 'selected' : ''}>${escapeHtml(m?.name || id)}</option>`;
                    }).join('')}
                </select>
                <input type="number" class="encounter-percent-input" min="1" max="100" value="${enc.percent || 5}" placeholder="%">
                <span class="encounter-percent-label">%</span>
                <button class="menu_button menu_button_icon encounter-remove-btn" title="Remove">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
    }).join('');

    // Add event handlers
    list.querySelectorAll('.mazemaster-encounter-row').forEach(row => {
        const index = parseInt(row.dataset.index);

        row.querySelector('.encounter-minion-select')?.addEventListener('change', () => {
            // Will be saved when Save Profile is clicked
        });

        row.querySelector('.encounter-percent-input')?.addEventListener('change', () => {
            // Will be saved when Save Profile is clicked
        });

        row.querySelector('.encounter-remove-btn')?.addEventListener('click', () => {
            row.remove();
        });
    });
}

function renderMazeTrapEncountersList(trapEncounters) {
    const list = document.getElementById('mazemaster_maze_traps_list');
    if (!list) return;

    const trapNames = getTrapNames();

    if (trapEncounters.length === 0) {
        list.innerHTML = '<div class="mazemaster-empty-state" style="font-size: 0.85em;">No traps. Add traps to place trap tiles in the maze.</div>';
        return;
    }

    list.innerHTML = trapEncounters.map((enc, index) => {
        const trap = getTrap(enc.trapId);
        return `
            <div class="mazemaster-encounter-row mazemaster-trap-encounter-row" data-index="${index}">
                <select class="trap-encounter-select">
                    ${trapNames.map(id => {
                        const t = getTrap(id);
                        return `<option value="${escapeHtml(id)}" ${enc.trapId === id ? 'selected' : ''}>${escapeHtml(t?.name || id)}</option>`;
                    }).join('')}
                </select>
                <input type="number" class="trap-encounter-percent-input" min="1" max="100" value="${enc.percent || 5}" placeholder="%">
                <span class="encounter-percent-label">%</span>
                <button class="menu_button menu_button_icon trap-encounter-remove-btn" title="Remove">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
    }).join('');

    // Add event handlers
    list.querySelectorAll('.mazemaster-trap-encounter-row').forEach(row => {
        row.querySelector('.trap-encounter-remove-btn')?.addEventListener('click', () => {
            row.remove();
        });
    });
}

function collectMazeDataFromUI() {
    const profileName = document.getElementById('mazemaster_maze_profile_select')?.value;
    const existingProfile = getMazeProfile(profileName) || {};

    // Collect encounters from the list (now using percent)
    const encounterRows = document.querySelectorAll('#mazemaster_maze_encounters_list .mazemaster-encounter-row');
    const minionEncounters = [];
    encounterRows.forEach(row => {
        const minionId = row.querySelector('.encounter-minion-select')?.value;
        const percent = parseInt(row.querySelector('.encounter-percent-input')?.value) || 5;
        if (minionId) {
            minionEncounters.push({ minionId, percent });
        }
    });

    // Collect trap encounters from the list
    const trapEncounterRows = document.querySelectorAll('#mazemaster_maze_traps_list .mazemaster-trap-encounter-row');
    const trapEncounters = [];
    trapEncounterRows.forEach(row => {
        const trapId = row.querySelector('.trap-encounter-select')?.value;
        const percent = parseInt(row.querySelector('.trap-encounter-percent-input')?.value) || 5;
        if (trapId) {
            trapEncounters.push({ trapId, percent });
        }
    });

    // Collect random messages
    const randomMessagesText = document.getElementById('mazemaster_maze_random_messages')?.value || '';
    const mainMinionRandomMessages = randomMessagesText.split('\n').filter(m => m.trim());

    return {
        gridSize: parseInt(document.getElementById('mazemaster_maze_size')?.value) || 10,
        difficulty: document.getElementById('mazemaster_maze_difficulty')?.value || 'normal',
        theme: document.getElementById('mazemaster_maze_theme')?.value || 'fantasy',
        mapStyle: document.getElementById('mazemaster_maze_mapstyle')?.value || 'maze',
        floors: parseInt(document.getElementById('mazemaster_maze_floors')?.value) || 1,
        fogOfWar: document.getElementById('mazemaster_maze_fog_of_war')?.checked || false,
        winCommand: document.getElementById('mazemaster_maze_win_cmd')?.value || '',
        loseCommand: document.getElementById('mazemaster_maze_lose_cmd')?.value || '',
        winMessage: document.getElementById('mazemaster_maze_win_message')?.value || '',
        winImage: existingProfile.winImage || '',
        chestImage: existingProfile.chestImage || '',
        // Main minion settings
        mainMinion: document.getElementById('mazemaster_maze_main_minion')?.value || '',
        mainMinionIntroMessage: document.getElementById('mazemaster_maze_intro_message')?.value || '',
        mainMinionRandomChance: parseInt(document.getElementById('mazemaster_maze_random_chance')?.value) || 15,
        mainMinionRandomMessages: mainMinionRandomMessages,
        mainMinionExitType: document.getElementById('mazemaster_maze_exit_type')?.value || 'messenger',
        mainMinionExitProfile: document.getElementById('mazemaster_maze_exit_profile')?.value || '',
        // Encounters (percent-based)
        minionEncounters: minionEncounters,
        trapEncounters: trapEncounters,
        // Loss behavior
        onBattlebarLoss: document.getElementById('mazemaster_maze_loss_action')?.value || 'continue',
        // Chest settings
        chestTilePercent: parseInt(document.getElementById('mazemaster_maze_chest_percent')?.value) || 10,
        chestLockedPercent: parseInt(document.getElementById('mazemaster_maze_locked_percent')?.value) || 30,
        chestLockedBonusPercent: parseInt(document.getElementById('mazemaster_maze_locked_bonus')?.value) || 50,
        chestMimicPercent: parseInt(document.getElementById('mazemaster_maze_mimic_percent')?.value) || 15,
        chestLootMin: parseInt(document.getElementById('mazemaster_maze_loot_min')?.value) || 1,
        chestLootMax: parseInt(document.getElementById('mazemaster_maze_loot_max')?.value) || 2,
        chestKeyChance: parseInt(document.getElementById('mazemaster_maze_chest_key')?.value) || 30,
        chestPowChance: parseInt(document.getElementById('mazemaster_maze_chest_pow')?.value) || 50,
        chestStealthChance: parseInt(document.getElementById('mazemaster_maze_chest_stealth')?.value) || 0,
        chestGrandpowChance: parseInt(document.getElementById('mazemaster_maze_chest_grandpow')?.value) || 0,
        lockedChestKeyChance: parseInt(document.getElementById('mazemaster_maze_locked_key')?.value) || 40,
        lockedChestPowChance: parseInt(document.getElementById('mazemaster_maze_locked_pow')?.value) || 60,
        lockedChestStealthChance: parseInt(document.getElementById('mazemaster_maze_locked_stealth')?.value) || 30,
        lockedChestGrandpowChance: parseInt(document.getElementById('mazemaster_maze_locked_grandpow')?.value) || 5,
        // Starting inventory
        startingInventory: {
            key: parseInt(document.getElementById('mazemaster_start_key')?.value) || 0,
            pow: parseInt(document.getElementById('mazemaster_start_pow')?.value) || 0,
            stealth: parseInt(document.getElementById('mazemaster_start_stealth')?.value) || 0,
            grandpow: parseInt(document.getElementById('mazemaster_start_grandpow')?.value) || 0,
        },
        // Portals
        portals: collectPortalsFromUI(),
        // Objectives
        objectives: collectObjectivesFromUI(),
        // STScript Hooks
        onMove: document.getElementById('mazemaster_hook_onMove')?.value || '',
        onMilestone: document.getElementById('mazemaster_hook_onMilestone')?.value || '',
        onExploreComplete: document.getElementById('mazemaster_hook_onExploreComplete')?.value || '',
        onItemAdd: document.getElementById('mazemaster_hook_onItemAdd')?.value || '',
        onItemRemove: document.getElementById('mazemaster_hook_onItemRemove')?.value || '',
        onChestOpen: document.getElementById('mazemaster_hook_onChestOpen')?.value || '',
        onTrade: document.getElementById('mazemaster_hook_onTrade')?.value || '',
        onEnemyMove: document.getElementById('mazemaster_hook_onEnemyMove')?.value || '',
        onTeleport: document.getElementById('mazemaster_hook_onTeleport')?.value || '',
        onObjectiveProgress: document.getElementById('mazemaster_hook_onObjectiveProgress')?.value || '',
        onObjectiveComplete: document.getElementById('mazemaster_hook_onObjectiveComplete')?.value || '',
        onAllObjectivesComplete: document.getElementById('mazemaster_hook_onAllObjectivesComplete')?.value || '',
        onStatUpdate: document.getElementById('mazemaster_hook_onStatUpdate')?.value || '',
        // Preserve story config
        storyConfig: existingProfile.storyConfig || { mainStory: '', milestones: [] },
    };
}

/**
 * Collect portal configuration from the UI
 */
function collectPortalsFromUI() {
    const portals = [];
    const portalItems = document.querySelectorAll('#mazemaster_portals_list .mazemaster-portal-item');

    portalItems.forEach((item) => {
        const id = item.querySelector('.portal-id')?.value?.trim() || '';
        const color = item.querySelector('.portal-color-input')?.value || '#9b59b6';
        const bidirectional = item.querySelector('.portal-bidirectional')?.checked ?? true;

        const startXInput = item.querySelector('.portal-start-x')?.value;
        const startYInput = item.querySelector('.portal-start-y')?.value;
        const endXInput = item.querySelector('.portal-end-x')?.value;
        const endYInput = item.querySelector('.portal-end-y')?.value;

        portals.push({
            id: id || `portal_${portals.length + 1}`,
            color: color,
            bidirectional: bidirectional,
            startX: startXInput !== '' ? parseInt(startXInput) : null,
            startY: startYInput !== '' ? parseInt(startYInput) : null,
            endX: endXInput !== '' ? parseInt(endXInput) : null,
            endY: endYInput !== '' ? parseInt(endYInput) : null,
        });
    });

    return portals;
}

/**
 * Collect objectives configuration from the UI
 */
function collectObjectivesFromUI() {
    const objectives = [];
    const objectiveItems = document.querySelectorAll('#mazemaster_objectives_list .mazemaster-objective-item');

    objectiveItems.forEach((item, idx) => {
        const id = item.querySelector('.objective-id')?.value?.trim() || `obj_${idx + 1}`;
        const type = item.querySelector('.objective-type')?.value || 'collect';
        const target = item.querySelector('.objective-target')?.value?.trim() || '';
        const count = parseInt(item.querySelector('.objective-count')?.value) || 1;
        const description = item.querySelector('.objective-description')?.value?.trim() || '';
        const required = item.querySelector('.objective-required')?.checked ?? true;
        const reward = item.querySelector('.objective-reward')?.value?.trim() || '';

        objectives.push({
            id,
            type,
            target: type === 'explore' ? null : target,
            count,
            description: description || `${type === 'collect' ? 'Collect' : type === 'defeat' ? 'Defeat' : 'Explore'} ${count}${type === 'explore' ? '%' : ' ' + target}`,
            required,
            reward,
        });
    });

    return objectives;
}

/**
 * Crop an image file to a square (center crop)
 * @param {File} file - The image file to crop
 * @returns {Promise<Blob>} - The cropped image as a Blob
 */
async function cropToSquare(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);

            const size = Math.min(img.width, img.height);
            const offsetX = (img.width - size) / 2;
            const offsetY = (img.height - size) / 2;

            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, size, size);

            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to create cropped image'));
                }
            }, file.type || 'image/png');
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
        };

        img.src = url;
    });
}

async function uploadImage(file, filenamePrefix) {
    // First crop the image to square
    let imageBlob;
    try {
        imageBlob = await cropToSquare(file);
    } catch (err) {
        console.warn('[MazeMaster] Could not crop image, using original:', err);
        imageBlob = file;
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const base64 = e.target.result.split(',')[1];
                const ext = file.name.split('.').pop().toLowerCase();
                const timestamp = Date.now();
                const filename = `${filenamePrefix}_${timestamp}`;

                const response = await fetch('/api/images/upload', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({
                        image: base64,
                        ch_name: 'MazeMaster',
                        filename: filename,
                        format: ext,
                    }),
                });

                if (response.ok) {
                    resolve(`user/images/MazeMaster/${filename}.${ext}`);
                } else {
                    const error = await response.json().catch(() => ({}));
                    reject(new Error(error.error || 'Upload failed'));
                }
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(imageBlob);
    });
}

// =============================================================================
// MINIONS UI HELPERS
// =============================================================================

function renderMinionsList() {
    const list = document.getElementById('mazemaster_minions_list');
    if (!list) return;

    const minionIds = getMinionNames();

    if (minionIds.length === 0) {
        list.innerHTML = '<div class="mazemaster-empty-state">No minions. Add minions for use in the maze game.</div>';
        return;
    }

    // Get available profiles for dropdowns
    const battlebarProfileNames = getBattlebarProfileNames();
    const wheelProfileNames = getProfileNames();

    list.innerHTML = minionIds.map(id => {
        const minion = getMinion(id);
        const minionType = minion.type || 'messenger';
        const battlebarProfiles = minion.battlebarProfiles || [];
        const wheelProfiles = minion.wheelProfiles || [];
        const messages = minion.messages || [];
        const encounterScript = minion.encounterScript || '';
        const merchantItemCount = minion.merchantItemCount || { min: 1, max: 3 };
        const movement = minion.movement || { type: 'stationary', patrolRadius: 3, chaseRange: 5, speed: 1 };

        return `
            <div class="mazemaster-minion-card" data-id="${escapeHtml(id)}">
                <div class="minion-image">
                    ${minion.imagePath ? `<img src="${escapeHtml(getExtensionImagePath(minion.imagePath))}" alt="${escapeHtml(minion.name)}">` : ''}
                </div>
                <div class="minion-info">
                    <div class="minion-row">
                        <input type="text" class="minion-name-input" value="${escapeHtml(minion.name)}" placeholder="Minion name">
                        <select class="minion-type-select">
                            <option value="messenger" ${minionType === 'messenger' ? 'selected' : ''}>Messenger</option>
                            <option value="battlebar" ${minionType === 'battlebar' ? 'selected' : ''}>Battlebar</option>
                            <option value="prizewheel" ${minionType === 'prizewheel' ? 'selected' : ''}>PrizeWheel</option>
                            <option value="merchant" ${minionType === 'merchant' ? 'selected' : ''}>Merchant</option>
                        </select>
                    </div>
                    <div class="minion-profiles battlebar-profiles" style="display: ${minionType === 'battlebar' ? 'block' : 'none'};">
                        <label>Battlebar Profiles:</label>
                        <select multiple class="minion-battlebar-select">
                            ${battlebarProfileNames.map(name =>
                                `<option value="${escapeHtml(name)}" ${battlebarProfiles.includes(name) ? 'selected' : ''}>${escapeHtml(name)}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="minion-profiles wheel-profiles" style="display: ${minionType === 'prizewheel' ? 'block' : 'none'};">
                        <label>Wheel Profiles:</label>
                        <select multiple class="minion-wheel-select">
                            ${wheelProfileNames.map(name =>
                                `<option value="${escapeHtml(name)}" ${wheelProfiles.includes(name) ? 'selected' : ''}>${escapeHtml(name)}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="minion-profiles messenger-messages" style="display: ${minionType === 'messenger' ? 'block' : 'none'};">
                        <label>Messages (one per line):</label>
                        <textarea class="minion-messages-input" rows="2" placeholder="Hello traveler!&#10;Beware the maze...">${escapeHtml(messages.join('\n'))}</textarea>
                    </div>
                    <div class="minion-profiles merchant-settings" style="display: ${minionType === 'merchant' ? 'block' : 'none'};">
                        <label>Trade Items Required:</label>
                        <div class="merchant-range-row">
                            <input type="number" class="merchant-min-input mazemaster-input-small" min="1" max="10" value="${merchantItemCount.min}">
                            <span>to</span>
                            <input type="number" class="merchant-max-input mazemaster-input-small" min="1" max="10" value="${merchantItemCount.max}">
                            <span>items for 1 Grandpow</span>
                        </div>
                    </div>
                    <div class="minion-encounter-script">
                        <label>Encounter Script (STScript):</label>
                        <textarea class="minion-script-input" rows="2" placeholder="/echo Custom action on encounter...">${escapeHtml(encounterScript)}</textarea>
                    </div>
                    <div class="minion-movement-settings">
                        <label>Maze Movement:</label>
                        <div class="movement-row">
                            <select class="minion-movement-type">
                                <option value="stationary" ${movement.type === 'stationary' ? 'selected' : ''}>Stationary</option>
                                <option value="patrol" ${movement.type === 'patrol' ? 'selected' : ''}>Patrol</option>
                                <option value="chase" ${movement.type === 'chase' ? 'selected' : ''}>Chase Player</option>
                            </select>
                        </div>
                        <div class="movement-params" style="display: ${movement.type !== 'stationary' ? 'flex' : 'none'};">
                            <div class="movement-param patrol-param" style="display: ${movement.type === 'patrol' ? 'flex' : 'none'};">
                                <span>Radius:</span>
                                <input type="number" class="minion-patrol-radius mazemaster-input-small" min="1" max="10" value="${movement.patrolRadius || 3}">
                            </div>
                            <div class="movement-param chase-param" style="display: ${movement.type === 'chase' ? 'flex' : 'none'};">
                                <span>Range:</span>
                                <input type="number" class="minion-chase-range mazemaster-input-small" min="1" max="20" value="${movement.chaseRange || 5}">
                            </div>
                            <div class="movement-param">
                                <span>Speed:</span>
                                <input type="number" class="minion-movement-speed mazemaster-input-small" min="1" max="5" value="${movement.speed || 1}" title="Moves every N player moves">
                            </div>
                        </div>
                    </div>
                </div>
                <button class="menu_button menu_button_icon minion-delete-btn" title="Delete Minion">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
    }).join('');

    // Add event handlers
    list.querySelectorAll('.mazemaster-minion-card').forEach(card => {
        const minionId = card.dataset.id;

        // Name input change
        const nameInput = card.querySelector('.minion-name-input');
        if (nameInput) {
            nameInput.addEventListener('change', () => {
                const minion = getMinion(minionId);
                if (minion) {
                    minion.name = nameInput.value.trim() || 'Unknown';
                    saveMinion(minionId, minion);
                }
            });
        }

        // Type select change
        const typeSelect = card.querySelector('.minion-type-select');
        if (typeSelect) {
            typeSelect.addEventListener('change', () => {
                const minion = getMinion(minionId);
                if (minion) {
                    minion.type = typeSelect.value;
                    saveMinion(minionId, minion);

                    // Toggle visibility of profile sections
                    const battlebarSection = card.querySelector('.battlebar-profiles');
                    const wheelSection = card.querySelector('.wheel-profiles');
                    const messengerSection = card.querySelector('.messenger-messages');
                    const merchantSection = card.querySelector('.merchant-settings');

                    if (battlebarSection) battlebarSection.style.display = minion.type === 'battlebar' ? 'block' : 'none';
                    if (wheelSection) wheelSection.style.display = minion.type === 'prizewheel' ? 'block' : 'none';
                    if (messengerSection) messengerSection.style.display = minion.type === 'messenger' ? 'block' : 'none';
                    if (merchantSection) merchantSection.style.display = minion.type === 'merchant' ? 'block' : 'none';
                }
            });
        }

        // Battlebar profiles select
        const battlebarSelect = card.querySelector('.minion-battlebar-select');
        if (battlebarSelect) {
            battlebarSelect.addEventListener('change', () => {
                const minion = getMinion(minionId);
                if (minion) {
                    minion.battlebarProfiles = Array.from(battlebarSelect.selectedOptions).map(opt => opt.value);
                    saveMinion(minionId, minion);
                }
            });
        }

        // Wheel profiles select
        const wheelSelect = card.querySelector('.minion-wheel-select');
        if (wheelSelect) {
            wheelSelect.addEventListener('change', () => {
                const minion = getMinion(minionId);
                if (minion) {
                    minion.wheelProfiles = Array.from(wheelSelect.selectedOptions).map(opt => opt.value);
                    saveMinion(minionId, minion);
                }
            });
        }

        // Messenger messages textarea
        const messagesInput = card.querySelector('.minion-messages-input');
        if (messagesInput) {
            messagesInput.addEventListener('change', () => {
                const minion = getMinion(minionId);
                if (minion) {
                    minion.messages = messagesInput.value.split('\n').filter(m => m.trim());
                    saveMinion(minionId, minion);
                }
            });
        }

        // Merchant settings
        const merchantMinInput = card.querySelector('.merchant-min-input');
        const merchantMaxInput = card.querySelector('.merchant-max-input');
        if (merchantMinInput) {
            merchantMinInput.addEventListener('change', () => {
                const minion = getMinion(minionId);
                if (minion) {
                    minion.merchantItemCount = minion.merchantItemCount || { min: 1, max: 3 };
                    minion.merchantItemCount.min = parseInt(merchantMinInput.value) || 1;
                    saveMinion(minionId, minion);
                }
            });
        }
        if (merchantMaxInput) {
            merchantMaxInput.addEventListener('change', () => {
                const minion = getMinion(minionId);
                if (minion) {
                    minion.merchantItemCount = minion.merchantItemCount || { min: 1, max: 3 };
                    minion.merchantItemCount.max = parseInt(merchantMaxInput.value) || 3;
                    saveMinion(minionId, minion);
                }
            });
        }

        // Encounter script textarea
        const scriptInput = card.querySelector('.minion-script-input');
        if (scriptInput) {
            scriptInput.addEventListener('change', () => {
                const minion = getMinion(minionId);
                if (minion) {
                    minion.encounterScript = scriptInput.value;
                    saveMinion(minionId, minion);
                }
            });
        }

        // Movement settings
        const movementTypeSelect = card.querySelector('.minion-movement-type');
        const movementParams = card.querySelector('.movement-params');
        const patrolParams = card.querySelector('.patrol-param');
        const chaseParams = card.querySelector('.chase-param');
        const patrolRadiusInput = card.querySelector('.minion-patrol-radius');
        const chaseRangeInput = card.querySelector('.minion-chase-range');
        const movementSpeedInput = card.querySelector('.minion-movement-speed');

        if (movementTypeSelect) {
            movementTypeSelect.addEventListener('change', () => {
                const minion = getMinion(minionId);
                if (minion) {
                    minion.movement = minion.movement || { type: 'stationary', patrolRadius: 3, chaseRange: 5, speed: 1 };
                    minion.movement.type = movementTypeSelect.value;
                    saveMinion(minionId, minion);

                    // Show/hide params based on type
                    if (movementParams) {
                        movementParams.style.display = movementTypeSelect.value !== 'stationary' ? 'flex' : 'none';
                    }
                    if (patrolParams) {
                        patrolParams.style.display = movementTypeSelect.value === 'patrol' ? 'flex' : 'none';
                    }
                    if (chaseParams) {
                        chaseParams.style.display = movementTypeSelect.value === 'chase' ? 'flex' : 'none';
                    }
                }
            });
        }

        if (patrolRadiusInput) {
            patrolRadiusInput.addEventListener('change', () => {
                const minion = getMinion(minionId);
                if (minion) {
                    minion.movement = minion.movement || { type: 'patrol', patrolRadius: 3, chaseRange: 5, speed: 1 };
                    minion.movement.patrolRadius = parseInt(patrolRadiusInput.value) || 3;
                    saveMinion(minionId, minion);
                }
            });
        }

        if (chaseRangeInput) {
            chaseRangeInput.addEventListener('change', () => {
                const minion = getMinion(minionId);
                if (minion) {
                    minion.movement = minion.movement || { type: 'chase', patrolRadius: 3, chaseRange: 5, speed: 1 };
                    minion.movement.chaseRange = parseInt(chaseRangeInput.value) || 5;
                    saveMinion(minionId, minion);
                }
            });
        }

        if (movementSpeedInput) {
            movementSpeedInput.addEventListener('change', () => {
                const minion = getMinion(minionId);
                if (minion) {
                    minion.movement = minion.movement || { type: 'stationary', patrolRadius: 3, chaseRange: 5, speed: 1 };
                    minion.movement.speed = parseInt(movementSpeedInput.value) || 1;
                    saveMinion(minionId, minion);
                }
            });
        }

        // Minion image click-to-edit
        const minionImageDiv = card.querySelector('.minion-image');
        if (minionImageDiv) {
            minionImageDiv.style.cursor = 'pointer';
            minionImageDiv.title = 'Click to change image';
            minionImageDiv.addEventListener('click', () => {
                // Create a temporary file input
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/*';
                fileInput.style.display = 'none';
                document.body.appendChild(fileInput);

                fileInput.addEventListener('change', async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) {
                        document.body.removeChild(fileInput);
                        return;
                    }

                    try {
                        const imagePath = await uploadImage(file, minionId);
                        const minion = getMinion(minionId);
                        if (minion) {
                            minion.imagePath = imagePath;
                            saveMinion(minionId, minion);
                            renderMinionsList();
                        }
                    } catch (err) {
                        console.error('[MazeMaster] Image upload failed:', err);
                        alert(`Image upload failed: ${err.message}`);
                    }

                    document.body.removeChild(fileInput);
                });

                fileInput.click();
            });
        }

        // Delete button
        const deleteBtn = card.querySelector('.minion-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                const minion = getMinion(minionId);
                const confirmed = await callGenericPopup(`Delete minion "${minion?.name || minionId}"?`, POPUP_TYPE.CONFIRM);
                if (confirmed) {
                    deleteMinion(minionId);
                    renderMinionsList();
                }
            });
        }
    });
}

function renderTrapsList() {
    const list = document.getElementById('mazemaster_traps_list');
    if (!list) return;

    const trapIds = getTrapNames();

    if (trapIds.length === 0) {
        list.innerHTML = '<div class="mazemaster-empty-state">No traps. Add traps for use in maze profiles.</div>';
        return;
    }

    list.innerHTML = trapIds.map(id => {
        const trap = getTrap(id);
        return `
            <div class="mazemaster-trap-card" data-id="${escapeHtml(id)}">
                <div class="trap-image">
                    ${trap.imagePath ? `<img src="${escapeHtml(getExtensionImagePath(trap.imagePath))}" alt="${escapeHtml(trap.name)}">` : '<div class="trap-no-image"><i class="fa-solid fa-dungeon"></i></div>'}
                </div>
                <div class="trap-info">
                    <div class="trap-row">
                        <input type="text" class="trap-name-input mazemaster-input" value="${escapeHtml(trap.name)}" placeholder="Trap name">
                    </div>
                    <div class="trap-message-row">
                        <label>Message:</label>
                        <textarea class="trap-message-input" rows="2" placeholder="You triggered a trap!">${escapeHtml(trap.message || '')}</textarea>
                    </div>
                    <div class="trap-script-row">
                        <label>Script (STScript):</label>
                        <textarea class="trap-script-input" rows="2" placeholder="/echo Trap triggered!">${escapeHtml(trap.script || '')}</textarea>
                    </div>
                </div>
                <button class="menu_button menu_button_icon trap-delete-btn" title="Delete Trap">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
    }).join('');

    // Add event handlers
    list.querySelectorAll('.mazemaster-trap-card').forEach(card => {
        const trapId = card.dataset.id;

        // Name input change
        const nameInput = card.querySelector('.trap-name-input');
        if (nameInput) {
            nameInput.addEventListener('change', () => {
                const trap = getTrap(trapId);
                if (trap) {
                    trap.name = nameInput.value.trim() || 'Unknown Trap';
                    saveTrap(trapId, trap);
                }
            });
        }

        // Message textarea change
        const messageInput = card.querySelector('.trap-message-input');
        if (messageInput) {
            messageInput.addEventListener('change', () => {
                const trap = getTrap(trapId);
                if (trap) {
                    trap.message = messageInput.value;
                    saveTrap(trapId, trap);
                }
            });
        }

        // Script textarea change
        const scriptInput = card.querySelector('.trap-script-input');
        if (scriptInput) {
            scriptInput.addEventListener('change', () => {
                const trap = getTrap(trapId);
                if (trap) {
                    trap.script = scriptInput.value;
                    saveTrap(trapId, trap);
                }
            });
        }

        // Trap image click-to-edit
        const trapImageDiv = card.querySelector('.trap-image');
        if (trapImageDiv) {
            trapImageDiv.style.cursor = 'pointer';
            trapImageDiv.title = 'Click to change image';
            trapImageDiv.addEventListener('click', () => {
                // Create a temporary file input
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/*';
                fileInput.style.display = 'none';
                document.body.appendChild(fileInput);

                fileInput.addEventListener('change', async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) {
                        document.body.removeChild(fileInput);
                        return;
                    }

                    try {
                        const imagePath = await uploadImage(file, trapId);
                        const trap = getTrap(trapId);
                        if (trap) {
                            trap.imagePath = imagePath;
                            saveTrap(trapId, trap);
                            renderTrapsList();
                        }
                    } catch (err) {
                        console.error('[MazeMaster] Image upload failed:', err);
                        alert(`Image upload failed: ${err.message}`);
                    }

                    document.body.removeChild(fileInput);
                });

                fileInput.click();
            });
        }

        // Delete button
        const deleteBtn = card.querySelector('.trap-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                const trap = getTrap(trapId);
                const confirmed = await callGenericPopup(`Delete trap "${trap?.name || trapId}"?`, POPUP_TYPE.CONFIRM);
                if (confirmed) {
                    deleteTrap(trapId);
                    renderTrapsList();
                }
            });
        }
    });
}

function initUI() {
    console.log('[MazeMaster] initUI called');
    let panelHtml;
    try {
        panelHtml = getPanelHtml();
        console.log('[MazeMaster] getPanelHtml succeeded');
    } catch (e) {
        console.error('[MazeMaster] getPanelHtml FAILED:', e);
        panelHtml = '<div>Error loading panel</div>';
    }

    const drawerWrapper = document.createElement('div');
    drawerWrapper.id = 'mazemaster-button';
    drawerWrapper.className = 'drawer';
    drawerWrapper.innerHTML = `
        <div class="drawer-toggle drawer-header">
            <div class="drawer-icon fa-solid fa-dharmachakra fa-fw closedIcon" title="MazeMaster"></div>
        </div>
        <div id="mazemaster_drawer" class="drawer-content closedDrawer">
            ${panelHtml}
        </div>
    `;

    const extensionsButton = document.getElementById('extensions-settings-button');
    console.log('[MazeMaster] extensions-settings-button:', extensionsButton);
    if (extensionsButton) {
        extensionsButton.after(drawerWrapper);
        console.log('[MazeMaster] Drawer inserted after extensions button');
    } else {
        console.error('[MazeMaster] extensions-settings-button NOT FOUND!');
    }

    // Set up drawer toggle click handler directly (more reliable than copying from another drawer)
    const drawerToggle = drawerWrapper.querySelector('.drawer-toggle');
    if (drawerToggle && window.jQuery) {
        const $ = window.jQuery;
        $(drawerToggle).on('click', async function() {
            const icon = $(this).find('.drawer-icon');
            const drawer = $(this).parent().find('.drawer-content');
            const drawerWasOpenAlready = drawer.hasClass('openDrawer');

            if (!drawerWasOpenAlready) {
                // Close other open drawers (except pinned ones)
                $('.openDrawer:not(.pinnedOpen)').removeClass('openDrawer').addClass('closedDrawer');
                $('.openIcon:not(.drawerPinnedOpen)').removeClass('openIcon').addClass('closedIcon');
            }

            // Toggle this drawer
            icon.toggleClass('openIcon closedIcon');
            drawer.toggleClass('openDrawer closedDrawer');
        });
    }

    setupEventHandlers();
    renderSegmentsList();
    renderMinionsList();
    renderTrapsList();
    updateMazeSettings();

    // If battlebar config is active, render images
    if (extensionSettings.activeGameConfig === 'battlebar') {
        renderBattlebarImages();
    }
}

/**
 * Handle Intelligent Distribute button - auto-set tile percentages
 * Defaults: Trap 5%, Chest 15%, Minions distributed (messenger high, merchant low)
 */
function handleIntelligentDistribute() {
    // Set chest tiles to 15%
    const chestPercentInput = document.getElementById('mazemaster_maze_chest_percent');
    if (chestPercentInput) chestPercentInput.value = '15';

    // Get current minion encounters
    const encountersList = document.getElementById('mazemaster_maze_encounters_list');
    const encounterRows = encountersList?.querySelectorAll('.mazemaster-encounter-row') || [];

    // Calculate minion percentages based on type
    // Remaining after chests (15%) and traps (5%) = 80%
    // Reserve ~15% for empty/movement space
    // Available for minions: ~65% (but we'll use what's configured)

    // Type priority weights (higher = more tiles)
    const typeWeights = {
        'messenger': 10,    // Highest priority - most common
        'prizewheel': 6,    // Medium-high
        'battlebar': 4,     // Medium
        'merchant': 1,      // Lowest - rarest
    };

    // Calculate total weight and assign percentages
    let totalWeight = 0;
    const minionTypes = [];

    encounterRows.forEach(row => {
        const minionId = row.getAttribute('data-minion-id');
        if (!minionId) return;

        const minion = getMinion(minionId);
        const type = minion?.type || 'battlebar';
        const weight = typeWeights[type] || 4;
        totalWeight += weight;
        minionTypes.push({ row, type, weight });
    });

    // Distribute remaining percentage (after traps 5%, chests 15% = 20% used)
    // Available: 80%, but leave some empty space
    const minionTotalPercent = 60; // 60% for minions, 20% empty

    if (totalWeight > 0) {
        minionTypes.forEach(({ row, weight }) => {
            const percent = Math.round((weight / totalWeight) * minionTotalPercent);
            const percentInput = row.querySelector('.encounter-percent-input');
            if (percentInput) {
                percentInput.value = percent;
            }
        });
    }

    // Set trap tiles to 5%
    const trapsList = document.getElementById('mazemaster_maze_traps_list');
    const trapRows = trapsList?.querySelectorAll('.mazemaster-encounter-row') || [];

    if (trapRows.length > 0) {
        // Distribute 5% across trap types
        const trapPercent = Math.floor(5 / trapRows.length);
        trapRows.forEach(row => {
            const percentInput = row.querySelector('.encounter-percent-input');
            if (percentInput) {
                percentInput.value = trapPercent || 1;
            }
        });
    }

    // Save the profile with new values and refresh UI
    const profileName = document.getElementById('mazemaster_maze_profile_select')?.value;
    if (profileName) {
        const profileData = collectMazeDataFromUI();
        saveMazeProfile(profileName, profileData);
        loadMazeProfileSettings(); // Refresh the UI to show saved values
    }

    console.log('[MazeMaster] Intelligent Distribute applied: Chests 15%, Traps 5%, Minions distributed');
}

/**
 * Save current maze progress
 */
function saveMazeProgress() {
    if (!currentMaze.isOpen || !currentMaze.profileName) {
        console.warn('[MazeMaster] No active maze to save');
        return false;
    }

    // Create serializable state (avoiding circular references)
    const saveState = {
        profileName: currentMaze.profileName,
        size: currentMaze.size,
        playerX: currentMaze.playerX,
        playerY: currentMaze.playerY,
        exitX: currentMaze.exitX,
        exitY: currentMaze.exitY,
        visited: Array.from(currentMaze.visited),
        inventory: { ...currentMaze.inventory },
        exitEncounterDone: currentMaze.exitEncounterDone,
        shownMilestones: Array.from(currentMaze.shownMilestones || []),
        // v1.2.0: Multi-floor support
        currentFloor: currentMaze.currentFloor || 0,
        totalFloors: currentMaze.totalFloors || 1,
        floors: (currentMaze.floors || [currentMaze.grid]).map(floor =>
            floor.map(row => row.map(cell => ({
                walls: cell.walls,
                visited: cell.visited,
                minion: cell.minion,
                trap: cell.trap,
                chest: cell.chest,
                staircase: cell.staircase,
                roomInfo: cell.roomInfo,  // v1.2.1: Room name/description
            })))
        ),
        // Serialize grid with only essential data (for backwards compat, same as floors[currentFloor])
        grid: currentMaze.grid.map(row => row.map(cell => ({
            walls: cell.walls,
            visited: cell.visited,
            minion: cell.minion,
            trap: cell.trap,
            chest: cell.chest,
            staircase: cell.staircase,
            roomInfo: cell.roomInfo,  // v1.2.1: Room name/description
        }))),
        // v1.2.1: Persistent message log
        messageLog: currentMaze.messageLog || [],
        timestamp: Date.now(),
    };

    extensionSettings.savedMazes[currentMaze.profileName] = saveState;
    saveSettingsDebounced();

    console.log(`[MazeMaster] Maze progress saved for "${currentMaze.profileName}"`);
    return true;
}

/**
 * Load saved maze progress
 */
function loadMazeProgress(profileName) {
    const saveState = extensionSettings.savedMazes?.[profileName];
    if (!saveState) {
        console.warn(`[MazeMaster] No saved game for "${profileName}"`);
        return false;
    }

    const profile = getMazeProfile(profileName);
    if (!profile) {
        console.error(`[MazeMaster] Profile "${profileName}" no longer exists`);
        return false;
    }

    // v1.2.0: Restore multi-floor state
    const totalFloors = saveState.totalFloors || 1;
    const currentFloor = saveState.currentFloor || 0;

    // Restore all floors (backwards compatible with single-floor saves)
    let floors;
    if (saveState.floors && saveState.floors.length > 0) {
        floors = saveState.floors.map(floor =>
            floor.map(row => row.map(cell => ({
                walls: cell.walls,
                visited: cell.visited,
                minion: cell.minion,
                trap: cell.trap,
                chest: cell.chest,
                staircase: cell.staircase,
                roomInfo: cell.roomInfo,  // v1.2.1: Room name/description
            })))
        );
    } else {
        // Old save format - single floor
        floors = [saveState.grid.map(row => row.map(cell => ({
            walls: cell.walls,
            visited: cell.visited,
            minion: cell.minion,
            trap: cell.trap,
            chest: cell.chest,
            staircase: cell.staircase,
            roomInfo: cell.roomInfo,  // v1.2.1: Room name/description
        })))];
    }

    // Current grid is the current floor
    const grid = floors[currentFloor];

    // Determine initial minion display
    let initialMinion = getDefaultMinion();
    const mainMinion = profile.mainMinion ? getMinion(profile.mainMinion) : null;
    if (mainMinion) {
        initialMinion = {
            name: mainMinion.name,
            imagePath: mainMinion.imagePath,
            message: 'Continuing your journey...',
        };
    }

    // Restore state
    currentMaze = {
        isOpen: true,
        profile: profile,
        profileName: profileName,
        grid: grid,
        size: saveState.size,
        playerX: saveState.playerX,
        playerY: saveState.playerY,
        exitX: saveState.exitX,
        exitY: saveState.exitY,
        visited: new Set(saveState.visited),
        isVictory: false,
        currentMinion: initialMinion,
        isPaused: false,
        pendingEncounter: null,
        exitEncounterDone: saveState.exitEncounterDone,
        pendingConfirmation: null,
        pendingChest: null,
        inventory: {
            key: 0, stealth: 0, pow: 0, grandpow: 0,
            floorKey: 0, portalStone: 0, minionBane: 0, mapFragment: 0, timeShard: 0, voidWalk: 0,
            ...saveState.inventory  // Overlay saved values
        },
        shownMilestones: new Set(saveState.shownMilestones || []),
        // v1.2.0: Multi-floor state
        currentFloor: currentFloor,
        totalFloors: totalFloors,
        floors: floors,
        voidWalkActive: false,
        // v1.2.1: Persistent message log
        messageLog: saveState.messageLog || [],
    };

    showMazeModal();
    renderMazeGrid();
    updatePlayerPosition(false); // Set initial position without animation
    renderMessageLog();  // Render saved messages first
    updateMazeHero();
    updateInventoryDisplay();

    // v1.2.0: Update floor UI
    updateFloorIndicator();
    updateDpadFloorButtons();

    document.addEventListener('keydown', handleMazeKeydown, { capture: true });

    console.log(`[MazeMaster] Loaded saved maze "${profileName}" (floor ${currentFloor + 1}/${totalFloors})`);
    return true;
}

/**
 * Delete saved maze
 */
function deleteSavedMaze(profileName) {
    if (extensionSettings.savedMazes?.[profileName]) {
        delete extensionSettings.savedMazes[profileName];
        saveSettingsDebounced();
        console.log(`[MazeMaster] Deleted saved maze "${profileName}"`);
        return true;
    }
    return false;
}

/**
 * Get list of saved maze profile names
 */
function getSavedMazeNames() {
    return Object.keys(extensionSettings.savedMazes || {});
}

/**
 * Render the saved games list in the config panel and game tab
 */
function renderSavedGamesList() {
    // Render to both config panel and game tab
    const listIds = ['mazemaster_saved_games_list', 'mazemaster_game_tab_saves'];

    const savedNames = getSavedMazeNames();

    for (const listId of listIds) {
        const list = document.getElementById(listId);
        if (!list) continue;

        if (savedNames.length === 0) {
            list.innerHTML = '<div class="mazemaster-no-saves">No saved games</div>';
            continue;
        }

        list.innerHTML = savedNames.map(name => {
            const save = extensionSettings.savedMazes[name];
            const date = new Date(save.timestamp);
            const progress = save.visited ? Math.round((save.visited.length / (save.size * save.size)) * 100) : 0;

            return `
                <div class="mazemaster-saved-game" data-profile="${escapeHtml(name)}">
                    <div class="mazemaster-saved-game-info">
                        <div class="mazemaster-saved-game-name">${escapeHtml(name)}</div>
                        <div class="mazemaster-saved-game-details">${progress}% explored - ${date.toLocaleDateString()}</div>
                    </div>
                    <div class="mazemaster-saved-game-actions">
                        <button class="menu_button menu_button_icon saved-game-load" title="Resume">
                            <i class="fa-solid fa-play"></i>
                        </button>
                        <button class="menu_button menu_button_icon saved-game-delete" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Attach handlers
        list.querySelectorAll('.mazemaster-saved-game').forEach(item => {
            const profileName = item.dataset.profile;

            item.querySelector('.saved-game-load')?.addEventListener('click', () => {
                loadMazeProgress(profileName);
            });

            item.querySelector('.saved-game-delete')?.addEventListener('click', async () => {
                const confirmed = await callGenericPopup(`Delete saved game "${profileName}"?`, POPUP_TYPE.CONFIRM);
                if (confirmed) {
                    deleteSavedMaze(profileName);
                    renderSavedGamesList();
                }
            });
        });
    }
}

/**
 * Populate the LLM preset dropdown with available presets
 */
function populateLLMPresetDropdown() {
    const dropdown = document.getElementById('mazemaster_llm_preset');
    if (!dropdown) return;

    // Clear existing options except the first "(Use Current)" option
    dropdown.innerHTML = '<option value="">(Use Current)</option>';

    // Try to get presets from the preset manager
    try {
        if (typeof getPresetManager === 'function') {
            const presetManager = getPresetManager();
            if (presetManager && typeof presetManager.getAllPresets === 'function') {
                const presets = presetManager.getAllPresets();
                presets.forEach(preset => {
                    const option = document.createElement('option');
                    option.value = preset;
                    option.textContent = preset;
                    if (preset === extensionSettings.llmPreset) {
                        option.selected = true;
                    }
                    dropdown.appendChild(option);
                });
                console.log(`[MazeMaster] Populated LLM preset dropdown with ${presets.length} presets`);
            }
        }
    } catch (error) {
        console.warn('[MazeMaster] Could not populate LLM presets:', error);
    }
}

/**
 * Show Story Milestones modal for configuring maze story
 */
async function showStoryMilestonesModal() {
    const profileName = document.getElementById('mazemaster_maze_profile_select')?.value;
    if (!profileName) {
        alert('Please create a maze profile first');
        return;
    }

    const profile = getMazeProfile(profileName) || {};
    const storyConfig = profile.storyConfig || { mainStory: '', milestones: [] };

    // Create modal HTML
    const modalHtml = `
        <div id="mazemaster_story_modal" class="mazemaster-story-modal">
            <div class="mazemaster-story-modal-content">
                <h3><i class="fa-solid fa-book"></i> Story Milestones</h3>

                <div class="mazemaster-section">
                    <label class="mazemaster-label">Main Story</label>
                    <textarea id="story_main_text" class="mazemaster-story-textarea" rows="4"
                        placeholder="The maze stretches before you, filled with danger and mystery...">${escapeHtml(storyConfig.mainStory || '')}</textarea>
                </div>

                <div class="mazemaster-section">
                    <label class="mazemaster-label">Milestones</label>
                    <div id="story_milestones_list" class="mazemaster-milestones-list">
                        <!-- Milestones rendered here -->
                    </div>
                    <button id="story_add_milestone_btn" class="menu_button mazemaster-add-btn">
                        <i class="fa-solid fa-plus"></i> Add Milestone
                    </button>
                </div>

                <div class="mazemaster-story-modal-buttons">
                    <button id="story_save_btn" class="menu_button menu_button_primary">
                        <i class="fa-solid fa-save"></i> Save
                    </button>
                    <button id="story_cancel_btn" class="menu_button">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    `;

    // Add modal to body
    const modalWrapper = document.createElement('div');
    modalWrapper.innerHTML = modalHtml;
    document.body.appendChild(modalWrapper.firstElementChild);

    const modal = document.getElementById('mazemaster_story_modal');
    const milestonesList = document.getElementById('story_milestones_list');

    // Render milestones
    function renderMilestones() {
        if (storyConfig.milestones.length === 0) {
            milestonesList.innerHTML = '<div class="mazemaster-empty-state">No milestones. Add milestones to show story updates at specific progress points.</div>';
            return;
        }

        milestonesList.innerHTML = storyConfig.milestones.map((m, index) => `
            <div class="mazemaster-milestone-row" data-index="${index}">
                <div class="milestone-percent">
                    <input type="number" class="milestone-percent-input" min="1" max="99" value="${m.percent || 25}" placeholder="%">
                    <span>%</span>
                </div>
                <textarea class="milestone-text-input" rows="2" placeholder="Story update at this point...">${escapeHtml(m.storyUpdate || '')}</textarea>
                <button class="menu_button menu_button_icon milestone-remove-btn" title="Remove">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `).join('');

        // Add remove handlers
        milestonesList.querySelectorAll('.milestone-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const row = e.target.closest('.mazemaster-milestone-row');
                const index = parseInt(row.dataset.index);
                storyConfig.milestones.splice(index, 1);
                renderMilestones();
            });
        });
    }

    renderMilestones();

    // Add milestone button
    document.getElementById('story_add_milestone_btn')?.addEventListener('click', () => {
        storyConfig.milestones.push({ percent: 50, storyUpdate: '' });
        renderMilestones();
    });

    // Save button
    document.getElementById('story_save_btn')?.addEventListener('click', () => {
        // Collect data from modal
        storyConfig.mainStory = document.getElementById('story_main_text')?.value || '';

        // Collect milestones from inputs
        const milestoneRows = milestonesList.querySelectorAll('.mazemaster-milestone-row');
        storyConfig.milestones = [];
        milestoneRows.forEach(row => {
            const percent = parseInt(row.querySelector('.milestone-percent-input')?.value) || 25;
            const storyUpdate = row.querySelector('.milestone-text-input')?.value || '';
            if (storyUpdate.trim()) {
                storyConfig.milestones.push({ percent, storyUpdate });
            }
        });

        // Sort by percent
        storyConfig.milestones.sort((a, b) => a.percent - b.percent);

        // Save to profile
        profile.storyConfig = storyConfig;
        saveMazeProfile(profileName, profile);

        // Close modal
        modal.remove();
        alert('Story milestones saved!');
    });

    // Cancel button
    document.getElementById('story_cancel_btn')?.addEventListener('click', () => {
        modal.remove();
    });

    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

function setupEventHandlers() {
    // Profile select change
    const profileSelect = document.getElementById('mazemaster_profile_select');
    if (profileSelect) {
        profileSelect.addEventListener('change', (e) => {
            extensionSettings.currentProfile = e.target.value;
            saveSettingsDebounced();
            updateProfileSettings();
            renderSegmentsList();
        });
    }

    // New profile button
    const newProfileBtn = document.getElementById('mazemaster_new_profile_btn');
    if (newProfileBtn) {
        newProfileBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const name = await callGenericPopup('Enter new wheel profile name:', POPUP_TYPE.INPUT, '');
            if (name && name.trim()) {
                const trimmed = name.trim();
                if (!extensionSettings.profiles[trimmed]) {
                    extensionSettings.profiles[trimmed] = { segments: [], randomize: false, difficulty: 1 };
                    extensionSettings.currentProfile = trimmed;
                    saveSettingsDebounced();
                    refreshPanel();
                } else {
                    await callGenericPopup(`Profile "${trimmed}" already exists.`, POPUP_TYPE.TEXT);
                }
            }
        });
    }

    // Delete profile button
    const deleteProfileBtn = document.getElementById('mazemaster_delete_profile_btn');
    if (deleteProfileBtn) {
        deleteProfileBtn.addEventListener('click', async () => {
            const profileName = document.getElementById('mazemaster_profile_select')?.value;
            if (profileName) {
                const confirmed = await callGenericPopup(`Delete wheel profile "${profileName}"?`, POPUP_TYPE.CONFIRM);
                if (confirmed) {
                    deleteProfile(profileName);
                    refreshPanel();
                }
            }
        });
    }

    // Rename profile button
    const renameProfileBtn = document.getElementById('mazemaster_rename_profile_btn');
    if (renameProfileBtn) {
        renameProfileBtn.addEventListener('click', async () => {
            const oldName = document.getElementById('mazemaster_profile_select')?.value;
            if (!oldName) {
                alert('No profile selected to rename');
                return;
            }
            const newName = await callGenericPopup('Enter new profile name:', POPUP_TYPE.INPUT, oldName);
            if (newName && newName.trim() && newName.trim() !== oldName) {
                const trimmed = newName.trim();
                if (extensionSettings.profiles[trimmed]) {
                    alert('A profile with that name already exists');
                    return;
                }
                // Copy profile data to new name
                extensionSettings.profiles[trimmed] = extensionSettings.profiles[oldName];
                delete extensionSettings.profiles[oldName];
                extensionSettings.currentProfile = trimmed;
                saveSettingsDebounced();
                refreshPanel();
            }
        });
    }

    // Export profile button
    const exportBtn = document.getElementById('mazemaster_export_btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const profileName = document.getElementById('mazemaster_profile_select')?.value;
            if (!profileName) {
                alert('No profile selected to export');
                return;
            }
            exportProfile(profileName);
        });
    }

    // Import profile button
    const importBtn = document.getElementById('mazemaster_import_btn');
    const importFile = document.getElementById('mazemaster_import_file');
    if (importBtn && importFile) {
        importBtn.addEventListener('click', () => {
            importFile.click();
        });

        importFile.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            try {
                const profileName = await importProfile(file);
                alert(`Profile "${profileName}" imported successfully!`);
                refreshPanel();
            } catch (err) {
                alert(`Import failed: ${err.message}`);
            }

            // Reset file input
            importFile.value = '';
        });
    }

    // Add segment button
    const addSegmentBtn = document.getElementById('mazemaster_add_segment_btn');
    if (addSegmentBtn) {
        addSegmentBtn.addEventListener('click', () => {
            const list = document.getElementById('mazemaster_segments_list');
            if (!list) return;

            const emptyState = list.querySelector('.mazemaster-empty-state');
            if (emptyState) emptyState.remove();

            const index = list.querySelectorAll('.mazemaster-segment-item').length;
            const newItem = document.createElement('div');
            newItem.className = 'mazemaster-segment-item';
            newItem.dataset.index = index;
            newItem.innerHTML = `
                <div class="mazemaster-segment-row">
                    <div class="mazemaster-segment-field small">
                        <label>Trigger</label>
                        <input type="text" class="seg-trigger" value="com${index + 1}" placeholder="com1">
                    </div>
                    <div class="mazemaster-segment-field">
                        <label>Display Text</label>
                        <input type="text" class="seg-text" value="" placeholder="Prize name">
                    </div>
                    <div class="mazemaster-segment-field small">
                        <label>Size</label>
                        <select class="seg-size">
                            ${SIZE_OPTIONS.map(s => `<option value="${s}" ${s === 'fraction' ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                    </div>
                    <button class="menu_button menu_button_icon mazemaster-segment-delete" title="Delete">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
                <div class="mazemaster-segment-row">
                    <div class="mazemaster-segment-field">
                        <label>STScript Command</label>
                        <textarea class="seg-command" placeholder="/echo You won!"></textarea>
                    </div>
                    <div class="mazemaster-segment-field tiny">
                        <label>&nbsp;</label>
                        <label class="mazemaster-segment-checkbox">
                            <input type="checkbox" class="seg-respin">
                            Respin
                        </label>
                    </div>
                </div>
            `;

            newItem.querySelector('.mazemaster-segment-delete').addEventListener('click', () => {
                newItem.remove();
            });

            list.appendChild(newItem);
        });
    }

    // Save button
    const saveBtn = document.getElementById('mazemaster_save_btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const profileName = document.getElementById('mazemaster_profile_select')?.value;
            if (!profileName) {
                alert('Please create a profile first');
                return;
            }

            const segments = collectSegmentsFromUI();
            const randomize = document.getElementById('mazemaster_randomize')?.checked || false;
            const difficulty = parseInt(document.getElementById('mazemaster_difficulty')?.value) || 1;

            // Validate wheel balance
            if (segments.length === 0) {
                alert('Error: Wheel must have at least one segment');
                return;
            }

            const halfCount = segments.filter(s => s.size === 'halfseg').length;
            const doubleCount = segments.filter(s => s.size === 'doubleseg').length;
            if (halfCount !== doubleCount) {
                alert(`Error: Wheel unbalanced!\n\n${halfCount} halfseg(s) ≠ ${doubleCount} doubleseg(s)\n\nFor every halfseg, you need a doubleseg to balance the wheel.`);
                return;
            }

            saveProfile(profileName, segments, randomize, difficulty);
            console.log(`[MazeMaster] Saved profile "${profileName}":`, { segments, randomize, difficulty });
            alert(`Profile "${profileName}" saved!`);
        });
    }

    // Preview Wheel button
    const previewWheelBtn = document.getElementById('mazemaster_preview_wheel_btn');
    if (previewWheelBtn) {
        previewWheelBtn.addEventListener('click', () => {
            const profileName = document.getElementById('mazemaster_profile_select')?.value;
            if (!profileName) {
                alert('Please select or create a wheel profile first');
                return;
            }

            // Load the profile and show the wheel
            const result = loadWheelFromProfile(profileName);
            if (result.error) {
                alert(`Error: ${result.error}`);
                return;
            }

            const validation = validateWheelBalance();
            if (!validation.valid) {
                alert(`Error: ${validation.error}`);
                return;
            }

            showWheelModal();
        });
    }

    // Preview Battlebar button
    const previewBattlebarBtn = document.getElementById('mazemaster_preview_battlebar_btn');
    if (previewBattlebarBtn) {
        previewBattlebarBtn.addEventListener('click', () => {
            const profileName = document.getElementById('mazemaster_bb_profile_select')?.value;
            if (!profileName) {
                alert('Please select or create a battlebar profile first');
                return;
            }

            const result = startBattlebar(profileName);
            if (result.error) {
                alert(`Error: ${result.error}`);
                return;
            }
        });
    }

    // =========================================================================
    // GAME SELECTOR HANDLERS
    // =========================================================================

    const showWheelBtn = document.getElementById('mazemaster_show_wheel');
    const showBattlebarBtn = document.getElementById('mazemaster_show_battlebar');
    const showMazeBtn = document.getElementById('mazemaster_show_maze');
    const showMinionsBtn = document.getElementById('mazemaster_show_minions');
    const showTrapsBtn = document.getElementById('mazemaster_show_traps');
    const wheelConfig = document.getElementById('mazemaster_wheel_config');
    const battlebarConfig = document.getElementById('mazemaster_battlebar_config');
    const mazeConfig = document.getElementById('mazemaster_maze_config');
    const minionsConfig = document.getElementById('mazemaster_minions_config');
    const trapsConfig = document.getElementById('mazemaster_traps_config');

    function setActiveGameConfig(configType) {
        extensionSettings.activeGameConfig = configType;
        saveSettingsDebounced();

        // Update button states
        showWheelBtn?.classList.toggle('active', configType === 'wheel');
        showBattlebarBtn?.classList.toggle('active', configType === 'battlebar');
        showMazeBtn?.classList.toggle('active', configType === 'maze');
        showMinionsBtn?.classList.toggle('active', configType === 'minions');
        showTrapsBtn?.classList.toggle('active', configType === 'traps');

        // Update config visibility
        if (wheelConfig) wheelConfig.style.display = configType === 'wheel' ? 'block' : 'none';
        if (battlebarConfig) battlebarConfig.style.display = configType === 'battlebar' ? 'block' : 'none';
        if (mazeConfig) mazeConfig.style.display = configType === 'maze' ? 'block' : 'none';
        if (minionsConfig) minionsConfig.style.display = configType === 'minions' ? 'block' : 'none';
        if (trapsConfig) trapsConfig.style.display = configType === 'traps' ? 'block' : 'none';

        // Render content if needed
        if (configType === 'battlebar') renderBattlebarImages();
        if (configType === 'minions') renderMinionsList();
        if (configType === 'traps') renderTrapsList();
    }

    if (showWheelBtn) showWheelBtn.addEventListener('click', () => setActiveGameConfig('wheel'));
    if (showBattlebarBtn) showBattlebarBtn.addEventListener('click', () => setActiveGameConfig('battlebar'));
    if (showMazeBtn) showMazeBtn.addEventListener('click', () => setActiveGameConfig('maze'));
    if (showMinionsBtn) showMinionsBtn.addEventListener('click', () => setActiveGameConfig('minions'));
    if (showTrapsBtn) showTrapsBtn.addEventListener('click', () => setActiveGameConfig('traps'));

    // TAB HANDLERS
    // =========================================================================
    const tabs = document.querySelectorAll('.mazemaster-tab');
    const tabContents = document.querySelectorAll('.mazemaster-tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;

            // Update tab buttons
            tabs.forEach(t => t.classList.toggle('active', t === tab));

            // Update tab content
            tabContents.forEach(content => {
                const isTarget = content.id === `mazemaster-tab-${targetTab}`;
                content.classList.toggle('active', isTarget);
            });
        });
    });

    // PLAY MAZE BUTTON
    // =========================================================================
    const playMazeBtn = document.getElementById('mazemaster_play_maze');
    if (playMazeBtn) {
        playMazeBtn.addEventListener('click', async () => {
            const profileSelect = document.getElementById('mazemaster_play_profile');
            const profileName = profileSelect?.value || extensionSettings.currentMazeProfile || 'default';

            // Close current chat to prevent LLM from absorbing chat context
            try {
                await executeSlashCommandsWithOptions('/closechat');
            } catch (e) {
                // Chat may already be closed or not exist
                console.log('[MazeMaster] No active chat to close');
            }

            startMaze(profileName);
        });
    }

    // LLM PRESET DROPDOWN
    // =========================================================================
    populateLLMPresetDropdown();

    const llmPresetSelect = document.getElementById('mazemaster_llm_preset');
    if (llmPresetSelect) {
        llmPresetSelect.addEventListener('change', (e) => {
            extensionSettings.llmPreset = e.target.value;
            saveSettingsDebounced();
        });
    }

    const llmEnabledCheckbox = document.getElementById('mazemaster_llm_enabled');
    if (llmEnabledCheckbox) {
        llmEnabledCheckbox.addEventListener('change', (e) => {
            extensionSettings.llmEnabled = e.target.checked;
            saveSettingsDebounced();
        });
    }

    // D-PAD SETTINGS
    // =========================================================================
    const dpadEnabledCheckbox = document.getElementById('mazemaster_dpad_enabled');
    if (dpadEnabledCheckbox) {
        dpadEnabledCheckbox.addEventListener('change', (e) => {
            if (!extensionSettings.dpadConfig) {
                extensionSettings.dpadConfig = { enabled: true, floating: true, position: { x: null, y: null } };
            }
            extensionSettings.dpadConfig.enabled = e.target.checked;
            saveSettingsDebounced();
        });
    }

    const dpadFloatingCheckbox = document.getElementById('mazemaster_dpad_floating');
    if (dpadFloatingCheckbox) {
        dpadFloatingCheckbox.addEventListener('change', (e) => {
            if (!extensionSettings.dpadConfig) {
                extensionSettings.dpadConfig = { enabled: true, floating: true, position: { x: null, y: null } };
            }
            extensionSettings.dpadConfig.floating = e.target.checked;
            saveSettingsDebounced();
        });
    }

    const dpadResetBtn = document.getElementById('mazemaster_dpad_reset');
    if (dpadResetBtn) {
        dpadResetBtn.addEventListener('click', () => {
            if (!extensionSettings.dpadConfig) {
                extensionSettings.dpadConfig = { enabled: true, floating: true, position: { x: null, y: null } };
            }
            extensionSettings.dpadConfig.position = { x: null, y: null };
            saveSettingsDebounced();
            // Also reset if D-Pad is currently visible
            const dpad = document.getElementById('maze_dpad');
            if (dpad) {
                dpad.style.left = '';
                dpad.style.top = '';
                dpad.style.right = '20px';
                dpad.style.bottom = '20px';
            }
        });
    }

    // RENDERER SETTINGS
    // =========================================================================
    const rendererSelect = document.getElementById('mazemaster_renderer_type');
    if (rendererSelect) {
        rendererSelect.addEventListener('change', (e) => {
            extensionSettings.rendererType = e.target.value;
            RendererRegistry.getRenderer(e.target.value);  // Switch renderer
            saveSettingsDebounced();
        });
    }

    // LAYOUT MODE SETTINGS
    // =========================================================================
    const layoutSelect = document.getElementById('mazemaster_layout_mode');
    if (layoutSelect) {
        layoutSelect.addEventListener('change', (e) => {
            extensionSettings.layoutMode = e.target.value;
            saveSettingsDebounced();
            applyLayoutMode();  // Apply immediately
        });
    }

    // =========================================================================
    // BATTLEBAR HANDLERS
    // =========================================================================

    // Battlebar profile select
    const bbProfileSelect = document.getElementById('mazemaster_bb_profile_select');
    if (bbProfileSelect) {
        bbProfileSelect.addEventListener('change', (e) => {
            extensionSettings.currentBattlebarProfile = e.target.value;
            saveSettingsDebounced();
            updateBattlebarSettings();
            renderBattlebarImages();
        });
    }

    // Battlebar new profile
    const bbNewProfileBtn = document.getElementById('mazemaster_bb_new_profile_btn');
    if (bbNewProfileBtn) {
        bbNewProfileBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const name = await callGenericPopup('Enter new battlebar profile name:', POPUP_TYPE.INPUT, '');
            if (name && name.trim()) {
                const trimmed = name.trim();
                if (!extensionSettings.battlebarProfiles[trimmed]) {
                    saveBattlebarProfile(trimmed, {});
                    extensionSettings.currentBattlebarProfile = trimmed;
                    saveSettingsDebounced();
                    refreshPanel();
                    // Switch to battlebar view
                    setTimeout(() => {
                        document.getElementById('mazemaster_show_battlebar')?.click();
                    }, 100);
                } else {
                    await callGenericPopup(`Battlebar profile "${trimmed}" already exists.`, POPUP_TYPE.TEXT);
                }
            }
        });
    }

    // Battlebar delete profile
    const bbDeleteProfileBtn = document.getElementById('mazemaster_bb_delete_profile_btn');
    if (bbDeleteProfileBtn) {
        bbDeleteProfileBtn.addEventListener('click', async () => {
            const profileName = document.getElementById('mazemaster_bb_profile_select')?.value;
            if (profileName) {
                const confirmed = await callGenericPopup(`Delete battlebar profile "${profileName}"?`, POPUP_TYPE.CONFIRM);
                if (confirmed) {
                    deleteBattlebarProfile(profileName);
                    refreshPanel();
                    setTimeout(() => {
                        document.getElementById('mazemaster_show_battlebar')?.click();
                    }, 100);
                }
            }
        });
    }

    // Battlebar rename profile
    const bbRenameProfileBtn = document.getElementById('mazemaster_bb_rename_profile_btn');
    if (bbRenameProfileBtn) {
        bbRenameProfileBtn.addEventListener('click', async () => {
            const oldName = document.getElementById('mazemaster_bb_profile_select')?.value;
            if (!oldName) {
                alert('No profile selected to rename');
                return;
            }
            const newName = await callGenericPopup('Enter new profile name:', POPUP_TYPE.INPUT, oldName);
            if (newName && newName.trim() && newName.trim() !== oldName) {
                const trimmed = newName.trim();
                if (extensionSettings.battlebarProfiles[trimmed]) {
                    alert('A profile with that name already exists');
                    return;
                }
                // Copy profile data to new name
                extensionSettings.battlebarProfiles[trimmed] = extensionSettings.battlebarProfiles[oldName];
                delete extensionSettings.battlebarProfiles[oldName];
                extensionSettings.currentBattlebarProfile = trimmed;
                saveSettingsDebounced();
                refreshPanel();
                setTimeout(() => {
                    document.getElementById('mazemaster_show_battlebar')?.click();
                }, 100);
            }
        });
    }

    // Battlebar export
    const bbExportBtn = document.getElementById('mazemaster_bb_export_btn');
    if (bbExportBtn) {
        bbExportBtn.addEventListener('click', () => {
            const profileName = document.getElementById('mazemaster_bb_profile_select')?.value;
            if (!profileName) {
                alert('No profile selected to export');
                return;
            }
            exportBattlebarProfile(profileName);
        });
    }

    // Battlebar import
    const bbImportBtn = document.getElementById('mazemaster_bb_import_btn');
    const bbImportFile = document.getElementById('mazemaster_bb_import_file');
    if (bbImportBtn && bbImportFile) {
        bbImportBtn.addEventListener('click', () => {
            bbImportFile.click();
        });

        bbImportFile.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            try {
                const profileName = await importBattlebarProfile(file);
                alert(`Battlebar profile "${profileName}" imported successfully!`);
                refreshPanel();
                document.getElementById('mazemaster_show_battlebar')?.click();
            } catch (err) {
                alert(`Import failed: ${err.message}`);
            }

            bbImportFile.value = '';
        });
    }

    // Battlebar save button
    const bbSaveBtn = document.getElementById('mazemaster_bb_save_btn');
    if (bbSaveBtn) {
        bbSaveBtn.addEventListener('click', () => {
            const profileName = document.getElementById('mazemaster_bb_profile_select')?.value;
            if (!profileName) {
                alert('Please create a battlebar profile first');
                return;
            }

            const profileData = collectBattlebarDataFromUI();

            // Validate required fields
            const errors = [];
            if (!profileData.hitsToWin || profileData.hitsToWin < 1) {
                errors.push('Hits to Win must be at least 1');
            }
            if (!profileData.missesToLose || profileData.missesToLose < 1) {
                errors.push('Misses to Lose must be at least 1');
            }
            if (!profileData.difficulty || profileData.difficulty < 1 || profileData.difficulty > 5) {
                errors.push('Difficulty must be between 1 and 5');
            }

            if (errors.length > 0) {
                alert('Validation Error:\n\n' + errors.join('\n'));
                return;
            }

            saveBattlebarProfile(profileName, profileData);
            alert(`Battlebar profile "${profileName}" saved!`);
        });
    }

    // Battlebar add image button
    const bbAddImageBtn = document.getElementById('mazemaster_bb_add_image_btn');
    const bbImageFile = document.getElementById('mazemaster_bb_image_file');
    if (bbAddImageBtn && bbImageFile) {
        bbAddImageBtn.addEventListener('click', () => {
            bbImageFile.click();
        });

        bbImageFile.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const profileName = document.getElementById('mazemaster_bb_profile_select')?.value;
            if (!profileName) {
                alert('Please create a profile first');
                bbImageFile.value = '';
                return;
            }

            try {
                const imagePath = await uploadBattlebarImage(file, profileName);
                const profile = getBattlebarProfile(profileName) || {};
                const images = profile.images || [];
                images.push({ path: imagePath, name: file.name });
                profile.images = images;
                saveBattlebarProfile(profileName, profile);
                renderBattlebarImages();
            } catch (err) {
                alert(`Image upload failed: ${err.message}`);
            }

            bbImageFile.value = '';
        });
    }

    // =========================================================================
    // MAZE HANDLERS
    // =========================================================================

    // Maze profile select
    const mazeProfileSelect = document.getElementById('mazemaster_maze_profile_select');
    if (mazeProfileSelect) {
        mazeProfileSelect.addEventListener('change', (e) => {
            extensionSettings.currentMazeProfile = e.target.value;
            saveSettingsDebounced();
            updateMazeSettings();
        });
    }

    // Maze new profile
    const mazeNewProfileBtn = document.getElementById('mazemaster_maze_new_profile_btn');
    if (mazeNewProfileBtn) {
        mazeNewProfileBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const name = await callGenericPopup('Enter new maze profile name:', POPUP_TYPE.INPUT, '');
            if (name && name.trim()) {
                const trimmed = name.trim();
                if (!extensionSettings.mazeProfiles[trimmed]) {
                    saveMazeProfile(trimmed, { gridSize: 10 });
                    extensionSettings.currentMazeProfile = trimmed;
                    saveSettingsDebounced();
                    refreshPanel();
                    setTimeout(() => {
                        document.getElementById('mazemaster_show_maze')?.click();
                    }, 100);
                } else {
                    await callGenericPopup(`Maze profile "${trimmed}" already exists.`, POPUP_TYPE.TEXT);
                }
            }
        });
    }

    // Maze delete profile
    const mazeDeleteProfileBtn = document.getElementById('mazemaster_maze_delete_profile_btn');
    if (mazeDeleteProfileBtn) {
        mazeDeleteProfileBtn.addEventListener('click', async () => {
            const profileName = document.getElementById('mazemaster_maze_profile_select')?.value;
            if (profileName) {
                const confirmed = await callGenericPopup(`Delete maze profile "${profileName}"?`, POPUP_TYPE.CONFIRM);
                if (confirmed) {
                    deleteMazeProfile(profileName);
                    refreshPanel();
                    setTimeout(() => {
                        document.getElementById('mazemaster_show_maze')?.click();
                    }, 100);
                }
            }
        });
    }

    // Maze rename profile
    const mazeRenameProfileBtn = document.getElementById('mazemaster_maze_rename_profile_btn');
    if (mazeRenameProfileBtn) {
        mazeRenameProfileBtn.addEventListener('click', async () => {
            const oldName = document.getElementById('mazemaster_maze_profile_select')?.value;
            if (!oldName) {
                alert('No profile selected to rename');
                return;
            }
            const newName = await callGenericPopup('Enter new profile name:', POPUP_TYPE.INPUT, oldName);
            if (newName && newName.trim() && newName.trim() !== oldName) {
                const trimmed = newName.trim();
                if (extensionSettings.mazeProfiles[trimmed]) {
                    alert('A profile with that name already exists');
                    return;
                }
                // Copy profile data to new name
                extensionSettings.mazeProfiles[trimmed] = extensionSettings.mazeProfiles[oldName];
                delete extensionSettings.mazeProfiles[oldName];
                extensionSettings.currentMazeProfile = trimmed;
                saveSettingsDebounced();
                refreshPanel();
                setTimeout(() => {
                    document.getElementById('mazemaster_show_maze')?.click();
                }, 100);
            }
        });
    }

    // Maze save profile
    const mazeSaveBtn = document.getElementById('mazemaster_maze_save_btn');
    if (mazeSaveBtn) {
        mazeSaveBtn.addEventListener('click', () => {
            const profileName = document.getElementById('mazemaster_maze_profile_select')?.value;
            if (!profileName) {
                alert('Please create a maze profile first');
                return;
            }

            const profileData = collectMazeDataFromUI();

            // Validate required fields
            const errors = [];
            if (!profileData.gridSize || profileData.gridSize < 5 || profileData.gridSize > 20) {
                errors.push('Grid Size must be between 5 and 20');
            }

            // Validate encounter percentages don't exceed 100%
            if (profileData.minionEncounters && profileData.minionEncounters.length > 0) {
                const totalPercent = profileData.minionEncounters.reduce((sum, enc) => sum + (enc.percent || 0), 0);
                if (totalPercent > 100) {
                    errors.push(`Encounter percentages total ${totalPercent}% (max 100%)`);
                }
            }

            if (errors.length > 0) {
                alert('Validation Error:\n\n' + errors.join('\n'));
                return;
            }

            saveMazeProfile(profileName, profileData);
            alert(`Maze profile "${profileName}" saved!`);
        });
    }

    // Story Milestones button
    const storyBtn = document.getElementById('mazemaster_maze_story_btn');
    if (storyBtn) {
        storyBtn.addEventListener('click', () => {
            showStoryMilestonesModal();
        });
    }

    // Collapsible section toggles
    document.querySelectorAll('.mazemaster-collapsible-header').forEach(header => {
        header.addEventListener('click', () => {
            const targetId = header.getAttribute('data-target');
            const content = document.getElementById(targetId);
            const collapsible = header.closest('.mazemaster-collapsible');

            if (content) {
                const isExpanded = content.style.display !== 'none';
                content.style.display = isExpanded ? 'none' : 'block';
                collapsible?.classList.toggle('expanded', !isExpanded);
            }
        });
    });

    // Render saved games list
    renderSavedGamesList();

    // Intelligent Distribute button
    const distributeBtn = document.getElementById('mazemaster_intelligent_distribute');
    if (distributeBtn) {
        distributeBtn.addEventListener('click', handleIntelligentDistribute);
    }

    // Maze win image upload
    const mazeWinImageBtn = document.getElementById('mazemaster_maze_win_image_btn');
    const mazeWinImageFile = document.getElementById('mazemaster_maze_win_image_file');
    if (mazeWinImageBtn && mazeWinImageFile) {
        mazeWinImageBtn.addEventListener('click', () => {
            mazeWinImageFile.click();
        });

        mazeWinImageFile.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const profileName = document.getElementById('mazemaster_maze_profile_select')?.value;
            if (!profileName) {
                alert('Please create a profile first');
                mazeWinImageFile.value = '';
                return;
            }

            try {
                const imagePath = await uploadImage(file, `maze_win_${profileName}`);
                const profile = getMazeProfile(profileName) || {};
                profile.winImage = imagePath;
                saveMazeProfile(profileName, profile);

                // Update preview
                const previewContainer = document.querySelector('.mazemaster-maze-win-image-preview');
                if (previewContainer) {
                    previewContainer.innerHTML = `<img id="maze_win_image_preview" src="${imagePath}" alt="Victory">`;
                }
            } catch (err) {
                alert(`Image upload failed: ${err.message}`);
            }

            mazeWinImageFile.value = '';
        });
    }

    // Chest image upload
    const chestImageBtn = document.getElementById('mazemaster_chest_image_btn');
    const chestImageFile = document.getElementById('mazemaster_chest_image_file');
    if (chestImageBtn && chestImageFile) {
        chestImageBtn.addEventListener('click', () => {
            chestImageFile.click();
        });

        chestImageFile.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const profileName = document.getElementById('mazemaster_maze_profile_select')?.value;
            if (!profileName) {
                alert('Please create a profile first');
                chestImageFile.value = '';
                return;
            }

            try {
                const imagePath = await uploadImage(file, `chest_${profileName}`);
                const profile = getMazeProfile(profileName);
                if (profile) {
                    profile.chestImage = imagePath;
                    saveMazeProfile(profileName, profile);

                    // Update preview
                    const previewContainer = document.querySelector('.mazemaster-chest-preview');
                    if (previewContainer) {
                        previewContainer.innerHTML = `<img id="mazemaster_chest_preview_img" src="${imagePath}" style="width: 100%; height: 100%; object-fit: cover;">`;
                    }
                }
            } catch (err) {
                alert(`Image upload failed: ${err.message}`);
            }

            chestImageFile.value = '';
        });
    }

    // Main minion select - toggle settings visibility
    const mainMinionSelect = document.getElementById('mazemaster_maze_main_minion');
    if (mainMinionSelect) {
        mainMinionSelect.addEventListener('change', (e) => {
            const settingsDiv = document.getElementById('mazemaster_main_minion_settings');
            if (settingsDiv) {
                settingsDiv.style.display = e.target.value ? '' : 'none';
            }
        });
    }

    // Exit type select - update profile dropdown
    const exitTypeSelect = document.getElementById('mazemaster_maze_exit_type');
    if (exitTypeSelect) {
        exitTypeSelect.addEventListener('change', () => {
            const currentType = exitTypeSelect.value;
            updateExitProfileDropdown(currentType, '');
        });
    }

    // Add portal button
    const addPortalBtn = document.getElementById('mazemaster_add_portal_btn');
    if (addPortalBtn) {
        addPortalBtn.addEventListener('click', () => {
            const list = document.getElementById('mazemaster_portals_list');
            if (!list) return;

            const portalIndex = list.children.length;
            const portalItem = document.createElement('div');
            portalItem.className = 'mazemaster-portal-item';
            portalItem.dataset.portalIndex = portalIndex;
            portalItem.innerHTML = `
                <div class="portal-header">
                    <span class="portal-color" style="background: #9b59b6"></span>
                    <span class="portal-name">Portal ${portalIndex + 1}</span>
                    <button class="menu_button remove-portal-btn" title="Remove Portal">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
                <div class="portal-details">
                    <div class="portal-row">
                        <label>ID:</label>
                        <input type="text" class="portal-id mazemaster-input" value="" placeholder="portal${portalIndex + 1}">
                    </div>
                    <div class="portal-row">
                        <label>Color:</label>
                        <input type="color" class="portal-color-input" value="#9b59b6">
                    </div>
                    <div class="portal-row">
                        <label>Bidirectional:</label>
                        <input type="checkbox" class="portal-bidirectional" checked>
                    </div>
                    <div class="portal-row coords-row">
                        <span>Start: X</span>
                        <input type="number" class="portal-start-x mazemaster-input" value="" placeholder="auto" min="0">
                        <span>Y</span>
                        <input type="number" class="portal-start-y mazemaster-input" value="" placeholder="auto" min="0">
                    </div>
                    <div class="portal-row coords-row">
                        <span>End: X</span>
                        <input type="number" class="portal-end-x mazemaster-input" value="" placeholder="auto" min="0">
                        <span>Y</span>
                        <input type="number" class="portal-end-y mazemaster-input" value="" placeholder="auto" min="0">
                    </div>
                </div>
            `;

            // Add remove handler
            portalItem.querySelector('.remove-portal-btn').addEventListener('click', () => {
                portalItem.remove();
                updatePortalHint();
            });

            // Update color preview when color input changes
            portalItem.querySelector('.portal-color-input').addEventListener('input', (e) => {
                portalItem.querySelector('.portal-color').style.background = e.target.value;
            });

            // Update name when ID changes
            portalItem.querySelector('.portal-id').addEventListener('input', (e) => {
                portalItem.querySelector('.portal-name').textContent = e.target.value || `Portal ${portalIndex + 1}`;
            });

            list.appendChild(portalItem);
            updatePortalHint();
        });
    }

    // Update portal count hint in section header
    function updatePortalHint() {
        const list = document.getElementById('mazemaster_portals_list');
        const hint = document.querySelector('[data-target="portals_section"]')?.closest('.mazemaster-collapsible')?.querySelector('.mazemaster-collapse-hint');
        if (list && hint) {
            hint.textContent = `(${list.children.length} portal pairs)`;
        }
    }

    // Add remove handlers to existing portal items
    document.querySelectorAll('#mazemaster_portals_list .remove-portal-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.mazemaster-portal-item').remove();
            updatePortalHint();
        });
    });

    // Add color preview update for existing portals
    document.querySelectorAll('#mazemaster_portals_list .portal-color-input').forEach(input => {
        input.addEventListener('input', (e) => {
            e.target.closest('.mazemaster-portal-item').querySelector('.portal-color').style.background = e.target.value;
        });
    });

    // Add objective button
    const addObjectiveBtn = document.getElementById('mazemaster_add_objective_btn');
    if (addObjectiveBtn) {
        addObjectiveBtn.addEventListener('click', () => {
            const list = document.getElementById('mazemaster_objectives_list');
            if (!list) return;

            const objIndex = list.children.length;
            const objectiveItem = document.createElement('div');
            objectiveItem.className = 'mazemaster-objective-item';
            objectiveItem.dataset.objectiveIndex = objIndex;
            objectiveItem.innerHTML = `
                <div class="objective-config-header">
                    <span class="objective-name">Objective ${objIndex + 1}</span>
                    <button class="menu_button remove-objective-btn" title="Remove Objective">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
                <div class="objective-config-details">
                    <div class="objective-config-row">
                        <label>ID:</label>
                        <input type="text" class="objective-id mazemaster-input" value="" placeholder="obj${objIndex + 1}">
                    </div>
                    <div class="objective-config-row">
                        <label>Type:</label>
                        <select class="objective-type mazemaster-select">
                            <option value="collect">Collect Item</option>
                            <option value="defeat">Defeat Minion</option>
                            <option value="explore">Explore %</option>
                        </select>
                    </div>
                    <div class="objective-config-row objective-target-row">
                        <label>Target:</label>
                        <input type="text" class="objective-target mazemaster-input" value="" placeholder="key, pow, stealth...">
                    </div>
                    <div class="objective-config-row">
                        <label>Count:</label>
                        <input type="number" class="objective-count mazemaster-input" value="1" min="1">
                    </div>
                    <div class="objective-config-row">
                        <label>Description:</label>
                        <input type="text" class="objective-description mazemaster-input" value="" placeholder="Find 3 Keys">
                    </div>
                    <div class="objective-config-row">
                        <label>Required:</label>
                        <input type="checkbox" class="objective-required" checked>
                    </div>
                    <div class="objective-config-row">
                        <label>Reward Script:</label>
                        <input type="text" class="objective-reward mazemaster-input" value="" placeholder="/echo Objective complete!">
                    </div>
                </div>
            `;

            // Add remove handler
            objectiveItem.querySelector('.remove-objective-btn').addEventListener('click', () => {
                objectiveItem.remove();
                updateObjectiveHint();
            });

            // Add type change handler to show/hide target row
            const typeSelect = objectiveItem.querySelector('.objective-type');
            const targetRow = objectiveItem.querySelector('.objective-target-row');
            typeSelect.addEventListener('change', () => {
                targetRow.style.display = typeSelect.value === 'explore' ? 'none' : 'flex';
            });

            // Update description when description changes
            objectiveItem.querySelector('.objective-description').addEventListener('input', (e) => {
                objectiveItem.querySelector('.objective-name').textContent = e.target.value || `Objective ${objIndex + 1}`;
            });

            list.appendChild(objectiveItem);
            updateObjectiveHint();
        });
    }

    // Update objective count hint in section header
    function updateObjectiveHint() {
        const list = document.getElementById('mazemaster_objectives_list');
        const hint = document.querySelector('[data-target="objectives_section"]')?.closest('.mazemaster-collapsible')?.querySelector('.mazemaster-collapse-hint');
        if (list && hint) {
            hint.textContent = `(${list.children.length} objectives)`;
        }
    }

    // Add remove handlers to existing objective items
    document.querySelectorAll('#mazemaster_objectives_list .remove-objective-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.mazemaster-objective-item').remove();
            updateObjectiveHint();
        });
    });

    // Add type change handlers to existing objectives
    document.querySelectorAll('#mazemaster_objectives_list .objective-type').forEach(select => {
        const item = select.closest('.mazemaster-objective-item');
        const targetRow = item.querySelector('.objective-target-row');
        select.addEventListener('change', () => {
            targetRow.style.display = select.value === 'explore' ? 'none' : 'flex';
        });
    });

    // Add encounter button
    const addEncounterBtn = document.getElementById('mazemaster_add_encounter_btn');
    if (addEncounterBtn) {
        addEncounterBtn.addEventListener('click', () => {
            const list = document.getElementById('mazemaster_maze_encounters_list');
            if (!list) return;

            const minionOptions = Object.keys(extensionSettings.minions || {}).map(id => {
                const m = extensionSettings.minions[id];
                return `<option value="${id}">${m.name || id}</option>`;
            }).join('');

            const row = document.createElement('div');
            row.className = 'mazemaster-encounter-row';
            row.innerHTML = `
                <select class="encounter-minion-select">
                    <option value="">Select Minion</option>
                    ${minionOptions}
                </select>
                <input type="number" class="encounter-percent-input" min="1" max="100" value="5" placeholder="%">
                <span class="encounter-percent-label">%</span>
                <button class="encounter-remove-btn menu_button"><i class="fa-solid fa-trash"></i></button>
            `;

            // Add remove handler
            row.querySelector('.encounter-remove-btn').addEventListener('click', () => {
                row.remove();
            });

            list.appendChild(row);
        });
    }

    // Add trap encounter button
    const addTrapEncounterBtn = document.getElementById('mazemaster_add_trap_encounter_btn');
    if (addTrapEncounterBtn) {
        addTrapEncounterBtn.addEventListener('click', () => {
            const list = document.getElementById('mazemaster_maze_traps_list');
            if (!list) return;

            const trapOptions = getTrapNames().map(id => {
                const t = getTrap(id);
                return `<option value="${escapeHtml(id)}">${escapeHtml(t?.name || id)}</option>`;
            }).join('');

            if (!trapOptions) {
                alert('No traps available. Create traps in the Traps tab first.');
                return;
            }

            const row = document.createElement('div');
            row.className = 'mazemaster-encounter-row mazemaster-trap-encounter-row';
            row.innerHTML = `
                <select class="trap-encounter-select">
                    <option value="">Select Trap</option>
                    ${trapOptions}
                </select>
                <input type="number" class="trap-encounter-percent-input" min="1" max="100" value="5" placeholder="%">
                <span class="encounter-percent-label">%</span>
                <button class="trap-encounter-remove-btn menu_button"><i class="fa-solid fa-trash"></i></button>
            `;

            // Add remove handler
            row.querySelector('.trap-encounter-remove-btn').addEventListener('click', () => {
                row.remove();
            });

            list.appendChild(row);
        });
    }

    // =========================================================================
    // MINION HANDLERS
    // =========================================================================

    // Add minion button
    const addMinionBtn = document.getElementById('mazemaster_add_minion_btn');
    const minionImageFile = document.getElementById('mazemaster_minion_image_file');
    if (addMinionBtn && minionImageFile) {
        addMinionBtn.addEventListener('click', () => {
            minionImageFile.click();
        });

        minionImageFile.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            try {
                const minionId = `minion_${Date.now()}`;
                const imagePath = await uploadImage(file, minionId);
                const minionName = await callGenericPopup('Enter minion name:', POPUP_TYPE.INPUT, 'New Minion');

                if (minionName && minionName.trim()) {
                    saveMinion(minionId, {
                        name: minionName.trim(),
                        imagePath: imagePath,
                    });
                    renderMinionsList();
                }
            } catch (err) {
                alert(`Image upload failed: ${err.message}`);
            }

            minionImageFile.value = '';
        });
    }

    // Minion profile save button
    const minionProfileSaveBtn = document.getElementById('mazemaster_minion_profile_save_btn');
    if (minionProfileSaveBtn) {
        minionProfileSaveBtn.addEventListener('click', async () => {
            const profileName = await callGenericPopup('Enter profile name:', POPUP_TYPE.INPUT, 'My Minions');
            if (profileName && profileName.trim()) {
                const trimmed = profileName.trim();
                extensionSettings.minionProfiles[trimmed] = JSON.parse(JSON.stringify(extensionSettings.minions || {}));
                saveSettingsDebounced();
                alert(`Minion profile "${trimmed}" saved!`);
                refreshPanel();
                setTimeout(() => {
                    document.getElementById('mazemaster_show_minions')?.click();
                }, 100);
            }
        });
    }

    // Minion profile load button
    const minionProfileLoadBtn = document.getElementById('mazemaster_minion_profile_load_btn');
    if (minionProfileLoadBtn) {
        minionProfileLoadBtn.addEventListener('click', async () => {
            const profileSelect = document.getElementById('mazemaster_minion_profile_select');
            const profileName = profileSelect?.value;
            if (!profileName) {
                alert('Select a profile to load');
                return;
            }
            const confirmed = await callGenericPopup(`Load minion profile "${profileName}"? This will replace your current minions.`, POPUP_TYPE.CONFIRM);
            if (confirmed) {
                extensionSettings.minions = JSON.parse(JSON.stringify(extensionSettings.minionProfiles[profileName] || {}));
                saveSettingsDebounced();
                renderMinionsList();
                alert(`Minion profile "${profileName}" loaded!`);
            }
        });
    }

    // Minion profile delete button
    const minionProfileDeleteBtn = document.getElementById('mazemaster_minion_profile_delete_btn');
    if (minionProfileDeleteBtn) {
        minionProfileDeleteBtn.addEventListener('click', async () => {
            const profileSelect = document.getElementById('mazemaster_minion_profile_select');
            const profileName = profileSelect?.value;
            if (!profileName) {
                alert('Select a profile to delete');
                return;
            }
            const confirmed = await callGenericPopup(`Delete minion profile "${profileName}"?`, POPUP_TYPE.CONFIRM);
            if (confirmed) {
                delete extensionSettings.minionProfiles[profileName];
                saveSettingsDebounced();
                refreshPanel();
                setTimeout(() => {
                    document.getElementById('mazemaster_show_minions')?.click();
                }, 100);
            }
        });
    }

    // =========================================================================
    // TRAP HANDLERS
    // =========================================================================

    // Add trap button
    const addTrapBtn = document.getElementById('mazemaster_add_trap_btn');
    const trapImageFile = document.getElementById('mazemaster_trap_image_file');
    if (addTrapBtn && trapImageFile) {
        addTrapBtn.addEventListener('click', () => {
            trapImageFile.click();
        });

        trapImageFile.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            try {
                const trapId = `trap_${Date.now()}`;
                const imagePath = await uploadImage(file, trapId);
                const trapName = await callGenericPopup('Enter trap name:', POPUP_TYPE.INPUT, 'New Trap');

                if (trapName && trapName.trim()) {
                    saveTrap(trapId, {
                        name: trapName.trim(),
                        imagePath: imagePath,
                        message: 'You triggered a trap!',
                        script: '',
                    });
                    renderTrapsList();
                }
            } catch (err) {
                alert(`Image upload failed: ${err.message}`);
            }

            trapImageFile.value = '';
        });
    }

    // Trap profile save button
    const trapProfileSaveBtn = document.getElementById('mazemaster_trap_profile_save_btn');
    if (trapProfileSaveBtn) {
        trapProfileSaveBtn.addEventListener('click', async () => {
            const profileName = await callGenericPopup('Enter profile name:', POPUP_TYPE.INPUT, 'My Traps');
            if (profileName && profileName.trim()) {
                const trimmed = profileName.trim();
                extensionSettings.trapProfiles[trimmed] = JSON.parse(JSON.stringify(extensionSettings.traps || {}));
                saveSettingsDebounced();
                alert(`Trap profile "${trimmed}" saved!`);
                refreshPanel();
                setTimeout(() => {
                    document.getElementById('mazemaster_show_traps')?.click();
                }, 100);
            }
        });
    }

    // Trap profile load button
    const trapProfileLoadBtn = document.getElementById('mazemaster_trap_profile_load_btn');
    if (trapProfileLoadBtn) {
        trapProfileLoadBtn.addEventListener('click', async () => {
            const profileSelect = document.getElementById('mazemaster_trap_profile_select');
            const profileName = profileSelect?.value;
            if (!profileName) {
                alert('Select a profile to load');
                return;
            }
            const confirmed = await callGenericPopup(`Load trap profile "${profileName}"? This will replace your current traps.`, POPUP_TYPE.CONFIRM);
            if (confirmed) {
                extensionSettings.traps = JSON.parse(JSON.stringify(extensionSettings.trapProfiles[profileName] || {}));
                saveSettingsDebounced();
                renderTrapsList();
                alert(`Trap profile "${profileName}" loaded!`);
            }
        });
    }

    // Trap profile delete button
    const trapProfileDeleteBtn = document.getElementById('mazemaster_trap_profile_delete_btn');
    if (trapProfileDeleteBtn) {
        trapProfileDeleteBtn.addEventListener('click', async () => {
            const profileSelect = document.getElementById('mazemaster_trap_profile_select');
            const profileName = profileSelect?.value;
            if (!profileName) {
                alert('Select a profile to delete');
                return;
            }
            const confirmed = await callGenericPopup(`Delete trap profile "${profileName}"?`, POPUP_TYPE.CONFIRM);
            if (confirmed) {
                delete extensionSettings.trapProfiles[profileName];
                saveSettingsDebounced();
                refreshPanel();
                setTimeout(() => {
                    document.getElementById('mazemaster_show_traps')?.click();
                }, 100);
            }
        });
    }
}

function refreshPanel() {
    const drawer = document.getElementById('mazemaster_drawer');
    if (drawer) {
        drawer.innerHTML = getPanelHtml();
        setupEventHandlers();
        renderSegmentsList();
        renderBattlebarImages();
        renderMinionsList();
        renderTrapsList();
        updateMazeSettings();
    }
}

// =============================================================================
// MACRO PROCESSING (like TPLink pattern)
// =============================================================================

/**
 * Process a message element for MazeMaster macros
 * {{wheel:profileName}} - spins the wheel
 * {{battlebar:profileName}} - starts the battlebar
 * {{maze:profileName}} - starts the maze
 */
async function processMacroMessage(mesElement) {
    if (processedMacroMessages.has(mesElement)) return;

    // Skip streaming messages
    if (mesElement.classList.contains('streaming') ||
        mesElement.classList.contains('is-typing') ||
        mesElement.querySelector('.mes_text.streaming')) {
        return;
    }

    const mesText = mesElement.querySelector('.mes_text .stle--content') || mesElement.querySelector('.mes_text');
    if (!mesText) return;

    const text = mesText.textContent || '';

    // Match {{wheel:profileName}}, {{battlebar:profileName}}, and {{maze:profileName}}
    const wheelPattern = /\{\{wheel:([^}]+)\}\}/gi;
    const battlebarPattern = /\{\{battlebar:([^}]+)\}\}/gi;
    const mazePattern = /\{\{maze:([^}]+)\}\}/gi;

    const wheelMatches = [];
    const battlebarMatches = [];
    const mazeMatches = [];

    let match;
    while ((match = wheelPattern.exec(text)) !== null) {
        wheelMatches.push({ full: match[0], profile: match[1].trim() });
    }
    while ((match = battlebarPattern.exec(text)) !== null) {
        battlebarMatches.push({ full: match[0], profile: match[1].trim() });
    }
    while ((match = mazePattern.exec(text)) !== null) {
        mazeMatches.push({ full: match[0], profile: match[1].trim() });
    }

    if (wheelMatches.length === 0 && battlebarMatches.length === 0 && mazeMatches.length === 0) return;

    // Mark as processed
    processedMacroMessages.add(mesElement);

    const context = SillyTavern.getContext();
    const mesId = mesElement.getAttribute('mesid');

    // Process wheel macros
    for (const m of wheelMatches) {
        console.log(`[MazeMaster] Processing wheel macro: ${m.full}`);

        // Trigger the wheel (same as slash command)
        const result = loadWheelFromProfile(m.profile);
        if (!result.error) {
            const validation = validateWheelBalance();
            if (validation.valid) {
                showWheelModal();
            }
        }

        const replacement = `[🎡 Wheel: ${m.profile}]`;

        // Update chat context and DOM
        if (context.chat && mesId !== null) {
            const msgIndex = parseInt(mesId);
            if (context.chat[msgIndex]) {
                const originalMes = context.chat[msgIndex].mes;
                // Strip macro from context (AI never sees it)
                const contextMes = originalMes.replace(m.full, '').replace(/\s+/g, ' ').trim();
                // Visual replacement for user
                const visualMes = originalMes.replace(m.full, replacement);

                context.chat[msgIndex].mes = contextMes;

                const mesTextEl = mesElement.querySelector('.mes_text');
                if (mesTextEl) {
                    mesTextEl.innerHTML = visualMes;
                }
            }
        }
    }

    // Process battlebar macros
    for (const m of battlebarMatches) {
        console.log(`[MazeMaster] Processing battlebar macro: ${m.full}`);

        // Trigger the battlebar (same as slash command)
        startBattlebar(m.profile);

        const replacement = `[⚔️ Battlebar: ${m.profile}]`;

        // Update chat context and DOM
        if (context.chat && mesId !== null) {
            const msgIndex = parseInt(mesId);
            if (context.chat[msgIndex]) {
                const originalMes = context.chat[msgIndex].mes;
                // Strip macro from context
                const contextMes = originalMes.replace(m.full, '').replace(/\s+/g, ' ').trim();
                // Visual replacement
                const visualMes = originalMes.replace(m.full, replacement);

                context.chat[msgIndex].mes = contextMes;

                const mesTextEl = mesElement.querySelector('.mes_text');
                if (mesTextEl) {
                    mesTextEl.innerHTML = visualMes;
                }
            }
        }
    }

    // Process maze macros
    for (const m of mazeMatches) {
        console.log(`[MazeMaster] Processing maze macro: ${m.full}`);

        // Trigger the maze (same as slash command)
        startMaze(m.profile);

        const replacement = `[🏛️ Maze: ${m.profile}]`;

        // Update chat context and DOM
        if (context.chat && mesId !== null) {
            const msgIndex = parseInt(mesId);
            if (context.chat[msgIndex]) {
                const originalMes = context.chat[msgIndex].mes;
                // Strip macro from context
                const contextMes = originalMes.replace(m.full, '').replace(/\s+/g, ' ').trim();
                // Visual replacement
                const visualMes = originalMes.replace(m.full, replacement);

                context.chat[msgIndex].mes = contextMes;

                const mesTextEl = mesElement.querySelector('.mes_text');
                if (mesTextEl) {
                    mesTextEl.innerHTML = visualMes;
                }
            }
        }
    }
}

/**
 * Register message hooks to intercept and process MazeMaster macros
 */
function registerMacroHooks() {
    const context = SillyTavern.getContext();

    if (!context || !context.eventSource || !context.eventTypes) {
        console.warn('[MazeMaster] Context not ready for macro hooks, retrying...');
        setTimeout(registerMacroHooks, 500);
        return;
    }

    // Listen for user messages
    if (context.eventTypes.USER_MESSAGE_RENDERED) {
        context.eventSource.on(context.eventTypes.USER_MESSAGE_RENDERED, (messageId) => {
            setTimeout(() => {
                const mesElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
                if (mesElement) processMacroMessage(mesElement);
            }, 500);
        });
    }

    // Listen for AI messages
    if (context.eventTypes.CHARACTER_MESSAGE_RENDERED) {
        context.eventSource.on(context.eventTypes.CHARACTER_MESSAGE_RENDERED, (messageId) => {
            const tryProcess = (attempt = 1) => {
                const mesElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
                if (!mesElement) return;

                const isStreaming = mesElement.classList.contains('streaming') ||
                                   mesElement.classList.contains('is-typing');

                if (isStreaming && attempt < 5) {
                    setTimeout(() => tryProcess(attempt + 1), 1000);
                } else {
                    processMacroMessage(mesElement);
                }
            };
            setTimeout(() => tryProcess(), 500);
        });
    }

    console.log('[MazeMaster] Macro hooks registered');
}

// =============================================================================
// INITIALIZATION
// =============================================================================

(function init() {
    loadSettings();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initUI();
            registerSlashCommands();
            registerMacroHooks();
        });
    } else {
        initUI();
        registerSlashCommands();
        registerMacroHooks();
    }

    console.log(`[${MODULE_NAME}] Extension loaded (folder: ${EXTENSION_FOLDER_NAME})`);
})();
