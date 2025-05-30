// WrAIter - popup.js
// This script handles the functionality of the extension's popup.

// Import styles (handled by Webpack)
import './popup.css';
import { DEFAULT_QUICK_CONTEXTS } from '../shared/defaults.js';

// DOM Elements
const scratchpad = document.getElementById('scratchpad');
const queryTextarea = document.getElementById('query');
const quickQueriesButtonsContainer = document.getElementById('quick-queries-buttons');
const contextTextarea = document.getElementById('context');
const quickContextsDropdown = document.getElementById('quick-contexts-dropdown');
const addToQuickContextsButton = document.getElementById('add-to-quick-contexts-button');
// const modelSelector = document.getElementById('model-selector');
const requestChangesButton = document.getElementById('request-changes-button');
const suggestionsContainer = document.getElementById('suggestions-container');
const actionButtonsSection = document.getElementById('action-buttons-section');
// const applyChangesButton = document.getElementById('apply-changes-button');
// const queryAgainButton = document.getElementById('query-again-button');
const tokenCountSpan = document.getElementById('token-count');
const settingsButton = document.getElementById('settings-button');
const numSuggestionsInputPopup = document.getElementById('num-suggestions-popup');
const suggestionsSection = document.getElementById('suggestions-section');

// State variables
let currentSelectedText = "";
let currentSuggestions = []; // To store AI suggestions {id: string, text: string, status: 'pending' | 'accepted' | 'rejected'}
let preferredSuggestionId = null;
let currentQuickContexts = []; // To store quick contexts from storage

// Custom dropdown state
let selectedModelId = null;

/**
 * Initializes the popup when it's opened.
 * - Fetches and displays the selected text from the active tab.
 * - Loads quick queries from storage.
 * - Loads quick contexts from storage.
 * - Initializes the AI model selector.
 * - Updates the token count.
 */
async function initPopup() {
    console.log("WrAIter: Popup opened");

    // Request selected text from content script
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_SELECTED_TEXT' });
        if (response && response.selectedText) {
            currentSelectedText = response.selectedText;
            scratchpad.value = currentSelectedText;
            console.log("WrAIter: Received selected text:", currentSelectedText);
        } else {
            // If no text is selected, enable the scratchpad for manual input
            // and set a placeholder message.
            scratchpad.value = ""; // Clear any default value
            scratchpad.placeholder = "No editable text selected. Type or copy your own here to start working.";
            scratchpad.disabled = false; // Ensure it's not disabled
            console.log("WrAIter: No editable text selected. Scratchpad enabled for manual input.");
        }
    } catch (error) {
        console.error('WrAIter: Error getting selected text:', error);
        // On error, also enable the scratchpad with an error message as placeholder.
        scratchpad.value = ""; // Clear any default value
        scratchpad.placeholder = "Error getting selected text. Type or copy your own here to start working.";
        scratchpad.disabled = false; // Ensure it's not disabled
    }

    loadQuickQueries();
    loadQuickContexts();
    await initModelSelector(); // Ensure models are loaded and keys checked
    updateTokenCountDisplay();

    // Load and display the last used query
    try {
        const { lastUsedQuery = '' } = await chrome.storage.sync.get('lastUsedQuery');
        queryTextarea.value = lastUsedQuery;
        console.log("WrAIter: Loaded last used query:", lastUsedQuery);
    } catch (error) {
        console.error("WrAIter: Error loading last used query:", error);
    }

    // Load and display the last used number of suggestions
    try {
        const { lastUsedN = 2 } = await chrome.storage.sync.get({ lastUsedN: 2 }); // Default to 2
        numSuggestionsInputPopup.value = lastUsedN;
        console.log("WrAIter: Loaded last used N:", lastUsedN);
    } catch (error) {
        console.error("WrAIter: Error loading last used N:", error);
    }

    // Load and apply the saved context details open state
    try {
        const { contextDetailsOpen = false } = await chrome.storage.sync.get('contextDetailsOpen');
        const contextDetails = document.querySelector('#context-section details');
        if (contextDetails) {
            contextDetails.open = contextDetailsOpen;
             // Add event listener to save state when toggled
            contextDetails.addEventListener('toggle', async () => {
                await chrome.storage.sync.set({ contextDetailsOpen: contextDetails.open });
            });
        }
    } catch (error) {
        console.error("WrAIter: Error loading or setting context details open state:", error);
    }

    // Add other initializations if needed
}

/**
 * Fetches quick queries from storage and displays them as buttons.
 */
