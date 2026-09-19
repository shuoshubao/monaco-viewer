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

require.config({ paths: { vs: paths.vs } });

// 禁用 worker，纯展示不需要，返回一个空的 worker 对象避免报错
window.MonacoEnvironment = {
    getWorker: () => ({
        postMessage: () => {},
        terminate: () => {},
        onmessage: null,
        onerror: null
    })
};

// 加载编辑器核心
const monaco = await new Promise(resolve => {
    require(['vs/editor/editor.main'], monaco => resolve(monaco));
});

await loadCSS(paths.css);

// 通知 content script 我们准备好了
window.postMessage({ type: 'MONACO_INIT' }, '*');

// 接收内容和语言类型，初始化编辑器
window.addEventListener('message', async event => {
    if (event.data?.type !== 'CONTENT') {
        return;
    }

    const { content, language } = event.data;

    // 根据语言类型加载对应的语言服务
    if (language === 'json') {
        await new Promise(resolve => {
            require(['vs/language/json/jsonMode'], resolve);
        });
    }
    if (['javascript', 'typescript'].includes(language)) {
        await new Promise(resolve => {
            require(['vs/language/typescript/tsMode'], resolve);
        });
    }
    if (['css', 'less', 'scss'].includes(language)) {
        await new Promise(resolve => {
            require(['vs/language/css/cssMode'], resolve);
        });
    }
    if (language === 'yaml') {
        await new Promise(resolve => {
            require(['vs/basic-languages/yaml/yaml'], resolve);
        });
    }
    if (language === 'markdown') {
        await new Promise(resolve => {
            require(['vs/basic-languages/markdown/markdown'], resolve);
        });
    }

    monaco.editor.create(document.querySelector('#app'), {
        value: content,
        language,
        theme: 'vs-dark',
        readOnly: true,
        fontSize: 14,
        tabSize: 4,
        wordWrap: 'on',
        folding: true,
        automaticLayout: true,
        renderLineHighlight: 'line',
        scrollBeyondLastLine: false
    });
});
