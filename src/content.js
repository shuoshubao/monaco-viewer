// 在 document_start 时运行，等 DOM 加载完成后检测
async function init() {
    // 等 body 加载完成
    if (!document.body) {
        await new Promise(resolve => {
            if (document.body) return resolve();
            document.addEventListener('DOMContentLoaded', resolve, { once: true });
        });
    }

    // 读取页面内容
    let jsonText = document.body?.innerText || document.documentElement.innerText || '';

    // 清理可能的行号（Chrome 内置 viewer 会显示行号）
    jsonText = jsonText
        .split('\n')
        .map(line => line.replace(/^\d+\s+/, ''))
        .join('\n')
        .trim();

    // 尝试解析为 JSON，判断是否是 JSON 页面
    try {
        JSON.parse(jsonText);
    } catch {
        return; // 不是 JSON，直接退出
    }

    // 清空页面
    document.documentElement.innerHTML = '';

    // 注入基础样式
    const style = document.createElement('style');
    style.textContent = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #1e1e1e; }
    #monaco-root { width: 100%; height: 100vh; position: absolute; top: 0; left: 0; }
  `;
    document.head.appendChild(style);

    // 创建容器
    const container = document.createElement('div');
    container.id = 'monaco-root';
    document.body.appendChild(container);

    // 注入初始化脚本到主世界
    const initScript = document.createElement('script');
    initScript.src = chrome.runtime.getURL('init.js');
    initScript.onload = () => initScript.remove();
    document.head.appendChild(initScript);

    // 把 JSON 文本传到主世界
    window.addEventListener('message', event => {
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
        if (event.data?.type === 'MONACO_INIT') {
            window.postMessage(
                {
                    type: 'JSON_CONTENT',
                    content: jsonText
                },
                '*'
            );
        }
    });
}

init();
