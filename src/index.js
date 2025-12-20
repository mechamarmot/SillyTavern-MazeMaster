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
    // Inventory system
    inventory: {
        key: 0,
        stealth: 0,
        pow: 0,
        grandpow: 0,
    },
    pendingConfirmation: null,    // { type, minionId, x, y, canSlipAway }
    pendingChest: null,           // { chestData, x, y } for Open/Ignore flow
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

    const prompt = `You are ${minionName}, ${minionRole}.

${contextParts.length > 0 ? contextParts.join('\n') + '\n\n' : ''}The player has encountered you in a maze. Based on this message template: "${baseMessage}"

Write a short, atmospheric response (1-2 sentences max, under 100 characters if possible). Stay in character. Be mysterious and engaging. Do not use quotation marks around your response.`;

    try {
        console.log('[MazeMaster] Generating LLM message for:', minionName);

        const response = await generateQuietPrompt(prompt, {
            quietToLoud: false,
            skipWIAN: true,
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

    const prompt = `The player has triggered a trap called "${trapName}" in a maze.

${mainStory ? `Story Setting: ${mainStory}\n\n` : ''}Based on this trap description: "${baseMessage}"

Write a short, dramatic narration of the trap being triggered (1-2 sentences, under 100 characters). Make it visceral and immediate. Do not use quotation marks.`;

    try {
        console.log('[MazeMaster] Generating LLM message for trap:', trapName);

        const response = await generateQuietPrompt(prompt, {
            quietToLoud: false,
            skipWIAN: true,
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

    const prompt = `The player is in a battle called "${battlebarName}" - ${battleDesc}.

${mainStory ? `Story Setting: ${mainStory}\n\n` : ''}${progress ? progress + '\n\n' : ''}Based on this stage message: "${stageMessage}"

Write a short, intense combat narration (1-2 sentences, under 100 characters). Make it exciting and dramatic. Do not use quotation marks.`;

    try {
        console.log('[MazeMaster] Generating LLM message for battlebar:', battlebarName);

        const response = await generateQuietPrompt(prompt, {
            quietToLoud: false,
            skipWIAN: true,
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

    const prompt = `The player has discovered ${chestDesc} in a maze.

${mainStory ? `Story Setting: ${mainStory}\n\n` : ''}Based on this chest discovery message: "${baseMessage}"

Write a short, atmospheric description of finding the chest (1-2 sentences, under 100 characters). Make it feel rewarding and mysterious. Do not use quotation marks.`;

    try {
        console.log('[MazeMaster] Generating LLM message for chest');

        const response = await generateQuietPrompt(prompt, {
            quietToLoud: false,
            skipWIAN: true,
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
    };

    randomizeBattlebarZone();
    showBattlebarModal();
    startBattlebarAnimation();
    document.addEventListener('keydown', handleBattlebarKeydown);

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
    const speed = 100 / difficulty.traverseTime; // % per ms

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
 */
function normalizeTileDistribution(profile, totalValidCells) {
    const result = {
        minionPlacements: [],
        trapPlacements: [],
        chestCount: 0,
    };

    // Calculate raw percentages
    const chestPercent = profile.chestTilePercent || 0;
    const minionEncounters = profile.minionEncounters || [];
    const trapEncounters = profile.trapEncounters || [];

    let totalMinionPercent = minionEncounters.reduce((sum, e) => sum + (e.percent || 0), 0);
    let totalTrapPercent = trapEncounters.reduce((sum, e) => sum + (e.percent || 0), 0);

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

    // Convert minion percentages to counts
    for (const encounter of minionEncounters) {
        const scaledPercent = (encounter.percent || 0) * scale;
        const count = Math.floor(totalValidCells * scaledPercent / 100);
        if (count > 0) {
            result.minionPlacements.push({ minionId: encounter.minionId, count });
        }
    }

    // Convert trap percentages to counts
    for (const encounter of trapEncounters) {
        const scaledPercent = (encounter.percent || 0) * scale;
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

    console.log(`[MazeMaster] Placed ${distribution.chestCount} chests, ${minionCount} minions, ${trapCount} traps`);
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
    // Balance between visibility and fitting on screen
    if (gridSize <= 5) return 40;
    if (gridSize <= 7) return 35;
    if (gridSize <= 10) return 30;
    if (gridSize <= 12) return 26;
    if (gridSize <= 15) return 22;
    return 18;
}

function startMaze(profileName) {
    const profile = getMazeProfile(profileName);
    if (!profile) {
        console.error(`[MazeMaster] Maze profile "${profileName}" not found`);
        return { error: `Profile "${profileName}" not found` };
    }

    const size = profile.gridSize || 10;
    const grid = generateMaze(size);

    // Place tiles (chests and minion encounters)
    placeTiles(grid, profile, size);

    // Get starting inventory config
    const startInv = profile.startingInventory || { key: 0, stealth: 0, pow: 0, grandpow: 0 };

    // Determine initial minion display (main story, main minion intro, or default)
    let initialMinion = getDefaultMinion();
    const mainMinion = profile.mainMinion ? getMinion(profile.mainMinion) : null;

    // Use main story if available, otherwise use main minion intro
    if (profile.storyConfig?.mainStory) {
        initialMinion = {
            name: mainMinion?.name || 'Story',
            imagePath: mainMinion?.imagePath || '',
            message: profile.storyConfig.mainStory,
        };
    } else if (mainMinion) {
        initialMinion = {
            name: mainMinion.name,
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
        visited: new Set(['0,0']),
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
        },
        // Story milestones
        shownMilestones: new Set(),
    };

    showMazeModal();
    renderMazeGrid();
    updateMazeHero();
    updateInventoryDisplay();

    document.addEventListener('keydown', handleMazeKeydown, { capture: true });

    console.log(`[MazeMaster] Maze "${profileName}" started (${size}x${size})`);
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
                <!-- Hero Section (Minion Area) -->
                <div class="mazemaster-maze-hero">
                    <div id="maze_minion_name" class="maze-minion-name"></div>
                    <div class="mazemaster-maze-hero-content">
                        <div class="mazemaster-maze-hero-avatar">
                            <img id="maze_minion_img" src="" alt="" style="display: none;">
                            <div id="maze_generating_indicator" class="maze-generating-indicator">
                                <i class="fa-solid fa-comment-dots"></i>
                            </div>
                        </div>
                        <div id="maze_minion_message" class="maze-minion-message"></div>
                    </div>
                </div>

                <!-- Control Bar: Inventory | Actions | Save/Exit -->
                <div class="mazemaster-maze-control-bar">
                    <div class="mazemaster-maze-inventory">
                        <div class="inventory-item" title="Keys">
                            <i class="fa-solid fa-key"></i>
                            <span id="maze_inv_key">${currentMaze.inventory.key}</span>
                        </div>
                        <div class="inventory-item" title="Stealth">
                            <i class="fa-solid fa-user-ninja"></i>
                            <span id="maze_inv_stealth">${currentMaze.inventory.stealth}</span>
                        </div>
                        <div class="inventory-item" title="POW">
                            <i class="fa-solid fa-bolt"></i>
                            <span id="maze_inv_pow">${currentMaze.inventory.pow}</span>
                        </div>
                        <div class="inventory-item grandpow" title="GRANDPOW - Instant Win!">
                            <i class="fa-solid fa-star"></i>
                            <span id="maze_inv_grandpow">${currentMaze.inventory.grandpow}</span>
                        </div>
                    </div>
                    <div id="maze_encounter_confirm" class="maze-action-buttons">
                        <!-- Populated dynamically when encounter happens -->
                    </div>
                    <div class="mazemaster-maze-save-exit">
                        <button id="maze_save_exit_btn" class="menu_button maze-action-btn">
                            <i class="fa-solid fa-floppy-disk"></i> Save
                        </button>
                        <button id="maze_exit_btn" class="menu_button maze-action-btn maze-exit-btn">
                            <i class="fa-solid fa-door-open"></i> Exit
                        </button>
                    </div>
                </div>

                <!-- Maze Area: Full width container with arrows left, grid centered -->
                <div class="mazemaster-maze-area">
                    <div class="mazemaster-maze-arrows-left">
                        <button class="maze-arrow-btn menu_button" data-dir="up">UP</button>
                        <button class="maze-arrow-btn menu_button" data-dir="down">DOWN</button>
                        <button class="maze-arrow-btn menu_button" data-dir="left">LEFT</button>
                        <button class="maze-arrow-btn menu_button" data-dir="right">RIGHT</button>
                    </div>
                    <div class="mazemaster-maze-grid-wrapper">
                        <div id="maze_grid" class="mazemaster-maze-grid" style="grid-template-columns: repeat(${currentMaze.size}, ${cellSize}px);">
                            <!-- Grid cells rendered dynamically -->
                        </div>
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
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                padding: 15px;
                max-width: 95vw;
                max-height: 95vh;
                margin: 10px;
                background: #1a1a2e;
                border-radius: 15px;
                border: 2px solid #333;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
                overflow-y: auto;
            }

            /* Hero Section - Minion Area */
            .mazemaster-maze-hero {
                display: flex;
                flex-direction: column;
                width: 550px;
                max-width: 95vw;
                height: 180px;
                background: rgba(0, 0, 0, 0.3);
                border-radius: 10px;
                padding: 10px;
                border: 1px solid #444;
            }

            .maze-minion-name {
                font-weight: bold;
                font-size: 1.1em;
                color: #e94560;
                text-align: center;
                padding-bottom: 6px;
                margin-bottom: 8px;
                border-bottom: 1px solid #333;
                flex-shrink: 0;
            }

            .mazemaster-maze-hero-content {
                display: flex;
                gap: 12px;
                flex: 1;
                min-height: 0;
            }

            .mazemaster-maze-hero-avatar {
                width: 60px;
                height: 60px;
                min-width: 60px;
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

            .maze-minion-message {
                flex: 1;
                color: #eee;
                font-style: italic;
                line-height: 1.4;
                font-size: 0.95em;
                overflow-y: auto;
                padding-right: 8px;
                max-height: 100%;
            }

            /* Control Bar */
            .mazemaster-maze-control-bar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                width: 550px;
                max-width: 95vw;
                padding: 6px 10px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 8px;
                gap: 10px;
            }

            .maze-action-buttons {
                display: flex;
                gap: 6px;
                min-width: 120px;
            }

            .mazemaster-maze-inventory {
                display: flex;
                gap: 12px;
                background: rgba(0, 0, 0, 0.3);
                padding: 6px 12px;
                border-radius: 6px;
            }

            .inventory-item {
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 0.9em;
            }

            .inventory-item i { color: #f1c40f; }
            .inventory-item.grandpow i { color: #e74c3c; }

            .mazemaster-maze-save-exit {
                display: flex;
                gap: 6px;
            }

            /* Maze Area */
            .mazemaster-maze-area {
                display: flex;
                align-items: flex-start;
                width: 100%;
            }

            .mazemaster-maze-arrows-left {
                display: flex;
                flex-direction: column;
                gap: 6px;
                flex-shrink: 0;
            }

            .mazemaster-maze-arrows-left .maze-arrow-btn {
                width: 80px;
                padding: 12px 8px;
                font-size: 0.85em;
                font-weight: bold;
            }

            .mazemaster-maze-grid-wrapper {
                flex: 1;
                display: flex;
                justify-content: center;
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

            .maze-cell.player::after {
                content: '';
                position: absolute;
                top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                width: 60%; height: 60%;
                background: #3498db;
                border-radius: 50%;
                box-shadow: 0 0 10px #3498db;
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

            /* Arrow buttons */
            .maze-arrow-btn {
                width: 36px;
                height: 36px;
                font-size: 0.85em;
                padding: 0;
                display: flex;
                align-items: center;
                justify-content: center;
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
        </style>
    `;

    document.body.appendChild(modal);

    // Add mobile control handlers
    modal.querySelectorAll('.maze-arrow-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const dir = btn.dataset.dir;
            if (dir === 'up') tryMazeMove(0, -1);
            else if (dir === 'down') tryMazeMove(0, 1);
            else if (dir === 'left') tryMazeMove(-1, 0);
            else if (dir === 'right') tryMazeMove(1, 0);
        });
    });

    // Close button handler
    const closeBtn = document.getElementById('maze_close_btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeMaze);
        closeBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            closeMaze();
        });
    }

    // Save & Exit button handlers (both top bar and bottom bar)
    const saveHandler = async () => {
        saveMazeProgress();
        closeMaze();
        renderSavedGamesList();
    };
    document.getElementById('maze_save_exit_btn')?.addEventListener('click', saveHandler);

    // Exit button handler
    const exitHandler = async () => {
        const confirmed = await callGenericPopup('Exit without saving? Progress will be lost.', POPUP_TYPE.CONFIRM);
        if (confirmed) {
            closeMaze();
        }
    };
    document.getElementById('maze_exit_btn')?.addEventListener('click', exitHandler);
}

function closeMaze() {
    currentMaze.isOpen = false;
    document.removeEventListener('keydown', handleMazeKeydown, { capture: true });

    const modal = document.getElementById('mazemaster_maze_modal');
    if (modal) modal.remove();
}

function renderMazeGrid() {
    const { grid, size, playerX, playerY, visited, exitX, exitY, isVictory } = currentMaze;
    const gridEl = document.getElementById('maze_grid');
    if (!gridEl) return;

    const cellSize = getCellSize(size);
    gridEl.style.gridTemplateColumns = `repeat(${size}, ${cellSize}px)`;
    gridEl.innerHTML = '';

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const cell = grid[y][x];
            const cellEl = document.createElement('div');
            cellEl.className = 'maze-cell';
            cellEl.style.width = `${cellSize}px`;
            cellEl.style.height = `${cellSize}px`;

            const key = `${x},${y}`;
            const isVisited = visited.has(key);
            const isPlayer = x === playerX && y === playerY;
            const isExit = x === exitX && y === exitY;

            // Fog of war
            if (!isVisited) {
                cellEl.classList.add('hidden');
            } else {
                cellEl.classList.add('visited');
                if (cell.walls.top) cellEl.classList.add('wall-top');
                if (cell.walls.right) cellEl.classList.add('wall-right');
                if (cell.walls.bottom) cellEl.classList.add('wall-bottom');
                if (cell.walls.left) cellEl.classList.add('wall-left');
            }

            if (isPlayer) cellEl.classList.add('player');
            if (isExit && isVisited) {
                cellEl.classList.add('exit');
                if (isVictory) cellEl.classList.add('victory-glow');
            }

            // Minion tile indicators
            if (cell.minion && isVisited) {
                cellEl.classList.add('has-minion');
                if (cell.minion.triggered) {
                    cellEl.classList.add('minion-triggered');
                }
            }

            // Chest tile indicators
            if (cell.chest && isVisited) {
                cellEl.classList.add('has-chest');
                if (cell.chest.type === 'locked') {
                    cellEl.classList.add('chest-locked');
                }
                if (cell.chest.opened) {
                    cellEl.classList.add('chest-opened');
                }
                // Custom chest image
                if (currentMaze.profile?.chestImage && !cell.chest.opened) {
                    cellEl.classList.add('has-custom-chest');
                    const chestImg = document.createElement('img');
                    chestImg.src = getExtensionImagePath(currentMaze.profile.chestImage);
                    chestImg.className = 'maze-chest-img';
                    chestImg.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 70%; height: 70%; object-fit: cover; border-radius: 3px; z-index: 1;';
                    if (cell.chest.type === 'locked') {
                        chestImg.style.filter = 'grayscale(50%)';
                    }
                    cellEl.appendChild(chestImg);
                }
            }

            // Trap tile indicators
            if (cell.trap && isVisited) {
                cellEl.classList.add('has-trap');
                if (cell.trap.triggered) {
                    cellEl.classList.add('trap-triggered');
                }
            }

            gridEl.appendChild(cellEl);
        }
    }
}

function updateMazeHero() {
    const { currentMinion, isVictory, profile } = currentMaze;

    const imgEl = document.getElementById('maze_minion_img');
    const nameEl = document.getElementById('maze_minion_name');
    const messageEl = document.getElementById('maze_minion_message');

    if (isVictory) {
        // Victory state
        if (profile.winImage && imgEl) {
            imgEl.src = getExtensionImagePath(profile.winImage);
            imgEl.style.display = '';
        }
        if (nameEl) nameEl.textContent = 'Victory!';
        if (messageEl) messageEl.textContent = profile.winMessage || 'You escaped the maze!';
    } else if (currentMinion) {
        // Normal minion display
        if (currentMinion.imagePath && imgEl) {
            imgEl.src = getExtensionImagePath(currentMinion.imagePath);
            imgEl.style.display = '';
        } else if (imgEl) {
            imgEl.style.display = 'none';
        }
        if (nameEl) nameEl.textContent = currentMinion.name || '';
        if (messageEl) messageEl.textContent = currentMinion.message || '';
    }
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

function handleMazeKeydown(e) {
    if (!currentMaze.isOpen || currentMaze.isVictory) return;

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

function tryMazeMove(dx, dy) {
    if (!currentMaze.isOpen || currentMaze.isVictory) return;

    // Don't allow movement if paused (encounter in progress)
    if (currentMaze.isPaused) return;

    const { playerX, playerY, grid, size } = currentMaze;
    const newX = playerX + dx;
    const newY = playerY + dy;

    // Check bounds
    if (newX < 0 || newX >= size || newY < 0 || newY >= size) return;

    // Check walls
    const currentCell = grid[playerY][playerX];
    if (dx === 1 && currentCell.walls.right) return;
    if (dx === -1 && currentCell.walls.left) return;
    if (dy === 1 && currentCell.walls.bottom) return;
    if (dy === -1 && currentCell.walls.top) return;

    // Move player
    currentMaze.playerX = newX;
    currentMaze.playerY = newY;
    currentMaze.visited.add(`${newX},${newY}`);

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

    // Check for main minion random message
    maybeShowMainMinionMessage();

    // Check story milestones
    checkStoryMilestones();
}

/**
 * Handle reaching the exit tile
 */
async function handleExitReached() {
    const profile = currentMaze.profile;

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

    // Show confirmation buttons instead of auto-triggering
    const minionType = minion.type || 'messenger';
    showEncounterConfirmation(minionId, x, y, minionType);
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
}

/**
 * Add items to inventory
 */
function addToInventory(item, amount = 1) {
    if (currentMaze.inventory[item] !== undefined) {
        currentMaze.inventory[item] += amount;
        updateInventoryDisplay();
    }
}

/**
 * Remove items from inventory
 */
function removeFromInventory(item, amount = 1) {
    if (currentMaze.inventory[item] !== undefined) {
        currentMaze.inventory[item] = Math.max(0, currentMaze.inventory[item] - amount);
        updateInventoryDisplay();
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
function openNormalChest(x, y) {
    currentMaze.pendingChest = null;
    const profile = currentMaze.profile;
    const loot = generateChestLoot(profile, false);
    awardLoot(loot);
    showChestLootMessage(loot, "Chest");
}

/**
 * Open a locked chest
 */
function openLockedChest(x, y) {
    currentMaze.pendingChest = null;
    const profile = currentMaze.profile;
    const loot = generateChestLoot(profile, true);
    awardLoot(loot);
    showChestLootMessage(loot, "Locked Chest");
}

/**
 * Generate loot for a chest
 */
function generateChestLoot(profile, isLocked) {
    const loot = { key: 0, pow: 0, stealth: 0, grandpow: 0 };
    const min = profile.chestLootMin || 1;
    const max = profile.chestLootMax || 2;
    const itemCount = min + Math.floor(Math.random() * (max - min + 1));

    const chances = isLocked ? {
        key: profile.lockedChestKeyChance || 40,
        pow: profile.lockedChestPowChance || 60,
        stealth: profile.lockedChestStealthChance || 30,
        grandpow: profile.lockedChestGrandpowChance || 5,
    } : {
        key: profile.chestKeyChance || 30,
        pow: profile.chestPowChance || 50,
        stealth: profile.chestStealthChance || 0,
        grandpow: profile.chestGrandpowChance || 0,
    };

    // Apply locked bonus multiplier
    if (isLocked) {
        const bonus = 1 + (profile.chestLockedBonusPercent || 50) / 100;
        chances.key = Math.min(100, chances.key * bonus);
        chances.pow = Math.min(100, chances.pow * bonus);
        chances.stealth = Math.min(100, chances.stealth * bonus);
        chances.grandpow = Math.min(100, chances.grandpow * bonus);
    }

    for (let i = 0; i < itemCount; i++) {
        // Roll for each item type
        if (Math.random() * 100 < chances.key) loot.key++;
        if (Math.random() * 100 < chances.pow) loot.pow++;
        if (Math.random() * 100 < chances.stealth) loot.stealth++;
        if (Math.random() * 100 < chances.grandpow) loot.grandpow++;
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
    if (loot.key > 0) items.push(`${loot.key} Key${loot.key > 1 ? 's' : ''}`);
    if (loot.pow > 0) items.push(`${loot.pow} POW${loot.pow > 1 ? 's' : ''}`);
    if (loot.stealth > 0) items.push(`${loot.stealth} Stealth${loot.stealth > 1 ? 's' : ''}`);

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

    // Show OK to continue
    const messageEl = document.getElementById('maze_minion_message');
    if (messageEl) {
        const existingMessage = messageEl.innerHTML.split('<div class="maze-confirm-buttons">')[0];
        messageEl.innerHTML = existingMessage + `<div class="maze-confirm-buttons">
            <button id="maze_confirm_ok" class="menu_button maze-confirm-btn">OK</button>
        </div>`;
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

    // Record result
    lastResults.maze[currentMaze.profileName] = {
        result: 'lose',
        timestamp: Date.now(),
    };

    // Show loss screen in hero section
    document.getElementById('maze_minion_name').textContent = 'Defeat!';
    document.getElementById('maze_minion_message').textContent = 'You have been defeated...';

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
                            </div>
                        </div>

                        <!-- Grid Size -->
                        <div class="mazemaster-section">
                            <label class="mazemaster-label">Grid Size</label>
                            <select id="mazemaster_maze_size" class="mazemaster-select">
                                <option value="7" ${(currentMazeData.gridSize || 10) === 7 ? 'selected' : ''}>7x7 (Easy)</option>
                                <option value="10" ${(currentMazeData.gridSize || 10) === 10 ? 'selected' : ''}>10x10 (Medium)</option>
                                <option value="15" ${(currentMazeData.gridSize || 10) === 15 ? 'selected' : ''}>15x15 (Hard)</option>
                                <option value="20" ${(currentMazeData.gridSize || 10) === 20 ? 'selected' : ''}>20x20 (Expert)</option>
                            </select>
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
            }

            .mazemaster-minion-card .minion-image img {
                width: 100%;
                height: 100%;
                object-fit: cover;
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
            }

            .mazemaster-trap-card .trap-image img {
                width: 100%;
                height: 100%;
                object-fit: cover;
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
        // Preserve story config
        storyConfig: existingProfile.storyConfig || { mainStory: '', milestones: [] },
    };
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
        // Serialize grid with only essential data
        grid: currentMaze.grid.map(row => row.map(cell => ({
            walls: cell.walls,
            visited: cell.visited,
            minion: cell.minion,
            trap: cell.trap,
            chest: cell.chest,
        }))),
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

    // Restore grid
    const grid = saveState.grid.map(row => row.map(cell => ({
        walls: cell.walls,
        visited: cell.visited,
        minion: cell.minion,
        trap: cell.trap,
        chest: cell.chest,
    })));

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
        inventory: { ...saveState.inventory },
        shownMilestones: new Set(saveState.shownMilestones || []),
    };

    showMazeModal();
    renderMazeGrid();
    updateMazeHero();
    updateInventoryDisplay();

    document.addEventListener('keydown', handleMazeKeydown, { capture: true });

    console.log(`[MazeMaster] Loaded saved maze "${profileName}"`);
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
        playMazeBtn.addEventListener('click', () => {
            const profileSelect = document.getElementById('mazemaster_play_profile');
            const profileName = profileSelect?.value || extensionSettings.currentMazeProfile || 'default';
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
