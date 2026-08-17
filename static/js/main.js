/* ============================================================
   猫和老鼠点位查询 · 前端逻辑（原生 JS + fetch）
   页面切换仅刷新内容容器，不整页刷新
   ============================================================ */

(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

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
    if (st.v === 'maps') showMaps(st.l1);
    else if (st.v === 'groups') showGroups(st.l1, st.l2);
    else if (st.v === 'points') showPoints(st);
    else showCats();
  }

  window.addEventListener('popstate', () => renderView(history.state));

  /* ---------------- 视图渲染 ---------------- */

  function showCats() {
    layer1.hidden = false;
    layer2.hidden = true;
    layer3.hidden = true;
    pointsArea.hidden = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderIntro(info) {
    $('#introIcon').src = info.icon || '';
    $('#introIcon').alt = info.name || '';
    $('#introTitle').textContent = info.name || '';
    $('#introDesc').textContent = info.description || '';
    $('#introTips').innerHTML = (info.tips || []).map(t => `<li>${esc(t)}</li>`).join('');
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
    renderIntro(state.cats.find(c => c.name === l1) || {});
    groupChips.innerHTML = '<div class="loading-text">加载主题中...</div>';
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

  function renderPoints(points) {
    if (!points.length) {
      pointsGrid.innerHTML = '<div class="empty">该地图暂无已审核点位，点击上方「投稿」按钮投稿</div>';
      return;
    }
    pointsGrid.innerHTML = points.map((p, i) => {
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
          ${p.tags ? `<div class="card-tags">${esc(p.tags)}</div>` : ''}
        </div>
      </div>`;
    }).join('');

    // 缩略图加载完成后淡入（骨架屏到实图的过渡）
    $$('.point-card img').forEach(img => {
      if (img.complete) img.classList.add('loaded');
      else img.addEventListener('load', () => img.classList.add('loaded'));
    });

    $$('.point-card').forEach(card =>
      card.addEventListener('click', () => openLightbox(points, +card.dataset.point)));
  }

  /* ---------------- 原图灯箱（多图翻页） ---------------- */

  let lbItems = [];   // [{ src, title }]
  let lbIndex = 0;

  function openLightbox(points, pointIdx) {
    const flat = [];
    const firstIdx = [];
    points.forEach(p => {
      firstIdx.push(flat.length);
      getPointImages(p).forEach(im => flat.push({ src: im.original, title: p.title }));
    });
    lbItems = flat;
    lbIndex = Math.max(0, Math.min(firstIdx[pointIdx] ?? 0, flat.length - 1));
    renderLb();
    $('#lightbox').hidden = false;
  }

  function renderLb() {
    const item = lbItems[lbIndex];
    $('#lbImg').src = item.src;
    $('#lbTitle').textContent = `${item.title}（${lbIndex + 1}/${lbItems.length}）`;
    $('#lbPrev').hidden = lbItems.length <= 1;
    $('#lbNext').hidden = lbItems.length <= 1;
  }

  function lbStep(delta) {
    lbIndex = (lbIndex + delta + lbItems.length) % lbItems.length;
    renderLb();
  }

  $('#closeLightbox').addEventListener('click', () => { $('#lightbox').hidden = true; });
  $('#lbPrev').addEventListener('click', (e) => { e.stopPropagation(); lbStep(-1); });
  $('#lbNext').addEventListener('click', (e) => { e.stopPropagation(); lbStep(1); });
  $('#lightbox').addEventListener('click', (e) => {
    if (e.target === $('#lightbox')) $('#lightbox').hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if ($('#lightbox').hidden) return;
    if (e.key === 'ArrowLeft') lbStep(-1);
    else if (e.key === 'ArrowRight') lbStep(1);
    else if (e.key === 'Escape') $('#lightbox').hidden = true;
  });

  /* ---------------- 投稿弹窗 ---------------- */

  const submitModal = $('#submitModal');
  const fCat = $('#fCat'), fGroup = $('#fGroup'), fMapList = $('#fMapList');

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

  $('#navSubmit').addEventListener('click', openSubmitModal);

  async function openSubmitModal() {
    if (submitModal.hidden) {
      $('#formMsg').hidden = true;
      $('#formMsg').className = 'form-msg';
      // 载入分类下拉
      try {
        const cats = await getJSON('/api/categories');
        fCat.innerHTML = '<option value="">请选择</option>' +
          cats.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
      } catch (e) { toast('分类加载失败'); return; }
      fGroup.innerHTML = '<option value="">先选分类</option>';
      resetMapChecks(fMapList);
      fGroup.disabled = true;
    }
    submitModal.hidden = !submitModal.hidden;
  }
  $('#closeSubmit').addEventListener('click', () => { submitModal.hidden = true; });
  submitModal.addEventListener('click', (e) => {
    if (e.target === submitModal) submitModal.hidden = true;
  });

  fCat.addEventListener('change', async () => {
    fGroup.disabled = !fCat.value;
    resetMapChecks(fMapList);
    if (!fCat.value) { fGroup.innerHTML = '<option value="">先选分类</option>'; return; }
    fGroup.innerHTML = '<option value="">加载中...</option>';
    try {
      const groups = await getJSON('/api/groups?l1=' + encodeURIComponent(fCat.value));
      fGroup.innerHTML = '<option value="">请选择</option>' +
        groups.map(g => `<option value="${esc(g.name)}">${esc(g.name)}</option>`).join('');
    } catch (e) { toast('主题加载失败'); }
  });

  fGroup.addEventListener('change', async () => {
    if (!fGroup.value) { resetMapChecks(fMapList); return; }
    fMapList.innerHTML = '<p class="form-hint">加载中...</p>';
    try {
      const maps = await getJSON('/api/maps?l1=' + encodeURIComponent(fCat.value) +
        '&l2=' + encodeURIComponent(fGroup.value));
      renderMapChecks(maps, fMapList, new Set());
    } catch (e) { toast('地图加载失败'); }
  });

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

  function showMsg(el, text, type) {
    el.textContent = text;
    el.className = 'form-msg ' + type;
    el.hidden = false;
  }

  /* ---------------- 启动 ---------------- */

  history.replaceState({ v: 'cats' }, '');
  loadCategories();
})();