async function loadQuickQueries() {
    quickQueriesButtonsContainer.innerHTML = ''; // Clear existing buttons
    try {
        const { quickQueries = [] } = await chrome.storage.sync.get('quickQueries');
        
        // Removed the hardcoded default queries here. Quick queries will be loaded from storage,
        // which is initialized with defaults in options.js if storage is empty.
        const queriesToDisplay = quickQueries;

        queriesToDisplay.forEach(q => {
            const button = document.createElement('button');
            button.textContent = q.name;
            button.title = q.query;
            button.addEventListener('click', () => {
                queryTextarea.value = q.query;
            });
            // Add dblclick listener to automatically execute the query
            button.addEventListener('dblclick', () => {
                queryTextarea.value = q.query;
                handleRequestChanges(); // Trigger the AI request
            });
            quickQueriesButtonsContainer.appendChild(button);
        });
        console.log("WrAIter: Quick queries loaded.");
    } catch (error) {
        console.error("WrAIter: Error loading quick queries:", error);
    }
}

/**
 * Fetches quick contexts from storage and displays them in the dropdown.
 */
async function loadQuickContexts() {
    try {
        const { quickContexts = [] } = await chrome.storage.sync.get('quickContexts');
        quickContextsDropdown.innerHTML = ''; // Clear existing options
        quickContexts.forEach(context => {
            const option = document.createElement('option');
            option.value = context.id;
            option.textContent = context.name;
            quickContextsDropdown.appendChild(option);
        });
        console.log("WrAIter: Quick contexts loaded.");
    } catch (error) {
        console.error("WrAIter: Error loading quick contexts:", error);
    }
}

/**
 * Initializes the AI model selector.
 * Fetches supported models and their API key status.
 */
async function initModelSelector() {
    console.log("WrAIter: Initializing custom model selector.");
    const dropdown = document.getElementById('model-selector');
    const selectedDiv = document.getElementById('model-selected');
    const optionsContainer = document.getElementById('model-options');
    selectedDiv.textContent = 'Loading models...';
    optionsContainer.innerHTML = '';
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_SUPPORTED_MODELS' });
        const supportedModels = response?.models || [];
        const { apiKeys = {} } = await chrome.storage.sync.get('apiKeys');
        const { defaultModel = 'gemini-2.5-flash-preview-05-20' } = await chrome.storage.sync.get('defaultModel');

        if (supportedModels.length === 0) {
            selectedDiv.textContent = 'No models available';
            console.warn('WrAIter: No AI models available.');
            return;
        }

        // Populate option elements
        supportedModels.forEach(model => {
            const opt = document.createElement('div');
            opt.className = 'dropdown-option';
            opt.dataset.value = model.id;
            opt.innerHTML = `<code><strong>${model.name}</strong></code> <em>${model.description || ''}</em>`;
            if (!apiKeys[model.provider]) {
                opt.classList.add('disabled');
                opt.title = 'API key missing';
            }
            opt.addEventListener('click', () => {
                if (opt.classList.contains('disabled')) return;
                selectModel(model.id);
                optionsContainer.classList.add('hidden');
            });
            optionsContainer.appendChild(opt);
        });

        // Helper to update selected display and persist choice
        function selectModel(id) {
            const modelInfo = supportedModels.find(m => m.id === id);
            if (!modelInfo) return;
            selectedDiv.innerHTML = `<code><strong>${modelInfo.name}</strong></code> <em>${modelInfo.description || ''}</em>`;
            selectedModelId = id;
            chrome.storage.sync.set({ defaultModel: id });
        }

        // Determine enabled models based on available API keys
        const enabledModels = supportedModels.filter(m => apiKeys[m.provider]);
        const initial = enabledModels.find(m => m.id === defaultModel)?.id || enabledModels[0]?.id;
        if (initial) selectModel(initial);
        else selectedDiv.textContent = 'No valid model available, please set an API key in options.';

        // Toggle open/close
        selectedDiv.addEventListener('click', () => {
            optionsContainer.classList.toggle('hidden');
        });

        console.log('WrAIter: Custom model selector initialized.');
    } catch (error) {
        console.error('WrAIter: Error initializing model selector:', error);
        selectedDiv.textContent = 'Error loading models';
    }
}

/**
 * Handles the "Request Changes" button click.
 * Sends the current text, query, context, and selected model to the background script.
 */
