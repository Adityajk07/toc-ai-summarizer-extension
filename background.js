// background.js

// Function to call the Gemini API for summarization
async function callGeminiApi(contentToSummarize) {
    // UPDATED PROMPT: Shorter and easier to understand, as per user's request
    const prompt = `Summarize the following Terms and Conditions or legal document in a concise, easy-to-understand manner, highlighting key points, user obligations, data privacy, and termination clauses. Make it under 200 words and highlight important points and format it in an easy to understand, not boring manner.Use bullet points bold text etc where relevant`;

    let chatHistory = [];
    chatHistory.push({ role: "user", parts: [{ text: prompt + '\n\n' + contentToSummarize }] }); // Concatenate prompt and content

    const payload = { contents: chatHistory };
    // IMPORTANT: Make sure to replace "YOUR_GENERATED_GEMINI_API_KEY_HERE" with your actual API Key!
    const apiKey = "AIzaSyA7IPJirHirIAHv8y4l5bvO2VlZuYP41Ys"; //this one is fake chill no leaks here
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    try {
        const apiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!apiResponse.ok) {
            const errorData = await apiResponse.json();
            throw new Error(`API error: ${apiResponse.status} - ${errorData.error.message || apiResponse.statusText}`);
        }

        const result = await apiResponse.json();

        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            return { success: true, summary: result.candidates[0].content.parts[0].text };
        } else {
            return { success: false, error: 'No summary returned from AI.' };
        }
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        return { success: false, error: `Failed to summarize: ${error.message}` };
    }
}

// Listener for manual summarization request from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'summarizeCurrentPage') {
        // Get the active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) {
                sendResponse({ success: false, error: 'No active tab found.' });
                return;
            }
            const activeTab = tabs[0];

            // Inject the content script to get fresh page content
            chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                files: ['content.js'] // Re-inject content.js to ensure it's up-to-date and runs extractPageContent
            }, () => {
                if (chrome.runtime.lastError) {
                    sendResponse({ success: false, error: `Script injection failed: ${chrome.runtime.lastError.message}` });
                    return;
                }
                // Once content.js is injected, send a message to it to get the page content
                chrome.tabs.sendMessage(activeTab.id, { action: 'getPageContent' }, async (response) => {
                    if (chrome.runtime.lastError) {
                        sendResponse({ success: false, error: `Failed to get page content: ${chrome.runtime.lastError.message}` });
                        return;
                    }

                    const pageContent = response.content;

                    if (!pageContent || pageContent.trim().length === 0) {
                        sendResponse({ success: false, error: 'Could not extract relevant text from the page. Is it a Terms & Conditions page?' });
                        return;
                    }

                    // Truncate content if it's too long for the API (e.g., 100,000 characters)
                    const MAX_CONTENT_LENGTH = 100000;
                    const contentToSummarize = pageContent.length > MAX_CONTENT_LENGTH
                        ? pageContent.substring(0, MAX_CONTENT_LENGTH)
                        : pageContent;

                    const apiResult = await callGeminiApi(contentToSummarize);
                    if (apiResult.success) {
                        // Store summary for popup to retrieve later
                        chrome.storage.local.set({ 'currentTOCSummary': apiResult.summary }, () => {
                            sendResponse(apiResult); // Send summary back to popup
                        });
                    } else {
                        sendResponse(apiResult);
                    }
                });
            });
        });
        return true; // Indicate asynchronous response
    }
});

