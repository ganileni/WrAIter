// WrAIter - ai_service.js
// This module handles interactions with various AI APIs.

/**
 * Fetches available models from OpenAI API.
 * @param {string} apiKey The OpenAI API key.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of model objects.
 */
export async function fetchOpenAIModels(apiKey) {
    if (!apiKey) {
        throw new Error("OpenAI API key is required to fetch models.");
    }

    try {
        const response = await fetch("https://api.openai.com/v1/models", {
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        
        // Transform OpenAI model format to our internal format
        return data.data.map(model => ({
            id: model.id,
            name: model.id, // OpenAI doesn't provide friendly names, use ID
            description: `OpenAI model (created: ${new Date(model.created * 1000).toLocaleDateString()})`,
            provider: "openai",
            created: model.created,
            owned_by: model.owned_by
        }));
    } catch (error) {
        console.error("Error fetching OpenAI models:", error);
        throw error;
    }
}

/**
 * Fetches available models from Gemini API.
 * @param {string} apiKey The Gemini API key.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of model objects.
 */
export async function fetchGeminiModels(apiKey) {
    if (!apiKey) {
        throw new Error("Gemini API key is required to fetch models.");
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        
        // Transform Gemini model format to our internal format
        return data.models
            .filter(model => model.supportedGenerationMethods?.includes('generateContent'))
            .map(model => {
                // Extract model ID from the full name (e.g., "models/gemini-pro" -> "gemini-pro")
                const modelId = model.name.replace('models/', '');
                return {
                    id: modelId,
                    name: model.displayName || modelId,
                    description: model.description || "Google Gemini model",
                    provider: "gemini",
                    supportedGenerationMethods: model.supportedGenerationMethods
                };
            });
    } catch (error) {
        console.error("Error fetching Gemini models:", error);
        throw error;
    }
}

/**
 * Generates AI suggestions based on the provided text, query, context, and model.
 * @param {string} text The original text to modify.
 * @param {string} query The user's request for changes.
 * @param {string} context Additional context for the AI.
 * @param {Object} modelInfo The selected AI model object (must include id and provider).
 * @param {string} apiKey The API key for the selected model's provider.
 * @param {number} n The number of suggestions to generate.
 * @param {string|null} mockSuggestion If provided, returns this as a mock suggestion (for debug mode).
 * @returns {Promise<{suggestions: Array<string>, tokensUsed: number}>} A promise that resolves to an array of suggestions and tokens used.
 */
export async function getAISuggestions(text, query, context, modelInfo, apiKey, n, mockSuggestion = null) {
    console.log(`AI Service: Requesting ${n} suggestions for model ${modelInfo.id}. Debug mock: ${!!mockSuggestion}`);

    if (mockSuggestion) {
        const mockSuggestions = Array(n).fill(mockSuggestion);
        // For mock, we can estimate tokens or return 0
        const estimatedTokens = countTokens(text + query + context + mockSuggestion, modelInfo.id);
        console.log("AI Service: Using mock suggestion(s):", mockSuggestions);
        return { suggestions: mockSuggestions, tokensUsed: estimatedTokens * n }; // Or 0 for mock
    }

    if (!apiKey) {
        throw new Error(`API key for ${modelInfo.provider} is missing.`);
    }

    let suggestions = [];
    let totalTokensUsed = 0;

    // Construct a common prompt structure
    const basePrompt = `Original text:\n"""${text}"""\n\nUser request: "${query}"`;
    // Update prompt to include number of suggestions and instruction for no extra considerations
    const fullPrompt = context ?
        `${basePrompt}\n\nAdditional context (do not modify this part, only use for reference):\n"""${context}"""\n\nGenerate exactly ${n} distinct, modified version(s) of the original text based on the user request and context. Provide the response as a JSON object with a single key "suggestions" whose value is a JSON array of strings. Do not add any additional considerations, just modify the text. Wrap the JSON object in triple backticks.` :
        `${basePrompt}\n\nGenerate exactly ${n} distinct, modified version(s) of the original text based on the user request. Provide the response as a JSON object with a single key "suggestions" whose value is a JSON array of strings. Do not add any additional considerations, just modify the text. Wrap the JSON object in triple backticks.`;

    // Placeholder: Simple token counting for the prompt itself
    totalTokensUsed += countTokens(fullPrompt, modelInfo.id);

    try {
        if (modelInfo.provider === 'gemini') {
            console.log("AI Service: Calling Gemini API with JSON schema...");
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelInfo.id}:generateContent?key=${apiKey}`;

            // Define the schema for an array of strings
            const responseSchema = {
                type: "ARRAY",
                items: {
                    type: "STRING"
                }
            };

            const geminiResponse = await fetch(geminiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: fullPrompt
                        }]
                    }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: responseSchema // Use the defined schema
                    }
                })
            });

            if (!geminiResponse.ok) {
                const errorBody = await geminiResponse.text();
                throw new Error(`Gemini API error: ${geminiResponse.status} - ${geminiResponse.statusText}\n${errorBody}`);
            }

            const geminiData = await geminiResponse.json();

            // Parse and validate JSON response
            if (geminiData.candidates && geminiData.candidates.length > 0 && geminiData.candidates[0].content && geminiData.candidates[0].content.parts && geminiData.candidates[0].content.parts[0].text) {
                try {
                    const jsonResponse = JSON.parse(geminiData.candidates[0].content.parts[0].text);
                    if (Array.isArray(jsonResponse) && jsonResponse.every(item => typeof item === 'string')) {
                        suggestions = jsonResponse.slice(0, n); // Take up to n suggestions
                        if (suggestions.length < n) {
                             console.warn(`Gemini API returned ${suggestions.length} suggestions, less than requested ${n}.`);
                             // Pad with placeholder if less than n suggestions received
                             while (suggestions.length < n) {
                                 suggestions.push(`[Less than ${n} Gemini suggestions for '${query}']`);
                             }
                        }
                    } else {
                        console.error("Gemini API returned invalid JSON format:", jsonResponse);
                        suggestions = Array(n).fill(`[Gemini API returned invalid JSON for '${query}']`);
                    }
                } catch (parseError) {
                    console.error("Failed to parse Gemini API JSON response:", parseError);
                    suggestions = Array(n).fill(`[Failed to parse Gemini JSON for '${query}']`);
                }
            } else {
                 console.warn("Gemini API call returned no candidates or content.");
                 suggestions = Array(n).fill(`[No Gemini suggestions for '${query}']`);
            }

            // Estimate tokens from response metadata if available, otherwise use rough estimate
            totalTokensUsed = geminiData.usageMetadata ? geminiData.usageMetadata.totalTokenCount : countTokens(suggestions.join(' '), modelInfo.id);

        } else if (modelInfo.provider === 'openai') {
            console.log("AI Service: Calling OpenAI API...");
            const openaiUrl = 'https://api.openai.com/v1/chat/completions';
            const openaiResponse = await fetch(openaiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: modelInfo.id,
                    messages: [
                        { role: "user", content: fullPrompt }
                    ],
                    response_format: { type: "json_object" }, // Request JSON object output
                    n: 1 // Request only 1 completion containing the JSON object
                })
            });

             if (!openaiResponse.ok) {
                const errorBody = await openaiResponse.text();
                throw new Error(`OpenAI API error: ${openaiResponse.status} - ${openaiResponse.statusText}\n${errorBody}`);
            }

            const openaiData = await openaiResponse.json();

            // Parse and validate JSON response from OpenAI
            if (openaiData.choices && openaiData.choices.length > 0 && openaiData.choices[0].message && openaiData.choices[0].message.content) {
                try {
                    // Extract JSON string from content (assuming it's wrapped in ```json ... ``` or similar)
                    const content = openaiData.choices[0].message.content;
                    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                    const jsonString = jsonMatch ? jsonMatch[1] : content;
                    
                    const jsonResponse = JSON.parse(jsonString);
                    
                    // Validate the structure: must be an object with a 'suggestions' key containing an array of strings
                    if (typeof jsonResponse === 'object' && jsonResponse !== null && Array.isArray(jsonResponse.suggestions) && jsonResponse.suggestions.every(item => typeof item === 'string')) {
                        suggestions = jsonResponse.suggestions.slice(0, n); // Take up to n suggestions from the array
                        if (suggestions.length < n) {
                            console.warn(`OpenAI API returned ${suggestions.length} suggestions within the JSON, less than requested ${n}.`);
                            // Pad with placeholder if less than n suggestions received
                            while (suggestions.length < n) {
                                suggestions.push(`[Less than ${n} OpenAI suggestions for '${query}']`);
                            }
                        }
                    } else {
                        console.error("OpenAI API returned invalid JSON format or structure:", jsonResponse);
                        suggestions = Array(n).fill(`[OpenAI API returned invalid JSON for '${query}']`);
                    }
                } catch (parseError) {
                    console.error("Failed to parse OpenAI API JSON response:", parseError);
                    suggestions = Array(n).fill(`[Failed to parse OpenAI JSON for '${query}']`);
                }
            } else {
                 console.warn("OpenAI API call returned no choices or content.");
                  suggestions = Array(n).fill(`[No OpenAI suggestions for '${query}']`);
            }

            // Use actual token count from response if available, otherwise use rough estimate
            totalTokensUsed = openaiData.usage ? openaiData.usage.total_tokens : countTokens(suggestions.join(' '), modelInfo.id); // Corrected access based on typical OpenAI response

        } else {
            throw new Error(`Unsupported AI provider: ${modelInfo.provider}`);
        }

        console.log("AI Service: Generated suggestions:", suggestions, "Tokens used:", totalTokensUsed);
        return { suggestions, tokensUsed: totalTokensUsed };

    } catch (error) {
        console.error(`AI Service: Error during API call to ${modelInfo.provider}:`, error);
        throw error; // Re-throw the error to be caught by the caller
    }
}

/**
 * Counts tokens in a given string. This is a very basic placeholder.
 * Real token counting depends on the specific model and its tokenizer.
 * For accurate counting, use the respective client libraries (e.g., tiktoken for OpenAI).
 * @param {string} text The text to count tokens for.
 * @param {string} modelId The ID of the model (used to potentially apply model-specific rules).
 * @returns {number} An estimated token count.
 */
export function countTokens(text, modelId) {
    if (!text) return 0;
    // Extremely rough estimate: 1 token ~ 4 chars in English
    // This is a placeholder and NOT ACCURATE for billing or precise limits.
    const charCount = text.length;
    let tokenEstimate = Math.ceil(charCount / 4);

    // Add a small base cost per call, as some models might have this implicitly
    tokenEstimate += 5; // Small arbitrary overhead

    // console.log(`Token count (estimate) for model ${modelId}, text "${text.substring(0,30)}...": ${tokenEstimate}`);
    return tokenEstimate;
}

// --- Placeholder API call functions (to be implemented) ---
// async function callGeminiAPI(prompt, apiKey, modelId, n) {
//     // Actual Gemini API call using fetch or a client library
//     // Refer to Google AI Gemini API documentation
//     // This would involve setting up the request body, headers, and handling the response.
//     // The response needs to be parsed to extract `n` suggestions and token count.
//     return { suggestions: [`Gemini response for ${modelId}`], tokens: 50 }; // Placeholder
// }

// async function callOpenAIAPI(prompt, apiKey, modelId, n) {
//     // Actual OpenAI API call using fetch or openai-node library
//     // Refer to OpenAI API documentation
//     // This would involve setting up the request body, headers, and handling the response.
//     // The response needs to be parsed to extract `n` suggestions and token count.
//     return { suggestions: [`OpenAI response for ${modelId}`], tokens: 50 }; // Placeholder
// }

console.log("WrAIter: ai_service.js loaded"); 