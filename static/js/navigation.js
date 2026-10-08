// 把视图状态编码为 URL：l1/l2/l3/tag 写入 query（分享链接、刷新后恢复）。
// 参数不足以唯一确定视图时显式带上 v（如“分类/主题的全部点位”与地图选择页同参数）。
export function viewUrl(st, pathname = location.pathname) {
  const params = new URLSearchParams();
  if (st && st.l1) params.set('l1', st.l1);
  if (st && st.l2) params.set('l2', st.l2);
  if (st && st.l3) params.set('l3', st.l3);
  if (st && st.tag) params.set('tag', st.tag);
  if (st && st.v === 'points' && !st.l3 && !st.tag) params.set('v', 'points');
  const qs = params.toString();
  return pathname + (qs ? '?' + qs : '');
}

// 从当前 URL 解析视图状态；l1 不在分类列表中（失效链接）则回到首页。
// 旧格式（无 v 参数）按层级推断：l3+l2 → 点位页，l2 → 主题页，l1 → 分类页。
export function stateFromLocation(categories, search = location.search) {
  const params = new URLSearchParams(search);
  const v = params.get('v') || '';
  const l1 = params.get('l1') || '';
  const l2 = params.get('l2') || '';
  const l3 = params.get('l3') || '';
  const tag = params.get('tag') || '';
  const l1Valid = !!l1 && categories.some(c => c.name === l1);
  if (tag) return { v: 'points', l1: l1Valid ? l1 : '', l2: l1 && !l1Valid ? '' : l2, l3: l1 && !l1Valid ? '' : l3, tag };
  if (v === 'points' || (l3 && l2)) {
    if (l1 && !l1Valid) return { v: 'cats' };
    return { v: 'points', l1: l1Valid ? l1 : '', l2, l3 };
  }
  if (!l1Valid) return { v: 'cats' };
  if (l2) return { v: 'groups', l1, l2 };
  return { v: 'maps', l1 };
}

// 页面内返回按层级计算，不依赖进入页面前的浏览器历史。
export function parentView(st) {
  if (st.tag) return { v: 'points', l1: st.l1 || '', l2: st.l2 || '', l3: st.l3 || '' };
  if (!st.l1) return { v: 'cats' };
  if (st.l2) return { v: 'groups', l1: st.l1, l2: st.l2 };
  return { v: 'maps', l1: st.l1 };
}

// 集中管理 URL、浏览器历史及弹层标记，业务模块不直接操作历史栈。
export function createNavigation({ renderView }) {
  const overlays = new Map();
  const opened = new Set();
  let cleanupPending = false;

  function pushView(view) {
    history.pushState(view, '', viewUrl(view));
  }

  function navigate(view) {
    pushView(view);
    renderView(view);
  }

  function openOverlay(marker) {
    if (opened.has(marker)) return;
    opened.add(marker);
    history.pushState({ [marker]: true }, '');
  }

  function closeOverlay(marker) {
    if (!opened.delete(marker)) return;
    if (history.state && history.state[marker]) {
      cleanupPending = true;
      history.back();
    }
  }

  window.addEventListener('popstate', () => {
    // 主动关闭弹层产生的回退仅清理标记，不重新加载底层页面。
    if (cleanupPending) { cleanupPending = false; return; }
    const view = history.state;
    if (view && [...overlays.keys()].some(marker => view[marker])) return;
    for (const overlay of overlays.values()) {
      if (overlay.isOpen()) {
        overlay.close();
        return;
      }
    }
    renderView(view);
  });

  function start(categories) {
    const initialState = stateFromLocation(categories);
    history.replaceState(initialState, '', viewUrl(initialState));
    if (initialState.v !== 'cats') renderView(initialState);
  }

  return {
    start,
    navigate,
    pushView,
    back: () => history.back(),
    openOverlay,
    closeOverlay,
    registerOverlay: (marker, overlay) => overlays.set(marker, overlay),
  };
}