async function handleRequestChanges() {
    const originalText = scratchpad.value;
    const query = queryTextarea.value;
    const manualContext = contextTextarea.value;
    
    // Collect selected quick contexts
    const selectedQuickContextIds = Array.from(quickContextsDropdown.selectedOptions).map(option => option.value);
    const { quickContexts = [] } = await chrome.storage.sync.get('quickContexts');
    const selectedContextTexts = quickContexts
        .filter(context => selectedQuickContextIds.includes(context.id))
        .map(context => context.context);
    
    // Combine quick contexts with manual context (newline-separated)
    const allContexts = [...selectedContextTexts];
    if (manualContext.trim()) {
        allContexts.push(manualContext.trim());
    }
    const combinedContext = allContexts.join('\n');
    
    const selectedModel = selectedModelId;
    const apiKeyPresent = !!selectedModel;
    const N = parseInt(numSuggestionsInputPopup.value, 10); // Get N from the new popup input

    if (!originalText || originalText === "No editable text selected." || scratchpad.disabled) {
        alert("Please ensure there is text in the scratchpad.");
        return;
    }
    if (!query) {
        alert("Please enter a query/request.");
        return;
    }
    if (!selectedModel || !apiKeyPresent) {
        alert("Please select a valid AI model with an API key set in options.");
        return;
    }
    if (isNaN(N) || N < 1 || N > 5) {
        alert("Number of suggestions must be between 1 and 5.");
        return;
    }

    // Save the current query and N to storage before processing
    try {
        await chrome.storage.sync.set({ lastUsedQuery: query, lastUsedN: N });
        console.log("WrAIter: Saved last used query and N:", query, N);
    } catch (error) {
        console.error("WrAIter: Error saving last used query or N:", error);
    }

    console.log("WrAIter: Requesting changes with model:", selectedModel);
    requestChangesButton.disabled = true;
    requestChangesButton.textContent = "Generating...";
    suggestionsContainer.innerHTML = '<p>Generating suggestions...</p>'; // Show loading state
    actionButtonsSection.style.display = 'none';
    suggestionsSection.style.display = 'block'; // Show the suggestions section while generating

    try {
        const { debugMode, mockAISuggestion } = await chrome.storage.sync.get({ debugMode: false, mockAISuggestion: 'This is a mock suggestion.' });

        const response = await chrome.runtime.sendMessage({
            type: 'PROCESS_TEXT',
            text: originalText,
            query: query,
            context: combinedContext, // Use the combined context
            model: selectedModel,
            n: N, // Number of suggestions to generate
            debug: {
                enabled: debugMode,
                mockSuggestion: debugMode ? mockAISuggestion : null
            }
        });

        if (response && response.suggestions) {
            currentSuggestions = response.suggestions.map((text, index) => ({
                id: `suggestion-${Date.now()}-${index}`,
                text,
                status: 'pending'
            }));
            preferredSuggestionId = null; // Reset preferred suggestion
            renderSuggestions();
            actionButtonsSection.style.display = 'none'; // Hide the main action buttons section
            // checkAllSuggestionsHandled(); // This function is no longer needed and was removed
            console.log("WrAIter: Received suggestions:", currentSuggestions);
        } else if (response && response.error) {
            console.error("WrAIter: Error from AI service:", response.error);
            suggestionsContainer.innerHTML = `<p style="color: red;">Error: ${response.error}</p>`;
        } else {
            throw new Error("Invalid response from background script.");
        }
        updateTokenCountDisplay(); // Update token count after successful or failed request
    } catch (error) {
        console.error('WrAIter: Error requesting changes:', error);
        suggestionsContainer.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    }
    requestChangesButton.disabled = false;
    requestChangesButton.textContent = "Request Changes";
}

/**
 * Renders the AI-generated suggestions in the UI.
 */
