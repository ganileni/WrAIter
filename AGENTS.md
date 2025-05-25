# WrAIter Chrome Extension - Context

## Project Overview

WrAIter is a Chrome browser extension that enhances text editing by providing AI-powered suggestions. It allows users to select editable text on any webpage, open the extension popup, and receive AI-generated alternatives based on their queries.

## Core Features

1. **Text Selection & Editing**
   - Works with any editable text field on web pages
   - Supports both standard input fields and contentEditable elements
   - Maintains selection context for precise text replacement

2. **AI-Powered Suggestions**
   - Multiple AI model support (Gemini 1.0, 1.5, and 2.5 preview variants, and OpenAI GPT-3.5 Turbo, GPT-4 Turbo, GPT-4o)
   - Configurable number of alternative suggestions (N=1 to 5)
   - Context-aware text modifications
   - Token usage tracking

3. **User Interface**
   - Clean, modern popup interface
   - Quick query shortcuts for common modifications
   - **Quick context system with dropdown selection for reusable context snippets**
   - Optional context input for better AI understanding
   - **"Add to Quick Contexts" button to save current context as a reusable snippet**
   - Model selection dropdown
   - Token usage display
   - Suggestions section is dynamically shown/hidden based on generation status and availability.
   - Per-suggestion action buttons ("Accept and Apply", "Accept and Re-edit")
   - **Double-clicking a quick query button automatically executes the query.**

4. **Customization Options**
   - API key management for different AI providers
   - Customizable quick queries
   - **Customizable quick contexts with full management (add, delete, reorder)**
   - Default model selection (initial default: Gemini 2.5 Flash Preview 05-20; persists last-used choice)
   - Debug mode for testing
   - **Keyboard Shortcut**: Default `Ctrl+Shift+E` (Command+Shift+E on Mac) to open the popup. Can be enabled/disabled via the options page. The key combination is customizable in the Chrome extensions shortcuts settings (`chrome://extensions/shortcuts`).

## Technical Architecture

### Components

1. **Popup (`popup/`)**
   - Main user interface
   - Handles text input/output
   - Manages suggestion display and selection
   - Communicates with background script

2. **Content Script (`content/`)**
   - Injected into web pages
   - Handles text selection and modification
   - Manages editable element detection
   - Applies AI suggestions to the page
   - Responds to 'PING' messages from the background script with 'PONG' to indicate it is active.

3. **Background Script (`background/`)**
   - Manages extension state
   - Handles communication between components
   - Processes API requests
   - Tracks token usage
   - Programmatically injects the content script into the active tab if it is not already present (using a PING/PONG check) before requesting selected text.

4. **Options Page (`options/`)**
   - Configuration interface
   - API key management
   - Quick query customization
   - **Quick context customization**
   - Debug settings

5. **AI Service (`shared/ai_service.js`)**
   - Manages AI model interactions
   - Handles API calls
   - Processes and parses structured JSON responses from AI models
   - Token counting
   - Model configuration
   - Model registry metadata: supports id, name, description, and provider for each AI model, including Gemini 2.5 preview variants and OpenAI models.
   - **Structured Output Implementation:**
     - Prompts are constructed to explicitly request a specific number of suggestions (`N`) and formatted as a JSON array (Gemini) or a JSON object with a "suggestions" key (OpenAI).
     - API calls are configured (`responseMimeType` for Gemini, `response_format` for OpenAI) to enforce JSON output.
     - Response parsing includes validation to ensure the output is in the expected JSON structure and contains the requested number of string suggestions. Includes error handling for invalid formats or missing data.

### Data Flow

1. User selects text on a webpage
2. Popup opens and requests selected text from the background script
3. Background script checks if the content script is present in the active tab (using PING/PONG), injecting it if necessary
4. Background script requests selected text from the content script
5. Content script retrieves selected text from the page
6. Content script sends the selected text back to the background script
7. Background script sends the selected text to the popup
8. User enters query and optional context
9. **User selects quick contexts from dropdown (combined with manual context)**
10. Background script processes request with AI service
11. Suggestions are displayed in popup
12. User selects and applies desired suggestion
13. Background script sends the suggestion to the content script
14. Content script updates the webpage with the suggestion

