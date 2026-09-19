// 检测页面是否是 JSON，是的话注入 Monaco 渲染
(async () => {
    // 等 DOM 加载完成
    if (!document.body) {
        await new Promise(resolve => {
            document.addEventListener('DOMContentLoaded', resolve, { once: true });
        });
    }

    // 读取页面文本，清理 Chrome 内置 viewer 的行号
    let jsonText = (document.body?.innerText || document.documentElement.innerText || '')
        .split('\n')
        .map(line => line.replace(/^\d+\s+/, ''))
        .join('\n')
        .trim();

    // 不是 JSON 就退出
    try {
        JSON.parse(jsonText);
    } catch {
        return;
    }

    // 清空原页面，准备渲染 Monaco
    document.documentElement.innerHTML = '';

    // 注入基础样式
    const style = document.createElement('style');
    style.textContent = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #1e1e1e; }
    #monaco-root { width: 100%; height: 100vh; position: absolute; top: 0; left: 0; }
  `;
    document.head.appendChild(style);

    // Monaco 容器
    const container = document.createElement('div');
    container.id = 'monaco-root';
    document.body.appendChild(container);

    // 注入 init.js 到主世界，加载并初始化 Monaco
    const initScript = document.createElement('script');
    initScript.src = chrome.runtime.getURL('init.js');
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
                        loader: chrome.runtime.getURL('vendor/vs/loader.js'),
                        vs: chrome.runtime.getURL('vendor/vs/'),
                        css: chrome.runtime.getURL('vendor/vs/editor/editor.main.css')
                    }
                },
                '*'
            );
        }
        // Monaco 初始化完成，发送 JSON 内容给它渲染
        if (event.data?.type === 'MONACO_INIT') {
            window.postMessage({ type: 'JSON_CONTENT', content: jsonText }, '*');
        }
    });
})();
