import { $ } from './ui.js';

// 桌面窄栏与手机抽屉分别管理，手机始终从关闭状态进入。
export function createSidebar() {
  const body = document.body;
  const sidebar = $('#layer1');
  const toggle = $('#sidebarToggle');
  const mobileToggle = $('#mobileSidebarToggle');
  const backdrop = $('#sidebarBackdrop');
  const mobile = window.matchMedia('(max-width: 860px)');
  let collapsed = false;
  let opened = false;
  try { collapsed = localStorage.getItem('tjmap_sidebar_collapsed') === '1'; } catch (e) { /* 存储不可用时默认展开 */ }

  function render() {
    body.classList.toggle('sidebar-collapsed', !mobile.matches && collapsed);
    body.classList.toggle('sidebar-open', mobile.matches && opened);
    sidebar.inert = mobile.matches && !opened;
    backdrop.hidden = !mobile.matches || !opened;
    toggle.setAttribute('aria-expanded', String(mobile.matches ? opened : !collapsed));
    toggle.setAttribute('aria-label', mobile.matches ? '关闭分类导航' : collapsed ? '展开分类导航' : '收起分类导航');
    mobileToggle.setAttribute('aria-expanded', String(mobile.matches && opened));
  }
  function close() {
    opened = false;
    render();
    mobileToggle.focus();
  }
  mobileToggle.addEventListener('click', () => {
    opened = true;
    render();
    toggle.focus();
  });
  toggle.addEventListener('click', () => {
    if (mobile.matches) { close(); return; }
    collapsed = !collapsed;
    try { localStorage.setItem('tjmap_sidebar_collapsed', collapsed ? '1' : '0'); } catch (e) { /* 折叠仍可使用 */ }
    render();
  });
  backdrop.addEventListener('click', close);
  sidebar.addEventListener('click', e => {
    if (mobile.matches && e.target.closest('.cat-card')) close();
  });
  document.addEventListener('keydown', e => {
    if (!mobile.matches || !opened) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      const buttons = Array.from(sidebar.querySelectorAll('button:not([disabled])'));
      const first = buttons[0], last = buttons.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  mobile.addEventListener('change', () => {
    const hadFocus = sidebar.contains(document.activeElement);
    opened = false;
    render();
    if (mobile.matches && hadFocus) mobileToggle.focus();
  });
  render();
}
