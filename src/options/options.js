// WrAIter - options.js
// This script handles the functionality of the extension's options page.

import './options.css';
import { DEFAULT_QUICK_QUERIES, DEFAULT_QUICK_CONTEXTS } from '../shared/defaults.js';

// DOM Elements
const apiKeyInputsContainer = document.getElementById('api-key-inputs');
const saveApiKeysButton = document.getElementById('save-api-keys-button');
const defaultModelSelector = document.getElementById('default-model-selector');
const saveGeneralSettingsButton = document.getElementById('save-general-settings-button');
const quickQueriesList = document.getElementById('quick-queries-list');
const newQuickQueryNameInput = document.getElementById('new-quick-query-name');
const newQuickQueryTextInput = document.getElementById('new-quick-query-text');
const addQuickQueryButton = document.getElementById('add-quick-query-button');
const quickContextsList = document.getElementById('quick-contexts-list');
const newQuickContextNameInput = document.getElementById('new-quick-context-name');
const newQuickContextTextInput = document.getElementById('new-quick-context-text');
const addQuickContextButton = document.getElementById('add-quick-context-button');
const debugModeCheckbox = document.getElementById('debug-mode-enabled');
const mockAIResponseArea = document.getElementById('mock-ai-response-area');
const mockAISuggestionTextarea = document.getElementById('mock-ai-suggestion');
const saveDebugSettingsButton = document.getElementById('save-debug-settings-button');
const statusMessage = document.getElementById('status-message');
const resetQuickQueriesButton = document.getElementById('reset-quick-queries-button');
const resetQuickContextsButton = document.getElementById('reset-quick-contexts-button');
const shortcutEnabledCheckbox = document.getElementById('shortcut-enabled');
const contextMenuItemEnabledCheckbox = document.getElementById('context-menu-item-enabled');

// Supported AI model providers and their user-friendly names
// This should ideally come from a shared source with background.js or ai_service.js
// For now, defining it here and in background.js. Background will be the source of truth for popup.
const AI_PROVIDERS = {
    gemini: "Google Gemini",
    openai: "OpenAI"
};

// To store currently loaded quick queries for editing/deleting
let currentQuickQueries = [];
// To store currently loaded quick contexts for editing/deleting
let currentQuickContexts = [];

/**
 * Initializes the options page.
 * - Loads saved settings from chrome.storage.
 * - Populates input fields and UI elements.
 */
async function initOptions() {
    console.log("WrAIter: Options page opened");
    await loadApiKeys();
    await loadGeneralSettings();
    await loadQuickQueries();
    await loadQuickContexts();
    await loadDebugSettings();
    initModelSelectors(); // Populate model selectors (API key and default model)
}

/**
 * Displays a status message to the user (e.g., "Settings saved!").
 * @param {string} message The message to display.
 * @param {boolean} isError If true, displays the message as an error.
 */
function showStatusMessage(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.className = isError ? 'error' : 'success';
    setTimeout(() => {
        statusMessage.textContent = '';
        statusMessage.className = '';
    }, 3000);
}

// --- API Key Management ---
/**
 * Loads API keys from storage and populates the input fields.
 * Dynamically creates input fields based on AI_PROVIDERS.
 */
async function loadApiKeys() {
    apiKeyInputsContainer.innerHTML = ''; // Clear existing inputs
    const { apiKeys = {} } = await chrome.storage.sync.get('apiKeys');

    for (const providerId in AI_PROVIDERS) {
        const providerName = AI_PROVIDERS[providerId];
        const groupDiv = document.createElement('div');
        groupDiv.className = 'api-key-group';

        const label = document.createElement('label');
        label.setAttribute('for', `api-key-${providerId}`);
        label.textContent = `${providerName} API Key:`;

        const input = document.createElement('input');
        input.type = 'password'; // Use password type for sensitive keys
        input.id = `api-key-${providerId}`;
        input.name = `api-key-${providerId}`;
        input.placeholder = `Enter your ${providerName} API Key`;
        input.value = apiKeys[providerId] || '';

        groupDiv.appendChild(label);
        groupDiv.appendChild(input);
        apiKeyInputsContainer.appendChild(groupDiv);
    }
    console.log("WrAIter: API Key fields populated.");
}