### Chrome Storage Structure

The extension uses `chrome.storage.sync` to store user preferences and state. The primary keys and their expected data structures are:

*   `apiKeys`: Object containing API keys for different providers.
    *   Example: `{ gemini: "YOUR_GEMINI_KEY", openai: "YOUR_OPENAI_KEY" }`
*   `N`: Number indicating the default number of suggestions to generate (integer between 1 and 5).
*   `defaultModel`: String storing the `id` of the user's preferred AI model.
*   `quickQueries`: Array of objects, each representing a saved quick query.
    *   Example: `[{ name: "Fix Grammar", query: "Fix grammar and spelling" }, { name: "Make Shorter", query: "Rewrite this text to be shorter" }]`
*   `quickContexts`: Array of objects, each representing a saved quick context.
    *   Example: `[{ id: "default-brit", name: "Brit", context: "*Exclusively* use British English spelling.", enabled: false }, { id: "custom-123", name: "Academic", context: "Use formal academic language.", enabled: true }]`
*   `debugMode`: Boolean indicating if debug mode is enabled.
*   `mockAISuggestion`: String containing the text to use as a mock suggestion when debug mode is enabled.
*   `tokenCount`: Number tracking the cumulative token usage across API calls (integer).
*   `isShortcutEnabled`: Boolean indicating if the `Ctrl+Shift+E` keyboard shortcut is enabled.
*   `isContextMenuItemEnabled`: Boolean indicating if the context menu item "Edit with WrAIter" is enabled.
*   `lastUsedQuery`: String storing the query text from the last request in the popup.
*   `lastUsedN`: Number storing the number of suggestions requested in the last popup request (integer between 1 and 5).

### Message Passing API

Components (Popup, Background Script, Content Script) communicate using `chrome.runtime.sendMessage` and `chrome.tabs.sendMessage`. Messages are objects with a mandatory `type` property and additional data properties depending on the type. Responses are sent via the `sendResponse` callback.

Here is a list of message types and their typical payloads/responses:

*   **From Popup to Background Script:**
    *   `type: 'GET_SELECTED_TEXT'`
        *   Request: `{ type: 'GET_SELECTED_TEXT' }`
        *   Response: `{ selectedText: string | null, error?: string }` - The selected text from the active tab's editable element.
    *   `type: 'PROCESS_TEXT'`
        *   Request: `{ type: 'PROCESS_TEXT', text: string, query: string, context: string, model: string, n: number, debug: { enabled: boolean, mockSuggestion: string | null } }` - Initiates AI suggestion generation.
        *   Response: `{ suggestions?: Array<string>, tokensUsed?: number, error?: string }` - An array of generated suggestions and the estimated token count.
    *   `type: 'APPLY_CHANGES'`
        *   Request: `{ type: 'APPLY_CHANGES', text: string }` - Requests the content script to apply the provided text to the page.
        *   Response: `{ success: boolean, error?: string }` - Indicates if the change was successfully applied.
    *   `type: 'GET_SUPPORTED_MODELS'`
        *   Request: `{ type: 'GET_SUPPORTED_MODELS' }` - Requests the list of supported AI models.
        *   Response: `{ models: Array<{ id: string, name: string, description: string, provider: string }> }` - The list of supported models.
    *   `type: 'GET_TOKEN_COUNT'`
        *   Request: `{ type: 'GET_TOKEN_COUNT' }` - Requests the current total token count.
        *   Response: `{ tokenCount: number }` - The total token count.
    *   `type: 'RESET_TOKEN_COUNT'`
        *   Request: `{ type: 'RESET_TOKEN_COUNT' }` - Requests to reset the total token count to 0.
        *   Response: `{ success: boolean, error?: string }` - Indicates if the reset was successful.

*   **From Background Script to Content Script:**
    *   `type: 'PING'`
        *   Request: `{ type: 'PING' }` - Used to check if the content script is already injected and active in a tab.
        *   Response: `{ status: 'PONG' }` - Confirmation that the content script is active.
    *   `type: 'GET_SELECTED_TEXT_FROM_PAGE'`
        *   Request: `{ type: 'GET_SELECTED_TEXT_FROM_PAGE' }` - Requests the content script to get the selected text from the current page.
        *   Response: `{ selectedText: string | null }` - The selected text.
    *   `type: 'APPLY_CHANGES_TO_PAGE'`
        *   Request: `{ type: 'APPLY_CHANGES_TO_PAGE', text: string }` - Requests the content script to apply the provided text to the page's editable element.
        *   Response: `{ success: boolean }` - Indicates if the application was attempted (actual DOM manipulation success is best effort).

