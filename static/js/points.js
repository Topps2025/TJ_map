import { $, $$, esc } from './ui.js';
import { getJSON } from './api.js';

export function getPointImages(p) {
  if (p.images && p.images.length) return p.images;
  return [{ thumb: p.thumb_url, original: p.original_url }];
}

// 旧数据标题为 untitle，对外统一展示为“未命名点位”（后台保留原值便于编辑）
export function displayName(title) {
  return title && title !== 'untitle' ? title : '未命名点位';
}

// 点位卡片、列表与预览共用渲染；导航和灯箱由入口注入。
export function createPoints({ navigate, openLightbox, getContext }) {
  const pointsGrid = $('#pointsGrid');

  function renderSkeleton() {
    pointsGrid.innerHTML = Array(6).fill(
      `<div class="skeleton-card">
        <div class="skeleton-block sk-img"></div>
        <div class="skeleton-block sk-line"></div>
        <div class="skeleton-block sk-line short"></div>
      </div>`).join('');
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
        navigate({ v: 'points', ...getContext(), tag });
      }));
  }

  function renderPoints(points) {
    if (!points.length) {
      pointsGrid.innerHTML = '<div class="empty">该地图暂无已审核点位，点击右下角「投稿」卡片投稿</div>';
      return;
    }
    renderPointsTo(pointsGrid, points);
  }

  // 加载指定范围（分类 l1 或 分类+主题 l1+l2）的已审核点位，最多展示 PREVIEW_MAX 条；
  // 无数据时隐藏预览区块。block 未挂载或加载失败均静默隐藏。
  // key 为令牌标识：同一 key 的新请求会使旧请求结果作废，防止快速切换时串页。
  const PREVIEW_MAX = 3;
  const previewTokens = {};

  // 离开当前范围时立即作废预览，不等待下一次预览请求开始。
  function invalidatePreviews() {
    for (const key of Object.keys(previewTokens)) previewTokens[key]++;
  }

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


  return { renderSkeleton, renderPoints, loadPreview, invalidatePreviews };
}
