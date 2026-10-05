import { $, lockBodyScroll } from './ui.js';

// 后台灯箱按单条投稿翻图，不依赖列表或编辑状态。
export function createAdminLightbox() {
  const mask = $('#lightbox');
  const image = $('#lbImg');
  let items = [];
  let index = 0;
  let opening = false;
  let closeCleanup = false;

  function setZoom(zoomed) {
    image.classList.toggle('zoomed', zoomed);
    mask.classList.toggle('lb-zoomed', zoomed);
    if (zoomed) mask.querySelector('.lightbox').scrollTop = 0;
  }

  function render() {
    const item = items[index] || { src: '', title: '', desc: '' };
    setZoom(false);
    image.src = item.src;
    $('#lbTitle').textContent = items.length > 1 ? `${item.title}（${index + 1}/${items.length}）` : item.title;
    const description = $('#lbDesc');
    description.textContent = item.desc;
    description.hidden = !item.desc;
    $('#lbPrev').hidden = items.length <= 1;
    $('#lbNext').hidden = items.length <= 1;
    $('#lbOriginal').href = item.src;
    $('#lbOriginal').hidden = !item.src;
  }

  function open(row) {
    const images = row.images && row.images.length ? row.images : [{ original: row.original_url }];
    items = images.map(item => ({ src: item.original, title: row.title, desc: row.description || '' }));
    index = 0;
    render();
    mask.hidden = false;
    if (!opening) {
      opening = true;
      history.pushState({ __lb: true }, '');
    }
    lockBodyScroll(true);
  }

  function close() {
    mask.hidden = true;
    setZoom(false);
    lockBodyScroll(false);
    if (opening) {
      opening = false;
      if (history.state && history.state.__lb) {
        closeCleanup = true;
        history.back();
      }
    }
  }

  function step(delta) {
    index = (index + delta + items.length) % items.length;
    render();
  }

  window.addEventListener('popstate', () => {
    if (closeCleanup) { closeCleanup = false; return; }
    if (history.state && history.state.__lb) return;
    if (!mask.hidden) close();
  });
  $('#closeLightbox').addEventListener('click', close);
  mask.addEventListener('click', event => {
    if (event.target === mask) close();
  });
  image.addEventListener('click', () => setZoom(!image.classList.contains('zoomed')));
  $('#lbOriginal').addEventListener('click', event => event.stopPropagation());
  $('#lbPrev').addEventListener('click', event => { event.stopPropagation(); step(-1); });
  $('#lbNext').addEventListener('click', event => { event.stopPropagation(); step(1); });

  let touchX = 0;
  let touchY = 0;
  mask.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) return;
    touchX = event.touches[0].clientX;
    touchY = event.touches[0].clientY;
  }, { passive: true });
  mask.addEventListener('touchend', event => {
    if (image.classList.contains('zoomed') || event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - touchX;
    const dy = event.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 2) step(dx < 0 ? 1 : -1);
  }, { passive: true });
  document.addEventListener('keydown', event => {
    if (mask.hidden) return;
    if (event.key === 'ArrowLeft') step(-1);
    else if (event.key === 'ArrowRight') step(1);
    else if (event.key === 'Escape') close();
  });

  return { open };
}