function renderSuggestions() {
    suggestionsContainer.innerHTML = ''; // Clear previous suggestions or loading message
    if (currentSuggestions.length === 0) {
        suggestionsSection.style.display = 'none'; // Hide the suggestions section
        suggestionsContainer.innerHTML = ''; // Clear content when hidden
        actionButtonsSection.style.display = 'none'; // Hide the main action buttons section
        return;
    }

    suggestionsSection.style.display = 'block'; // Show the suggestions section
    // Remove special handling for N=1, all suggestions get buttons now

    currentSuggestions.forEach(suggestion => {
        const suggestionDiv = document.createElement('div');
        // We don't need status classes (accepted/rejected) for the primary display anymore
        suggestionDiv.className = `suggestion`;
        suggestionDiv.id = suggestion.id;

        const textarea = document.createElement('textarea');
        textarea.value = suggestion.text;
        textarea.rows = Math.max(3, suggestion.text.split('\n').length + 1);
        textarea.addEventListener('input', (e) => {
            // Update the text in our state if the user edits it
            const changedSuggestion = currentSuggestions.find(s => s.id === suggestion.id);
            if (changedSuggestion) {
                changedSuggestion.text = e.target.value;
            }
        });
        suggestionDiv.appendChild(textarea);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'suggestion-item-actions'; // Use a different class name

        const acceptApplyButton = document.createElement('button');
        // Check if text was originally selected from the page or manually entered
        if (currentSelectedText === "") {
            acceptApplyButton.textContent = 'Copy';
            acceptApplyButton.className = 'accept-apply';
            // Use an arrow function to pass the suggestion text directly
            acceptApplyButton.onclick = () => handleCopyToClipboard(suggestion.text);
        } else {
            acceptApplyButton.textContent = 'Apply';
            acceptApplyButton.className = 'accept-apply';
            // Use an arrow function to pass the suggestion ID for handleAcceptAndApply
            acceptApplyButton.onclick = () => handleAcceptAndApply(suggestion.id);
        }
        actionsDiv.appendChild(acceptApplyButton);

        const acceptReeditButton = document.createElement('button');
        acceptReeditButton.textContent = 'Re-edit';
        acceptReeditButton.className = 'accept-reedit';
        acceptReeditButton.onclick = () => handleAcceptAndReedit(suggestion.id);
        actionsDiv.appendChild(acceptReeditButton);

        suggestionDiv.appendChild(actionsDiv);
        suggestionsContainer.appendChild(suggestionDiv);
    });

    // The main action buttons section (Apply Changes, Query Again) is now mostly redundant,
    // as actions are per-suggestion. We can hide it or repurpose it later if needed.
    actionButtonsSection.style.display = 'none';

    // The checkAllSuggestionsHandled logic is also no longer directly needed
    // for enabling/disabling the main Apply button.
    // checkAllSuggestionsHandled(); // Remove or repurpose this call
}

/**
 * Handles the "Accept and Apply" action for a specific suggestion.
 * Sends the selected suggestion to the content script to update the page and closes the popup.
 * @param {string} suggestionId The ID of the suggestion to apply.
 */
async function handleAcceptAndApply(suggestionId) {
    const suggestionToApply = currentSuggestions.find(s => s.id === suggestionId);

    if (!suggestionToApply) {
        console.error("WrAIter: Suggestion not found for applying:", suggestionId);
        alert("Error: Could not find the suggestion to apply.");
        return;
    }

    console.log("WrAIter: Applying changes and closing popup:", suggestionToApply.text);
    // Disable buttons temporarily? Or just let the popup close? Let's let it close.

    try {
        // Send message to content script to apply changes
        await chrome.runtime.sendMessage({
            type: 'APPLY_CHANGES',
            text: suggestionToApply.text
        });
        console.log("WrAIter: Changes applied successfully. Closing popup.");
        // Close the popup window
        window.close();
    } catch (error) {
        console.error('WrAIter: Error applying changes:', error);
        alert('Failed to apply changes to the page. Error: ' + error.message);
        // Don't close the popup on error so user can see the message
    }
}

/**
 * Handles the "Accept and Re-edit" action for a specific suggestion.
 * Moves the selected suggestion's text to the scratchpad for further refinement.
 * @param {string} suggestionId The ID of the suggestion to re-edit.
 */
function handleAcceptAndReedit(suggestionId) {
    const suggestionToReedit = currentSuggestions.find(s => s.id === suggestionId);

    if (!suggestionToReedit) {
        console.error("WrAIter: Suggestion not found for re-editing:", suggestionId);
        alert("Error: Could not find the suggestion to re-edit.");
        return;
    }

    console.log("WrAIter: Re-editing with text:", suggestionToReedit.text);
    // Update the scratchpad with the suggestion's text
    scratchpad.value = suggestionToReedit.text;
    currentSelectedText = suggestionToReedit.text; // Keep state consistent

    // Clear previous query and context for the new re-edit cycle
    queryTextarea.value = "";
    contextTextarea.value = "";

    // Clear the suggestions list and hide the suggestions container/action buttons
    currentSuggestions = [];
    preferredSuggestionId = null; // Reset preferred selection
    renderSuggestions(); // This will clear the UI

    // Focus the scratchpad for immediate editing
    scratchpad.focus();

    // Optional: Add a visual cue/animation to the scratchpad update
    // This would require more complex DOM manipulation or CSS animations.
    // For now, the value update is sufficient.
}

/**
 * Updates the token count display by fetching it from the background script.
 */
