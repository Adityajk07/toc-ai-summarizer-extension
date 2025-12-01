// background.js (V2 using OpenAI verify endpoint)
console.log('🟢 background SW loaded - TOC Summarizer (OpenAI verify)');

const VERIFY_OPENAI_URL = 'http://localhost:3000/api/verify-with-openai';

// helper to retry sending message to content script (existing)
function sendMessageToTabWithRetry(tabId, msg, attempts = 8, delay = 80) {
  return new Promise((resolve) => {
    let tries = 0;
    function attempt() {
      chrome.tabs.sendMessage(tabId, msg, (resp) => {
        const lastErr = chrome.runtime.lastError && chrome.runtime.lastError.message;
        console.log(`background: sendMessage attempt ${tries + 1}, lastError=`, lastErr);
        if (!lastErr) return resolve(resp);
        tries++;
        if (tries < attempts && /Receiving end does not exist/.test(lastErr)) {
          return setTimeout(attempt, delay);
        }
        return resolve(null);
      });
    }
    attempt();
  });
}

/* Gemni proxy calling preserved from V1 (keeps existing behavior) */
async function callGeminiApi(contentToSummarize) {
  const PROXY_URL = 'http://localhost:3000/proxy/gemini';
  const prompt = `Summarize the following Terms and Conditions or legal document in a concise, easy-to-understand manner, highlighting key points, user obligations, data privacy, and termination clauses. Make it under 200 words and highlight important points and format it in an easy to understand, not boring manner. Use bullet points, bold text etc where relevant.`;

  const chatHistory = [{ role: "user", parts: [{ text: prompt + '\n\n' + contentToSummarize }] }];
  const payload = { contents: chatHistory };

  try {
    const apiResponse = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!apiResponse.ok) {
      const t = await apiResponse.text();
      throw new Error(`Proxy/API error: ${apiResponse.status} - ${t}`);
    }
    const result = await apiResponse.json();
    if (result && result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts[0]) {
      return { success: true, summary: result.candidates[0].content.parts[0].text };
    } else {
      return { success: false, error: 'No summary returned from Gemini (proxy).' };
    }
  } catch (err) {
    console.error('background: Error calling Gemini proxy:', err);
    return { success: false, error: String(err) };
  }
}

/* Call server-side OpenAI verify endpoint (recommended; keys stay on server) */
async function callOpenAIVerify(contentToSummarize) {
  try {
    const resp = await fetch(VERIFY_OPENAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: contentToSummarize })
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`verify API error ${resp.status}: ${t}`);
    }
    const j = await resp.json();
    // j expected: { gemini_summary, openai_summary, confidence, raw_similarity, provenance }
    if (!j || typeof j.gemini_summary === 'undefined') {
      console.warn('background: verify returned unexpected payload, falling back to Gemini');
      return await callGeminiApi(contentToSummarize);
    }
    return { success: true, gemini_summary: j.gemini_summary, openai_summary: j.openai_summary || null, confidence: (typeof j.confidence === 'number') ? j.confidence : 0, provenance: j.provenance || {} };
  } catch (err) {
    console.error('background: callOpenAIVerify failed, falling back to Gemini proxy', err);
    // fallback to original V1
    return await callGeminiApi(contentToSummarize);
  }
}

/* Message listener that triggers summarization */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'summarizeCurrentPage') {
    console.log('background: received summarizeCurrentPage request from popup', request);
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs.length === 0) {
        sendResponse({ success: false, error: 'No active tab found.' });
        return;
      }
      const activeTab = tabs[0];

      // inject content.js into all frames
      chrome.scripting.executeScript({
        target: { tabId: activeTab.id, allFrames: true },
        files: ['content.js']
      }, async () => {
        // use retry sender
        const response = await sendMessageToTabWithRetry(activeTab.id, { action: 'getPageContent' }, 10, 100);
        if (!response) {
          sendResponse({ success: false, error: 'No response from content script' });
          return;
        }
        const pageContent = response.content;
        if (!pageContent || !pageContent.trim()) {
          sendResponse({ success: false, error: 'Could not extract relevant text from the page.' });
          return;
        }
        const MAX_CONTENT_LENGTH = 100000;
        const contentToSummarize = pageContent.length > MAX_CONTENT_LENGTH ? pageContent.substring(0, MAX_CONTENT_LENGTH) : pageContent;

        // Call server verify (OpenAI)
        const apiResult = await callOpenAIVerify(contentToSummarize);

        if (apiResult.success) {
          const geminiSummary = apiResult.gemini_summary || null;
          const openaiSummary = apiResult.openai_summary || null;
          const confidence = apiResult.confidence || 0;
          const provenance = apiResult.provenance || {};

          chrome.storage.local.set({
            'currentTOCSummary': geminiSummary,
            'currentTOCConfidence': confidence,
            'currentTOCOpenAISummary': openaiSummary,
            'currentTOCProvenance': provenance
          }, () => {
            sendResponse({ success: true, summary: geminiSummary, confidence, openai_summary: openaiSummary });
          });
        } else {
          // fallback case: apiResult may be from callGeminiApi
          if (apiResult.summary) {
            chrome.storage.local.set({ 'currentTOCSummary': apiResult.summary }, () => {
              sendResponse({ success: true, summary: apiResult.summary, confidence: 0 });
            });
          } else {
            sendResponse({ success: false, error: apiResult.error || 'Unknown error' });
          }
        }
      });
    });
    return true; // keep channel open
  }
});
