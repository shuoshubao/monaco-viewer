// 检测页面类型，是的话注入 Monaco 渲染
(async () => {
    // 问 background 当前 tab 的内容类型
    const { type } = await chrome.runtime.sendMessage({ type: 'CHECK_TYPE' });
    if (!type) {
        return;
    }

    // 等 DOM 加载完成
    if (!document.body) {
        await new Promise(resolve => {
            document.addEventListener('DOMContentLoaded', resolve, { once: true });
        });
    }

    // 读取页面文本
    const content = document.body?.innerText || document.documentElement.innerText || '';

    // 清空原页面，准备渲染 Monaco
    document.documentElement.innerHTML = '';

    // 根据类型设置 favicon
    const faviconMap = { scss: 'sass' };
    const faviconName = faviconMap[type] || type;
    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.href = chrome.runtime.getURL(`icons/file-types/${faviconName}.svg`);
    document.head.appendChild(favicon);

    // 注入基础样式
    const style = document.createElement('style');
    style.textContent = `
* {
    box-sizing: border-box;
}
html,
body {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: #1e1e1e;
}
#app {
    position: absolute;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    padding-top: 5px;
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
})();
