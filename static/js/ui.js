// 通用 DOM、文本和弹层滚动工具，不在导入时绑定页面事件。
export const $ = (s) => document.querySelector(s);
export const $$ = (s, scope) => Array.from((scope || document).querySelectorAll(s));

export function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.hidden = true; }, 2400);
}

// 分类介绍文案：转义后把 [文字](链接) 与裸 http(s) 链接渲染为可点击超链接
export function linkifyText(text) {
  if (!text) return '';
  let html = esc(text);
  const anchors = [];
  // 1) 显式链接：[文字](https://...)
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, t, u) => {
    const token = '\u0000' + anchors.length + '\u0000';
    anchors.push(`<a class="intro-link" href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
    return token;
  });
  // 2) 裸链接自动转超链接（排除中文全角括号等结尾符号）
  html = html.replace(/(https?:\/\/[^\s<>"'（）()]+)/g, (m, u) => {
    const token = '\u0000' + anchors.length + '\u0000';
    anchors.push(`<a class="intro-link" href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
    return token;
  });
  // 3) 还原锚点
  return html.replace(/\u0000(\d+)\u0000/g, (m, i) => anchors[+i] || '');
}

export function lockBodyScroll(lock) {
  document.body.style.overflow = lock ? 'hidden' : '';
}

// 弹层打开后还原滚动位置：部分移动浏览器会在遮罩显示时滚动页面（如把视口“对焦”到页脚的固定按钮）
export function restoreScroll(prevScroll) {
  const cur = window.scrollY || document.documentElement.scrollTop || 0;
  if (cur !== prevScroll) window.scrollTo(0, prevScroll);
}
