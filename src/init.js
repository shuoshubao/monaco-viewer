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

// 从 content script 获取扩展资源的路径和设置
const { paths, settings, lib } = await new Promise(resolve => {
    window.addEventListener('message', event => {
        if (event.data?.type === 'PATHS') {
            resolve(event.data);
        }
    });
    window.postMessage({ type: 'GET_PATHS' }, '*');
});

// 通知 content script 我们准备好了
window.postMessage({ type: 'MONACO_INIT' }, '*');

let monaco = null;
let editorInstance = null;
let currentContent = '';
let currentLanguage = 'markdown';
let markdownItLoaded = false;

const loadMonaco = async () => {
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
    monaco = await new Promise(resolve => {
        require(['vs/editor/editor.main'], monaco => resolve(monaco));
    });

    await loadCSS(paths.css);
};

const ensureMarkdownIt = async () => {
    if (!markdownItLoaded) {
        // 先保存全局的 define，Monaco 的 loader 会接管 define，导致 markdown-it 被当成 AMD 模块加载
        const originalDefine = window.define;
        window.define = undefined;
        await loadScript(lib.markdownIt);
        window.define = originalDefine;
        markdownItLoaded = true;
    }
};

const getMarkdownStyles = () => `
    html[data-theme="vs-dark"] body {
        background: #1e1e1e;
    }
    html[data-theme="vs"] body {
        background: #ffffff;
    }

    .markdown-body {
        max-width: 900px;
        margin: 0 auto;
        padding: 32px 24px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6;

        html[data-theme="vs-dark"] & { color: #e0e0e0; }
        html[data-theme="vs"] & { color: #24292e; }

        h1, h2, h3 {
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
        }
        h1 { font-size: 2em; }
        h2 { font-size: 1.5em; }
        h3 { font-size: 1.25em; }

        html[data-theme="vs-dark"] & h1,
        html[data-theme="vs-dark"] & h2 {
            border-bottom: 1px solid #333;
        }
        html[data-theme="vs"] & h1,
        html[data-theme="vs"] & h2 {
            border-bottom: 1px solid #eaecef;
        }

        p { margin: 0 0 16px; }
        code {
            padding: 2px 6px;
            font-size: 85%;
            border-radius: 3px;
            font-family: 'SFMono-Regular', Consolas, monospace;

            html[data-theme="vs-dark"] & {
                background: rgba(110,118,129,0.4);
            }
            html[data-theme="vs"] & {
                background: rgba(27,31,35,0.05);
            }
        }

        pre {
            padding: 16px;
            overflow: auto;
            font-size: 85%;
            line-height: 1.45;
            border-radius: 6px;
            margin-bottom: 16px;

            html[data-theme="vs-dark"] & {
                background: #2d2d2d;
            }
            html[data-theme="vs"] & {
                background: #f6f8fa;
            }

            code {
                padding: 0;
                background: transparent;
            }
        }

        ul, ol {
            margin-bottom: 16px;
            padding-left: 2em;
        }
        blockquote {
            padding: 0 1em;
            border-left: 0.25em solid;
            margin: 0 0 16px;

            html[data-theme="vs-dark"] & {
                color: #999;
                border-left-color: #444;
            }
            html[data-theme="vs"] & {
                color: #6a737d;
                border-left-color: #dfe2e5;
            }
        }
        a {
            text-decoration: none;

            html[data-theme="vs-dark"] & {
                color: #58a6ff;
            }
            html[data-theme="vs"] & {
                color: #0366d6;
            }
        }
    }
`;

const disposeEditor = () => {
    if (editorInstance) {
        editorInstance.dispose();
        editorInstance = null;
    }
};

const renderMarkdown = async content => {
    disposeEditor();
    await ensureMarkdownIt();
    const md = window.markdownit();
    const html = md.render(content);
    document.documentElement.dataset.theme = settings.theme;

    document.querySelector('#app').innerHTML = `
        <style>${getMarkdownStyles()}</style>
        <div class="markdown-body">${html}</div>
    `;
};

const renderEditor = async (content, language) => {
    if (!monaco) {
        await loadMonaco();
    }

    // 清空内容，准备重新创建编辑器
    document.querySelector('#app').innerHTML = '';

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

    editorInstance = monaco.editor.create(document.querySelector('#app'), {
        value: content,
        language,
        theme: settings.theme || 'vs-dark',
        readOnly: true,
        fontSize: 14,
        wordWrap: 'on',
        folding: true,
        foldingStrategy: 'indentation',
        automaticLayout: true,
        renderLineHighlight: 'line',
        scrollBeyondLastLine: false
    });
};

const render = async () => {
    if (currentLanguage === 'markdown' && settings.markdownPreview) {
        await renderMarkdown(currentContent);
    } else {
        await renderEditor(currentContent, currentLanguage);
    }
};

window.addEventListener('message', async event => {
    if (event.data?.type === 'UPDATE_THEME') {
        settings.theme = event.data.theme;
        if (document.querySelector('.markdown-body')) {
            document.documentElement.dataset.theme = event.data.theme;
        } else if (editorInstance) {
            editorInstance.updateOptions({ theme: event.data.theme });
        }
        return;
    }

    if (event.data?.type === 'UPDATE_MARKDOWN_PREVIEW') {
        settings.markdownPreview = event.data.markdownPreview;
        if (currentLanguage === 'markdown') {
            await render();
        }
        return;
    }

    if (event.data?.type !== 'CONTENT') {
        return;
    }

    const { content, language } = event.data;
    currentContent = content;
    currentLanguage = language;
    await render();
});