/**
 * Saves the entered API keys to chrome.storage.
 */
async function saveApiKeys() {
    const apiKeys = {};
    let allKeysValid = true;
    for (const providerId in AI_PROVIDERS) {
        const input = document.getElementById(`api-key-${providerId}`);
        if (input && input.value.trim()) {
            apiKeys[providerId] = input.value.trim();
        } else {
            // Allow empty keys, they just won't be used
            apiKeys[providerId] = ''; // Explicitly store as empty if cleared
        }
    }

    try {
        await chrome.storage.sync.set({ apiKeys });
        showStatusMessage("API keys saved successfully!");
        console.log("WrAIter: API Keys saved:", apiKeys);
        // Re-initialize model selectors as key availability might have changed
        initModelSelectors(); 
        // Inform popup to update its model selector if it's open
        // This is handled by chrome.storage.onChanged in popup.js
    } catch (error) {
        console.error("WrAIter: Error saving API keys:", error);
        showStatusMessage("Error saving API keys: " + error.message, true);
    }
}

// --- General Settings Management ---
/**
 * Loads general settings (default model, shortcut enabled) from storage.
 */
async function loadGeneralSettings() {
    const { defaultModel, isShortcutEnabled, isContextMenuItemEnabled } = await chrome.storage.sync.get({
        defaultModel: 'gemini-1.5-flash',
        isShortcutEnabled: true,
        isContextMenuItemEnabled: true // Default to true
    });
    // Default model will be set by initModelSelectors after it populates the dropdown
    if (shortcutEnabledCheckbox) {
        shortcutEnabledCheckbox.checked = isShortcutEnabled;
    }
     if (contextMenuItemEnabledCheckbox) {
        contextMenuItemEnabledCheckbox.checked = isContextMenuItemEnabled;
    }
    console.log("WrAIter: General settings loaded.");
}

/**
 * Saves general settings to chrome.storage.
 */
async function saveGeneralSettings() {
    const defaultModel = defaultModelSelector.value;
    const isShortcutEnabled = shortcutEnabledCheckbox ? shortcutEnabledCheckbox.checked : true; // Default to true if element not found
    const isContextMenuItemEnabled = contextMenuItemEnabledCheckbox ? contextMenuItemEnabledCheckbox.checked : true; // Default to true if element not found

    try {
        await chrome.storage.sync.set({ defaultModel, isShortcutEnabled, isContextMenuItemEnabled });
        showStatusMessage("General settings saved successfully!");
        console.log("WrAIter: General settings saved.");
    } catch (error) {
        console.error("WrAIter: Error saving general settings:", error);
        showStatusMessage("Error saving general settings: " + error.message, true);
    }
}

/**
 * Populates the model selectors (default model and API key check related) on the options page.
 */
