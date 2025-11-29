// content.js (full replacement with logs and robust extract)
console.log('content.js loaded - listener registering');

const termsKeywords = [
  'terms and conditions','terms of service','privacy policy','legal notice','disclaimer',
  'user agreement','cookie policy','acceptable use policy','eula','imprint','terms & conditions'
];

const contentSelectors = [
  'main','article','section','div[id*="terms"]','div[class*="terms"]','div[id*="policy"]',
  'div[class*="policy"]','div[id*="legal"]','div[class*="legal"]','div[role="main"]',
  'div.content','div.main-content','div.text-content','iframe'
];

function extractPageContent() {
  console.log('content.js: extractPageContent running');
  let extractedContent = '';
  let keywordFound = false;

  const bodyText = document.body && document.body.innerText ? document.body.innerText : '';
  const pageTextLower = bodyText.toLowerCase();
  for (const keyword of termsKeywords) {
    if (pageTextLower.includes(keyword)) {
      keywordFound = true;
      break;
    }
  }

  if (!keywordFound) {
    console.log('content.js: no keywords found on page');
    return '';
  }

  for (const selector of contentSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      if (!element) continue;
      if (element.tagName && element.tagName.toLowerCase() === 'iframe') {
        try {
          const iframeDoc = element.contentDocument || (element.contentWindow && element.contentWindow.document);
          if (iframeDoc && iframeDoc.body) {
            const iframeText = iframeDoc.body.innerText || '';
            for (const keyword of termsKeywords) {
              if (iframeText.toLowerCase().includes(keyword)) {
                extractedContent = iframeText;
                break;
              }
            }
            if (extractedContent) break;
          }
        } catch (e) {
          // cross-origin iframe
          console.warn('content.js: cannot access iframe due to CORS', e);
        }
      } else {
        const elementText = element.innerText || '';
        if (elementText && elementText.length > 100) {
          const elementTextLower = elementText.toLowerCase();
          for (const keyword of termsKeywords) {
            if (elementTextLower.includes(keyword)) {
              extractedContent = elementText;
              break;
            }
          }
          if (extractedContent) break;
        }
      }
    }
    if (extractedContent) break;
  }

  if (!extractedContent && keywordFound) {
    console.log('content.js: fallback to whole body text');
    extractedContent = bodyText;
  }

  console.log('content.js: extracted length=', extractedContent ? extractedContent.length : 0);
  return extractedContent;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('content.js got message:', request, 'from', sender && sender.tab ? sender.tab.id : sender);
  if (request.action === 'getPageContent') {
    const content = extractPageContent();
    // sendResponse with object to match background's expectation
    sendResponse({ success: true, content });
    // synchronous response here; return false would be OK, but return true to allow asynchronicity if you later change
    return true;
  }
  return true;
});
