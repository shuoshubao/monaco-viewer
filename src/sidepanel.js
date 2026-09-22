// 这条连接的存活状态就是侧边栏的开关状态，background 靠它判断面板是否被关闭
chrome.runtime.connect({ name: 'sidepanel' });
