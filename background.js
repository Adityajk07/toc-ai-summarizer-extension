// background.js (full replacement)
// DEBUGGING + robust message flow + proxy usage

// Top-level debug log so we know the SW loaded
console.log('🟢 background SW loaded - TOC Summarizer');

const PROXY_URL = 'http://localhost:3000/proxy/gemini'; // update if you changed port

// small safe helper for sending messages to a tab with retries (handles race)
function sendMessageToTabWithRetry(tabId, msg, attempts = 8, delay = 80) {
  return new Promise((resolve) => {
    let tries = 0;
    function attempt() {
      chrome.tabs.sendMessage(tabId, msg, (resp) => {
        const lastErr = chrome.runtime.lastError && chrome.runtime.lastError.message;
        console.log(`background: sendMessage attempt ${tries + 1}, lastError=`, lastErr, 'resp=', resp);
        if (!lastErr) return resolve(resp);
        tries++;
        if (tries < attempts && /Receiving end does not exist/.test(lastErr)) {
          return setTimeout(attempt, delay);
        }
        // give up
        return resolve(null);
      });
    }
    attempt();
  });
}

// call Gemini via local proxy (payload is the same shape you used)
async function callGeminiApi(contentToSummarize) {
  const prompt = `Summarize the following Terms and Conditions or legal document in a concise, easy-to-understand manner, highlighting key points, user obligations, data privacy, and termination clauses. Make it under 200 words and highlight important points and format it in an easy to understand, not boring manner. Use bullet points, bold text etc where relevant.`;

  const chatHistory = [{ role: "user", parts: [{ text: prompt + '\n\n' + contentToSummarize }] }];
  const payload = { contents: chatHistory };

  try {
    console.log('background: calling proxy', PROXY_URL, 'payload_length=', JSON.stringify(payload).length);
    const apiResponse = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!apiResponse.ok) {
      let errText;
      try { errText = await apiResponse.json(); } catch (e) { errText = await apiResponse.text(); }
      throw new Error(`Proxy/API error: ${apiResponse.status} - ${JSON.stringify(errText)}`);
    }

    const result = await apiResponse.json();
    console.log('background: proxy returned result keys=', Object.keys(result || {}));

    if (result && result.candidates && result.candidates.length > 0 &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0) {
      return { success: true, summary: result.candidates[0].content.parts[0].text };
    } else {
      return { success: false, error: 'No summary returned from AI.' };
    }
  } catch (error) {
    console.error('background: Error calling Gemini API via proxy:', error);
    return { success: false, error: `Failed to summarize: ${error.message}` };
  }
}

// Listener for manual summarization request from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'summarizeCurrentPage') {
    console.log('background: received summarizeCurrentPage request from popup', request);

    // Get the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs.length === 0) {
        console.error('background: no active tab found');
        sendResponse({ success: false, error: 'No active tab found.' });
        return;
      }
      const activeTab = tabs[0];
      console.log('background: activeTab id=', activeTab.id, 'url=', activeTab.url);

      // inject content.js into all frames of the tab (helps if TOC is inside iframe)
      chrome.scripting.executeScript({
        target: { tabId: activeTab.id, allFrames: true },
        files: ['content.js']
      }, async () => {
        console.log('background: executeScript callback; lastError=', chrome.runtime.lastError && chrome.runtime.lastError.message);

        // Use retry sender to avoid race between injection and listener registration
        const response = await sendMessageToTabWithRetry(activeTab.id, { action: 'getPageContent' }, 10, 100);
        console.log('background: final response from content script =', response);

        if (!response) {
          console.error('background: no response from content script after retries');
          sendResponse({ success: false, error: 'No response from content script' });
          return;
        }

        const pageContent = response.content;
        if (!pageContent || pageContent.trim().length === 0) {
          console.warn('background: content script returned empty content');
          sendResponse({ success: false, error: 'Could not extract relevant text from the page.' });
          return;
        }

        const MAX_CONTENT_LENGTH = 100000;
        const contentToSummarize = pageContent.length > MAX_CONTENT_LENGTH
          ? pageContent.substring(0, MAX_CONTENT_LENGTH)
          : pageContent;

        // call proxy -> Gemini
        const apiResult = await callGeminiApi(contentToSummarize);

        if (apiResult.success) {
          // Store summary for popup to retrieve later
          chrome.storage.local.set({ 'currentTOCSummary': apiResult.summary }, () => {
            console.log('background: stored summary, sending response to popup');
            sendResponse(apiResult);
          });
        } else {
          console.error('background: apiResult failure', apiResult);
          sendResponse(apiResult);
        }
      });

    });

    // Keep the message channel open for async sendResponse
    return true;
  }
});
