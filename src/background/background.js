// WrAIter - background.js
// This script runs in the background, managing state, API calls, and communication.

// Import the AI service module (assuming it will be created in shared/)
// Webpack will bundle this. Ensure ai_service.js uses ES6 modules or is compatible.
import { getAISuggestions, countTokens } from '../shared/ai_service.js';
// Import default quick queries from shared/defaults.js
import { DEFAULT_QUICK_QUERIES, DEFAULT_QUICK_CONTEXTS, DEFAULT_MODEL_FILTERS } from '../shared/defaults.js';

console.log("WrAIter: Background service worker started.");

// Guard flag to prevent concurrent execution of updateContextMenu()
let isUpdatingContextMenu = false;

// Default settings on installation
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        console.log("WrAIter: First install, setting default options.");
        await chrome.storage.sync.set({
            apiKeys: { gemini: '', openai: '' }, // Initialize with empty keys
            N: 1, // Default number of suggestions
            defaultModel: '',
            quickQueries: DEFAULT_QUICK_QUERIES, // Use the imported default queries
            quickContexts: DEFAULT_QUICK_CONTEXTS, // Use the imported default contexts
            debugMode: false,
            mockAISuggestion: "This is a mock AI suggestion.",
            tokenCount: 0,
            isShortcutEnabled: true, // Add default value for the shortcut setting
            isContextMenuItemEnabled: true, // Add default value for the context menu item setting
            availableModels: [],
            enabledModels: [],
            modelMetadata: {},
            geminiIncludeRegex: DEFAULT_MODEL_FILTERS.geminiInclude,
            geminiExcludeRegex: DEFAULT_MODEL_FILTERS.geminiExclude,
            openaiIncludeRegex: DEFAULT_MODEL_FILTERS.openaiInclude,
            openaiExcludeRegex: DEFAULT_MODEL_FILTERS.openaiExclude
        });
        // You could also open the options page on first install
        // chrome.runtime.openOptionsPage();
    } else if (details.reason === 'update') {
        // Handle updates if necessary, e.g., migrating settings
        console.log("WrAIter: Extension updated to version", chrome.runtime.getManifest().version);
        // Ensure tokenCount and new settings exist if updating from a version that didn't have them
        const storage = await chrome.storage.sync.get([
            'tokenCount', 
            'isContextMenuItemEnabled', 
            'quickContexts',
            'availableModels',
            'enabledModels',
            'geminiIncludeRegex',
            'geminiExcludeRegex',
            'openaiIncludeRegex',
            'openaiExcludeRegex'
        ]);
        
        if (typeof storage.tokenCount === 'undefined') {
            await chrome.storage.sync.set({ tokenCount: 0 });
        }
        if (typeof storage.isContextMenuItemEnabled === 'undefined') {
             await chrome.storage.sync.set({ isContextMenuItemEnabled: true });
        }
        if (typeof storage.quickContexts === 'undefined') {
             await chrome.storage.sync.set({ quickContexts: DEFAULT_QUICK_CONTEXTS });
        }
        // Ensure availableModels exists and handle legacy formats
        if (typeof storage.availableModels === 'undefined') {
            await chrome.storage.sync.set({ availableModels: [] });
        } else if (Array.isArray(storage.availableModels) && storage.availableModels.length > 0 && typeof storage.availableModels[0] === 'object') {
            const oldModels = storage.availableModels;
            const newIds = oldModels.map(m => m.id);
            const metadata = {};
            oldModels.forEach(model => {
                metadata[model.id] = {
                    name: model.name || model.id,
                    description: model.description || '',
                    provider: model.provider || inferProviderFromId(model.id)
                };
            });
            await chrome.storage.sync.set({ 
                availableModels: newIds,
                modelMetadata: metadata
            });
            console.log("WrAIter: Migrated availableModels from object format to IDs + metadata.");
        }

        // Ensure modelMetadata exists
        if (typeof storage.modelMetadata === 'undefined') {
            await chrome.storage.sync.set({ modelMetadata: {} });
        }

        if (typeof storage.enabledModels === 'undefined') {
            await chrome.storage.sync.set({ enabledModels: [] });
        }
        if (typeof storage.geminiIncludeRegex === 'undefined') {
            await chrome.storage.sync.set({ geminiIncludeRegex: DEFAULT_MODEL_FILTERS.geminiInclude });
        }
        if (typeof storage.geminiExcludeRegex === 'undefined') {
            await chrome.storage.sync.set({ geminiExcludeRegex: DEFAULT_MODEL_FILTERS.geminiExclude });
        }
        if (typeof storage.openaiIncludeRegex === 'undefined') {
            await chrome.storage.sync.set({ openaiIncludeRegex: DEFAULT_MODEL_FILTERS.openaiInclude });
        }
        if (typeof storage.openaiExcludeRegex === 'undefined') {
            await chrome.storage.sync.set({ openaiExcludeRegex: DEFAULT_MODEL_FILTERS.openaiExclude });
        }
    }

    // Create or remove context menu item based on setting
    updateContextMenu();
});