async function updateTokenCountDisplay() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_TOKEN_COUNT' });
        if (response && typeof response.tokenCount === 'number') {
            tokenCountSpan.textContent = response.tokenCount;
            console.log("WrAIter: Token count updated:", response.tokenCount);
        }
    } catch (error) {
        console.error("WrAIter: Error fetching token count:", error);
        tokenCountSpan.textContent = "N/A";
    }
}

/**
 * Opens the options page.
 */
function openOptionsPage() {
    chrome.runtime.openOptionsPage();
}

/**
 * Opens the user manual in a new tab.
 */
function openUserManual() {
    const manualUrl = chrome.runtime.getURL('MANUAL.html');
    chrome.tabs.create({ url: manualUrl });
}

/**
 * Handles adding current context text as a new quick context.
 */
async function handleAddToQuickContexts() {
    const contextText = contextTextarea.value.trim();
    
    if (!contextText) {
        alert("Please enter some context text before adding it as a quick context.");
        return;
    }
    
    const title = prompt("Enter a title for this quick context:");
    if (!title || !title.trim()) {
        return; // User cancelled or entered empty title
    }
    
    try {
        const { quickContexts = [] } = await chrome.storage.sync.get('quickContexts');
        const newQuickContext = {
            id: `custom-${Date.now()}`,
            name: title.trim(),
            context: contextText,
            enabled: true
        };
        
        quickContexts.push(newQuickContext);
        await chrome.storage.sync.set({ quickContexts });
        
        // Reload the dropdown to show the new context
        await loadQuickContexts();
        
        console.log("WrAIter: Quick context added:", newQuickContext);
        alert(`Quick context "${title.trim()}" added successfully!`);
    } catch (error) {
        console.error("WrAIter: Error adding quick context:", error);
        alert("Error adding quick context: " + error.message);
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', initPopup);
requestChangesButton.addEventListener('click', handleRequestChanges);
settingsButton.addEventListener('click', openOptionsPage);
document.getElementById('manual-button').addEventListener('click', openUserManual);
addToQuickContextsButton.addEventListener('click', handleAddToQuickContexts);

// Get the reset token count element
const resetTokenCountSpan = document.getElementById('reset-token-count');

/**
 * Handles the click event on the reset token count text.
 * Sends a message to the background script to reset the token count.
 */
async function handleResetTokenCount() {
    console.log("WrAIter: Resetting token count.");
    try {
        await chrome.runtime.sendMessage({ type: 'RESET_TOKEN_COUNT' });
        console.log("WrAIter: Token count reset message sent.");
        // Update the display after resetting
        updateTokenCountDisplay();
    } catch (error) {
        console.error("WrAIter: Error sending reset token count message:", error);
    }
}

// Add event listener to the reset token count text
if (resetTokenCountSpan) {
    resetTokenCountSpan.addEventListener('click', handleResetTokenCount);
}

// Listen for storage changes to update UI elements like quick queries or model status
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        if (changes.quickQueries) {
            console.log("WrAIter: Detected change in quick queries, reloading.");
            loadQuickQueries();
        }
        if (changes.quickContexts) {
            console.log("WrAIter: Detected change in quick contexts, reloading.");
            loadQuickContexts();
        }
        if (changes.apiKeys || changes.defaultModel) {
            console.log("WrAIter: Detected change in API keys or default model, re-initializing selector.");
            initModelSelector();
        }
        if (changes.tokenCount) {
            // This might be set directly by background, or we can rely on our update function
            // For simplicity, let popup manage its display updates for now via updateTokenCountDisplay
            // If background directly updates 'tokenCount' in storage, this could react:
            // tokenCountSpan.textContent = changes.tokenCount.newValue || 0;
        }
    }
});


// Basic function to check if an element is editable (simplified)
// This will be primarily handled by the content script, but popup might need a check.
function isElementEditable(element) {
    if (!element) return false;
    return element.isContentEditable || element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';
}

// Close popup if user clicks outside of it.
// This is tricky for extensions as the popup is a separate window.
// Chrome handles this by default if the popup loses focus.
// No specific code needed here for typical popup auto-close behavior.

console.log("WrAIter: popup.js loaded");

/**
 * Copies text to the clipboard.
 * @param {string} text The text to copy.
 */
async function handleCopyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        console.log('WrAIter: Text copied to clipboard.');
        // Optionally provide user feedback, e.g., a temporary status message
        // For now, rely on browser's potential feedback or logs.
        window.close(); // Close popup after copying
    } catch (err) {
        console.error('WrAIter: Failed to copy text:', err);
        alert('Failed to copy text to clipboard.');
    }
} 