async function initModelSelectors() {
    console.log("WrAIter: Initializing model selectors on options page.");
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_SUPPORTED_MODELS' });
        const supportedModels = response?.models || [];
        const { apiKeys = {} } = await chrome.storage.sync.get('apiKeys');
        const { defaultModel: savedDefaultModel } = await chrome.storage.sync.get('defaultModel');

        defaultModelSelector.innerHTML = ''; // Clear existing options

        if (supportedModels.length === 0) {
            const option = document.createElement('option');
            option.textContent = "No models available";
            option.disabled = true;
            defaultModelSelector.appendChild(option);
            console.warn("WrAIter: No AI models available for default model selector.");
            return;
        }

        let firstEnabledOptionValue = null;

        supportedModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            if (!apiKeys[model.provider]) {
                option.disabled = true;
                option.textContent += " (API key missing)";
            } else {
                if (!firstEnabledOptionValue) {
                    firstEnabledOptionValue = model.id;
                }
            }
            defaultModelSelector.appendChild(option);
        });

        // Set the saved default model if available and its API key exists
        if (savedDefaultModel) {
            const defaultOption = Array.from(defaultModelSelector.options).find(opt => opt.value === savedDefaultModel && !opt.disabled);
            if (defaultOption) {
                defaultModelSelector.value = savedDefaultModel;
            } else if (firstEnabledOptionValue) {
                 // If saved default is no longer valid (e.g. key removed), pick the first available enabled one
                defaultModelSelector.value = firstEnabledOptionValue;
            } else {
                // No model is enabled, leave as is or select the first (disabled) one
                if(defaultModelSelector.options.length > 0) defaultModelSelector.selectedIndex = 0;
            }
        } else if (firstEnabledOptionValue) {
            // If no default model was saved, pick the first available enabled one
            defaultModelSelector.value = firstEnabledOptionValue;
        } else {
             if(defaultModelSelector.options.length > 0) defaultModelSelector.selectedIndex = 0;
        }

        console.log("WrAIter: Default model selector populated.");

    } catch (error) {
        console.error("WrAIter: Error initializing model selectors on options page:", error);
        const option = document.createElement('option');
        option.textContent = "Error loading models";
        option.disabled = true;
        defaultModelSelector.appendChild(option);
    }
}


// --- Quick Query Management ---
/**
 * Loads quick queries from storage and displays them in the management list.
 */
async function loadQuickQueries() {
    const { quickQueries = [] } = await chrome.storage.sync.get({ quickQueries: DEFAULT_QUICK_QUERIES });
    currentQuickQueries = quickQueries;
    renderQuickQueriesList();
    console.log("WrAIter: Quick queries loaded for management.");
}

/**
 * Renders the list of quick queries for management (edit/delete).
 */
function renderQuickQueriesList() {
    quickQueriesList.innerHTML = ''; // Clear existing list
    if (currentQuickQueries.length === 0) {
        quickQueriesList.innerHTML = '<p>No custom quick queries defined. Add one below or use the defaults.</p>';
    }

    currentQuickQueries.forEach((q, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'quick-query-item';
        itemDiv.dataset.id = q.id || `query-${index}`; // Use ID if present, otherwise index

        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'details';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'name';
        nameSpan.textContent = q.name;
        const querySpan = document.createElement('span');
        querySpan.className = 'query-text';
        querySpan.textContent = q.query;
        querySpan.title = q.query; // Show full query on hover
        detailsDiv.appendChild(nameSpan);
        detailsDiv.appendChild(querySpan);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'actions';

        // Add Reorder Buttons
        const upButton = document.createElement('button');
        upButton.textContent = '▲'; // Up arrow
        upButton.className = 'move-up';
        upButton.title = 'Move Up';
        upButton.onclick = () => moveQuickQueryUp(itemDiv.dataset.id);
        // Disable Up button for the first item
        if (index === 0) {
            upButton.disabled = true;
        }
        actionsDiv.appendChild(upButton);

        const downButton = document.createElement('button');
        downButton.textContent = '▼'; // Down arrow
        downButton.className = 'move-down';
        downButton.title = 'Move Down';
        downButton.onclick = () => moveQuickQueryDown(itemDiv.dataset.id);
        // Disable Down button for the last item
        if (index === currentQuickQueries.length - 1) {
            downButton.disabled = true;
        }
        actionsDiv.appendChild(downButton);

        // Delete button
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.onclick = () => deleteQuickQuery(q.id || `query-${index}`);
        actionsDiv.appendChild(deleteButton);

        itemDiv.appendChild(detailsDiv);
        itemDiv.appendChild(actionsDiv);
        quickQueriesList.appendChild(itemDiv);
    });
}