// Function to create or remove the context menu item
async function updateContextMenu() {
    // Prevent concurrent execution
    if (isUpdatingContextMenu) {
        console.log("WrAIter Background: updateContextMenu() already running, skipping concurrent call.");
        return;
    }

    isUpdatingContextMenu = true;

    try {
        const { isContextMenuItemEnabled = true } = await chrome.storage.sync.get('isContextMenuItemEnabled');
        const menuId = "wraiter-edit-text";

        // Always attempt to remove the context menu item first to ensure a clean state
        try {
            await chrome.contextMenus.remove(menuId);
            console.log(`WrAIter Background: Removed context menu item: ${menuId}`);
        } catch (error) {
            // Ignore the error if the item did not exist, which is expected when creating it for the first time
            if (!error.message.includes(`Cannot find menu item with id ${menuId}`)) {
                 console.warn(`WrAIter Background: Error attempting to remove context menu item ${menuId}:`, error);
            }
        }

        // If the setting is enabled, create the context menu item
        if (isContextMenuItemEnabled) {
            console.log("WrAIter Background: Context menu item enabled, creating it.");
            
            // Convert chrome.contextMenus.create() callback to Promise
            await new Promise((resolve, reject) => {
                chrome.contextMenus.create({
                    id: menuId,
                    title: "Edit with WrAIter",
                    // Show only when text is selected within an editable element
                    contexts: ["editable"],
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error("WrAIter Background: Error creating context menu item:", chrome.runtime.lastError.message);
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        console.log("WrAIter Background: Context menu item created successfully.");
                        resolve();
                    }
                });
            });
        } else {
            console.log("WrAIter Background: Context menu item disabled, ensured it's removed.");
            // The remove call at the start handled disabling.
        }
    } finally {
        // Always reset the guard flag, even if an error occurred
        isUpdatingContextMenu = false;
    }
}

// Listen for changes in the context menu setting and update the menu
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.isContextMenuItemEnabled !== undefined) {
        console.log("WrAIter Background: Context menu setting changed.");
        // When the setting changes, always update the menu state
        updateContextMenu();
    }
});

// Also call updateContextMenu when the service worker starts (e.g., after browser update or crash)
// This ensures the correct menu state is set on startup.
updateContextMenu();

// --- Command Handling ---
// Listen for commands registered in manifest.json
chrome.commands.onCommand.addListener(async (command) => {
    console.log(`WrAIter Background: Command received: ${command}`);
    if (command === "_execute_action") {
        // This command is triggered by the keyboard shortcut (Ctrl+Shift+E by default)
        const { isShortcutEnabled = true } = await chrome.storage.sync.get('isShortcutEnabled');
        
        if (isShortcutEnabled) {
            console.log("WrAIter Background: Shortcut enabled, opening popup.");
            // Open the action popup programmatically
            // This requires the 'scripting' permission and manifest_version 3
            try {
                // Check if there is an active tab first
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs.length > 0 && tabs[0].id) {
                    // openPopup requires an active tab to associate with
                    chrome.action.openPopup();
                } else {
                    console.warn("WrAIter Background: No active tab found to open popup via shortcut.");
                    // Optionally, show a notification to the user
                }
            } catch (error) {
                console.error("WrAIter Background: Error opening popup via shortcut:", error);
                // Optionally, show a notification
            }
        } else {
            console.log("WrAIter Background: Shortcut disabled in options.");
            // Do nothing, the command is effectively ignored
        }
    }
});

