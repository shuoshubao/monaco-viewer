// 检测页面类型，是的话注入 Monaco 渲染
(async () => {
    // 一开始就隐藏整个页面，避免闪烁
    document.documentElement.style.display = 'none';

    // 问 background 当前 tab 的内容类型
    let { type } = await chrome.runtime.sendMessage({ type: 'CHECK_TYPE' });
    if (!type) {
        // 不是我们支持的类型，显示原页面
        document.documentElement.style.display = '';
        return;
    }

    const getSystemTheme = () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'vs-dark' : 'vs');
    const resolveTheme = themeSetting => (themeSetting === 'auto' ? getSystemTheme() : themeSetting);

    // 读取用户设置
    const settings = await chrome.storage.local.get(['theme', 'markdownPreview']);
    let themeSetting = settings.theme || 'auto';
    let actualTheme = resolveTheme(themeSetting);
    const markdownPreview = settings.markdownPreview || false;

    // 等 DOM 加载完成
    if (!document.body) {
        await new Promise(resolve => {
            document.addEventListener('DOMContentLoaded', resolve, { once: true });
        });
    }

    // 读取页面文本
    let content = document.body?.innerText || document.documentElement.innerText || '';

    // 解析并按 4 空格缩进格式化 JSON，不是 JSON 则返回 null
    const formatJSON = text => {
        const trimmed = text.trim();
        // 只认对象和数组，裸的数字/字符串当普通文本
        if (!/^[[{]/.test(trimmed)) {
            return null;
        }
        try {
            return JSON.stringify(JSON.parse(trimmed), null, 4);
        } catch {
            return null;
        }
    };

    // text/plain 只看 header 判断不出类型，用内容判断是不是 JSON
    if (type === 'plain') {
        const formatted = formatJSON(content);
        if (formatted === null) {
            // 不是 JSON，原样显示原页面
            document.documentElement.style.display = '';
            return;
        }
        content = formatted;
        type = 'json';
    } else if (type === 'json') {
        // 接口返回的 JSON 通常是压缩的，格式化后再展示；解析失败就保持原样
        content = formatJSON(content) ?? content;
    }

    // 清空原页面，准备渲染 Monaco
    document.documentElement.innerHTML = '';

    // 恢复页面显示
    document.documentElement.style.display = '';

    // 根据类型设置 favicon
    const faviconMap = { scss: 'sass' };
    const faviconName = faviconMap[type] || type;
    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.href = chrome.runtime.getURL(`icons/file-types/${faviconName}.svg`);
    document.head.appendChild(favicon);

    // 注入基础样式
    const bgColor = actualTheme === 'vs' ? '#ffffff' : '#1e1e1e';
    const style = document.createElement('style');
    style.textContent = `
*,
*::before,
*::after {
    box-sizing: border-box;
}
body {
    padding: 0;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: ${bgColor};
}
#app {
    position: absolute;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
}
#app:has(.markdown-body) {
    padding-top: 0;
}
`;
    document.head.appendChild(style);

    // Monaco 容器
    const container = document.createElement('div');
    container.id = 'app';
    document.body.appendChild(container);

    // 注入 init.js 到主世界，加载并初始化 Monaco
    const initScript = document.createElement('script');
    initScript.src = chrome.runtime.getURL('init.js');
    initScript.type = 'module';
    initScript.onload = () => initScript.remove();
    document.head.appendChild(initScript);

    const applyTheme = newActualTheme => {
        actualTheme = newActualTheme;
        const bg = actualTheme === 'vs' ? '#ffffff' : '#1e1e1e';
        document.body.style.background = bg;
        window.postMessage({ type: 'UPDATE_THEME', theme: actualTheme }, '*');
    };

    // auto 模式下监听系统主题变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
        if (themeSetting === 'auto') {
            applyTheme(resolveTheme('auto'));
        }
    });

    // 和主世界的 init.js 通信
    window.addEventListener('message', event => {
        // init.js 请求扩展资源的路径
        if (event.data?.type === 'GET_PATHS') {
            window.postMessage(
                {
                    type: 'PATHS',
                    paths: {
                        loader: chrome.runtime.getURL('monaco-editor/vs/loader.js'),
                        vs: chrome.runtime.getURL('monaco-editor/vs'),
                        css: chrome.runtime.getURL('monaco-editor/vs/editor/editor.main.css')
                    },
                    settings: { theme: actualTheme, markdownPreview },
                    lib: {
                        markdownIt: chrome.runtime.getURL('markdown-it/markdown-it.min.js')
                    }
                },
                '*'
            );
        }
        // Monaco 初始化完成，发送内容和类型给它渲染
        if (event.data?.type === 'MONACO_INIT') {
            window.postMessage({ type: 'CONTENT', content, language: type }, '*');
        }
    });

    // 监听来自 popup 的消息
    chrome.runtime.onMessage.addListener(message => {
        if (message?.type === 'UPDATE_THEME') {
            themeSetting = message.theme;
            applyTheme(resolveTheme(themeSetting));
        }
        if (message?.type === 'UPDATE_MARKDOWN_PREVIEW') {
            // 转发给 init.js
            window.postMessage({ type: 'UPDATE_MARKDOWN_PREVIEW', markdownPreview: message.markdownPreview }, '*');
        }
    });
})();
