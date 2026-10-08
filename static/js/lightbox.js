import { $, lockBodyScroll, restoreScroll } from './ui.js';
import { getPointImages, displayName } from './points.js';

// 多图灯箱管理自己的图片、缩放及触摸状态。
export function createLightbox({ navigation }) {
  let lbItems = [];   // [{ src, title, desc }]
  let lbIndex = 0;
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
    points.slice(pointIdx, pointIdx + 1).forEach(p => {
      getPointImages(p).forEach(im => flat.push({ src: im.original, title: displayName(p.title), desc: p.description || '' }));
    });
    lbItems = flat;
    lbIndex = 0;
    renderLb();
    const prevScroll = window.scrollY || document.documentElement.scrollTop || 0;
    lbMask.hidden = false;
    // 压入返回标记：手机上看图时按系统返回键先关图，而不是退出当前层级
    navigation.openOverlay('__lb');
    lockBodyScroll(true);
    restoreScroll(prevScroll);
  }

  function closeLightbox() {
    lbMask.hidden = true;
    setLbZoom(false);
    lockBodyScroll(false);
    // 清理返回标记：若当前在标记上则回退弹出它，保持历史栈不残留
    navigation.closeOverlay('__lb');
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


  return { open: openLightbox, close: closeLightbox, isOpen: () => !lbMask.hidden };
}
