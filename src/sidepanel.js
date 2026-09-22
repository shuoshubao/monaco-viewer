// 和 background 建一条长连接，侧边栏一关闭这条连接就断开，
// background 借此感知侧边栏的真实开关状态（sidePanel 没有 onClosed 事件）
chrome.runtime.connect({ name: 'sidepanel' });