// --- Message Handling ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("WrAIter Background: Message received", request);

    if (request.type === 'GET_SELECTED_TEXT') {
        // Forward the request to the content script in the active tab
        getActiveTabId().then(tabId => {
            if (tabId) {
                // Check if the content script is already injected
                chrome.tabs.sendMessage(tabId, { type: 'PING' })
                    .then(response => {
                        if (response && response.status === 'PONG') {
                            // Content script is already injected, send the request
                            console.log("WrAIter Background: Content script already injected. Sending GET_SELECTED_TEXT_FROM_PAGE.");
                            chrome.tabs.sendMessage(tabId, { type: 'GET_SELECTED_TEXT_FROM_PAGE' })
                                .then(response => {
                                    console.log("WrAIter Background: Text from content script:", response);
                                    sendResponse(response);
                                })
                                .catch(error => {
                                    console.error("WrAIter Background: Error getting text from content script after PING success:", error);
                                    sendResponse({ selectedText: null, error: error.message });
                                });
                        } else {
                             // Response was not expected, assume content script not ready or error
                             console.warn("WrAIter Background: Unexpected response to PING. Injecting content script.");
                             injectAndSendMessage(tabId, sendResponse);
                        }
                    })
                    .catch(error => {
                        // Error likely means the content script is not injected
                        console.log("WrAIter Background: Error on PING (likely not injected):", error.message);
                        injectAndSendMessage(tabId, sendResponse);
                    });
            } else {
                sendResponse({ selectedText: null, error: "No active tab found." });
            }
        });
        return true; // Indicates asynchronous response
    }
    if (request.type === 'PROCESS_TEXT') {
        handleProcessTextRequest(request, sendResponse);
        return true; // Indicates asynchronous response
    }
    if (request.type === 'APPLY_CHANGES') {
        // Forward to content script
        getActiveTabId().then(tabId => {
            if (tabId) {
                chrome.tabs.sendMessage(tabId, { type: 'APPLY_CHANGES_TO_PAGE', text: request.text })
                    .then(response => sendResponse(response))
                    .catch(error => {
                         console.error("WrAIter Background: Error sending apply changes to content script:", error);
                         sendResponse({ success: false, error: error.message });
                    });
            } else {
                sendResponse({ success: false, error: "No active tab found." });
            }
        });
        return true; // Indicates asynchronous response
    }
    if (request.type === 'GET_SUPPORTED_MODELS') {
        // Return available and enabled models from storage
        chrome.storage.sync.get({
            availableModels: [],
            enabledModels: [],
            modelMetadata: {}
        }).then(({ availableModels: modelIds, enabledModels, modelMetadata }) => {
            // Handle migration: if modelIds contains objects (old format), extract IDs
            let idsToUse = modelIds;
            if (Array.isArray(modelIds) && modelIds.length > 0 && typeof modelIds[0] === 'object') {
                idsToUse = modelIds.map(m => m.id);
            }

            const availableModels = (idsToUse || []).map(id => {
                const meta = modelMetadata?.[id] || {};
                return {
                    id,
                    name: meta.name || id,
                    description: meta.description || `Model ID: ${id}`,
                    provider: meta.provider || inferProviderFromId(id)
                };
            });
            
            // Filter to only return enabled models
            const modelsToShow = availableModels.filter(model => enabledModels.includes(model.id));
            sendResponse({ models: modelsToShow });
        });
        return true; // Indicates asynchronous response
    }
    if (request.type === 'GET_TOKEN_COUNT') {
        chrome.storage.sync.get({ tokenCount: 0 }).then(data => {
            sendResponse({ tokenCount: data.tokenCount });
        });
        return true; // Indicates asynchronous response
    }

    if (request.type === 'RESET_TOKEN_COUNT') {
        console.log("WrAIter Background: Received RESET_TOKEN_COUNT message.");
        chrome.storage.sync.set({ tokenCount: 0 }).then(() => {
            console.log("WrAIter Background: Token count reset to 0.");
            sendResponse({ success: true });
        }).catch(error => {
            console.error("WrAIter Background: Error resetting token count:", error);
            sendResponse({ success: false, error: error.message });
        });
        return true; // Indicates asynchronous response
    }

    // Add more message handlers as needed
    return false; // Default for unhandled messages
});

async function injectAndSendMessage(tabId, sendResponse) {
    try {
        console.log("WrAIter Background: Attempting to inject content script into tab", tabId);
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.bundle.js']
        });
        console.log("WrAIter Background: Content script injected successfully. Sending GET_SELECTED_TEXT_FROM_PAGE.");

        // Now that the script is injected, send the message
        chrome.tabs.sendMessage(tabId, { type: 'GET_SELECTED_TEXT_FROM_PAGE' })
            .then(response => {
                console.log("WrAIter Background: Text from content script after injection:", response);
                sendResponse(response);
            })
            .catch(error => {
                console.error("WrAIter Background: Error getting text from content script after injection:", error);
                sendResponse({ selectedText: null, error: error.message });
            });

    } catch (error) {
        console.error("WrAIter Background: Error injecting content script:", error);
        sendResponse({ selectedText: null, error: `Failed to inject content script: ${error.message}` });
    }
}

/**
 * Helper to get the ID of the currently active tab.
 * @returns {Promise<number | null>} Promise resolving to the tab ID or null.
 */
async function getActiveTabId() {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        return tabs[0]?.id || null;
    } catch (error) {
        console.error("WrAIter Background: Error querying active tab:", error);
        return null;
    }
}

/**
 * Handles the request to process text with an AI model.
 * @param {object} request The request object from the popup.
 * @param {function} sendResponse Callback to send the response.
 */
