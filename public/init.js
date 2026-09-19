(async () => {
    // 请求路径配置
    const paths = await new Promise(resolve => {
        window.addEventListener('message', event => {
            if (event.data?.type === 'PATHS') {
                resolve(event.data.paths);
            }
        });
        window.postMessage({ type: 'GET_PATHS' }, '*');
    });

    // 加载 loader.js
    await loadScript(paths.loader);

    // 等待 require 可用
    await waitForRequire();

    // 配置 require
    require.config({
        paths: {
            vs: paths.vs
        }
    });

    // 禁用 worker
    window.MonacoEnvironment = {
        getWorker: () => null
    };

    // 加载 Monaco
    const monaco = await new Promise(resolve => {
        require(['vs/editor/editor.main'], monaco => resolve(monaco));
    });

    // 加载 CSS
    await loadCSS(paths.css);

    // 手动注册 JSON 语言
    monaco.languages.register({ id: 'json' });
    monaco.languages.setTokensProvider('json', createJsonTokenizer());

    // 通知 content script，我们准备好了
    window.postMessage({ type: 'MONACO_INIT' }, '*');

    // 等待接收 JSON 内容
    window.addEventListener('message', event => {
        if (event.data?.type === 'JSON_CONTENT') {
            monaco.editor.create(document.getElementById('monaco-root'), {
                value: event.data.content,
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
        }
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

function loadCSS(href) {
    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = resolve;
        link.onerror = reject;
        document.head.appendChild(link);
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

                if (/\s/.test(char)) {
                    let end = pos;
                    while (end < len && /\s/.test(line[end])) end++;
                    tokens.push({ startIndex: pos, scopes: '' });
                    pos = end;
                    continue;
                }

                if ('{}[]'.includes(char)) {
                    tokens.push({ startIndex: pos, scopes: 'delimiter.bracket.json' });
                    pos++;
                    continue;
                }

                if (char === ':') {
                    tokens.push({ startIndex: pos, scopes: 'delimiter.colon.json' });
                    pos++;
                    continue;
                }

                if (char === ',') {
                    tokens.push({ startIndex: pos, scopes: 'delimiter.comma.json' });
                    pos++;
                    continue;
                }

                if (char === '"') {
                    let end = pos + 1;
                    while (end < len && line[end] !== '"') {
                        if (line[end] === '\\') end++;
                        end++;
                    }
                    end = Math.min(end + 1, len);

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

                if (/[-0-9]/.test(char)) {
                    let end = pos;
                    while (end < len && /[0-9.eE+-]/.test(line[end])) end++;
                    tokens.push({ startIndex: pos, scopes: 'number.json' });
                    pos = end;
                    continue;
                }

                const rest = line.slice(pos);
                if (rest.startsWith('true') || rest.startsWith('false') || rest.startsWith('null')) {
                    const word = rest.startsWith('true') ? 'true' : rest.startsWith('false') ? 'false' : 'null';
                    tokens.push({ startIndex: pos, scopes: 'keyword.json' });
                    pos += word.length;
                    continue;
                }

                tokens.push({ startIndex: pos, scopes: '' });
                pos++;
            }

            return { tokens, endState: state };
        }
    };
}
