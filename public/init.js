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

// 通知 content script 我们准备好了
window.postMessage({ type: 'MONACO_INIT' }, '*');

// 接收内容和语言类型，初始化编辑器
window.addEventListener('message', async event => {
    if (event.data?.type === 'CONTENT') {
        const { content, language } = event.data;

        // 根据语言类型加载对应的语言服务
        if (language === 'json') {
            await new Promise(resolve => {
                require(['vs/language/json/jsonMode'], resolve);
            });
        } else if (language === 'javascript' || language === 'typescript') {
            await new Promise(resolve => {
                require(['vs/language/typescript/tsMode'], resolve);
            });
        } else if (language === 'css' || language === 'less' || language === 'scss') {
            await new Promise(resolve => {
                require(['vs/language/css/cssMode'], resolve);
            });
        } else if (language === 'yaml') {
            await new Promise(resolve => {
                require(['vs/basic-languages/yaml'], resolve);
            });
        } else if (language === 'markdown') {
            await new Promise(resolve => {
                require(['vs/basic-languages/markdown'], resolve);
            });
        }

        monaco.editor.create(document.getElementById('monaco-root'), {
            value: content,
            language,
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
