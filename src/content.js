(async () => {
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

    // 加载 loader.js
    await loadScript(chrome.runtime.getURL('vendor/vs/loader.js'));

    // 等待 require 可用
    await waitForRequire();

    // 配置 require
    window.require.config({
        paths: {
            vs: chrome.runtime.getURL('vendor/vs/')
        }
    });

    // 加载 Monaco 编辑器
    const monaco = await new Promise(resolve => {
        window.require(['vs/editor/editor.main'], monaco => resolve(monaco));
    });

    // 手动注册 JSON 语言（不用 worker）
    monaco.languages.register({ id: 'json' });
    monaco.languages.setTokensProvider('json', createJsonTokenizer());

    // 初始化 Monaco
    monaco.editor.create(container, {
        value: jsonText,
        language: 'json',
        theme: 'vs-dark',
        automaticLayout: true,
        readOnly: true,
        minimap: { enabled: true },
        fontSize: 14,
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        folding: true,
        renderLineHighlight: 'line'
    });
})();

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function waitForRequire() {
    return new Promise(resolve => {
        if (window.require) return resolve();
        const interval = setInterval(() => {
            if (window.require) {
                clearInterval(interval);
                resolve();
            }
        }, 50);
    });
}

function createJsonTokenizer() {
    return {
        getInitialState: () => ({ state: 'start' }),
        tokenize: (line, state) => {
            const tokens = [];
            let pos = 0;
            const len = line.length;

            while (pos < len) {
                const char = line[pos];

                // 空白
                if (/\s/.test(char)) {
                    let end = pos;
                    while (end < len && /\s/.test(line[end])) end++;
                    tokens.push({ startIndex: pos, scopes: '' });
                    pos = end;
                    continue;
                }

                // 括号
                if ('{}[]'.includes(char)) {
                    tokens.push({ startIndex: pos, scopes: 'delimiter.bracket.json' });
                    pos++;
                    continue;
                }

                // 冒号
                if (char === ':') {
                    tokens.push({ startIndex: pos, scopes: 'delimiter.colon.json' });
                    pos++;
                    continue;
                }

                // 逗号
                if (char === ',') {
                    tokens.push({ startIndex: pos, scopes: 'delimiter.comma.json' });
                    pos++;
                    continue;
                }

                // 字符串
                if (char === '"') {
                    let end = pos + 1;
                    while (end < len && line[end] !== '"') {
                        if (line[end] === '\\') end++;
                        end++;
                    }
                    end = Math.min(end + 1, len);

                    // 判断是键还是值（后面跟着冒号就是键）
                    let after = end;
                    while (after < len && /\s/.test(line[after])) after++;
                    const isKey = after < len && line[after] === ':';

                    tokens.push({
                        startIndex: pos,
                        scopes: isKey ? 'string.key.json' : 'string.value.json'
                    });
                    pos = end;
                    continue;
                }

                // 数字
                if (/[-0-9]/.test(char)) {
                    let end = pos;
                    while (end < len && /[0-9.eE+-]/.test(line[end])) end++;
                    tokens.push({ startIndex: pos, scopes: 'number.json' });
                    pos = end;
                    continue;
                }

                // 布尔值和 null
                const rest = line.slice(pos);
                if (rest.startsWith('true') || rest.startsWith('false') || rest.startsWith('null')) {
                    const word = rest.startsWith('true') ? 'true' : rest.startsWith('false') ? 'false' : 'null';
                    tokens.push({
                        startIndex: pos,
                        scopes: word === 'null' ? 'keyword.json' : 'keyword.json'
                    });
                    pos += word.length;
                    continue;
                }

                // 其他
                tokens.push({ startIndex: pos, scopes: '' });
                pos++;
            }

            return { tokens, endState: state };
        }
    };
}
