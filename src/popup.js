const getSystemTheme = () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

const applyPopupTheme = themeSetting => {
    const actualTheme = themeSetting === 'auto' ? getSystemTheme() : themeSetting === 'vs-dark' ? 'dark' : 'light';
    document.body.dataset.popupTheme = actualTheme;
};

// 系统主题变化时，如果是 auto 模式就更新 popup
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
    const { theme = 'auto' } = await chrome.storage.local.get('theme');
    if (theme === 'auto') {
        applyPopupTheme(theme);
    }
});

// DOM 加载完成后初始化事件
window.addEventListener('DOMContentLoaded', () => {
    const themeButtons = document.querySelectorAll('.segmented-item');
    const markdownToggle = document.getElementById('markdownToggle');

    // 读取当前设置
    const loadSettings = async () => {
        const { theme = 'auto', markdownPreview = false } = await chrome.storage.local.get(['theme', 'markdownPreview']);

        // 更新 popup 自己的主题
        applyPopupTheme(theme);

        // 更新主题按钮状态
        themeButtons.forEach(btn => {
            if (btn.dataset.theme === theme) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // 更新 markdown 预览开关状态
        if (markdownPreview) {
            markdownToggle.classList.add('active');
        } else {
            markdownToggle.classList.remove('active');
        }
    };

    // 主题切换
    themeButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const theme = btn.dataset.theme;
            await chrome.storage.local.set({ theme });
            loadSettings();
            // 给当前标签页发消息，更新主题
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) {
                // 忽略非代码页面的发送错误
                chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_THEME', theme }).catch(() => {});
            }
        });
    });

    // Markdown 预览切换
    markdownToggle.addEventListener('click', async () => {
        const isActive = markdownToggle.classList.toggle('active');
        await chrome.storage.local.set({ markdownPreview: isActive });
        // 给当前标签页发消息，更新预览
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_MARKDOWN_PREVIEW', markdownPreview: isActive }).catch(() => {});
        }
    });

    // 初始化
    loadSettings();
});
