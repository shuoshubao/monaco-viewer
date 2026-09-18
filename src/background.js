chrome.webRequest.onHeadersReceived.addListener(
    details => {
        if (details.tabId < 0) return;

        const contentType = details.responseHeaders?.find(h => h.name.toLowerCase() === 'content-type');

        if (contentType && /application\/([a-z.+-]+\+)?json/i.test(contentType.value)) {
            const viewerUrl = chrome.runtime.getURL('viewer.html') + '?url=' + encodeURIComponent(details.url);
            chrome.tabs.update(details.tabId, { url: viewerUrl });
        }
    },
    { urls: ['<all_urls>'], types: ['main_frame'] },
    ['responseHeaders']
);
