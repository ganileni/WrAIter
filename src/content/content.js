// WrAIter - content.js
// This script is injected into web pages to interact with their content.

console.log("WrAIter: content.js loaded");

let lastSelectedEditableElement = null;
let lastSelectionRange = null;

// Listen for text selection changes to keep track of the active editable element and selection
document.addEventListener('selectionchange', () => {
    const activeElement = document.activeElement;
    if (isElementEditable(activeElement)) {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && selection.toString().trim() !== '') {
            lastSelectedEditableElement = activeElement;
            lastSelectionRange = selection.getRangeAt(0).cloneRange();
            // console.log("WrAIter Content: Stored selection in editable element:", lastSelectedEditableElement, lastSelectionRange.toString());
        } else if (selection && selection.toString().trim() === '' && lastSelectedEditableElement === activeElement) {
            // If selection is cleared within the same element, clear stored range
            // lastSelectionRange = null; // Keep this commented, if we want to re-apply to last *position*
        }
    } else {
        // If focus moves out of an editable field, or selection is in non-editable, clear them
        // We only care about selection *inside* an editable field for our primary use case.
        // lastSelectedEditableElement = null; // Do not clear if we want to apply even if focus is lost momentarily
        // lastSelectionRange = null;
    }
});

// More robust check for editable elements, including contentEditable
function isElementEditable(element) {
    if (!element) return false;
    const tagName = element.tagName.toLowerCase();
    return (
        element.isContentEditable ||
        tagName === 'textarea' ||
        (tagName === 'input' &&
            /^(text|search|url|tel|email|password|number|date|month|week|time|datetime-local)$/i.test(
                element.type
            ))
    );
}

/**
 * Gets the currently selected text from an editable field on the page.
 * It prioritizes the element that had a selection when the popup was likely opened.
 * @returns {string | null} The selected text, or null if no editable text is selected.
 */
function getSelectedTextFromPage() {
    const activeElement = document.activeElement;
    let selectedText = "";

    // Priority 1: Use last stored selection if the element is still focused or was recently
    if (lastSelectedEditableElement && (document.activeElement === lastSelectedEditableElement || document.body.contains(lastSelectedEditableElement))) {
        if (lastSelectedEditableElement.isContentEditable) {
            if (lastSelectionRange) {
                 // Ensure the range is still valid within the document
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(lastSelectionRange);
                selectedText = selection.toString().trim();
                selection.removeAllRanges(); // Clear immediately to avoid disrupting user
                if (selectedText) {
                    console.log("WrAIter Content: Retrieved from lastSelectionRange:", selectedText);
                    return selectedText;
                }
            }
        } else if (typeof lastSelectedEditableElement.selectionStart === 'number') {
            selectedText = lastSelectedEditableElement.value.substring(
                lastSelectedEditableElement.selectionStart,
                lastSelectedEditableElement.selectionEnd
            ).trim();
            if (selectedText) {
                console.log("WrAIter Content: Retrieved from lastSelectedEditableElement (input/textarea) selectionStart/End:", selectedText);
                return selectedText;
            }
        }
    }

    // Priority 2: Try current document.activeElement if it's editable
    if (isElementEditable(activeElement)) {
        if (activeElement.isContentEditable) {
            const selection = window.getSelection();
            selectedText = selection.toString().trim();
            if (selectedText) {
                lastSelectedEditableElement = activeElement; // Update last selected
                if (selection.rangeCount > 0) lastSelectionRange = selection.getRangeAt(0).cloneRange();
                console.log("WrAIter Content: Retrieved from activeElement (contentEditable):", selectedText);
                return selectedText;
            }
        } else if (typeof activeElement.selectionStart === 'number') {
            selectedText = activeElement.value.substring(
                activeElement.selectionStart,
                activeElement.selectionEnd
            ).trim();
            if (selectedText) {
                lastSelectedEditableElement = activeElement; // Update last selected
                lastSelectionRange = null; // For input/textarea, range is implicit by selectionStart/End
                console.log("WrAIter Content: Retrieved from activeElement (input/textarea):", selectedText);
                return selectedText;
            }
        }
    }
    
    // Fallback: If there's a general window selection and its anchor/focus node is editable or within editable
    const selection = window.getSelection();
    if (selection && selection.toString().trim() !== '' && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        let commonAncestor = range.commonAncestorContainer;
        // Traverse up to find an editable parent if the common ancestor itself isn't directly editable
        while (commonAncestor && commonAncestor.nodeType !== Node.ELEMENT_NODE) {
            commonAncestor = commonAncestor.parentNode;
        }
        if (commonAncestor && isElementEditable(commonAncestor)) {
            selectedText = selection.toString().trim();
            if (selectedText) {
                 lastSelectedEditableElement = commonAncestor;
                 lastSelectionRange = range.cloneRange();
                 console.log("WrAIter Content: Retrieved from general window selection within an editable ancestor:", selectedText);
                 return selectedText;
            }
        }
    }

    console.log("WrAIter Content: No editable text found or selected.");
    return null;
}

