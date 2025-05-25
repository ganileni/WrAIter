// WrAIter - background.js
// This script runs in the background, managing state, API calls, and communication.

// Import the AI service module (assuming it will be created in shared/)
// Webpack will bundle this. Ensure ai_service.js uses ES6 modules or is compatible.
import { getAISuggestions, getSupportedAIModels, countTokens } from '../shared/ai_service.js';
// Import default quick queries from shared/defaults.js
import { DEFAULT_QUICK_QUERIES, DEFAULT_QUICK_CONTEXTS } from '../shared/defaults.js';

console.log("WrAIter: Background service worker started.");

// Default settings on installation
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        console.log("WrAIter: First install, setting default options.");
        await chrome.storage.sync.set({
            apiKeys: { gemini: '', openai: '' }, // Initialize with empty keys
            N: 1, // Default number of suggestions
            defaultModel: 'gemini-1.5-flash', // A common default, ensure it's in getSupportedAIModels
            quickQueries: DEFAULT_QUICK_QUERIES, // Use the imported default queries
            quickContexts: DEFAULT_QUICK_CONTEXTS, // Use the imported default contexts
            debugMode: false,
            mockAISuggestion: "This is a mock AI suggestion.",
            tokenCount: 0,
            isShortcutEnabled: true, // Add default value for the shortcut setting
            isContextMenuItemEnabled: true // Add default value for the context menu item setting
        });
        // You could also open the options page on first install
        // chrome.runtime.openOptionsPage();
    } else if (details.reason === 'update') {
        // Handle updates if necessary, e.g., migrating settings
        console.log("WrAIter: Extension updated to version", chrome.runtime.getManifest().version);
        // Ensure tokenCount and new settings exist if updating from a version that didn't have them
        const { tokenCount, isContextMenuItemEnabled, quickContexts } = await chrome.storage.sync.get(['tokenCount', 'isContextMenuItemEnabled', 'quickContexts']);
        if (typeof tokenCount === 'undefined') {
            await chrome.storage.sync.set({ tokenCount: 0 });
        }
        if (typeof isContextMenuItemEnabled === 'undefined') {
             await chrome.storage.sync.set({ isContextMenuItemEnabled: true });
        }
        if (typeof quickContexts === 'undefined') {
             await chrome.storage.sync.set({ quickContexts: DEFAULT_QUICK_CONTEXTS });
        }
    }

    // Create or remove context menu item based on setting
    updateContextMenu();
});

// Function to create or remove the context menu item
async function updateContextMenu() {
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
        chrome.contextMenus.create({
            id: menuId,
            title: "Edit with WrAIter",
            // Show only when text is selected within an editable element
            contexts: ["editable"],
        }, () => {
            if (chrome.runtime.lastError) {
                console.error("WrAIter Background: Error creating context menu item:", chrome.runtime.lastError.message);
            } else {
                console.log("WrAIter Background: Context menu item created successfully.");
            }
        });
    } else {
        console.log("WrAIter Background: Context menu item disabled, ensured it's removed.");
        // The remove call at the start handled disabling.
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
        sendResponse({ models: getSupportedAIModels() });
        // No need for true, synchronous for now unless models list becomes async
        return false; 
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
        // Fetch API key for the selected model's provider (e.g., 'gemini' or 'openai')
        const { apiKeys = {} } = await chrome.storage.sync.get('apiKeys');
        const selectedModelInfo = getSupportedAIModels().find(m => m.id === model);
        
        if (!selectedModelInfo) {
            throw new Error(`Model ${model} not found or supported.`);
        }

        const apiKey = apiKeys[selectedModelInfo.provider];

        if (!debug.enabled && !apiKey) {
            sendResponse({ error: `API key for ${selectedModelInfo.provider} is not set. Please set it in the options page.` });
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