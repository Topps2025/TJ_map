import { $, esc, toast } from './ui.js';

export const MAX_FILE_MB = 10;   // 与后端 MAX_UPLOAD_SIZE 一致

// 图片选择、拖拽、预览和大小预检独立于投稿表单。
export function createImagePicker() {
  const fImage = $('#fImage');
  const fileDrop = $('#fileDrop');
  const fFileList = $('#fFileList');
  let pickedFiles = [];

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


  function reset() {
    pickedFiles = [];
    fImage.value = '';
    renderFileList();
  }

  return {
    reset,
    getFiles: () => [...pickedFiles],
    totalSizeMb: () => totalSizeMb(pickedFiles),
  };
}