/**
 * Resets quick queries to their default values.
 */
async function resetQuickQueriesToDefaults() {
    if (!confirm("Are you sure you want to reset all quick queries to their default settings?")) {
        return;
    }

    try {
        await chrome.storage.sync.set({ quickQueries: DEFAULT_QUICK_QUERIES });
        showStatusMessage("Quick queries reset to defaults.");
        console.log("WrAIter: Quick queries reset to defaults.", DEFAULT_QUICK_QUERIES);
        // Reload and render the list after resetting
        loadQuickQueries();
    } catch (error) {
        console.error("WrAIter: Error resetting quick queries:", error);
        showStatusMessage("Error resetting quick queries: " + error.message, true);
    }
}

/**
 * Adds a new quick query to the list and saves to storage.
 */
async function addQuickQuery() {
    const name = newQuickQueryNameInput.value.trim();
    const query = newQuickQueryTextInput.value.trim();

    if (!name || !query) {
        showStatusMessage("Both name and query text are required for a new quick query.", true);
        return;
    }

    const newQuery = { id: `custom-${Date.now()}`, name, query };
    currentQuickQueries.push(newQuery);

    try {
        await chrome.storage.sync.set({ quickQueries: currentQuickQueries });
        showStatusMessage(`Quick query "${name}" added successfully!`);
        renderQuickQueriesList();
        newQuickQueryNameInput.value = '';
        newQuickQueryTextInput.value = '';
        console.log("WrAIter: Quick query added:", newQuery);
    } catch (error) {
        console.error("WrAIter: Error adding quick query:", error);
        showStatusMessage("Error adding quick query: " + error.message, true);
        // Revert if save failed (optional, depends on desired strictness)
        currentQuickQueries.pop();
    }
}

/**
 * Deletes a quick query from the list and updates storage.
 * @param {string} queryId The ID of the quick query to delete.
 */
async function deleteQuickQuery(queryId) {
    const queryNameToDelete = currentQuickQueries.find(q => (q.id || `query-${currentQuickQueries.indexOf(q)}`) === queryId)?.name || "Selected query";
    if (!confirm(`Are you sure you want to delete the quick query "${queryNameToDelete}"?`)) {
        return;
    }

    currentQuickQueries = currentQuickQueries.filter(q => (q.id || `query-${currentQuickQueries.indexOf(q)}`) !== queryId);

    try {
        await chrome.storage.sync.set({ quickQueries: currentQuickQueries });
        showStatusMessage(`Quick query "${queryNameToDelete}" deleted successfully!`);
        renderQuickQueriesList();
        console.log("WrAIter: Quick query deleted, ID:", queryId);
    } catch (error) {
        console.error("WrAIter: Error deleting quick query:", error);
        showStatusMessage("Error deleting quick query: " + error.message, true);
        // Optionally, reload queries from storage to revert if save failed
        loadQuickQueries();
    }
}

/**
 * Moves a quick query up in the list.
 * @param {string} queryId The ID of the quick query to move.
 */
async function moveQuickQueryUp(queryId) {
    const index = currentQuickQueries.findIndex(q => (q.id || `query-${currentQuickQueries.indexOf(q)}`) === queryId);
    if (index > 0) {
        // Swap the item with the one above it
        [currentQuickQueries[index - 1], currentQuickQueries[index]] = [currentQuickQueries[index], currentQuickQueries[index - 1]];
        await saveQuickQueriesOrder(); // Save the new order
        renderQuickQueriesList(); // Re-render the list
    }
}

/**
 * Moves a quick query down in the list.
 * @param {string} queryId The ID of the quick query to move.
 */
async function moveQuickQueryDown(queryId) {
    const index = currentQuickQueries.findIndex(q => (q.id || `query-${currentQuickQueries.indexOf(q)}`) === queryId);
    if (index < currentQuickQueries.length - 1) {
        // Swap the item with the one below it
        [currentQuickQueries[index + 1], currentQuickQueries[index]] = [currentQuickQueries[index], currentQuickQueries[index + 1]];
        await saveQuickQueriesOrder(); // Save the new order
        renderQuickQueriesList(); // Re-render the list
    }
}