*   **From Content Script to Background Script:**
    *   (Responses to messages initiated by the Background Script, e.g., for 'PING', 'GET_SELECTED_TEXT_FROM_PAGE', 'APPLY_CHANGES_TO_PAGE').

*   **From Options Page to Background Script:**
    *   `type: 'GET_SUPPORTED_MODELS'`
        *   Request: `{ type: 'GET_SUPPORTED_MODELS' }` - Requests the list of supported AI models (same as from Popup).
        *   Response: `{ models: Array<{ id: string, name: string, description: string, provider: string }> }` - The list of supported models.

## Development Setup

### Prerequisites
- Node.js and npm
- Chrome browser
- API keys for desired AI providers

### Build Process
1. Install dependencies: `npm install`
2. Development mode: `npm run watch`
3. Production build: `npm run build`
4. Package for Chrome Web Store: Zip the contents of the `dist/` directory. This zip file can be uploaded to the Chrome Developer Dashboard.

### Project Structure
```
WrAIter/
├── dist/                       # Bundled files
├── src/                        # Source files
│   ├── assets/                 # Static assets
│   │   └── icons/
│   │       ├── icon16.png
│   │       ├── icon48.png
│   │       └── icon128.png
│   ├── background/            # Background script
│   ├── content/               # Content script
│   ├── options/               # Options page
│   ├── popup/                 # Popup interface
│   ├── shared/                # Shared utilities
│   └── manifest.json          # Extension manifest
├── .gitignore
├── package.json
└── webpack.config.js
```

## Security Considerations

1. **API Key Storage**
   - Keys stored in Chrome's sync storage
   - Never exposed in client-side code
   - Encrypted in transit

2. **Content Script Safety**
   - Minimal DOM manipulation
   - Careful selection handling
   - Error recovery mechanisms

3. **Data Privacy**
   - No data collection beyond API usage
   - Clear token usage tracking
   - Optional debug mode for testing

## Future Enhancements

1. **AI Model Support**
   - Additional model providers
   - Model-specific optimizations
   - Better token counting accuracy

2. **User Experience**
   - Keyboard shortcuts
   - Context menu integration
   - Suggestion history
   - Custom prompt templates

3. **Performance**
   - Caching mechanisms
   - Batch processing
   - Offline capabilities

4. **Integration**
   - Editor plugins
   - Browser sync
   - Export/import settings

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. After *every change* you should update AGENTS.md with the relevant information.
5. Submit a pull request

## License

MIT license

# WrAIter Chrome Extension - Agent Notes

Important note for agents making changes: After *every change* you must update AGENTS.md with the relevant information.

## Project Description

WrAIter is a Chrome browser extension that enhances text editing by providing AI-powered suggestions. Users can select editable text, open the extension popup, and receive AI-generated alternatives based on their queries.

## Tech Stack

-   **Language:** JavaScript (ES6+)
-   **Bundler:** Webpack
-   **Framework/Libraries:** (None initially, will add as needed for UI and state management)
-   **Styling:** CSS3
-   **AI Integration:** Gemini & OpenAI APIs

## Core Components

1.  **Popup (`popup.html`, `popup.js`, `popup.css`):**
    *   The main interface for the extension.
    *   Displays the selected text in a "scratchpad" textarea.
    *   Contains a "query" textarea for user input.
    *   "Request changes" button to trigger AI suggestions.
    *   "Quick queries" buttons for common prompts.
    *   Quick contexts dropdown for selecting reusable context snippets. Remembers dropdown state across runs.
    *   Collapsible "context" textarea.
    *   "Add to Quick Contexts" button to save current context as a reusable snippet.
    *   AI model selector dropdown.
    *   Displays AI-generated suggestions.
    *   "Accept and Apply" and "Accept and Re-edit" buttons below each suggestion.
    *   Token usage display.
    *   Gear icon to open the options page.
    *   **Double-clicking a quick query button automatically executes the query.**

