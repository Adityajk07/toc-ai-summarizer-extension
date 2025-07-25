// content.js

// Define keywords to look for to identify T&C pages
const termsKeywords = [
    'terms and conditions',
    'terms of service',
    'privacy policy',
    'legal notice',
    'disclaimer',
    'user agreement',
    'cookie policy',
    'acceptable use policy',
    'eula', // End User License Agreement
    'imprint', // Common in European sites
    'terms & conditions' // Common variation
];

// Define common selectors for elements that might contain T&C content
// Ordered by likelihood/specificity
const contentSelectors = [
    'main',
    'article',
    'section',
    'div[id*="terms"]',
    'div[class*="terms"]',
    'div[id*="policy"]',
    'div[class*="policy"]',
    'div[id*="legal"]',
    'div[class*="legal"]',
    'div[role="main"]',
    'div.content',
    'div.main-content',
    'div.text-content',
    'iframe' // Check for iframes, though content access might be restricted by CORS
];

/**
 * Extracts relevant text content from the current page based on keywords and selectors.
 * @returns {string} The extracted text content, or an empty string if not found.
 */
function extractPageContent() {
    let extractedContent = '';
    let keywordFound = false;

    // Step 1: Check if any of the keywords are present on the page at all
    const pageTextLower = document.body.innerText.toLowerCase();
    for (const keyword of termsKeywords) {
        if (pageTextLower.includes(keyword)) {
            keywordFound = true;
            break;
        }
    }

    // If no relevant keywords are found on the entire page, return empty content
    if (!keywordFound) {
        return '';
    }

    // Step 2: If keywords are found, try to find a specific, relevant container
    for (const selector of contentSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
            // For iframes, try to access content if it's same-origin
            if (element.tagName.toLowerCase() === 'iframe') {
                try {
                    const iframeDoc = element.contentDocument || element.contentWindow.document;
                    if (iframeDoc && iframeDoc.body) {
                        const iframeText = iframeDoc.body.innerText;
                        // Check if iframe content contains keywords
                        for (const keyword of termsKeywords) {
                            if (iframeText.toLowerCase().includes(keyword)) {
                                extractedContent = iframeText;
                                break; // Found content in iframe, break from keyword loop
                            }
                        }
                        if (extractedContent) break; // Found content in iframe, break from element loop
                    }
                } catch (e) {
                    // Cross-origin iframe, cannot access content
                    console.warn('TOC Summarizer: Could not access iframe content due to CORS:', e);
                }
            } else {
                // For other elements, check their innerText
                const elementText = element.innerText;
                // Ensure element has substantial text and contains keywords
                if (elementText && elementText.length > 100) {
                    const elementTextLower = elementText.toLowerCase();
                    for (const keyword of termsKeywords) {
                        if (elementTextLower.includes(keyword)) {
                            extractedContent = elementText;
                            break; // Found content in element, break from keyword loop
                        }
                    }
                    if (extractedContent) break; // Found content in element, break from element loop
                }
            }
        }
        if (extractedContent) break; // Found content in a selector, break from selector loop
    }

    // Step 3: Fallback if no specific container was found, but keywords were present
    if (!extractedContent && keywordFound) {
        extractedContent = document.body.innerText;
    }

    return extractedContent;
}

// Listener for messages from background script (e.g., manual trigger)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getPageContent') {
        const content = extractPageContent();
        sendResponse({ success: true, content: content });
    }
    // Return true to indicate that sendResponse will be called asynchronously
    return true;
});