/**
 * Saves the current order of quick queries to storage.
 */
async function saveQuickQueriesOrder() {
    try {
        await chrome.storage.sync.set({ quickQueries: currentQuickQueries });
        console.log("WrAIter: Quick queries order saved.", currentQuickQueries);
        // No status message here, reordering is a quick action.
    } catch (error) {
        console.error("WrAIter: Error saving quick queries order:", error);
        showStatusMessage("Error saving quick query order: " + error.message, true);
    }
}

// --- Quick Context Management ---
/**
 * Loads quick contexts from storage and displays them in the management list.
 */
async function loadQuickContexts() {
    const { quickContexts = [] } = await chrome.storage.sync.get({ quickContexts: DEFAULT_QUICK_CONTEXTS });
    currentQuickContexts = quickContexts;
    renderQuickContextsList();
    console.log("WrAIter: Quick contexts loaded for management.");
}

/**
 * Renders the list of quick contexts for management (edit/delete).
 */
function renderQuickContextsList() {
    quickContextsList.innerHTML = ''; // Clear existing list
    if (currentQuickContexts.length === 0) {
        quickContextsList.innerHTML = '<p>No custom quick contexts defined. Add one below or use the defaults.</p>';
    }

    currentQuickContexts.forEach((c, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'quick-context-item';
        itemDiv.dataset.id = c.id || `context-${index}`; // Use ID if present, otherwise index

        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'details';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'name';
        nameSpan.textContent = c.name;
        const contextSpan = document.createElement('span');
        contextSpan.className = 'context-text';
        contextSpan.textContent = c.context;
        contextSpan.title = c.context; // Show full context on hover
        detailsDiv.appendChild(nameSpan);
        detailsDiv.appendChild(contextSpan);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'actions';

        // Add Reorder Buttons
        const upButton = document.createElement('button');
        upButton.textContent = '▲'; // Up arrow
        upButton.className = 'move-up';
        upButton.title = 'Move Up';
        upButton.onclick = () => moveQuickContextUp(itemDiv.dataset.id);
        // Disable Up button for the first item
        if (index === 0) {
            upButton.disabled = true;
        }
        actionsDiv.appendChild(upButton);

        const downButton = document.createElement('button');
        downButton.textContent = '▼'; // Down arrow
        downButton.className = 'move-down';
        downButton.title = 'Move Down';
        downButton.onclick = () => moveQuickContextDown(itemDiv.dataset.id);
        // Disable Down button for the last item
        if (index === currentQuickContexts.length - 1) {
            downButton.disabled = true;
        }
        actionsDiv.appendChild(downButton);

        // Delete button
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.onclick = () => deleteQuickContext(c.id || `context-${index}`);
        actionsDiv.appendChild(deleteButton);

        itemDiv.appendChild(detailsDiv);
        itemDiv.appendChild(actionsDiv);
        quickContextsList.appendChild(itemDiv);
    });
}

/**
 * Resets quick contexts to their default values.
 */
async function resetQuickContextsToDefaults() {
    if (!confirm("Are you sure you want to reset all quick contexts to their default settings?")) {
        return;
    }

    try {
        await chrome.storage.sync.set({ quickContexts: DEFAULT_QUICK_CONTEXTS });
        showStatusMessage("Quick contexts reset to defaults.");
        console.log("WrAIter: Quick contexts reset to defaults.", DEFAULT_QUICK_CONTEXTS);
        // Reload and render the list after resetting
        loadQuickContexts();
    } catch (error) {
        console.error("WrAIter: Error resetting quick contexts:", error);
        showStatusMessage("Error resetting quick contexts: " + error.message, true);
    }
}

