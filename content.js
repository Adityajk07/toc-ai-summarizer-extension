// ========================
//  CONTENT SCRIPT (DEBUG)
// ========================
console.log('%c[content.js] Loaded', 'color:#00eaff;font-weight:bold;');

//
// DEBUG OVERLAY (visible on page)
//
function showDebugOverlay(text) {
  try {
    let box = document.getElementById('__toc_debug_overlay');
    if (!box) {
      box = document.createElement('div');
      box.id = '__toc_debug_overlay';
      box.style.position = 'fixed';
      box.style.bottom = '10px';
      box.style.right = '10px';
      box.style.maxWidth = '350px';
      box.style.zIndex = 9999999;
      box.style.background = 'rgba(0,0,0,0.75)';
      box.style.color = '#00eaff';
      box.style.padding = '10px';
      box.style.border = '1px solid #00eaff';
      box.style.borderRadius = '8px';
      box.style.fontSize = '12px';
      box.style.fontFamily = 'monospace';
      box.style.whiteSpace = 'pre-wrap';
      box.style.pointerEvents = 'none';
      document.body.appendChild(box);
    }
    box.textContent = text;
  } catch (err) {
    console.warn('debug overlay failed', err);
  }
}

//
// Send logs to background
//
function log(msg) {
  console.log('%c[content.js] ' + msg, 'color:#0ff');
  chrome.runtime.sendMessage({ debugLog: msg });
  showDebugOverlay(msg);
}

//
// CONFIG
//
const termsKeywords = [
  'terms', 'terms and conditions', 'terms of service', 'terms & conditions',
  'privacy policy', 'policy', 'legal', 'disclaimer', 'user agreement'
];

const selectors = [
  'main','article','section','footer','header','nav','p',
  'div[id*="terms"]','div[class*="terms"]',
  'div[id*="policy"]','div[class*="policy"]',
  'div[id*="legal"]','div[class*="legal"]',
  'div[role="main"]','div.content','div.text','div.main-content',
  'iframe'
];

//
// Extract attempt (single)
//
function extractOnce() {
  log('🟦 Running extractOnce()');

  const bodyText = document.body?.innerText || '';
  if (!bodyText) {
    log('❌ bodyText empty');
    return { content: '', reason: 'empty_body' };
  }

  const lowerBody = bodyText.toLowerCase();
  const keywordMatched = termsKeywords.some(k => lowerBody.includes(k));

  if (!keywordMatched) {
    log('❌ No keywords found in whole body');
    return { content: '', reason: 'keyword_missing' };
  }
  log('✅ Keyword detected in body');

  // Try each selector
  for (const sel of selectors) {
    const nodes = document.querySelectorAll(sel);
    if (nodes.length) log(`🔍 selector "${sel}" matched ${nodes.length} nodes`);

    for (const node of nodes) {
      if (!node) continue;

      // iframe handling
      if (node.tagName?.toLowerCase() === 'iframe') {
        try {
          const doc = node.contentDocument || node.contentWindow?.document;
          const txt = doc?.body?.innerText || '';
          if (txt && txt.length > 40 && termsKeywords.some(k => txt.toLowerCase().includes(k))) {
            log('🟩 extracted from SAME-ORIGIN iframe');
            return { content: txt, reason: 'iframe_extract' };
          }
        } catch (err) {
          log('⚠ iframe CORS blocked');
        }
        continue;
      }

      // normal element
      const txt = node.innerText?.trim() || '';
      if (!txt) continue;

      const lower = txt.toLowerCase();
      if (lower.length > 40 && termsKeywords.some(k => lower.includes(k))) {
        log(`🟩 extracted from selector "${sel}"`);
        return { content: txt, reason: 'selector_match' };
      }
    }
  }

  log('⚠ No selector matched content -> fallback to body');
  return { content: bodyText, reason: 'fallback_whole_body' };
}

//
// Attempt extraction with retry for SPAs
//
async function extractContent() {
  log('▶ extractContent() started');
  const MAX_RETRIES = 12;
  for (let i = 0; i < MAX_RETRIES; i++) {
    const result = extractOnce();
    if (result.content) {
      log(`🟩 extract success at attempt ${i + 1}, reason=${result.reason}`);
      return result;
    }
    log(`⏳ retrying... (${i + 1}/${MAX_RETRIES})`);
    await new Promise(r => setTimeout(r, 150));
  }
  log('❌ FAILED after retries');
  return { content: '', reason: 'failed_all_retries' };
}

//
// Listen from background
//
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === 'getPageContent') {
    extractContent()
      .then(r => sendResponse({ success: true, content: r.content, reason: r.reason }))
      .catch(err => {
        log('❌ Error: ' + err);
        sendResponse({ success: false, error: String(err) });
      });
    return true;
  }
});