2.  **Options Page (`options.html`, `options.js`, `options.css`):**
    *   Allows users to configure API keys for AI models.
    *   Set `N` (number of alternative changes).
    *   Manage "quick queries" (add/remove/rename).
    *   Manage "quick contexts" (add/remove/rename/reorder).
    *   `manageQuickContexts()`: Handles UI for adding, removing, renaming, and reordering quick contexts.
    *   `saveQuickContexts()`: Saves quick contexts to `chrome.storage`.
    *   `toggleDebugMode()`: Enables/disables debug mode and saves the state.
    *   `saveMockSuggestion()`: Saves the mock AI suggestion if debug mode is on.
    *   `loadSettings()`: Loads all saved settings when the options page opens.

3.  **Content Script (`content.js`):**
    *   Injects into web pages to interact with editable text fields.
    *   Gets the selected text.
    *   Applies the chosen AI suggestion back to the selected text field.

4.  **Background Script (`background.js`):**
    *   Manages communication between the popup, content script, and options page.
    *   Handles API calls to AI services.
    *   Stores API keys and user preferences (e.g., using `chrome.storage`).
    *   Manages token counting.

5.  **AI Service Integration (`ai_service.js`):**
    *   A module responsible for making requests to various AI APIs (Gemini, OpenAI).
    *   Handles API key management and error handling for API calls.
    *   `generateSuggestions(text, query, context, model, apiKey, n, mockSuggestion)`:
        *   If mockSuggestion is provided (debug mode), returns it.
        *   Otherwise, constructs the appropriate API request based on the `model`.
        *   Makes the API call.
        *   Parses the response.
        *   Returns an array of `n` suggestions, parsed from structured JSON output.
        *   Calculates and returns token usage for the request.
        *   **Implementation Details for Structured JSON Output:**
            *   **Gemini:** Configured API calls to use `responseMimeType: "application/json"` and defined a `responseSchema` for an array of strings. Parses the JSON response directly.
            *   **OpenAI:** Modified prompts to request a JSON object with a `"suggestions"` key containing an array of strings, wrapped in triple backticks. Configured API calls with `response_format: { type: "json_object" }` and `n: 1`. Parses the JSON string extracted from the response content.
            *   **Validation:** Both implementations include parsing and validation to ensure the response is in the expected JSON format and contains an array of strings. The code attempts to extract exactly `n` suggestions and pads with placeholders if fewer are received.
    *   `getSupportedModels()`: Returns a list of supported AI model objects, each containing `id`, `name`, `description`, and `provider`, including Gemini 1.0, 1.5, 2.5 preview variants and OpenAI GPT-3.5 Turbo, GPT-4 Turbo, and GPT-4o.

6.  **Keyboard Shortcut**: Activates the extension popup using `Ctrl+Shift+E` (default, customizable via Chrome settings). The shortcut's functionality can be enabled or disabled from the extension's options page.

## Directory Structure

```
WrAIter/
├── dist/                       # Bundled files for the extension
├── node_modules/               # Project dependencies
├── src/                        # Source files
│   ├── assets/                 # Static assets (icons, images)
│   │   └── icons/
│   │       ├── icon16.png
│   │       ├── icon48.png
│   │       └── icon128.png
│   ├── background/
│   │   └── background.js       # Background script
│   ├── content/
│   │   └── content.js          # Content script
│   ├── options/
│   │   ├── options.html
│   │   ├── options.js
│   │   └── options.css
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   ├── shared/                 # Shared utility functions or modules
│   │   └── ai_service.js
│   └── manifest.json           # Extension manifest file
├── .gitignore
├── AGENT.md                    # This file
├── package.json
├── package-lock.json
└── webpack.config.js           # Webpack configuration
```

## Function Descriptions (High-Level)