/**
 * Adds a new quick context to the list and saves to storage.
 */
async function addQuickContext() {
    const name = newQuickContextNameInput.value.trim();
    const context = newQuickContextTextInput.value.trim();

    if (!name || !context) {
        showStatusMessage("Both name and context text are required for a new quick context.", true);
        return;
    }

    const newContext = { id: `custom-${Date.now()}`, name, context };
    currentQuickContexts.push(newContext);

    try {
        await chrome.storage.sync.set({ quickContexts: currentQuickContexts });
        showStatusMessage(`Quick context "${name}" added successfully!`);
        renderQuickContextsList();
        newQuickContextNameInput.value = '';
        newQuickContextTextInput.value = '';
        console.log("WrAIter: Quick context added:", newContext);
    } catch (error) {
        console.error("WrAIter: Error adding quick context:", error);
        showStatusMessage("Error adding quick context: " + error.message, true);
        // Revert if save failed (optional, depends on desired strictness)
        currentQuickContexts.pop();
    }
}

/**
 * Deletes a quick context from the list and updates storage.
 * @param {string} contextId The ID of the quick context to delete.
 */
async function deleteQuickContext(contextId) {
    const contextNameToDelete = currentQuickContexts.find(c => (c.id || `context-${currentQuickContexts.indexOf(c)}`) === contextId)?.name || "Selected context";
    if (!confirm(`Are you sure you want to delete the quick context "${contextNameToDelete}"?`)) {
        return;
    }

    currentQuickContexts = currentQuickContexts.filter(c => (c.id || `context-${currentQuickContexts.indexOf(c)}`) !== contextId);

    try {
        await chrome.storage.sync.set({ quickContexts: currentQuickContexts });
        showStatusMessage(`Quick context "${contextNameToDelete}" deleted successfully!`);
        renderQuickContextsList();
        console.log("WrAIter: Quick context deleted, ID:", contextId);
    } catch (error) {
        console.error("WrAIter: Error deleting quick context:", error);
        showStatusMessage("Error deleting quick context: " + error.message, true);
        // Optionally, reload contexts from storage to revert if save failed
        loadQuickContexts();
    }
}

/**
 * Moves a quick context up in the list.
 * @param {string} contextId The ID of the quick context to move.
 */
async function moveQuickContextUp(contextId) {
    const index = currentQuickContexts.findIndex(c => (c.id || `context-${currentQuickContexts.indexOf(c)}`) === contextId);
    if (index > 0) {
        // Swap the item with the one above it
        [currentQuickContexts[index - 1], currentQuickContexts[index]] = [currentQuickContexts[index], currentQuickContexts[index - 1]];
        await saveQuickContextsOrder(); // Save the new order
        renderQuickContextsList(); // Re-render the list
    }
}

/**
 * Moves a quick context down in the list.
 * @param {string} contextId The ID of the quick context to move.
 */
async function moveQuickContextDown(contextId) {
    const index = currentQuickContexts.findIndex(c => (c.id || `context-${currentQuickContexts.indexOf(c)}`) === contextId);
    if (index < currentQuickContexts.length - 1) {
        // Swap the item with the one below it
        [currentQuickContexts[index + 1], currentQuickContexts[index]] = [currentQuickContexts[index], currentQuickContexts[index + 1]];
        await saveQuickContextsOrder(); // Save the new order
        renderQuickContextsList(); // Re-render the list
    }
}

/**
 * Saves the current order of quick contexts to storage.
 */
async function saveQuickContextsOrder() {
    try {
        await chrome.storage.sync.set({ quickContexts: currentQuickContexts });
        console.log("WrAIter: Quick contexts order saved.", currentQuickContexts);
        // No status message here, reordering is a quick action.
    } catch (error) {
        console.error("WrAIter: Error saving quick contexts order:", error);
        showStatusMessage("Error saving quick context order: " + error.message, true);
    }
}

