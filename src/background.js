const jsonTabs = new Set();

chrome.webRequest.onHeadersReceived.addListener(
    details => {
        if (details.tabId < 0) return;

        const contentType = details.responseHeaders?.find(h => h.name.toLowerCase() === 'content-type');

        if (contentType && /application\/([a-z.+-]+\+)?json/i.test(contentType.value)) {
            jsonTabs.add(details.tabId);
        }
    },
    { urls: ['<all_urls>'], types: ['main_frame'] },
    ['responseHeaders']
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'CHECK_JSON') {
        const tabId = sender.tab?.id;
        sendResponse({ isJson: jsonTabs.has(tabId) });
    }
});

chrome.tabs.onRemoved.addListener(tabId => jsonTabs.delete(tabId));