### `popup.js`
*   `displaySelectedText()`: Retrieves selected text from the content script and displays it in the scratchpad.
*   `handleRequestChanges()`: Gathers input from scratchpad, query, and context; **combines selected quick contexts with manual context**; sends it to the background script for AI processing.
*   `displaySuggestions(suggestions)`: Renders the AI-generated suggestions, each with "Accept and Apply" and "Accept and Re-edit" buttons.
*   `handleAcceptAndApply(suggestionId)`: Handles clicking "Accept and Apply". Sends the selected suggestion to the content script to update the web page and closes the popup.
*   `handleAcceptAndReedit(suggestionId)`: Handles clicking "Accept and Re-edit". Moves the selected suggestion's text to the scratchpad and clears suggestions for further editing.
*   `updateTokenCount()`: Fetches and displays the current token count from the background script.
*   `loadQuickQueries()`: Loads and displays quick query buttons from storage.
*   **`loadQuickContexts()`: Loads and displays quick context options in the dropdown from storage.**
*   **`handleAddToQuickContexts()`: Handles adding current context text as a new quick context with user-provided title.**
*   `initModelSelector()`: Populates the AI model selector with options showing `name: description`, disables entries without API keys, sets default to the last-used model (initial default: Gemini 2.5 Flash Preview), and persists user selection.

### `options.js`
*   `saveApiKey()`: Saves the entered API key to `chrome.storage`.
*   `saveNValue()`: Saves the number of alternatives to `chrome.storage`.
*   `manageQuickQueries()`: Handles UI for adding, removing, and renaming quick queries.
*   `saveQuickQueries()`: Saves quick queries to `chrome.storage`.
*   **`manageQuickContexts()`: Handles UI for adding, removing, renaming, and reordering quick contexts.**
*   **`saveQuickContexts()`: Saves quick contexts to `chrome.storage`.**
*   `toggleDebugMode()`: Enables/disables debug mode and saves the state.
*   `saveMockSuggestion()`: Saves the mock AI suggestion if debug mode is on.
*   `loadSettings()`: Loads all saved settings when the options page opens.

### `content.js`
*   `getSelectedEditableText()`: Detects and returns the selected text from an editable element. Listens for messages from the popup.
*   `applyTextChanges(newText)`: Replaces the selected text in the editable element with `newText`. Listens for messages from the popup.

### `background.js`
*   `handleGetSelectedTextRequest(sendResponse)`: Receives a request from the popup, messages the active tab's content script to get selected text, and sends it back.
*   `handleProcessTextRequest(request, sendResponse)`: Receives text, query, context, model, and N from the popup. Calls `ai_service.js`.
*   `handleApplyTextRequest(request)`: Receives text from the popup and messages the content script to apply it.
*   `getApiKey(modelName)`: Retrieves the API key for the specified model from `chrome.storage`.
*   `incrementTokenCount(tokens)`: Updates the token count in `chrome.storage`.
*   `getTokenCount(sendResponse)`: Retrieves and sends the token count to the popup.
*   `init()`: Sets up listeners for messages from other parts of the extension. Manages default settings on installation.

### `ai_service.js`
*   `generateSuggestions(text, query, context, model, apiKey, n, mockSuggestion)`:
    *   If mockSuggestion is provided (debug mode), returns it.
    *   Otherwise, constructs the appropriate API request based on the `model`.
    *   Makes the API call.
    *   Parses the response.
    *   Returns an array of `n` suggestions, parsed from structured JSON output.
    *   Calculates and returns token usage for the request.
    *   **Implementation Details for Structured JSON Output:**
        *   **Gemini:** Configured API calls to use `responseMimeType: "application/json"` and defined a `responseSchema` for an array of strings. Parses the JSON response directly.
        *   **OpenAI:** Modified prompts to request a JSON object with a `"suggestions"` key containing an array of strings, wrapped in triple backticks. Configured API calls with `response_format: { type: "json_object" }` and `n: 1`. Parses the JSON string extracted from the response content.
        *   **Validation:** Both implementations include parsing and validation to ensure the response is in the expected JSON format and contains an array of strings. The code attempts to extract exactly `n` suggestions and pads with placeholders if fewer are received.
*   `getSupportedModels()`: Returns a list of supported AI model objects, each containing `id`, `name`, `description`, and `provider`, including Gemini 1.0, 1.5, 2.5 preview variants and OpenAI GPT-3.5 Turbo, GPT-4 Turbo, and GPT-4o.