/**
 * Applies the given text to the last selected editable element, replacing the previous selection.
 * @param {string} newText The text to apply.
 */
function applyTextChangesToPage(newText) {
    if (!lastSelectedEditableElement || !document.body.contains(lastSelectedEditableElement)) {
        console.warn("WrAIter Content: No valid last selected editable element to apply changes to.");
        alert("Could not apply changes. The original text field might no longer be available.");
        return false;
    }

    // Re-focus the element if it lost focus, crucial for some application methods
    // However, be careful not to disrupt user if they are typing elsewhere.
    // A short timeout or specific condition might be needed.
    // For now, let's assume if we have lastSelectedEditableElement, it's the intended target.
    // lastSelectedEditableElement.focus(); // This can be disruptive. Let's try without first.

    console.log("WrAIter Content: Attempting to apply text to:", lastSelectedEditableElement, "Range:", lastSelectionRange);
    console.log("WrAIter Content: New text:", newText);

    // Define textToInsert here so it's accessible in both branches
    let textToInsert = newText; // Initialize with the new text

    try {
        if (lastSelectedEditableElement.isContentEditable) {
            // For contentEditable, replace newlines with <br> tags
            textToInsert = newText.replace(/\n/g, '<br>'); // Reassign for contentEditable

            // For contentEditable, try to use the stored range if available and valid
            lastSelectedEditableElement.focus(); // Focus is often necessary here
            const selection = window.getSelection();
            selection.removeAllRanges();

            if (lastSelectionRange) {
                 // Check if the range is still somewhat valid (e.g., start and end containers exist)
                try {
                    const rangeParent = lastSelectionRange.commonAncestorContainer.parentNode;
                    if (!document.body.contains(rangeParent)) {
                        console.warn("WrAIter Content: Stored range parent is no longer in document. Falling back.");
                        lastSelectionRange = null; // Invalidate stale range
                    }
                } catch (e) {
                    console.warn("WrAIter Content: Error validating range, falling back.", e);
                    lastSelectionRange = null;
                }
            }

            if (lastSelectionRange) {
                selection.addRange(lastSelectionRange);
            } else {
                // Fallback: if no range, or range became invalid, try to select the element's content or create a new range.
                // This part is tricky. For now, if lastSelectionRange is lost, we might not be able to precisely replace.
                // A robust solution might involve re-finding the original text if it was unique, or simply appending/prepending.
                // For simplicity now, we'll assume if lastSelectionRange is gone, the context is too different.
                console.warn("WrAIter Content: lastSelectionRange is not available for contentEditable. Precise replacement may fail.");
                // As a basic fallback, one could try to replace all content, but that's too broad.
                // Or, place cursor at the start/end. For now, we require a valid range or input selection.
                // We will proceed with document.execCommand which might work if the element is focused
                // and has some internal selection idea.
            }

            // Use `insertHTML` for contentEditable to preserve formatting like newlines
            // Replacing newlines with <br> tags for basic newlines
            // textToInsert is now defined with '<br>' for contentEditable
            if (document.execCommand('insertHTML', false, textToInsert)) {
                console.log("WrAIter Content: Text applied using insertHTML for contentEditable.");
                // Update lastSelectionRange to be *after* the inserted text
                if (selection.rangeCount > 0) {
                    const newRange = selection.getRangeAt(0).cloneRange();
                    newRange.collapse(false); // Collapse to the end of the new selection
                    lastSelectionRange = newRange;
                }
            } else {
                // Fallback for older systems or if insertHTML fails
                console.warn("WrAIter Content: insertHTML failed for contentEditable. Trying value based (if applicable) or innerHTML (less ideal).");
                // This is a very rough fallback. For contentEditable, direct manipulation is preferred.
                // If it had a value property (it shouldn't for true contentEditable, but for completeness):
                if (typeof lastSelectedEditableElement.value !== 'undefined') {
                    lastSelectedEditableElement.value = textToInsert; // Or smarter replacement
                } else {
                    // Avoid innerHTML if possible as it can break things. This is a last resort.
                    // lastSelectedEditableElement.innerHTML = textToInsert; 
                    throw new Error("Failed to apply text to contentEditable element using execCommand.");
                }
            }
        } else if (typeof lastSelectedEditableElement.selectionStart === 'number') {
            // For <input> and <textarea>
            lastSelectedEditableElement.focus(); // Focus is often necessary here
            const start = lastSelectedEditableElement.selectionStart;
            const end = lastSelectedEditableElement.selectionEnd;
            const currentValue = lastSelectedEditableElement.value;

            // textToInsert is already defined as newText at the function start
            lastSelectedEditableElement.value = currentValue.substring(0, start) + textToInsert + currentValue.substring(end);
            
            // Move cursor to the end of the inserted text
            lastSelectedEditableElement.selectionStart = lastSelectedEditableElement.selectionEnd = start + textToInsert.length;
            console.log("WrAIter Content: Text applied to input/textarea.");

        } else {
            console.warn("WrAIter Content: Last selected element is not editable in a known way.");
            return false;
        }

        // Dispatch input and change events to ensure web page reacts to the change
        const eventInput = new Event('input', { bubbles: true, cancelable: true });
        const eventChange = new Event('change', { bubbles: true, cancelable: true });
        lastSelectedEditableElement.dispatchEvent(eventInput);
        lastSelectedEditableElement.dispatchEvent(eventChange);
        
        // Clear the selection state as the text has changed
        // lastSelectionRange = null; // Keep if we want to allow sequential operations on the new text
        // window.getSelection().removeAllRanges(); // Might be too aggressive

        return true;
    } catch (error) {
        console.error("WrAIter Content: Error applying text changes:", error);
        alert(`WrAIter: Error applying text: ${error.message}. Please try copying the suggestion manually.`);
        return false;
    }
}

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("WrAIter Content: Message received", request);
    
    if (request.type === 'PING') {
        console.log("WrAIter Content: Received PING. Responding with PONG.");
        sendResponse({ status: 'PONG' });
        return true; // Indicates asynchronous response
    }

    if (request.type === 'GET_SELECTED_TEXT_FROM_PAGE') {
        const selectedText = getSelectedTextFromPage();
        console.log("WrAIter Content: Sending selected text to popup:", selectedText);
        sendResponse({ selectedText: selectedText, element: lastSelectedEditableElement ? lastSelectedEditableElement.outerHTML.substring(0,100) : null });
        return true; // Indicates asynchronous response
    }
    if (request.type === 'APPLY_CHANGES_TO_PAGE') {
        if (request.text) {
            const success = applyTextChangesToPage(request.text);
            sendResponse({ success: success });
        } else {
            sendResponse({ success: false, error: "No text provided to apply." });
        }
        return true; // Indicates asynchronous response
    }
    return false; // For other message types not handled here
});

// Make the `isElementEditable` function available to the popup via a message if needed,
// though it's usually better for the content script to make these determinations.
// Example: if (request.type === 'CHECK_EDITABLE') { ... }

// Inject a simple CSS file if needed for content script specific UI (e.g. highlighting)
// This is handled by manifest.json linking content.css

console.log("WrAIter: content.js event listeners set up."); 