async function handleProcessTextRequest(request, sendResponse) {
    const { text, query, context, model, n, debug } = request;
    console.log("WrAIter Background: Processing text with model:", model, "N:", n, "Debug:", debug);

    try {
        // Fetch API key, available models, and metadata
        const { apiKeys = {}, availableModels: modelIds = [], modelMetadata = {} } = await chrome.storage.sync.get({
            apiKeys: {},
            availableModels: [],
            modelMetadata: {}
        });
        
        // Handle migration: if modelIds contains objects (old format), extract IDs
        let idsToUse = modelIds;
        if (Array.isArray(modelIds) && modelIds.length > 0 && typeof modelIds[0] === 'object') {
            idsToUse = modelIds.map(m => m.id);
        }
        
        const availableModels = (idsToUse || []).map(id => {
            const meta = modelMetadata?.[id] || {};
            return {
                id,
                name: meta.name || id,
                description: meta.description || `Model ID: ${id}`,
                provider: meta.provider || inferProviderFromId(id)
            };
        });
        
        if (availableModels.length === 0) {
            throw new Error("No models are available yet. Click the gear icon in the popup, add an API key in Options, refresh the model list, and try again.");
        }
        
        // Find the selected model
        let selectedModelInfo = availableModels.find(m => m.id === model);
        
        if (!selectedModelInfo) {
            throw new Error(`Model ${model} not found. Refresh available models after saving your API key (gear icon → Options).`);
        }

        const apiKey = apiKeys[selectedModelInfo.provider];

        if (!debug.enabled && !apiKey) {
            sendResponse({ error: `Missing ${selectedModelInfo.provider.toUpperCase()} API key. Click the gear icon in the popup, open Options, add the key, then refresh available models.` });
            return;
        }

        const { suggestions, tokensUsed } = await getAISuggestions(
            text,
            query,
            context,
            selectedModelInfo, // Pass the full model info object
            apiKey,
            n,
            debug.enabled ? debug.mockSuggestion : null
        );

        if (tokensUsed > 0) {
            await incrementTokenCount(tokensUsed);
        }

        sendResponse({ suggestions: suggestions });
        console.log("WrAIter Background: Suggestions sent to popup.");

    } catch (error) {
        console.error("WrAIter Background: Error processing text:", error);
        sendResponse({ error: error.message });
    }
}

/**
 * Increments the total token count in storage.
 * @param {number} tokens The number of tokens used in the last request.
 */
async function incrementTokenCount(tokens) {
    try {
        const { tokenCount = 0 } = await chrome.storage.sync.get('tokenCount');
        const newTokenCount = tokenCount + tokens;
        await chrome.storage.sync.set({ tokenCount: newTokenCount });
        console.log(`WrAIter Background: Token count updated to ${newTokenCount}. Added ${tokens} tokens.`);
        // The popup will listen for storage changes to tokenCount or request it directly.
    } catch (error) {
        console.error("WrAIter Background: Error incrementing token count:", error);
    }
}

function inferProviderFromId(id = '') {
    if (id.startsWith('gemini-') || id.startsWith('models/gemini-')) {
        return 'gemini';
    }
    if (id.startsWith('gpt-') || id.includes('openai')) {
        return 'openai';
    }
    return 'unknown';
}

// Context Menu Listener
chrome.contextMenus.onClicked.addListener((info, tab) => {
    console.log("WrAIter Background: Context menu item clicked.", info);
    // Check if the clicked item is our menu item and if there is selected editable text
    if (info.menuItemId === "wraiter-edit-text" && info.editable === true && info.selectionText) {
        console.log("WrAIter Background: 'Edit with WrAIter' clicked on editable text.");
        // Store the selected text in local storage for the popup to retrieve
        chrome.storage.local.set({ prefillText: info.selectionText }, () => {
            console.log("WrAIter Background: Stored selected text for popup.");
            // Attempt to open the popup
            // Note: Programmatically opening the popup might have limitations
            // depending on user interaction requirements of chrome.action.openPopup()
            try {
                // Check if there is an active tab first
                chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => {
                    if (tabs.length > 0 && tabs[0].id) {
                         // openPopup requires an active tab to associate with
                        chrome.action.openPopup();
                        console.log("WrAIter Background: Attempted to open popup.");
                    } else {
                        console.warn("WrAIter Background: No active tab found to open popup via context menu.");
                        // Optionally, show a notification to the user
                    }
                });

            } catch (error) {
                console.error("WrAIter Background: Error opening popup via context menu:", error);
                // Optionally, show a notification
            }
        });
    } else {
         console.log("WrAIter Background: Context menu item clicked, but not 'Edit with WrAIter' on editable text, or no text selected.");
    }
});

console.log("WrAIter: Background service worker event listeners set up."); 