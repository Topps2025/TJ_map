/* ============================================================
   猫和老鼠点位查询 · 前端逻辑（原生 JS + fetch）
   页面切换仅刷新内容容器，不整页刷新
   ============================================================ */

(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const state = { l1: '', l2: '', l3: '', mapsInfo: [] };

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
      catTabs.innerHTML = cats.map((c, i) =>
        `<button class="cat-tab" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
      $$('.cat-tab').forEach(btn =>
        btn.addEventListener('click', () => selectCategory(btn.dataset.cat)));
    } catch (e) {
      catTabs.innerHTML = '<div class="empty">分类加载失败，请刷新</div>';
    }
  }

  async function selectCategory(cat) {
    state.l1 = cat;
    state.l2 = '';
    state.l3 = '';
    $$('.cat-tab').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
    layer3.hidden = true;
    pointsArea.hidden = true;
    layer2.hidden = false;
    groupChips.innerHTML = '<div class="loading-text">加载主题中...</div>';
    try {
      const groups = await getJSON('/api/groups?l1=' + encodeURIComponent(cat));
      groupChips.innerHTML = groups.map(g => `
        <button class="map-card" data-name="${esc(g.name)}">
          <span class="map-card-thumb">
            ${g.thumb ? `<img src="${esc(g.thumb)}" alt="${esc(g.name)}" loading="lazy">` : '<span class="map-card-placeholder"></span>'}
          </span>
          <span class="map-card-name">${esc(g.name)}</span>
        </button>`).join('');
      $$('#groupChips .map-card').forEach(btn =>
        btn.addEventListener('click', () => selectGroup(btn.dataset.name)));
    } catch (e) {
      groupChips.innerHTML = '<div class="empty">主题加载失败</div>';
    }
  }

  /* ---------------- 第二层：地图主题 ---------------- */

  async function selectGroup(group) {
    state.l2 = group;
    state.l3 = '';
    $$('#groupChips .map-card').forEach(b => b.classList.toggle('active', b.dataset.name === group));
    pointsArea.hidden = true;
    layer3.hidden = false;
    mapChips.innerHTML = '<div class="loading-text">加载地图中...</div>';
    try {
      const maps = await getJSON('/api/maps?l1=' + encodeURIComponent(state.l1) +
        '&l2=' + encodeURIComponent(group));
      mapChips.innerHTML = maps.map(m => `
        <button class="map-card" data-name="${esc(m.name)}">
          <span class="map-card-thumb">
            ${m.thumb ? `<img src="${esc(m.thumb)}" alt="${esc(m.name)}" loading="lazy">` : '<span class="map-card-placeholder"></span>'}
          </span>
          <span class="map-card-name">${esc(m.name)}</span>
        </button>`).join('');
      state.mapsInfo = maps;
      $$('#mapChips .map-card').forEach(btn =>
        btn.addEventListener('click', () => selectMap(btn.dataset.name)));
    } catch (e) {
      mapChips.innerHTML = '<div class="empty">地图加载失败</div>';
    }
  }

  /* ---------------- 第三层：具体地图 -> 点位 ---------------- */

  async function selectMap(map) {
    state.l3 = map;
    $$('#mapChips .map-card').forEach(b => b.classList.toggle('active', b.dataset.name === map));
    const info = (state.mapsInfo || []).find(m => m.name === map) || {};
    pointsArea.hidden = false;
    pointsTitle.textContent = `${state.l1} · ${state.l2} · ${map}`;
    // 地图整图横幅（娱乐地图无整图则不显示）
    const banner = $('#mapBanner');
    if (info.full) {
      banner.hidden = false;
      const img = banner.querySelector('img');
      img.src = info.full;
      img.alt = map;
      banner.querySelector('.map-banner-name').textContent = map;
    } else {
      banner.hidden = true;
    }
    renderSkeleton();
    try {
      const points = await getJSON('/api/points?status=approved' +
        '&l1=' + encodeURIComponent(state.l1) +
        '&l2=' + encodeURIComponent(state.l2) +
        '&l3=' + encodeURIComponent(state.l3));
      renderPoints(points);
    } catch (e) {
      pointsGrid.innerHTML = '<div class="empty">加载失败，请重试</div>';
    }
  }

  function renderSkeleton() {
    pointsGrid.innerHTML = Array(6).fill(
      `<div class="skeleton-card">
        <div class="skeleton-block sk-img"></div>
        <div class="skeleton-block sk-line"></div>
        <div class="skeleton-block sk-line short"></div>
      </div>`).join('');
  }

  function renderPoints(points) {
    if (!points.length) {
      pointsGrid.innerHTML = '<div class="empty">该地图暂无已审核点位，点击右下角投稿</div>';
      return;
    }
    pointsGrid.innerHTML = points.map(p => `
      <div class="point-card" data-original="${esc(p.original_url)}">
        <div class="thumb-wrap">
          <img src="${esc(p.thumb_url)}" alt="${esc(p.title)}" loading="lazy">
        </div>
        <div class="card-body"><div class="card-title">${esc(p.title)}</div></div>
      </div>`).join('');

    // 缩略图加载完成后淡入（骨架屏到实图的过渡）
    $$('.point-card img').forEach(img => {
      if (img.complete) img.classList.add('loaded');
      else img.addEventListener('load', () => img.classList.add('loaded'));
    });

    $$('.point-card').forEach(card =>
      card.addEventListener('click', () => openLightbox(
        card.dataset.original, card.querySelector('.card-title').textContent)));
  }

  /* ---------------- 原图灯箱 ---------------- */

  function openLightbox(src, title) {
    $('#lbImg').src = src;
    $('#lbTitle').textContent = title || '';
    $('#lightbox').hidden = false;
  }
  $('#closeLightbox').addEventListener('click', () => { $('#lightbox').hidden = true; });
  $('#lightbox').addEventListener('click', (e) => {
    if (e.target === $('#lightbox')) $('#lightbox').hidden = true;
  });

  /* ---------------- 投稿弹窗 ---------------- */

  const submitModal = $('#submitModal');
  const fCat = $('#fCat'), fGroup = $('#fGroup'), fMap = $('#fMap');

  $('#openSubmit').addEventListener('click', async () => {
    if (submitModal.hidden) {
      $('#formMsg').hidden = true;
      $('#formMsg').className = 'form-msg';
      // 载入分类下拉
      try {
        const cats = await getJSON('/api/categories');
        fCat.innerHTML = '<option value="">请选择</option>' +
          cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
      } catch (e) { toast('分类加载失败'); return; }
      fGroup.innerHTML = '<option value="">先选分类</option>';
      fMap.innerHTML = '<option value="">先选主题</option>';
      fGroup.disabled = true;
      fMap.disabled = true;
    }
    submitModal.hidden = !submitModal.hidden;
  });
  $('#closeSubmit').addEventListener('click', () => { submitModal.hidden = true; });
  submitModal.addEventListener('click', (e) => {
    if (e.target === submitModal) submitModal.hidden = true;
  });

  fCat.addEventListener('change', async () => {
    fGroup.disabled = !fCat.value;
    fMap.disabled = true;
    fMap.innerHTML = '<option value="">先选主题</option>';
    if (!fCat.value) { fGroup.innerHTML = '<option value="">先选分类</option>'; return; }
    fGroup.innerHTML = '<option value="">加载中...</option>';
    try {
      const groups = await getJSON('/api/groups?l1=' + encodeURIComponent(fCat.value));
      fGroup.innerHTML = '<option value="">请选择</option>' +
        groups.map(g => `<option value="${esc(g.name)}">${esc(g.name)}</option>`).join('');
    } catch (e) { toast('主题加载失败'); }
  });

  fGroup.addEventListener('change', async () => {
    fMap.disabled = !fGroup.value;
    if (!fGroup.value) { fMap.innerHTML = '<option value="">先选主题</option>'; return; }
    fMap.innerHTML = '<option value="">加载中...</option>';
    try {
      const maps = await getJSON('/api/maps?l1=' + encodeURIComponent(fCat.value) +
        '&l2=' + encodeURIComponent(fGroup.value));
      fMap.innerHTML = '<option value="">请选择</option>' +
        maps.map(m => `<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('');
    } catch (e) { toast('地图加载失败'); }
  });

  // 图片预览 + 拖拽
  const fImage = $('#fImage');
  const fileDrop = $('#fileDrop');
  const filePreview = $('#filePreview');

  fImage.addEventListener('change', () => previewFile(fImage.files[0]));
  ['dragover', 'drop'].forEach(evt => fileDrop.addEventListener(evt, (e) => {
    e.preventDefault();
    fileDrop.classList.toggle('dragover', evt === 'dragover');
  }));
  fileDrop.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) { fImage.files = e.dataTransfer.files; previewFile(f); }
  });

  function previewFile(file) {
    if (!file) return;
    if (!/\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
      toast('仅支持图片文件');
      return;
    }
    $('#fileHint').hidden = true;
    filePreview.hidden = false;
    filePreview.src = URL.createObjectURL(file);
  }

  $('#submitForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#formMsg');
    const btn = $('#submitBtn');
    msg.hidden = true;

    if (!fCat.value || !fGroup.value || !fMap.value) {
      showMsg(msg, '请完整选择分类、主题和地图', 'error');
      return;
    }
    if (!$('#fTitle').value.trim()) {
      showMsg(msg, '请填写点位描述', 'error');
      return;
    }
    if (!fImage.files.length) {
      showMsg(msg, '请上传点位图片', 'error');
      return;
    }

    const fd = new FormData();
    fd.append('category_l1', fCat.value);
    fd.append('map_group_l2', fGroup.value);
    fd.append('map_name_l3', fMap.value);
    fd.append('title', $('#fTitle').value.trim());
    fd.append('image', fImage.files[0]);
    fd.append('submitter_email', $('#fEmail').value.trim());

    btn.disabled = true;
    btn.textContent = '提交中...';
    try {
      const res = await fetch('/api/submit', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.ok) {
        showMsg(msg, '投稿成功！审核通过后将在此展示', 'ok');
        e.target.reset();
        filePreview.hidden = true;
        $('#fileHint').hidden = false;
        fGroup.disabled = true;
        fMap.disabled = true;
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

  loadCategories();
})();
