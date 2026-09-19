const tabTypes = new Map();

const contentTypes = {
    json: /application\/([a-z.+-]+\+)?json/i,
    javascript: /(application|text)\/(x-)?javascript/i,
    typescript: /(application|text)\/(x-)?typescript/i,
    css: /text\/css/i,
    less: /text\/(x-)?less/i,
    scss: /text\/(x-)?s[ac]ss/i,
    yaml: /(application|text)\/(x-)?ya?ml/i,
    markdown: /text\/(x-)?markdown/i
};

chrome.webRequest.onHeadersReceived.addListener(
    details => {
        if (details.tabId < 0) {
            return;
        }

        const contentType = details.responseHeaders?.find(h => h.name.toLowerCase() === 'content-type');

        if (!contentType) {
            return;
        }

        for (const [type, regex] of Object.entries(contentTypes)) {
            if (regex.test(contentType.value)) {
                tabTypes.set(details.tabId, type);
                break;
            }
        }
    },
    { urls: ['<all_urls>'], types: ['main_frame'] },
    ['responseHeaders']
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'CHECK_TYPE') {
        const tabId = sender.tab?.id;
        sendResponse({ type: tabTypes.get(tabId) });
    }
});

chrome.tabs.onRemoved.addListener(tabId => tabTypes.delete(tabId));
