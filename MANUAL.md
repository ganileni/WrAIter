# WrAIter Chrome Extension - User Manual

## Introduction

WrAIter is a Chrome browser extension designed to enhance text editing on any webpage using AI-powered suggestions. It allows you to select editable text, access a popup interface, and receive AI-generated alternatives based on your queries.

## Core Features

*   **Text Selection & Editing:** Works on any editable text field on a webpage. Also works standalone allowing user to type/paste in any text.
*   **AI-Powered Suggestions:** Get multiple alternative suggestions from various AI models.
*   **Multiple AI Models:** Supports Gemini (1.0, 1.5, 2.5 preview) and OpenAI (GPT-3.5 Turbo, GPT-4 Turbo, GPT-4o).
*   **Iterative edit** Supports iteratively refining the text with sequential queries.
*   **Quick Queries:** Save frequently used queries as buttons for quick access.
*   **Quick Contexts:** Save reusable context snippets that can be easily selected via a dropdown. You can select multiple quick contexts.
*   **Options Page:** Configure API keys, default settings, and manage quick queries/contexts.
*   **Keyboard Shortcut:** Default `Ctrl+Shift+E` (Command+Shift+E on Mac) to open the popup (customizable).
*   **Context Menu:** Optionally open WrAIter by right-clicking on selected text (toggleable in Options).

## How to Use WrAIter

1.  **Select Text:** On any webpage, select the text you want to modify in an editable field.
2.  **Open Popup:**
    *   Click the WrAIter icon in your Chrome toolbar, OR
    *   Use the keyboard shortcut (`Ctrl+Shift+E` by default), OR
    *   (If enabled in Options) Right-click the selected text and choose "Edit with WrAIter".
3.  **The Popup Interface:**
    *   **Selected Text (Scratchpad):** The text you selected on the page will appear here. You can edit this text directly before sending it to the AI. You can even open the popup without selecting any text and type/paste any text in the scratchpad.
    *   **Your Request:** Enter your instruction for the AI (e.g., "Make this more formal", "Translate to French").
    *   **Quick Queries:** Click one of the buttons here to instantly populate the "Your Request" field with a saved query. *Double-clicking* a quick query button will automatically execute the request.
    *   **Add Context (Optional):** Click the summary to expand this section.
        *   **Quick Contexts:** Select saved context snippets from the dropdown. Use `Ctrl+click` (or `Cmd+click` on Mac) to select multiple. These will be combined with any text in the "More Context" area.
        *   **More Context:** Type any additional context you want the AI to consider (e.g., "The target audience is academic researchers.").
        *   **+ Add to Quick Contexts:** Click this button to save the text currently in the "More Context" area as a new quick context snippet. You will be prompted to give it a name.
    *   **AI Model:** Select the AI model you want to use from the dropdown. Models without configured API keys will be disabled. The last-used model is remembered.
    *   **How many:** Choose the number of suggestions you want the AI to generate (between 1 and 5).
    *   **Request Changes:** Click this button to send your text, query, and context to the selected AI model and generate suggestions.
    *   **Suggestions:** Once generated, the suggestions will appear here.
        *   **Accept and Apply:** Replaces the selected text on the webpage with this suggestion.
        *   **Accept and Re-edit:** Moves this suggestion's text into the "Selected Text" scratchpad for further modification.
    *   **Apply Changes:** (This button appears after suggestions are generated). Applies the text currently in the "Selected Text" scratchpad to the webpage.
    *   **Query Again:** Sends the current text, query, and context to the AI again.
    *   **Tokens Used:** Displays the estimated total number of tokens used across all your requests. Click "Reset" to clear the count.
    *   **Settings (⚙️):** Opens the extension's options page in a new tab.
    *   **User Manual (?):** Opens this user manual in a new tab.

4.  **Apply Changes:** Select an "Accept and Apply" button next to a suggestion, or modify the text in the scratchpad and click the "Apply Changes" button. The text on the webpage will be updated.

## Options Page

Access the options page by clicking the ⚙️ icon in the popup.

*   **API Keys:** Enter your API keys for Gemini and OpenAI. Keys are stored securely using Chrome's sync storage.
*   **Number of Suggestions (N):** Set the default number of suggestions to generate.
*   **Quick Queries:** Add, edit, or remove your saved quick query buttons.
*   **Quick Contexts:** Add, edit, remove, or reorder your saved quick context snippets.
*   **Debug Mode:** Enable for testing purposes. You can provide a mock suggestion that will be used instead of calling the AI API.
*   **Keyboard Shortcut:** Toggle the `Ctrl+Shift+E` shortcut on or off. The key combination itself can be changed in your Chrome extensions shortcuts settings (`chrome://extensions/shortcuts`).
*   **Context Menu Item:** Toggle the "Edit with WrAIter" option in the browser's right-click context menu.

## Installation

### Prerequisites

*   Node.js and npm (for building)
*   Chrome browser
*   API keys for your desired AI providers (e.g., Google Gemini, OpenAI)

### Loading as an Unpacked Extension

1.  **Build the extension:**
    *   Open your terminal in the project directory.
    *   Install dependencies: `npm install`
    *   Build the extension: `npm run build` (for production) or `npm run watch` (for development)
2.  **Open Chrome Extensions page:** Navigate to `chrome://extensions/` in your Chrome browser.
3.  **Enable Developer mode:** Toggle the "Developer mode" switch in the top right corner.
4.  **Load unpacked:** Click the "Load unpacked" button in the top left corner.
5.  **Select the `dist` folder:** Browse to your project directory and select the `dist` folder.
6.  The extension should now appear in your list and be ready to use. You can pin it to your toolbar for easy access.

## Security Considerations

*   API keys are stored in Chrome's sync storage and are not exposed in client-side code.
*   No personal data is collected by the extension.