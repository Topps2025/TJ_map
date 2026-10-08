import { $, $$, esc, toast, linkifyText } from './ui.js';
import { getJSON, pointsApiUrl } from './api.js';
import { parentView } from './navigation.js';

// 浏览状态仅由本模块修改，投稿通过 getContext 获取当前层级快照。
export function createBrowser({ navigation, points }) {
  const { navigate } = navigation;
  const { renderSkeleton, renderPoints, loadPreview } = points;
  const state = { l1: '', l2: '', l3: '', tag: '', mapsInfo: [], cats: [] };

  const layer1 = $('#layer1');
  const browseStatus = $('#browseStatus');
  const homeGuide = $('#homeGuide');
  let viewVersion = 0;
  const layer2 = $('#layer2');
  const layer3 = $('#layer3');
  const pointsArea = $('#pointsArea');
  const catTabs = $('#catTabs');
  const groupChips = $('#groupChips');
  const mapChips = $('#mapChips');
  const pointsGrid = $('#pointsGrid');
  const pointsTitle = $('#pointsTitle');
  const fabSubmit = $('#fabSubmit');
  const siteFooter = $('.site-footer');

  /* ---------------- 第一层：分类 ---------------- */

  async function loadCategories() {
    try {
      const cats = await getJSON('/api/categories');
      state.cats = cats;
      catTabs.innerHTML = cats.map((c, i) => `
        <button class="cat-card" data-cat="${esc(c.name)}" aria-label="${esc(c.name)}" aria-pressed="false" title="${esc(c.name)}">
          <span class="cat-card-thumb">
            ${c.icon ? `<img src="${esc(c.icon)}" alt="${esc(c.name)}" loading="lazy">` : '<span class="cat-card-placeholder"></span>'}
          </span>
          <span class="cat-card-name">${esc(c.name)}</span>
        </button>`).join('');
      $$('.cat-card').forEach(btn =>
        btn.addEventListener('click', () => {
          navigate({ v: 'maps', l1: btn.dataset.cat });
        }));
    } catch (e) {
      catTabs.innerHTML = '<div class="empty">分类加载失败，请刷新</div>';
    }
  }

  function renderView(st) {
    if (!st) st = { v: 'cats' };
    homeGuide.hidden = ['maps', 'groups', 'points'].includes(st.v);
    if (st.v === 'maps') showMaps(st.l1);
    else if (st.v === 'groups') showGroups(st.l1, st.l2);
    else if (st.v === 'points') showPoints(st);
    else showCats();
  }

  /* ---------------- 视图渲染 ---------------- */

  function setActiveCategory(l1) {
    $$('.cat-card').forEach(btn => {
      const active = btn.dataset.cat === l1;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  function showCats() {
    viewVersion++;
    Object.assign(state, { l1: '', l2: '', l3: '', tag: '' });
    setActiveCategory('');
    homeGuide.hidden = false;
    layer2.hidden = true;
    layer3.hidden = true;
    pointsArea.hidden = true;
    fabSubmit.hidden = true;
    siteFooter.hidden = false;
    browseStatus.hidden = state.cats.length > 0;
    if (!state.cats.length) {
      browseStatus.hidden = false;
      browseStatus.textContent = '分类暂时无法加载，请刷新页面重试。';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderIntro(info) {
    $('#introIcon').src = info.icon || '';
    $('#introIcon').alt = info.name || '';
    $('#introTitle').textContent = info.name || '';
    $('#introDesc').innerHTML = linkifyText(info.description);
    $('#introTips').innerHTML = (info.tips || []).map(t => `<li>${esc(t)}</li>`).join('');
  }

  async function showMaps(l1) {
    const version = ++viewVersion;
    browseStatus.hidden = true;
    $('#backToCats').hidden = false;
    state.l1 = l1;
    state.l2 = '';
    state.l3 = '';
    state.tag = '';
    setActiveCategory(l1);
    layer1.hidden = false;
    layer2.hidden = false;
    layer3.hidden = true;
    pointsArea.hidden = true;
    fabSubmit.hidden = true;   // 点进具体分类的介绍页不显示投稿卡片（进入具体地图后再出现）
    siteFooter.hidden = true;
    renderIntro(state.cats.find(c => c.name === l1) || {});
    groupChips.innerHTML = '<div class="loading-text">加载主题中...</div>';
    $('#catPreview').hidden = true;   // 隐藏旧分类的预览，等待新数据
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const groups = await getJSON('/api/groups?l1=' + encodeURIComponent(l1));
      if (version !== viewVersion) return;
      groupChips.innerHTML = groups.map((g, i) => `
        <button class="map-card animate-fadeInUp grid-item-${(i % 8) + 1}" data-name="${esc(g.name)}">
          <span class="map-card-thumb">
            ${g.thumb ? `<img src="${esc(g.thumb)}" alt="${esc(g.name)}" loading="lazy">` : '<span class="map-card-placeholder"></span>'}
          </span>
          <span class="map-card-name">${esc(g.name)}</span>
        </button>`).join('');
      $$('#groupChips .map-card').forEach(btn =>
        btn.addEventListener('click', () => openGroup(l1, btn.dataset.name)));
      // 分类投稿预览：展示该分类下已审核点位（最多 3 条）
      loadPreview('/api/points?status=approved&l1=' + encodeURIComponent(l1),
        $('#catPreviewGrid'), $('#catPreview'), 'cat', $('#catPreviewMore'));
    } catch (e) {
      if (version !== viewVersion) return;
      groupChips.innerHTML = '<div class="empty">主题加载失败</div>';
    }
  }

  /* ---------------- 地图大类 -> 具体地图 / 点位 ---------------- */

  async function openGroup(l1, l2) {
    const version = ++viewVersion;
    state.l1 = l1;
    state.l2 = l2;
    try {
      const maps = await getJSON('/api/maps?l1=' + encodeURIComponent(l1) +
        '&l2=' + encodeURIComponent(l2));
      if (version !== viewVersion) return;
      state.mapsInfo = maps;
      if (maps.length === 1) {
        // 单地图大类：该地图即具体地图，直接进入点位，跳过地图选择
        navigate({ v: 'points', l1, l2, l3: maps[0].name });
        return;
      }
      navigation.pushView({ v: 'groups', l1, l2 });
      showGroupsView(l1, l2, maps);
    } catch (e) {
      toast('地图加载失败');
    }
  }

  function showGroupsView(l1, l2, maps) {
    browseStatus.hidden = true;
    state.l3 = '';   // 主题（地图大类）层不预选具体地图，投稿时让用户自行勾选
    state.tag = '';
    layer1.hidden = false;
    setActiveCategory(l1);
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
        navigate({ v: 'points', l1, l2, l3: btn.dataset.name });
      }));
    $('#groupPreview').hidden = true;   // 隐藏旧主题的预览，等待新数据
    // 主题投稿预览：展示该分类+主题下已审核点位（最多 3 条）
    loadPreview('/api/points?status=approved&l1=' + encodeURIComponent(l1) +
      '&l2=' + encodeURIComponent(l2),
      $('#groupPreviewGrid'), $('#groupPreview'), 'group', $('#groupPreviewMore'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- 具体地图 -> 点位 ---------------- */

  async function showGroups(l1, l2) {
    const version = ++viewVersion;
    // 从历史记录返回时重新进入“具体地图”页
    state.l1 = l1;
    state.l2 = l2;
    try {
      const maps = await getJSON('/api/maps?l1=' + encodeURIComponent(l1) +
        '&l2=' + encodeURIComponent(l2));
      if (version !== viewVersion) return;
      state.mapsInfo = maps;
      showGroupsView(l1, l2, maps);
    } catch (e) {
      mapChips.innerHTML = '<div class="empty">地图加载失败</div>';
    }
  }

  async function showPoints(st) {
    const version = ++viewVersion;
    browseStatus.hidden = true;
    state.l1 = st.l1 || '';
    state.l2 = st.l2 || '';
    state.l3 = st.l3 || '';
    state.tag = st.tag || '';
    layer1.hidden = false;
    setActiveCategory(state.l1);
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
    $('#tagActions').hidden = !state.tag;
    $('#globalTag').hidden = !scope;
    renderSkeleton();
    try {
      const points = await getJSON(pointsApiUrl(state));
      if (version !== viewVersion) return;
      renderPoints(points);
    } catch (e) {
      if (version !== viewVersion) return;
      pointsGrid.innerHTML = '<div class="empty">加载失败，请重试</div>';
    }
  }

  /* ---------------- 页面内返回按钮（按层级导航） ---------------- */

  $('#backToCats').addEventListener('click', () => navigate({ v: 'cats' }));
  $('#backToGroups').addEventListener('click', () => navigate(state.l1 ? { v: 'maps', l1: state.l1 } : { v: 'cats' }));
  $('#backToMaps').addEventListener('click', () => navigate(parentView(state)));
  $('#clearTag').addEventListener('click', () => navigate({ v: 'points', l1: state.l1, l2: state.l2, l3: state.l3 }));
  $('#globalTag').addEventListener('click', () => navigate({ v: 'points', tag: state.tag }));

  // “更多 →”点击：进入分类级 / 主题级的完整点位列表（不限定具体地图）
  $('#catPreviewMore').addEventListener('click', () => {
    const st = { v: 'points', l1: state.l1, l2: '', l3: '' };
    navigate(st);
  });
  $('#groupPreviewMore').addEventListener('click', () => {
    const st = { v: 'points', l1: state.l1, l2: state.l2, l3: '' };
    navigate(st);
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

  return {
    loadCategories,
    renderView,
    refreshCurrentData,
    getCategories: () => state.cats,
    getContext: () => ({ l1: state.l1, l2: state.l2, l3: state.l3 }),
  };
}
