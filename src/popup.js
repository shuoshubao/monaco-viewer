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

// 把源 URL 的 cookie 复制到目标 URL
const copyCookies = async (sourceUrl, targetUrl) => {
    const cookies = await chrome.cookies.getAll({ url: sourceUrl });
    let ok = 0;
    let fail = 0;
    for (const cookie of cookies) {
        const details = {
            url: targetUrl,
            name: cookie.name,
            value: cookie.value,
            path: cookie.path,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            sameSite: cookie.sameSite
        };
        // 会话 cookie 没有过期时间，带上会报错
        if (!cookie.session) {
            details.expirationDate = cookie.expirationDate;
        }
        try {
            const result = await chrome.cookies.set(details);
            result ? ok++ : fail++;
        } catch {
            // 比如 secure cookie 写到 http、或 sameSite=none 但非 https 时会失败，跳过
            fail++;
        }
    }
    return { total: cookies.length, ok, fail };
};

// DOM 加载完成后初始化事件
window.addEventListener('DOMContentLoaded', () => {
    const themeButtons = document.querySelectorAll('.segmented-item');
    const markdownToggle = document.getElementById('markdownToggle');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const cookieSection = document.getElementById('cookieSection');
    const cookieSource = document.getElementById('cookieSource');
    const cookieTarget = document.getElementById('cookieTarget');
    const cookieCopyBtn = document.getElementById('cookieCopyBtn');
    const cookieStatus = document.getElementById('cookieStatus');

    // 当前标签页 id，popup 打开时就缓存，点击时才能同步调用 sidePanel.open
    let currentTabId = null;

    // 读取当前设置
    const loadSettings = async () => {
        const { theme = 'auto', markdownPreview = false, sidebar = false } = await chrome.storage.local.get(['theme', 'markdownPreview', 'sidebar']);

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

        // 更新侧滑开关状态
        if (sidebar) {
            sidebarToggle.classList.add('active');
        } else {
            sidebarToggle.classList.remove('active');
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

    // 侧滑：开关 Chrome 浏览器级别的侧边栏（Side Panel），不是往页面里插元素
    // 注意 sidePanel.open 必须在用户手势的同步任务里调用，所以这里不能 await 前置的异步查询，
    // tabId 用 popup 打开时就缓存好的那个，setOptions 也只发不等
    // sidebar 状态不在这里写，统一由 background 按侧边栏的实际开关来写，避免 open 失败时状态失真
    sidebarToggle.addEventListener('click', () => {
        const isActive = sidebarToggle.classList.toggle('active');
        const tabId = currentTabId;
        if (tabId === null) {
            sidebarToggle.classList.toggle('active');
            return;
        }
        if (isActive) {
            chrome.sidePanel.setOptions({ tabId, path: 'sidepanel.html', enabled: true });
            chrome.sidePanel.open({ tabId });
        } else {
            // sidePanel 没有 close 方法，禁用当前 tab 的面板等效于关闭
            chrome.sidePanel.setOptions({ tabId, enabled: false });
        }
    });

    // 只有 http/https 页面才有 cookie 可复制，其他页面（chrome://、file:// 等）整块隐藏
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        currentTabId = tab?.id ?? null;
        if (!tab?.url) {
            return;
        }
        let origin;
        try {
            const { protocol, origin: tabOrigin } = new URL(tab.url);
            if (!['http:', 'https:'].includes(protocol)) {
                return;
            }
            origin = tabOrigin;
        } catch {
            return;
        }
        // 源 URL 默认填当前页面的 origin（协议 + 域名 + 端口，去掉路径）
        cookieSource.value = origin;
        cookieSection.hidden = false;
    });

    // 目标 URL 用上次存的值，没有就用默认值
    chrome.storage.local.get('cookieTargetUrl').then(({ cookieTargetUrl }) => {
        cookieTarget.value = cookieTargetUrl || 'http://localhost:8080';
    });

    // 失去焦点时存起来，下次打开复用
    cookieTarget.addEventListener('blur', () => {
        chrome.storage.local.set({ cookieTargetUrl: cookieTarget.value.trim() });
    });

    // 复制 cookie
    const setStatus = (text, kind) => {
        cookieStatus.textContent = text;
        cookieStatus.className = `cookie-status${kind ? ` ${kind}` : ''}`;
    };

    cookieCopyBtn.addEventListener('click', async () => {
        const sourceUrl = cookieSource.value.trim();
        const targetUrl = cookieTarget.value.trim();

        if (!sourceUrl || !targetUrl) {
            setStatus('请填写源和目标 URL', 'error');
            return;
        }
        // 校验 URL 合法性
        try {
            new URL(sourceUrl);
            new URL(targetUrl);
        } catch {
            setStatus('URL 格式不正确', 'error');
            return;
        }

        cookieCopyBtn.disabled = true;
        setStatus('复制中…');
        try {
            const { total, ok, fail } = await copyCookies(sourceUrl, targetUrl);
            if (total === 0) {
                setStatus('源页面没有可复制的 cookie', 'error');
            } else if (fail === 0) {
                setStatus(`已复制 ${ok} 个 cookie`, 'success');
            } else {
                setStatus(`成功 ${ok} 个，失败 ${fail} 个`, ok > 0 ? 'success' : 'error');
            }
        } catch (e) {
            setStatus(`复制失败：${e.message}`, 'error');
        } finally {
            cookieCopyBtn.disabled = false;
        }
    });

    // 侧边栏可能被用户手动关掉（点 X 或切到别的面板），background 会同步 sidebar 状态，
    // popup 开着时监听 storage 变化，让开关状态跟实际情况一致
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.sidebar) {
            return;
        }
        sidebarToggle.classList.toggle('active', changes.sidebar.newValue === true);
    });

    // 初始化
    loadSettings();
});