// --- Debug Settings Management ---
/**
 * Loads debug settings from storage.
 */
async function loadDebugSettings() {
    const { debugMode = false, mockAISuggestion = "This is a mock AI suggestion." } = await chrome.storage.sync.get({
        debugMode: false,
        mockAISuggestion: "This is a mock AI suggestion."
    });

    debugModeCheckbox.checked = debugMode;
    mockAISuggestionTextarea.value = mockAISuggestion;
    mockAIResponseArea.classList.toggle('hidden', !debugMode);
    console.log("WrAIter: Debug settings loaded.");
}

/**
 * Saves debug settings to chrome.storage.
 */
async function saveDebugSettings() {
    const debugMode = debugModeCheckbox.checked;
    const mockAISuggestion = mockAISuggestionTextarea.value.trim();

    if (debugMode && !mockAISuggestion) {
        showStatusMessage("Mock AI suggestion cannot be empty when debug mode is enabled.", true);
        return;
    }

    try {
        await chrome.storage.sync.set({ debugMode, mockAISuggestion });
        showStatusMessage("Debug settings saved successfully!");
        console.log("WrAIter: Debug settings saved - Mode:", debugMode, "Mock Suggestion:", mockAISuggestion);
    } catch (error) {
        console.error("WrAIter: Error saving debug settings:", error);
        showStatusMessage("Error saving debug settings: " + error.message, true);
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', initOptions);
saveApiKeysButton.addEventListener('click', saveApiKeys);
saveGeneralSettingsButton.addEventListener('click', saveGeneralSettings);
addQuickQueryButton.addEventListener('click', addQuickQuery);
saveDebugSettingsButton.addEventListener('click', saveDebugSettings);
resetQuickQueriesButton.addEventListener('click', resetQuickQueriesToDefaults);
resetQuickContextsButton.addEventListener('click', resetQuickContextsToDefaults);
addQuickContextButton.addEventListener('click', addQuickContext);

const shortcutsLink = document.getElementById('shortcuts-link');
if (shortcutsLink) {
    shortcutsLink.addEventListener('click', (event) => {
        event.preventDefault(); // Prevent the default navigation
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });
}

debugModeCheckbox.addEventListener('change', () => {
    mockAIResponseArea.classList.toggle('hidden', !debugModeCheckbox.checked);
});

// Listen for storage changes from other parts of the extension (e.g. background changing models)
// This is less critical for options page itself, but good for consistency if needed.
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        // Example: If API keys were somehow changed by another source, reload them.
        // if (changes.apiKeys) {
        //     console.log("WrAIter Options: Detected external change in API keys, reloading.");
        //     loadApiKeys();
        //     initModelSelectors(); // API keys affect model availability
        // }
        // If supported models list changes (e.g. background updates it), re-init selectors
        // This would require background to store the list and options to listen
        if (changes.quickQueries) {
             console.log("WrAIter Options: Detected external change in quick queries, reloading.");
             loadQuickQueries(); // Reload if quick queries changed elsewhere
        }
        if (changes.apiKeys) {
            console.log("WrAIter Options: apiKeys changed in storage.");
            initModelSelectors(); // Re-evaluate which models are enabled
        }
        if (changes.tokenCount) {
            console.log("WrAIter Options: tokenCount changed in storage.");
            // Could update a token count display on options page if desired
        }
        if (changes.isContextMenuItemEnabled) {
            console.log("WrAIter Options: isContextMenuItemEnabled changed in storage.");
            if(contextMenuItemEnabledCheckbox) {
                 contextMenuItemEnabledCheckbox.checked = changes.isContextMenuItemEnabled.newValue;
            }
        }
        if (changes.quickContexts) {
            console.log("WrAIter Options: quickContexts changed in storage.");
            loadQuickContexts(); // Reload if contexts changed elsewhere
        }
    }
});

console.log("WrAIter: options.js loaded"); 