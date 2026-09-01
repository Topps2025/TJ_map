/* ============================================================
   猫和老鼠点位查询 · 前端逻辑（原生 JS + fetch）
   页面切换仅刷新内容容器，不整页刷新
   ============================================================ */

(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s, scope) => Array.from((scope || document).querySelectorAll(s));

  const state = { l1: '', l2: '', l3: '', tag: '', mapsInfo: [], cats: [] };

  const layer1 = $('#layer1');
  const layer2 = $('#layer2');
  const layer3 = $('#layer3');
  const pointsArea = $('#pointsArea');
  const catTabs = $('#catTabs');
  const groupChips = $('#groupChips');
  const mapChips = $('#mapChips');
  const pointsGrid = $('#pointsGrid');
  const pointsTitle = $('#pointsTitle');
  const siteFooter = $('.site-footer');

  /* ---------------- 工具 ---------------- */

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.hidden = true; }, 2400);
  }

  async function getJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || '请求失败');
    return data.data;
  }

  /* ---------------- 第一层：分类 ---------------- */

  async function loadCategories() {
    try {
      const cats = await getJSON('/api/categories');
      state.cats = cats;
      catTabs.innerHTML = cats.map((c, i) => `
        <button class="cat-card animate-fadeInUp grid-item-${(i % 8) + 1}" data-cat="${esc(c.name)}">
          <span class="cat-card-thumb">
            ${c.icon ? `<img src="${esc(c.icon)}" alt="${esc(c.name)}" loading="lazy">` : '<span class="cat-card-placeholder"></span>'}
          </span>
          <span class="cat-card-name">${esc(c.name)}</span>
        </button>`).join('');
      $$('.cat-card').forEach(btn =>
        btn.addEventListener('click', () => {
          pushView({ v: 'maps', l1: btn.dataset.cat });
          showMaps(btn.dataset.cat);
        }));
    } catch (e) {
      catTabs.innerHTML = '<div class="empty">分类加载失败，请刷新</div>';
    }
  }

  /* ---------------- 视图状态（支持浏览器前进/后退与 URL 分享/刷新恢复） ---------------- */

  // 把视图状态编码为 URL：l1/l2/l3/tag 写入 query（分享链接、刷新后恢复）。
  // 参数不足以唯一确定视图时显式带上 v（如“分类/主题的全部点位”与地图选择页同参数）。
  function viewUrl(st) {
    const params = new URLSearchParams();
    if (st && st.l1) params.set('l1', st.l1);
    if (st && st.l2) params.set('l2', st.l2);
    if (st && st.l3) params.set('l3', st.l3);
    if (st && st.tag) params.set('tag', st.tag);
    if (st && st.v === 'points' && !st.l3 && !st.tag) params.set('v', 'points');
    const qs = params.toString();
    return location.pathname + (qs ? '?' + qs : '');
  }

  // 从当前 URL 解析视图状态；l1 不在分类列表中（失效链接）则回到首页。
  // 旧格式（无 v 参数）按层级推断：l3+l2 → 点位页，l2 → 主题页，l1 → 分类页。
  function stateFromLocation() {
    const params = new URLSearchParams(location.search);
    const v = params.get('v') || '';
    const l1 = params.get('l1') || '';
    const l2 = params.get('l2') || '';
    const l3 = params.get('l3') || '';
    const tag = params.get('tag') || '';
    const l1Valid = !!l1 && state.cats.some(c => c.name === l1);
    if (tag) return { v: 'points', l1: l1Valid ? l1 : '', l2: '', l3: '', tag };
    if (v === 'points' || (l3 && l2)) {
      if (l1 && !l1Valid) return { v: 'cats' };
      return { v: 'points', l1: l1Valid ? l1 : '', l2, l3 };
    }
    if (!l1Valid) return { v: 'cats' };
    if (l2) return { v: 'groups', l1, l2 };
    return { v: 'maps', l1 };
  }

  function pushView(st) {
    history.pushState(st, '', viewUrl(st));
  }

  function renderView(st) {
    if (!st) st = { v: 'cats' };
    if (st.__modal) return;   // 投稿弹窗标记状态：不渲染，仅用于返回键关闭弹窗
    if (st.v === 'maps') showMaps(st.l1);
    else if (st.v === 'groups') showGroups(st.l1, st.l2);
    else if (st.v === 'points') showPoints(st);
    else showCats();
  }

  window.addEventListener('popstate', () => {
    // 关闭弹窗/灯箱时我们主动 history.back() 清理标记：本次事件只清栈、不渲染视图
    if (modalCloseCleanup) { modalCloseCleanup = false; return; }
    if (lbCloseCleanup) { lbCloseCleanup = false; return; }
    const st = history.state;
    if (st && (st.__modal || st.__lb)) return;   // 返回键刚把标记弹掉：保持当前视图
    if (!submitModal.hidden) {
      closeSubmitModal();                  // 弹窗打开时按返回键：仅关闭弹窗，不退出当前层级
      return;
    }
    if (!$('#lightbox').hidden) {
      closeLightbox();                     // 灯箱打开时按返回键：仅关灯箱，不退出当前层级
      return;
    }
    renderView(st);
  });

  /* ---------------- 视图渲染 ---------------- */

  function showCats() {
    state.l1 = '';
    state.l2 = '';
    state.l3 = '';
    state.tag = '';
    layer1.hidden = false;
    layer2.hidden = true;
    layer3.hidden = true;
    pointsArea.hidden = true;
    fabSubmit.hidden = true;
    siteFooter.hidden = false;   // 页脚仅首页（分类页）展示
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderIntro(info) {
    $('#introIcon').src = info.icon || '';
    $('#introIcon').alt = info.name || '';
    $('#introTitle').textContent = info.name || '';
    $('#introDesc').innerHTML = linkifyText(info.description);
    $('#introTips').innerHTML = (info.tips || []).map(t => `<li>${esc(t)}</li>`).join('');
  }

  // 分类介绍文案：转义后把 [文字](链接) 与裸 http(s) 链接渲染为可点击超链接
  function linkifyText(text) {
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

  async function showMaps(l1) {
    state.l1 = l1;
    state.l2 = '';
    state.l3 = '';
    state.tag = '';
    $$('.cat-card').forEach(b => b.classList.toggle('active', b.dataset.cat === l1));
    layer1.hidden = true;
    layer2.hidden = false;
    layer3.hidden = true;
    pointsArea.hidden = true;
    fabSubmit.hidden = true;   // 点进具体分类的介绍页不显示投稿卡片（进入具体地图后再出现）
    siteFooter.hidden = true;   // 非首页隐藏页脚
    renderIntro(state.cats.find(c => c.name === l1) || {});
    groupChips.innerHTML = '<div class="loading-text">加载主题中...</div>';
    $('#catPreview').hidden = true;   // 隐藏旧分类的预览，等待新数据
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const groups = await getJSON('/api/groups?l1=' + encodeURIComponent(l1));
      groupChips.innerHTML = groups.map((g, i) => `
        <button class="map-card animate-fadeInUp grid-item-${(i % 8) + 1}" data-name="${esc(g.name)}">
          <span class="map-card-thumb">
            ${g.thumb ? `<img src="${esc(g.thumb)}" alt="${esc(g.name)}" loading="lazy">` : '<span class="map-card-placeholder"></span>'}
          </span>
          <span class="map-card-name">${esc(g.name)}</span>
        </button>`).join('');
      $$('#groupChips .map-card').forEach(btn =>
        btn.addEventListener('click', () => openGroup(l1, btn.dataset.name)));
      // 分类投稿预览：展示该分类下已审核点位（最多 8 条）
      loadPreview('/api/points?status=approved&l1=' + encodeURIComponent(l1),
        $('#catPreviewGrid'), $('#catPreview'), 'cat', $('#catPreviewMore'));
    } catch (e) {
      groupChips.innerHTML = '<div class="empty">主题加载失败</div>';
    }
  }

  /* ---------------- 地图大类 -> 具体地图 / 点位 ---------------- */

  async function openGroup(l1, l2) {
    state.l1 = l1;
    state.l2 = l2;
    try {
      const maps = await getJSON('/api/maps?l1=' + encodeURIComponent(l1) +
        '&l2=' + encodeURIComponent(l2));
      state.mapsInfo = maps;
      if (maps.length === 1) {
        // 单地图大类：该地图即具体地图，直接进入点位，跳过地图选择
        pushView({ v: 'points', l1, l2, l3: maps[0].name });
        showPoints({ v: 'points', l1, l2, l3: maps[0].name });
        return;
      }
      pushView({ v: 'groups', l1, l2 });
      showGroupsView(l1, l2, maps);
    } catch (e) {
      toast('地图加载失败');
    }
  }

  function showGroupsView(l1, l2, maps) {
    state.l3 = '';   // 主题（地图大类）层不预选具体地图，投稿时让用户自行勾选
    state.tag = '';
    layer1.hidden = true;
    layer2.hidden = true;
    layer3.hidden = false;
    pointsArea.hidden = true;
    fabSubmit.hidden = false;
    siteFooter.hidden = true;   // 非首页隐藏页脚
    mapChips.innerHTML = maps.map((m, i) => `
      <button class="map-card animate-fadeInUp grid-item-${(i % 8) + 1}" data-name="${esc(m.name)}">
        <span class="map-card-thumb">
          ${m.thumb ? `<img src="${esc(m.thumb)}" alt="${esc(m.name)}" loading="lazy">` : '<span class="map-card-placeholder"></span>'}
        </span>
        <span class="map-card-name">${esc(m.name)}</span>
      </button>`).join('');
    $$('#mapChips .map-card').forEach(btn =>
      btn.addEventListener('click', () => {
        pushView({ v: 'points', l1, l2, l3: btn.dataset.name });
        showPoints({ v: 'points', l1, l2, l3: btn.dataset.name });
      }));
    $('#groupPreview').hidden = true;   // 隐藏旧主题的预览，等待新数据
    // 主题投稿预览：展示该分类+主题下已审核点位（最多 8 条）
    loadPreview('/api/points?status=approved&l1=' + encodeURIComponent(l1) +
      '&l2=' + encodeURIComponent(l2),
      $('#groupPreviewGrid'), $('#groupPreview'), 'group', $('#groupPreviewMore'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- 具体地图 -> 点位 ---------------- */

  // 拼接点位接口地址：l1/l2/l3/tag 均可选（标签页、搜索直达页可缺层级）
  function pointsApiUrl(st) {
    const params = new URLSearchParams({ status: 'approved' });
    if (st.l1) params.set('l1', st.l1);
    if (st.l2) params.set('l2', st.l2);
    if (st.l3) params.set('l3', st.l3);
    if (st.tag) params.set('tag', st.tag);
    return '/api/points?' + params.toString();
  }

  async function showGroups(l1, l2) {
    // 从历史记录返回时重新进入“具体地图”页
    state.l1 = l1;
    state.l2 = l2;
    try {
      const maps = await getJSON('/api/maps?l1=' + encodeURIComponent(l1) +
        '&l2=' + encodeURIComponent(l2));
      state.mapsInfo = maps;
      showGroupsView(l1, l2, maps);
    } catch (e) {
      mapChips.innerHTML = '<div class="empty">地图加载失败</div>';
    }
  }

  async function showPoints(st) {
    state.l1 = st.l1 || '';
    state.l2 = st.l2 || '';
    state.l3 = st.l3 || '';
    state.tag = st.tag || '';
    layer1.hidden = true;
    layer2.hidden = true;
    layer3.hidden = true;
    pointsArea.hidden = false;
    fabSubmit.hidden = false;
    siteFooter.hidden = true;   // 非首页隐藏页脚
    // 层级/标签均可缺省：如搜索直达（只有地图）、标签筛选（只有 tag）
    const scope = [state.l1, state.l2, state.l3].filter(Boolean).join(' · ');
    pointsTitle.textContent = scope
      ? (state.tag ? `${scope} · #${state.tag}` : scope)
      : (state.tag ? `#${state.tag} 的全部点位` : '点位展示');
    const info = (state.mapsInfo || []).find(m => m.name === st.l3) || {};
    // 地图整图横幅（无整图则不显示）
    const banner = $('#mapBanner');
    if (info.full) {
      banner.hidden = false;
      const img = banner.querySelector('img');
      img.src = info.full;
      img.alt = st.l3;
      banner.querySelector('.map-banner-name').textContent = st.l3;
    } else {
      banner.hidden = true;
    }
    renderSkeleton();
    try {
      const points = await getJSON(pointsApiUrl(state));
      renderPoints(points);
    } catch (e) {
      pointsGrid.innerHTML = '<div class="empty">加载失败，请重试</div>';
    }
  }

  /* ---------------- 页面内返回按钮（走浏览器历史） ---------------- */

  $('#backToCats').addEventListener('click', () => history.back());
  $('#backToGroups').addEventListener('click', () => history.back());
  $('#backToMaps').addEventListener('click', () => history.back());

  function renderSkeleton() {
    pointsGrid.innerHTML = Array(6).fill(
      `<div class="skeleton-card">
        <div class="skeleton-block sk-img"></div>
        <div class="skeleton-block sk-line"></div>
        <div class="skeleton-block sk-line short"></div>
      </div>`).join('');
  }

  function getPointImages(p) {
    if (p.images && p.images.length) return p.images;
    return [{ thumb: p.thumb_url, original: p.original_url }];
  }

  // 旧数据标题为 untitle，对外统一展示为“未命名点位”（后台保留原值便于编辑）
  function displayName(title) {
    return title && title !== 'untitle' ? title : '未命名点位';
  }

  // 生成单张点位卡片 HTML（点位网格与分类/主题预览共用）
  function pointCardHTML(p, i) {
    const imgs = getPointImages(p);
    return `
      <div class="point-card animate-fadeInUp grid-item-${(i % 8) + 1}" data-point="${i}">
        <div class="thumb-wrap">
          <img src="${esc(imgs[0].thumb)}" alt="${esc(displayName(p.title))}" loading="lazy">
          ${imgs.length > 1 ? `<span class="multi-badge">×${imgs.length}</span>` : ''}
        </div>
        <div class="card-body">
          <div class="card-title">${esc(displayName(p.title))}</div>
          ${p.maps && p.maps.length > 1 ? `<div class="card-maps">${p.maps.map(m => `<span class="map-tag">${esc(m)}</span>`).join('')}</div>` : ''}
          ${p.tags ? `<div class="card-tags">${p.tags.split(/\s+/).filter(Boolean).map(t => `<span class="tag-chip" data-tag="${esc(t)}">${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
      </div>`;
  }

  // 渲染点位列表到网格，并绑定点击打开灯箱
  function renderPointsTo(grid, points) {
    if (!points.length) {
      grid.innerHTML = '<div class="empty">暂无已审核点位，点击右下角「投稿」卡片投稿</div>';
      return;
    }
    grid.innerHTML = points.map((p, i) => pointCardHTML(p, i)).join('');

    // 缩略图加载完成后淡入（骨架屏到实图的过渡）
    $$('.point-card img', grid).forEach(img => {
      if (img.complete) img.classList.add('loaded');
      else img.addEventListener('load', () => img.classList.add('loaded'));
    });

    $$('.point-card', grid).forEach(card =>
      card.addEventListener('click', () => openLightbox(points, +card.dataset.point)));

    // 标签 chip 可点击：跳到该标签的筛选结果页（不触发卡片的灯箱打开）
    $$('.tag-chip', grid).forEach(chip =>
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const tag = chip.dataset.tag;
        if (!tag) return;
        pushView({ v: 'points', tag });
        showPoints({ v: 'points', tag });
      }));
  }

  function renderPoints(points) {
    if (!points.length) {
      pointsGrid.innerHTML = '<div class="empty">该地图暂无已审核点位，点击右下角「投稿」卡片投稿</div>';
      return;
    }
    renderPointsTo(pointsGrid, points);
  }

  /* ---------------- 分类/主题投稿预览（避免投稿少显单薄） ---------------- */

  // 加载指定范围（分类 l1 或 分类+主题 l1+l2）的已审核点位，最多展示 PREVIEW_MAX 条；
  // 无数据时隐藏预览区块。block 未挂载或加载失败均静默隐藏。
  // key 为令牌标识：同一 key 的新请求会使旧请求结果作废，防止快速切换时串页。
  const PREVIEW_MAX = 3;
  const previewTokens = {};

  async function loadPreview(url, grid, block, key, moreBtn) {
    if (!grid || !block) return;
    key = key || 'default';
    const token = (previewTokens[key] = (previewTokens[key] || 0) + 1);
    try {
      const points = await getJSON(url);
      if (token !== previewTokens[key]) return;   // 已有更新的请求，丢弃旧结果
      if (!points.length) {
        // 空预览：分类/主题层不显示投稿 FAB，至少给一句投稿引导而不是整块消失
        grid.innerHTML = `<div class="empty">${key === 'cat' ? '本分类' : '本主题'}暂无已审核点位，点进具体地图后可点击右下角「投稿」（自动预填地图）</div>`;
        if (moreBtn) moreBtn.hidden = true;
        block.hidden = false;
        return;
      }
      renderPointsTo(grid, points.slice(0, PREVIEW_MAX));
      // 超出预览条数时展示“更多 →”，跳到对应范围的完整点位列表
      if (moreBtn) moreBtn.hidden = points.length <= PREVIEW_MAX;
      block.hidden = false;
    } catch (e) {
      if (token === previewTokens[key]) {
        block.hidden = true;
        if (moreBtn) moreBtn.hidden = true;
      }
    }
  }

  // “更多 →”点击：进入分类级 / 主题级的完整点位列表（不限定具体地图）
  $('#catPreviewMore').addEventListener('click', () => {
    const st = { v: 'points', l1: state.l1, l2: '', l3: '' };
    pushView(st);
    showPoints(st);
  });
  $('#groupPreviewMore').addEventListener('click', () => {
    const st = { v: 'points', l1: state.l1, l2: state.l2, l3: '' };
    pushView(st);
    showPoints(st);
  });

  /* ---------------- 弹层滚动锁定（移动端点投稿/看原图时页面不乱滚） ---------------- */

  function lockBodyScroll(lock) {
    document.body.style.overflow = lock ? 'hidden' : '';
  }

  // 弹层打开后还原滚动位置：部分移动浏览器会在遮罩显示时滚动页面（如把视口“对焦”到页脚的固定按钮）
  function restoreScroll(prevScroll) {
    const cur = window.scrollY || document.documentElement.scrollTop || 0;
    if (cur !== prevScroll) window.scrollTo(0, prevScroll);
  }

  /* ---------------- 原图灯箱（多图翻页、触摸滑动、点击缩放、返回键关闭） ---------------- */

  let lbItems = [];   // [{ src, title, desc }]
  let lbIndex = 0;
  let lbOpening = false;         // 灯箱打开中（防止重复压入返回标记）
  let lbCloseCleanup = false;    // 关闭时正在清理返回标记（popstate 触发后跳过渲染）
  const lbMask = $('#lightbox');
  const lbImg = $('#lbImg');

  // 点击图片在 原始尺寸（容器可滚动平移）与适应窗口 之间切换
  function setLbZoom(zoomed) {
    lbImg.classList.toggle('zoomed', zoomed);
    lbMask.classList.toggle('lb-zoomed', zoomed);
    if (zoomed) lbMask.querySelector('.lightbox').scrollTop = 0;
  }
  function lbZoomed() { return lbImg.classList.contains('zoomed'); }

  function openLightbox(points, pointIdx) {
    const flat = [];
    const firstIdx = [];
    points.forEach(p => {
      firstIdx.push(flat.length);
      getPointImages(p).forEach(im => flat.push({ src: im.original, title: displayName(p.title), desc: p.description || '' }));
    });
    lbItems = flat;
    lbIndex = Math.max(0, Math.min(firstIdx[pointIdx] ?? 0, flat.length - 1));
    renderLb();
    const prevScroll = window.scrollY || document.documentElement.scrollTop || 0;
    lbMask.hidden = false;
    // 压入返回标记：手机上看图时按系统返回键先关图，而不是退出当前层级
    if (!lbOpening) {
      lbOpening = true;
      history.pushState({ __lb: true }, '');
    }
    lockBodyScroll(true);
    restoreScroll(prevScroll);
  }

  function closeLightbox() {
    lbMask.hidden = true;
    setLbZoom(false);
    lockBodyScroll(false);
    // 清理返回标记：若当前在标记上则回退弹出它，保持历史栈不残留
    if (lbOpening) {
      lbOpening = false;
      if (history.state && history.state.__lb) {
        lbCloseCleanup = true;
        history.back();
      }
    }
  }

  function renderLb() {
    const item = lbItems[lbIndex];
    setLbZoom(false);   // 翻页后回到适应窗口模式
    lbImg.src = item.src;
    $('#lbTitle').textContent = `${item.title}（${lbIndex + 1}/${lbItems.length}）`;
    const descEl = $('#lbDesc');
    if (item.desc) {
      descEl.textContent = item.desc;
      descEl.hidden = false;
    } else {
      descEl.textContent = '';
      descEl.hidden = true;
    }
    $('#lbPrev').hidden = lbItems.length <= 1;
    $('#lbNext').hidden = lbItems.length <= 1;
    // 新标签页查看原图（攻略图文字较小时可直接看原始分辨率）
    const orig = $('#lbOriginal');
    orig.href = item.src;
    orig.hidden = !item.src;
  }

  function lbStep(delta) {
    lbIndex = (lbIndex + delta + lbItems.length) % lbItems.length;
    renderLb();
  }

  $('#closeLightbox').addEventListener('click', closeLightbox);
  $('#lbPrev').addEventListener('click', (e) => { e.stopPropagation(); lbStep(-1); });
  $('#lbNext').addEventListener('click', (e) => { e.stopPropagation(); lbStep(1); });
  lbMask.addEventListener('click', (e) => {
    if (e.target === lbMask) closeLightbox();
  });
  lbImg.addEventListener('click', () => setLbZoom(!lbZoomed()));
  $('#lbOriginal').addEventListener('click', (e) => e.stopPropagation());

  // 触摸滑动翻页（缩放模式下让位给图片平移滚动）
  let lbTouchX = 0, lbTouchY = 0;
  lbMask.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    lbTouchX = e.touches[0].clientX;
    lbTouchY = e.touches[0].clientY;
  }, { passive: true });
  lbMask.addEventListener('touchend', (e) => {
    if (lbZoomed() || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - lbTouchX;
    const dy = e.changedTouches[0].clientY - lbTouchY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 2) lbStep(dx < 0 ? 1 : -1);
  }, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (lbMask.hidden) return;
    if (e.key === 'ArrowLeft') lbStep(-1);
    else if (e.key === 'ArrowRight') lbStep(1);
    else if (e.key === 'Escape') closeLightbox();
  });

  /* ---------------- 投稿弹窗 ---------------- */

  const submitModal = $('#submitModal');
  const fCat = $('#fCat'), fGroup = $('#fGroup'), fMapList = $('#fMapList');
  const fabSubmit = $('#fabSubmit');
  let modalOpening = false;       // 弹窗打开中（防止重复压入返回标记）
  let modalCloseCleanup = false;  // 关闭时正在清理标记（popstate 触发后跳过渲染）

  function renderMapChecks(maps, container, checked) {
    container.innerHTML = maps.map((m) => `
      <label class="map-check-item">
        <input type="checkbox" value="${esc(m.name)}" ${checked.has(m.name) ? 'checked' : ''}>
        <span class="map-check-thumb">
          ${m.thumb ? `<img src="${esc(m.thumb)}" alt="${esc(m.name)}" loading="lazy">` : '<span class="map-card-placeholder"></span>'}
        </span>
        <span class="map-check-name">${esc(m.name)}</span>
      </label>`).join('');
  }

  function resetMapChecks(container) {
    container.innerHTML = '<p class="form-hint">请先选择地图主题</p>';
  }

  // 分类下拉只加载一次（弹窗内选项不变）
  let catsLoaded = false;
  async function ensureCatsLoaded() {
    if (catsLoaded) return;
    const cats = await getJSON('/api/categories');
    fCat.innerHTML = '<option value="">请选择</option>' +
      cats.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
    catsLoaded = true;
  }

  // 按当前分类填充地图主题下拉
  async function populateGroups() {
    fGroup.disabled = !fCat.value;
    resetMapChecks(fMapList);
    if (!fCat.value) { fGroup.innerHTML = '<option value="">先选分类</option>'; return; }
    fGroup.innerHTML = '<option value="">加载中...</option>';
    try {
      const groups = await getJSON('/api/groups?l1=' + encodeURIComponent(fCat.value));
      fGroup.innerHTML = '<option value="">请选择</option>' +
        groups.map(g => `<option value="${esc(g.name)}">${esc(g.name)}</option>`).join('');
    } catch (e) { toast('主题加载失败'); }
  }

  // 按当前分类+主题填充具体地图勾选列表
  async function populateMaps() {
    if (!fGroup.value) { resetMapChecks(fMapList); return; }
    fMapList.innerHTML = '<p class="form-hint">加载中...</p>';
    try {
      const maps = await getJSON('/api/maps?l1=' + encodeURIComponent(fCat.value) +
        '&l2=' + encodeURIComponent(fGroup.value));
      renderMapChecks(maps, fMapList, new Set());
    } catch (e) { toast('地图加载失败'); }
  }

  // 打开投稿弹窗并预填字段：prefill = {l1, l2, l3}
  async function openSubmitModal(prefill) {
    prefill = prefill || {};
    // 回填记住的投稿人昵称/邮箱（localStorage），免去每次重填
    fillRememberedSubmitter();
    // 重置图片选择：清空已选文件与 input，避免二次打开后重复选择同一文件不触发 change
    pickedFiles = [];
    fImage.value = '';
    renderFileList();
    const prevScroll = window.scrollY || document.documentElement.scrollTop || 0;
    submitModal.classList.remove('closing');
    submitModal.hidden = false;
    lockBodyScroll(true);
    restoreScroll(prevScroll);
    $('#formMsg').hidden = true;
    $('#formMsg').className = 'form-msg';
    // 压入标记状态：手机端点开投稿后按返回键时，先关闭弹窗而不是退出页面
    if (!modalOpening) {
      modalOpening = true;
      history.pushState({ __modal: true }, '');
    }
    try {
      await ensureCatsLoaded();
    } catch (e) { toast('分类加载失败'); return; }
    if (prefill.l1) fCat.value = prefill.l1;
    await populateGroups();
    if (prefill.l2 && Array.from(fGroup.options).some(o => o.value === prefill.l2)) {
      fGroup.value = prefill.l2;
    }
    await populateMaps();
    if (prefill.l3) {
      // 预勾选当前具体地图
      Array.from(fMapList.querySelectorAll('input[type="checkbox"]')).forEach(cb => {
        cb.checked = cb.value === prefill.l3;
      });
    }
  }

  // 关闭投稿弹窗（✕/遮罩/返回键/投稿成功自动关闭 共用）
  function closeSubmitModal() {
    if (submitModal.classList.contains('closing')) return;   // 动画进行中，避免重复关闭
    submitModal.classList.add('closing');
    // 清理返回键标记：若当前在标记上则回退弹出它，保持历史栈不残留重复条目
    // （不能用 replaceState 替换成旧视图——那会在栈里复制一份当前视图，多次投稿后
    //   左滑返回会一次次回到同一个页面，表现为“卡在当前界面退不出去”）
    if (modalOpening) {
      modalOpening = false;
      if (history.state && history.state.__modal) {
        modalCloseCleanup = true;
        history.back();
      }
    }
    // 等淡出动画播完再真正隐藏并解锁滚动
    setTimeout(() => {
      submitModal.classList.remove('closing');
      submitModal.hidden = true;
      lockBodyScroll(false);
    }, 180);
  }

  // 右下角投稿卡片：按当前浏览层级自动预填字段
  fabSubmit.addEventListener('click', () => {
    openSubmitModal({ l1: state.l1, l2: state.l2, l3: state.l3 });
  });
  // 阻止移动端点击后浏览器把焦点滚到页脚附近（固定按钮在文档坐标里的位置），导致画面跳到网站说明/致谢
  fabSubmit.addEventListener('mousedown', (e) => e.preventDefault());
  $('#closeSubmit').addEventListener('click', closeSubmitModal);
  submitModal.addEventListener('click', (e) => {
    if (e.target === submitModal) closeSubmitModal();
  });

  fCat.addEventListener('change', populateGroups);
  fGroup.addEventListener('change', populateMaps);

  // 桌面端 Esc 关闭投稿弹窗（灯箱打开时由灯箱自己的 Esc 处理，不重复关）
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || submitModal.hidden) return;
    if (!$('#lightbox').hidden) return;
    closeSubmitModal();
  });

  /* ---------------- 投稿人信息记忆（localStorage，隐私模式下静默降级） ---------------- */

  const LS_SUBMITTER = 'tjmap_submitter';
  const LS_EMAIL = 'tjmap_email';

  function rememberSubmitter() {
    try {
      localStorage.setItem(LS_SUBMITTER, $('#fSubmitter').value.trim());
      localStorage.setItem(LS_EMAIL, $('#fEmail').value.trim());
    } catch (e) { /* localStorage 不可用时跳过 */ }
  }

  function fillRememberedSubmitter() {
    try {
      if (!$('#fSubmitter').value) $('#fSubmitter').value = localStorage.getItem(LS_SUBMITTER) || '';
      if (!$('#fEmail').value) $('#fEmail').value = localStorage.getItem(LS_EMAIL) || '';
    } catch (e) { /* localStorage 不可用时跳过 */ }
  }

  /* ---------------- 图片多选预览 + 拖拽 + 大小预检 ---------------- */

  const fImage = $('#fImage');
  const fileDrop = $('#fileDrop');
  const fFileList = $('#fFileList');
  let pickedFiles = [];
  const MAX_FILE_MB = 10;   // 与后端 MAX_UPLOAD_SIZE 一致

  // 选文件时即按大小预检，避免填完整表单提交后才收到 413
  function filterOversized(files) {
    const ok = [], oversized = [];
    files.forEach(f => (f.size > MAX_FILE_MB * 1024 * 1024 ? oversized : ok).push(f));
    if (oversized.length) {
      toast('「' + oversized.map(f => f.name).join('」「') + `」超过 ${MAX_FILE_MB}MB，未加入上传列表`);
    }
    return ok;
  }

  function totalSizeMb(files) {
    return files.reduce((s, f) => s + f.size, 0) / 1024 / 1024;
  }

  fImage.addEventListener('change', () => {
    pickedFiles = filterOversized(Array.from(fImage.files));
    syncFileInput();
    renderFileList();
  });
  ['dragover', 'drop'].forEach(evt => fileDrop.addEventListener(evt, (e) => {
    e.preventDefault();
    fileDrop.classList.toggle('dragover', evt === 'dragover');
  }));
  fileDrop.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files && Array.from(e.dataTransfer.files);
    if (files && files.length) {
      pickedFiles = filterOversized(files);
      syncFileInput();
      renderFileList();
    }
  });

  function syncFileInput() {
    const dt = new DataTransfer();
    pickedFiles.forEach(f => dt.items.add(f));
    fImage.files = dt.files;
  }

  function renderFileList() {
    if (!pickedFiles.length) {
      fFileList.innerHTML = '';
      $('#fileHint').hidden = false;
      return;
    }
    $('#fileHint').hidden = true;
    fFileList.innerHTML = pickedFiles.map((f, i) => `
      <div class="file-row">
        <img class="file-row-thumb" src="${URL.createObjectURL(f)}" alt="预览">
        <div class="file-row-info">
          <div class="file-row-name">${esc(f.name)}</div>
        </div>
        <button type="button" class="btn-ghost" data-index="${i}">移除</button>
      </div>`).join('');
  }

  fFileList.addEventListener('click', (e) => {
    const btn = e.target.closest('.file-row .btn-ghost');
    if (!btn) return;
    pickedFiles.splice(+btn.dataset.index, 1);
    syncFileInput();
    renderFileList();
  });

  $('#submitForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#formMsg');
    const btn = $('#submitBtn');
    msg.hidden = true;

    if (!fCat.value || !fGroup.value) {
      showMsg(msg, '请选择分类和地图主题', 'error');
      return;
    }
    const checkedMaps = Array.from(fMapList.querySelectorAll('input[type="checkbox"]:checked'))
      .map(c => c.value);
    if (!checkedMaps.length) {
      showMsg(msg, '请至少选择一个具体地图', 'error');
      return;
    }
    if (!$('#fTitle').value.trim()) {
      showMsg(msg, '请填写标题', 'error');
      return;
    }
    if (!$('#fSubmitter').value.trim()) {
      showMsg(msg, '请填写投稿人', 'error');
      return;
    }
    if (!$('#fEmail').value.trim()) {
      showMsg(msg, '请填写投稿人邮箱', 'error');
      return;
    }
    if (!pickedFiles.length) {
      showMsg(msg, '请上传至少一张点位图片', 'error');
      return;
    }
    if (totalSizeMb(pickedFiles) > MAX_FILE_MB) {
      showMsg(msg, `图片总大小 ${totalSizeMb(pickedFiles).toFixed(1)}MB，超过 ${MAX_FILE_MB}MB 上限，请减少图片数量或压缩后再试`, 'error');
      return;
    }

    const fd = new FormData();
    fd.append('category_l1', fCat.value);
    fd.append('map_group_l2', fGroup.value);
    checkedMaps.forEach(m => fd.append('map_names_l3', m));
    fd.append('title', $('#fTitle').value.trim());
    fd.append('description', $('#fDesc').value.trim());
    fd.append('submitter', $('#fSubmitter').value.trim());
    fd.append('submitter_email', $('#fEmail').value.trim());
    pickedFiles.forEach(f => fd.append('images', f));

    btn.disabled = true;
    btn.textContent = '提交中...';
    try {
      const res = await fetch('/api/submit', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.ok) {
        showMsg(msg, '投稿成功！审核通过后将在此展示', 'ok');
        rememberSubmitter();        // 记住投稿人昵称/邮箱，下次投稿免重填
        e.target.reset();
        pickedFiles = [];
        syncFileInput();
        renderFileList();
        resetMapChecks(fMapList);
        fGroup.disabled = true;
        fillRememberedSubmitter();  // 重置后回填，弹窗里仍可见
        refreshCurrentData();   // 投稿完成后回拉当前页最新点位/预览
        // 投稿成功后自动关闭弹窗，避免手动关闭；重开后仍会按当前层级预填分类/地图
        setTimeout(() => {
          closeSubmitModal();
          toast('投稿成功！审核通过后将在此展示');
        }, 800);
      } else {
        showMsg(msg, data.error || '提交失败', 'error');
      }
    } catch (err) {
      showMsg(msg, '网络错误，请重试', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '提交投稿';
    }
  });

  /* ---------------- 提交后刷新当前视图（投稿完成立即回拉最新点位） ---------------- */

  // 按当前浏览层级刷新数据区：点位页刷新点位网格，分类/主题页刷新投稿预览。
  // 投稿为 pending 状态，审核通过后再回到本页即可看到，无需手动刷新。
  function refreshCurrentData() {
    if (state.l3 || state.tag) {
      getJSON(pointsApiUrl(state))
        .then(points => renderPoints(points))
        .catch(() => {});
    } else if (state.l2) {
      loadPreview('/api/points?status=approved&l1=' + encodeURIComponent(state.l1) +
        '&l2=' + encodeURIComponent(state.l2),
        $('#groupPreviewGrid'), $('#groupPreview'), 'group', $('#groupPreviewMore'));
    } else if (state.l1) {
      loadPreview('/api/points?status=approved&l1=' + encodeURIComponent(state.l1),
        $('#catPreviewGrid'), $('#catPreview'), 'cat', $('#catPreviewMore'));
    }
  }

  function showMsg(el, text, type) {
    el.textContent = text;
    el.className = 'form-msg ' + type;
    el.hidden = false;
  }

  /* ---------------- 启动 ---------------- */

  (async function init() {
    // 先加载分类（首页卡片 + URL 恢复时的分类校验），再按 URL 参数恢复层级视图：
    // ?l1=挂机果盘点位&l2=雪夜古堡&l3=雪夜古堡II 可直达点位页，刷新不丢状态
    await loadCategories();
    const initialState = stateFromLocation();
    history.replaceState(initialState, '', viewUrl(initialState));
    if (initialState.v !== 'cats') renderView(initialState);
  })();
})();
