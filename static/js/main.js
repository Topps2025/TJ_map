/* ============================================================
   猫和老鼠点位查询 · 前端逻辑（原生 JS + fetch）
   页面切换仅刷新内容容器，不整页刷新
   ============================================================ */

(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s, scope) => Array.from((scope || document).querySelectorAll(s));

  const state = { l1: '', l2: '', l3: '', mapsInfo: [], cats: [] };

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

  /* ---------------- 视图状态（支持浏览器前进/后退） ---------------- */

  function pushView(st) {
    history.pushState(st, '');
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
    // 关闭弹窗时我们主动 history.back() 清理标记：本次事件只清栈、不渲染视图
    if (modalCloseCleanup) {
      modalCloseCleanup = false;
      return;
    }
    const st = history.state;
    if (st && st.__modal) return;          // 返回键刚把标记弹掉：保持当前视图
    if (!submitModal.hidden) {
      closeSubmitModal();                  // 弹窗打开时按返回键：仅关闭弹窗，不退出当前层级
      return;
    }
    renderView(st);
  });

  /* ---------------- 视图渲染 ---------------- */

  function showCats() {
    state.l1 = '';
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
        $('#catPreviewGrid'), $('#catPreview'), 'cat');
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
      $('#groupPreviewGrid'), $('#groupPreview'), 'group');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- 具体地图 -> 点位 ---------------- */

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
    state.l1 = st.l1;
    state.l2 = st.l2;
    state.l3 = st.l3;
    layer1.hidden = true;
    layer2.hidden = true;
    layer3.hidden = true;
    pointsArea.hidden = false;
    fabSubmit.hidden = false;
    siteFooter.hidden = true;   // 非首页隐藏页脚
    pointsTitle.textContent = `${st.l1} · ${st.l2} · ${st.l3}`;
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
      const points = await getJSON('/api/points?status=approved' +
        '&l1=' + encodeURIComponent(st.l1) +
        '&l2=' + encodeURIComponent(st.l2) +
        '&l3=' + encodeURIComponent(st.l3));
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

  // 生成单张点位卡片 HTML（点位网格与分类/主题预览共用）
  function pointCardHTML(p, i) {
    const imgs = getPointImages(p);
    return `
      <div class="point-card animate-fadeInUp grid-item-${(i % 8) + 1}" data-point="${i}">
        <div class="thumb-wrap">
          <img src="${esc(imgs[0].thumb)}" alt="${esc(p.title)}" loading="lazy">
          ${imgs.length > 1 ? `<span class="multi-badge">×${imgs.length}</span>` : ''}
        </div>
        <div class="card-body">
          <div class="card-title">${esc(p.title)}</div>
          ${p.maps && p.maps.length > 1 ? `<div class="card-maps">${p.maps.map(m => `<span class="map-tag">${esc(m)}</span>`).join('')}</div>` : ''}
          ${p.tags ? `<div class="card-tags">${p.tags.split(/\s+/).filter(Boolean).map(t => `<span class="tag-chip">${esc(t)}</span>`).join('')}</div>` : ''}
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
  const PREVIEW_MAX = 8;
  const previewTokens = {};

  async function loadPreview(url, grid, block, key) {
    if (!grid || !block) return;
    key = key || 'default';
    const token = (previewTokens[key] = (previewTokens[key] || 0) + 1);
    try {
      const points = await getJSON(url);
      if (token !== previewTokens[key]) return;   // 已有更新的请求，丢弃旧结果
      if (!points.length) { block.hidden = true; return; }
      renderPointsTo(grid, points.slice(0, PREVIEW_MAX));
      block.hidden = false;
    } catch (e) {
      if (token === previewTokens[key]) block.hidden = true;
    }
  }

  /* ---------------- 弹层滚动锁定（移动端点投稿/看原图时页面不乱滚） ---------------- */

  function lockBodyScroll(lock) {
    document.body.style.overflow = lock ? 'hidden' : '';
  }

  // 弹层打开后还原滚动位置：部分移动浏览器会在遮罩显示时滚动页面（如把视口“对焦”到页脚的固定按钮）
  function restoreScroll(prevScroll) {
    const cur = window.scrollY || document.documentElement.scrollTop || 0;
    if (cur !== prevScroll) window.scrollTo(0, prevScroll);
  }

  /* ---------------- 原图灯箱（多图翻页） ---------------- */

  let lbItems = [];   // [{ src, title, desc }]
  let lbIndex = 0;

  function openLightbox(points, pointIdx) {
    const flat = [];
    const firstIdx = [];
    points.forEach(p => {
      firstIdx.push(flat.length);
      getPointImages(p).forEach(im => flat.push({ src: im.original, title: p.title, desc: p.description || '' }));
    });
    lbItems = flat;
    lbIndex = Math.max(0, Math.min(firstIdx[pointIdx] ?? 0, flat.length - 1));
    renderLb();
    const prevScroll = window.scrollY || document.documentElement.scrollTop || 0;
    $('#lightbox').hidden = false;
    lockBodyScroll(true);
    restoreScroll(prevScroll);
  }

  function closeLightbox() {
    $('#lightbox').hidden = true;
    lockBodyScroll(false);
  }

  function renderLb() {
    const item = lbItems[lbIndex];
    $('#lbImg').src = item.src;
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
  }

  function lbStep(delta) {
    lbIndex = (lbIndex + delta + lbItems.length) % lbItems.length;
    renderLb();
  }

  $('#closeLightbox').addEventListener('click', closeLightbox);
  $('#lbPrev').addEventListener('click', (e) => { e.stopPropagation(); lbStep(-1); });
  $('#lbNext').addEventListener('click', (e) => { e.stopPropagation(); lbStep(1); });
  $('#lightbox').addEventListener('click', (e) => {
    if (e.target === $('#lightbox')) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if ($('#lightbox').hidden) return;
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

  // 图片多选预览 + 拖拽
  const fImage = $('#fImage');
  const fileDrop = $('#fileDrop');
  const fFileList = $('#fFileList');
  let pickedFiles = [];

  fImage.addEventListener('change', () => {
    pickedFiles = Array.from(fImage.files);
    renderFileList();
  });
  ['dragover', 'drop'].forEach(evt => fileDrop.addEventListener(evt, (e) => {
    e.preventDefault();
    fileDrop.classList.toggle('dragover', evt === 'dragover');
  }));
  fileDrop.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files && Array.from(e.dataTransfer.files);
    if (files && files.length) {
      pickedFiles = files;
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
        e.target.reset();
        pickedFiles = [];
        syncFileInput();
        renderFileList();
        resetMapChecks(fMapList);
        fGroup.disabled = true;
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
    if (state.l3) {
      getJSON('/api/points?status=approved' +
        '&l1=' + encodeURIComponent(state.l1) +
        '&l2=' + encodeURIComponent(state.l2) +
        '&l3=' + encodeURIComponent(state.l3))
        .then(points => renderPoints(points))
        .catch(() => {});
    } else if (state.l2) {
      loadPreview('/api/points?status=approved&l1=' + encodeURIComponent(state.l1) +
        '&l2=' + encodeURIComponent(state.l2),
        $('#groupPreviewGrid'), $('#groupPreview'), 'group');
    } else if (state.l1) {
      loadPreview('/api/points?status=approved&l1=' + encodeURIComponent(state.l1),
        $('#catPreviewGrid'), $('#catPreview'), 'cat');
    }
  }

  function showMsg(el, text, type) {
    el.textContent = text;
    el.className = 'form-msg ' + type;
    el.hidden = false;
  }

  /* ---------------- 启动 ---------------- */

  history.replaceState({ v: 'cats' }, '');
  loadCategories();
})();
