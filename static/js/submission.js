import { $, esc, toast, lockBodyScroll, restoreScroll } from './ui.js';
import { getJSON, submitPoint } from './api.js';
import { createImagePicker, MAX_FILE_MB } from './image-picker.js';

// 投稿表单只通过回调读取浏览上下文、通知提交完成。
export function createSubmission({ navigation, getContext, onSubmitted, isLightboxOpen }) {
  const imagePicker = createImagePicker();
  const submitModal = $('#submitModal');
  const fCat = $('#fCat'), fGroup = $('#fGroup'), fMapList = $('#fMapList');
  const fabSubmit = $('#fabSubmit');
  let hasDraft = false;
  let closeTimer;
  let draftVersion = 0;

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
    const version = draftVersion;
    const category = fCat.value;
    fGroup.disabled = !fCat.value;
    resetMapChecks(fMapList);
    if (!fCat.value) { fGroup.innerHTML = '<option value="">先选分类</option>'; return; }
    fGroup.innerHTML = '<option value="">加载中...</option>';
    try {
      const groups = await getJSON('/api/groups?l1=' + encodeURIComponent(fCat.value));
      if (version !== draftVersion || category !== fCat.value) return;
      fGroup.innerHTML = '<option value="">请选择</option>' +
        groups.map(g => `<option value="${esc(g.name)}">${esc(g.name)}</option>`).join('');
    } catch (e) {
      if (version !== draftVersion || category !== fCat.value) return;
      toast('主题加载失败');
    }
  }

  // 按当前分类+主题填充具体地图勾选列表
  async function populateMaps() {
    const version = draftVersion;
    const category = fCat.value;
    const group = fGroup.value;
    if (!fGroup.value) { resetMapChecks(fMapList); return; }
    fMapList.innerHTML = '<p class="form-hint">加载中...</p>';
    try {
      const maps = await getJSON('/api/maps?l1=' + encodeURIComponent(fCat.value) +
        '&l2=' + encodeURIComponent(fGroup.value));
      if (version !== draftVersion || category !== fCat.value || group !== fGroup.value) return;
      renderMapChecks(maps, fMapList, new Set());
    } catch (e) {
      if (version !== draftVersion || category !== fCat.value || group !== fGroup.value) return;
      toast('地图加载失败');
    }
  }

  // 打开投稿弹窗并预填字段：prefill = {l1, l2, l3}
  async function openSubmitModal(prefill) {
    prefill = prefill || {};
    // 回填记住的投稿人昵称/邮箱（localStorage），免去每次重填
    fillRememberedSubmitter();
    clearTimeout(closeTimer);
    const prevScroll = window.scrollY || document.documentElement.scrollTop || 0;
    submitModal.classList.remove('closing');
    submitModal.hidden = false;
    lockBodyScroll(true);
    restoreScroll(prevScroll);
    $('#formMsg').hidden = true;
    $('#formMsg').className = 'form-msg';
    // 压入标记状态：手机端点开投稿后按返回键时，先关闭弹窗而不是退出页面
    navigation.openOverlay('__modal');
    // 同一页面会话内重开时保留完整草稿，包括文件和地图勾选。
    if (hasDraft) return;
    const version = ++draftVersion;
    try {
      await ensureCatsLoaded();
    } catch (e) { toast('分类加载失败'); return; }
    if (version !== draftVersion) return;
    hasDraft = true;
    fCat.value = prefill.l1 || '';
    await populateGroups();
    if (version !== draftVersion) return;
    if (prefill.l2 && Array.from(fGroup.options).some(o => o.value === prefill.l2)) {
      fGroup.value = prefill.l2;
    }
    await populateMaps();
    if (version !== draftVersion) return;
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
    navigation.closeOverlay('__modal');
    // 等淡出动画播完再真正隐藏并解锁滚动
    closeTimer = setTimeout(() => {
      submitModal.classList.remove('closing');
      submitModal.hidden = true;
      lockBodyScroll(false);
    }, 180);
  }

  // 右下角投稿卡片：按当前浏览层级自动预填字段
  fabSubmit.addEventListener('click', () => {
    openSubmitModal(getContext());
  });
  // 阻止移动端点击后浏览器把焦点滚到页脚附近（固定按钮在文档坐标里的位置），导致画面跳到网站说明/致谢
  fabSubmit.addEventListener('mousedown', (e) => e.preventDefault());
  $('#closeSubmit').addEventListener('click', closeSubmitModal);
  $('#discardDraft').addEventListener('click', () => {
    if ($('#submitBtn').disabled) return;
    if (!window.confirm('放弃当前草稿？已填写内容和图片将被清空。')) return;
    draftVersion++;
    $('#submitForm').reset();
    imagePicker.reset();
    resetMapChecks(fMapList);
    fGroup.disabled = true;
    hasDraft = false;
    closeSubmitModal();
  });
  submitModal.addEventListener('click', (e) => {
    if (e.target === submitModal) closeSubmitModal();
  });

  // 手动选择优先于未完成的预填，也使此前的级联请求失效。
  fCat.addEventListener('change', () => {
    draftVersion++;
    populateGroups();
  });
  fGroup.addEventListener('change', () => {
    draftVersion++;
    populateMaps();
  });

  // 桌面端 Esc 关闭投稿弹窗（灯箱打开时由灯箱自己的 Esc 处理，不重复关）
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || submitModal.hidden) return;
    if (isLightboxOpen()) return;
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
    const pickedFiles = imagePicker.getFiles();
    if (!pickedFiles.length) {
      showMsg(msg, '请上传至少一张点位图片', 'error');
      return;
    }
    if (imagePicker.totalSizeMb() > MAX_FILE_MB) {
      showMsg(msg, `图片总大小 ${imagePicker.totalSizeMb().toFixed(1)}MB，超过 ${MAX_FILE_MB}MB 上限，请减少图片数量或压缩后再试`, 'error');
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
    $('#discardDraft').disabled = true;
    btn.textContent = '提交中...';
    try {
      const data = await submitPoint(fd);
      if (data.ok) {
        draftVersion++;
        hasDraft = false;
        showMsg(msg, '投稿成功！审核通过后将在此展示', 'ok');
        rememberSubmitter();        // 记住投稿人昵称/邮箱，下次投稿免重填
        e.target.reset();
        imagePicker.reset();
        resetMapChecks(fMapList);
        fGroup.disabled = true;
        fillRememberedSubmitter();  // 重置后回填，弹窗里仍可见
        onSubmitted();   // 投稿完成后回拉当前页最新点位/预览
        // 投稿成功后自动关闭弹窗，避免手动关闭；重开后仍会按当前层级预填分类/地图
        closeSubmitModal();
        toast('投稿成功！审核通过后将在此展示');
      } else {
        showMsg(msg, data.error || '提交失败', 'error');
      }
    } catch (err) {
      showMsg(msg, '网络错误，请重试', 'error');
    } finally {
      btn.disabled = false;
      $('#discardDraft').disabled = false;
      btn.textContent = '提交投稿';
    }
  });

  function showMsg(el, text, type) {
    el.textContent = text;
    el.className = 'form-msg ' + type;
    el.hidden = false;
  }

  return { close: closeSubmitModal, isOpen: () => !submitModal.hidden };
}
