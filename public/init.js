// 在主世界中运行，加载并初始化 Monaco 编辑器

const loadScript = src =>
    new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });

const loadCSS = href =>
    new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = resolve;
        link.onerror = reject;
        document.head.appendChild(link);
    });

const waitForRequire = () =>
    new Promise(resolve => {
        if (window.require) {
            resolve();
        }
        const interval = setInterval(() => {
            if (window.require) {
                clearInterval(interval);
                resolve();
            }
        }, 50);
    });

// 简单的 JSON 语法高亮 tokenizer
const createJsonTokenizer = () => ({
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

                // 后面跟冒号的是键，否则是值
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
});

// 从 content script 获取扩展资源的路径
const paths = await new Promise(resolve => {
    window.addEventListener('message', event => {
        if (event.data?.type === 'PATHS') {
            resolve(event.data.paths);
        }
    });
    window.postMessage({ type: 'GET_PATHS' }, '*');
});

// 加载 Monaco 依赖
await loadScript(paths.loader);
await waitForRequire();
require.config({ paths: { vs: paths.vs } });

// 禁用 worker，纯展示不需要
window.MonacoEnvironment = { getWorker: () => null };

// 加载编辑器核心
const monaco = await new Promise(resolve => {
    require(['vs/editor/editor.main'], monaco => resolve(monaco));
});

await loadCSS(paths.css);

// 手动注册 JSON 语法高亮
monaco.languages.register({ id: 'json' });
monaco.languages.setTokensProvider('json', createJsonTokenizer());

// 通知 content script 我们准备好了
window.postMessage({ type: 'MONACO_INIT' }, '*');

// 接收 JSON 内容，初始化编辑器
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
