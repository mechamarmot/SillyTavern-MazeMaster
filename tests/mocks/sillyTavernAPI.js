/**
 * SillyTavern API Mock for Testing MazeMaster Extension
 *
 * This mock provides a complete simulation of the SillyTavern context API
 * that MazeMaster depends on for slash commands, settings, popups, and LLM integration.
 */

// Use globalThis.jest which is set in setup.js, or provide a simple mock function creator
const getJest = () => globalThis.jest || {
  fn: (impl) => {
    const mockFn = (...args) => {
      mockFn.mock.calls.push(args);
      return impl ? impl(...args) : undefined;
    };
    mockFn.mock = { calls: [] };
    mockFn.mockClear = () => { mockFn.mock.calls = []; };
    return mockFn;
  }
};

// Track all mock function calls for assertions
export const mockCalls = {
  saveSettingsDebounced: [],
  executeSlashCommands: [],
  getRequestHeaders: [],
  callGenericPopup: [],
  generateQuietPrompt: [],
  registerSlashCommand: [],
};

// Mock data storage
export const mockStorage = {
  settings: {},
  characters: [],
  currentCharacter: null,
  chatHistory: [],
};

/**
 * Reset all mocks to initial state
 */
export function resetMocks() {
  Object.keys(mockCalls).forEach(key => {
    mockCalls[key] = [];
  });
  mockStorage.settings = {};
  mockStorage.characters = [];
  mockStorage.currentCharacter = null;
  mockStorage.chatHistory = [];
}

/**
 * Mock implementation of SillyTavern.getContext()
 */
export function createMockContext() {
  const jest = getJest();
  return {
    saveSettingsDebounced: jest.fn((settings) => {
      mockCalls.saveSettingsDebounced.push(settings);
      mockStorage.settings = { ...mockStorage.settings, ...settings };
      return Promise.resolve();
    }),

    SlashCommandParser: {
      addCommandObject: jest.fn((command) => {
        mockCalls.registerSlashCommand.push(command);
      }),
    },

    SlashCommand: class MockSlashCommand {
      constructor(options) {
        this.name = options.name;
        this.callback = options.callback;
        this.namedArgumentList = options.namedArgumentList || [];
        this.helpString = options.helpString || '';
        this.returns = options.returns || '';
      }
    },

    ARGUMENT_TYPE: {
      STRING: 'string',
      NUMBER: 'number',
      BOOLEAN: 'boolean',
      VARIABLE_NAME: 'variable_name',
      CLOSURE: 'closure',
      LIST: 'list',
    },

    SlashCommandNamedArgument: class MockSlashCommandNamedArgument {
      constructor(options) {
        this.name = options.name;
        this.description = options.description || '';
        this.typeList = options.typeList || [];
        this.isRequired = options.isRequired || false;
        this.defaultValue = options.defaultValue;
        this.acceptsMultiple = options.acceptsMultiple || false;
      }
    },

    executeSlashCommandsWithOptions: jest.fn(async (commands, options) => {
      mockCalls.executeSlashCommands.push({ commands, options });
      return { pipe: '' };
    }),

    getRequestHeaders: jest.fn(() => {
      mockCalls.getRequestHeaders.push({});
      return {
        'Content-Type': 'application/json',
        'X-Mock-Header': 'test',
      };
    }),

    callGenericPopup: jest.fn(async (content, type, title, options) => {
      mockCalls.callGenericPopup.push({ content, type, title, options });
      // Default to confirming popups
      return type === 'CONFIRM' ? true : 'mock_input';
    }),

    POPUP_TYPE: {
      TEXT: 'TEXT',
      CONFIRM: 'CONFIRM',
      INPUT: 'INPUT',
      DISPLAY: 'DISPLAY',
    },

    generateQuietPrompt: jest.fn(async (prompt, options) => {
      mockCalls.generateQuietPrompt.push({ prompt, options });
      return 'Mock LLM response for: ' + prompt.substring(0, 50) + '...';
    }),

    getPresetManager: jest.fn(() => ({
      getPresets: () => ['Default', 'Creative', 'Precise'],
      getCurrentPreset: () => 'Default',
      setPreset: jest.fn(),
    })),

    mainApi: {
      getCharacters: jest.fn(() => mockStorage.characters),
      getCurrentCharacter: jest.fn(() => mockStorage.currentCharacter),
      sendMessage: jest.fn(async (message) => {
        mockStorage.chatHistory.push({ role: 'user', content: message });
        return { success: true };
      }),
    },

    // Extension settings storage
    extension_settings: {
      MazeMaster: {},
    },

    // Event system mock
    eventSource: {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    },

    // Character management
    getCharacters: jest.fn(() => mockStorage.characters),
    getCurrentCharacter: jest.fn(() => mockStorage.currentCharacter),

    // Chat utilities
    sendSystemMessage: jest.fn(),
    addMessageToChat: jest.fn(),
  };
}

/**
 * Install the mock into the global scope
 */
export function mockSillyTavernAPI() {
  const mockContext = createMockContext();

  // Create global SillyTavern mock
  global.SillyTavern = {
    getContext: () => mockContext,
  };

  // Mock import.meta.url for module detection
  if (!global.import) {
    global.import = {
      meta: {
        url: 'file:///scripts/extensions/third-party/MazeMaster/dist/index.js',
      },
    };
  }

  // Mock document for DOM operations
  if (typeof document === 'undefined' || !document.createElement) {
    global.document = {
      ...global.document,
      createElement: jest.fn((tag) => ({
        tagName: tag.toUpperCase(),
        style: {},
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
          toggle: jest.fn(),
          contains: jest.fn(() => false),
        },
        appendChild: jest.fn(),
        removeChild: jest.fn(),
        setAttribute: jest.fn(),
        getAttribute: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        innerHTML: '',
        textContent: '',
        children: [],
        parentElement: null,
      })),
      getElementById: jest.fn(() => null),
      querySelector: jest.fn(() => null),
      querySelectorAll: jest.fn(() => []),
      body: {
        appendChild: jest.fn(),
        removeChild: jest.fn(),
      },
    };
  }

  return mockContext;
}

/**
 * Helper to add a test character to the mock
 */
export function addMockCharacter(character) {
  const defaultCharacter = {
    name: 'Test Character',
    avatar: 'test.png',
    description: 'A test character',
    personality: 'Helpful and friendly',
    ...character,
  };
  mockStorage.characters.push(defaultCharacter);
  return defaultCharacter;
}

/**
 * Helper to set the current character
 */
export function setCurrentCharacter(character) {
  mockStorage.currentCharacter = character;
}

/**
 * Get mock call history for assertions
 */
export function getMockCalls() {
  return { ...mockCalls };
}

/**
 * Get current mock storage state
 */
export function getMockStorage() {
  return { ...mockStorage };
}
