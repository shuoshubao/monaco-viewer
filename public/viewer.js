(async () => {
  const params = new URLSearchParams(window.location.search);
  const targetUrl = params.get("url");

  if (!targetUrl) {
    document.getElementById("loading").textContent = "No URL specified";
    return;
  }

  try {
    // 拉取 JSON 内容
    const res = await fetch(targetUrl, { credentials: "include" });
    const jsonText = await res.text();

    // 加载 loader.js
    document.getElementById("loading").textContent = "Loading Monaco loader…";
    await loadScript("vendor/vs/loader.js");

    // 等待 require 可用
    document.getElementById("loading").textContent = "Waiting for require…";
    await waitForRequire();

    // 配置 require
    document.getElementById("loading").textContent = "Configuring require…";
    require.config({
      paths: { vs: "vendor/vs/" },
    });

    // 禁用 worker（纯展示不需要）
    window.MonacoEnvironment = {
      getWorker: () => null,
    };

    // 加载 Monaco
    document.getElementById("loading").textContent = "Loading Monaco editor…";
    const monaco = await new Promise((resolve, reject) => {
      require(["vs/editor/editor.main"], (monaco) => resolve(monaco));
    });

    // 加载 CSS
    document.getElementById("loading").textContent = "Loading styles…";
    await loadCSS("vendor/vs/editor/editor.main.css");

    // 手动注册 JSON 语言
    monaco.languages.register({ id: "json" });
    monaco.languages.setTokensProvider("json", createJsonTokenizer());

    // 初始化编辑器
    document.getElementById("loading").remove();
    monaco.editor.create(document.getElementById("container"), {
      value: jsonText,
      language: "json",
      theme: "vs-dark",
      automaticLayout: true,
      readOnly: true,
      minimap: { enabled: true },
      fontSize: 14,
      wordWrap: "on",
      scrollBeyondLastLine: false,
      folding: true,
      renderLineHighlight: "line",
    });
  } catch (err) {
    document.getElementById("loading").textContent = "Error: " + err.message;
    console.error(err);
  }
})();

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => {
      console.log("Loaded:", src);
      resolve();
    };
    script.onerror = (e) => {
      console.error("Failed to load:", src, e);
      reject(new Error("Failed to load " + src));
    };
    document.head.appendChild(script);
  });
}

function loadCSS(href) {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = resolve;
    link.onerror = reject;
    document.head.appendChild(link);
  });
}

function waitForRequire() {
  return new Promise((resolve) => {
    if (window.require) {
      console.log("require is already available");
      return resolve();
    }
    console.log("Waiting for require…");
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (window.require) {
        clearInterval(interval);
        console.log("require is available after", attempts, "attempts");
        resolve();
      }
    }, 50);
  });
}

function createJsonTokenizer() {
  return {
    getInitialState: () => ({ state: "start" }),
    tokenize: (line, state) => {
      const tokens = [];
      let pos = 0;
      const len = line.length;

      while (pos < len) {
        const char = line[pos];

        if (/\s/.test(char)) {
          let end = pos;
          while (end < len && /\s/.test(line[end])) end++;
          tokens.push({ startIndex: pos, scopes: "" });
          pos = end;
          continue;
        }

        if ("{}[]".includes(char)) {
          tokens.push({ startIndex: pos, scopes: "delimiter.bracket.json" });
          pos++;
          continue;
        }

        if (char === ":") {
          tokens.push({ startIndex: pos, scopes: "delimiter.colon.json" });
          pos++;
          continue;
        }

        if (char === ",") {
          tokens.push({ startIndex: pos, scopes: "delimiter.comma.json" });
          pos++;
          continue;
        }

        if (char === '"') {
          let end = pos + 1;
          while (end < len && line[end] !== '"') {
            if (line[end] === "\\") end++;
            end++;
          }
          end = Math.min(end + 1, len);

          let after = end;
          while (after < len && /\s/.test(line[after])) after++;
          const isKey = after < len && line[after] === ":";

          tokens.push({
            startIndex: pos,
            scopes: isKey ? "string.key.json" : "string.value.json",
          });
          pos = end;
          continue;
        }

        if (/[-0-9]/.test(char)) {
          let end = pos;
          while (end < len && /[0-9.eE+-]/.test(line[end])) end++;
          tokens.push({ startIndex: pos, scopes: "number.json" });
          pos = end;
          continue;
        }

        const rest = line.slice(pos);
        if (rest.startsWith("true") || rest.startsWith("false") || rest.startsWith("null")) {
          const word = rest.startsWith("true") ? "true" : rest.startsWith("false") ? "false" : "null";
          tokens.push({ startIndex: pos, scopes: "keyword.json" });
          pos += word.length;
          continue;
        }

        tokens.push({ startIndex: pos, scopes: "" });
        pos++;
      }

      return { tokens, endState: state };
    },
  };
}
