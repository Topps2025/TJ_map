import { $, esc } from './ui.js';
import { getJSON } from './api.js';
import { adminRequest } from './admin-request.js';

function showMessage(element, message, type) {
  element.textContent = message;
  element.className = 'form-msg ' + type;
  element.hidden = false;
}

// 编辑弹窗独立保存正在编辑的投稿和级联地图选项。
export function createAdminEdit({ onSaved }) {
  const modal = $('#editModal');
  const category = $('#eCat');
  const group = $('#eGroup');
  const mapList = $('#eMapList');
  let editingRow = null;

  function open(row) {
    editingRow = row;
    $('#eTitle').value = row.title || '';
    $('#eDesc').value = row.description || '';
    $('#eSubmitter').value = row.submitter || '';
    $('#eEmail').value = row.submitter_email || '';
    $('#eMsg').hidden = true;
    $('#eMsg').className = 'form-msg';
    modal.hidden = false;
    loadCategories();
  }

  async function loadCategories() {
    try {
      const categories = await getJSON('/api/categories');
      category.innerHTML = '<option value="">请选择</option>' +
        categories.map(item => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join('');
      category.value = editingRow.category_l1;
      await loadGroups(true);
    } catch (error) {
      showMessage($('#eMsg'), '加载分类失败', 'error');
    }
  }

  async function loadGroups(prefill = false) {
    group.disabled = !category.value;
    mapList.innerHTML = '<p class="form-hint">请先选择地图主题</p>';
    if (!category.value) { group.innerHTML = '<option value="">先选分类</option>'; return; }
    group.innerHTML = '<option value="">加载中...</option>';
    const selectedCategory = category.value;
    try {
      const groups = await getJSON('/api/groups?l1=' + encodeURIComponent(selectedCategory));
      if (category.value !== selectedCategory) return;
      group.innerHTML = '<option value="">请选择</option>' +
        groups.map(item => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join('');
      if (prefill) {
        group.value = editingRow.map_group_l2;
        await loadMaps(true);
      }
    } catch (error) {
      if (category.value === selectedCategory) group.innerHTML = '<option value="">加载失败</option>';
    }
  }

  async function loadMaps(prefill = false) {
    if (!group.value) { mapList.innerHTML = '<p class="form-hint">请先选择地图主题</p>'; return; }
    mapList.innerHTML = '<p class="form-hint">加载中...</p>';
    const selectedCategory = category.value;
    const selectedGroup = group.value;
    try {
      const maps = await getJSON('/api/maps?l1=' + encodeURIComponent(selectedCategory) +
        '&l2=' + encodeURIComponent(selectedGroup));
      if (category.value !== selectedCategory || group.value !== selectedGroup) return;
      const checked = prefill ? new Set(editingRow.maps || [editingRow.map_name_l3]) : new Set();
      mapList.innerHTML = maps.map(map => `
        <label class="map-check-item">
          <input type="checkbox" value="${esc(map.name)}" ${checked.has(map.name) ? 'checked' : ''}>
          <span class="map-check-thumb">
            ${map.thumb ? `<img src="${esc(map.thumb)}" alt="${esc(map.name)}" loading="lazy">` : '<span class="map-card-placeholder"></span>'}
          </span>
          <span class="map-check-name">${esc(map.name)}</span>
        </label>`).join('');
    } catch (error) {
      if (category.value === selectedCategory && group.value === selectedGroup) {
        mapList.innerHTML = '<p class="form-hint">加载失败</p>';
      }
    }
  }

  category.addEventListener('change', () => loadGroups());
  group.addEventListener('change', () => loadMaps());
  $('#closeEdit').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', event => {
    if (event.target === modal) modal.hidden = true;
  });

  $('#editForm').addEventListener('submit', async event => {
    event.preventDefault();
    const message = $('#eMsg');
    message.hidden = true;
    if (!category.value || !group.value) { showMessage(message, '请选择分类和地图主题', 'error'); return; }
    const checkedMaps = Array.from(mapList.querySelectorAll('input[type="checkbox"]:checked'))
      .map(input => input.value);
    if (!checkedMaps.length) { showMessage(message, '请至少选择一个具体地图', 'error'); return; }
    if (!$('#eTitle').value.trim()) { showMessage(message, '请填写标题', 'error'); return; }
    if (!$('#eSubmitter').value.trim()) { showMessage(message, '请填写投稿人', 'error'); return; }
    if (!$('#eEmail').value.trim()) { showMessage(message, '请填写投稿人邮箱', 'error'); return; }

    const form = new FormData();
    form.append('category_l1', category.value);
    form.append('map_group_l2', group.value);
    checkedMaps.forEach(map => form.append('map_names_l3', map));
    form.append('title', $('#eTitle').value.trim());
    form.append('description', $('#eDesc').value.trim());
    form.append('submitter', $('#eSubmitter').value.trim());
    form.append('submitter_email', $('#eEmail').value.trim());

    const button = $('#eSaveBtn');
    button.disabled = true;
    button.textContent = '保存中...';
    try {
      const result = await adminRequest('/admin/edit/' + editingRow.id, { method: 'POST', body: form });
      if (result !== null) {
        modal.hidden = true;
        onSaved();
      }
    } catch (error) {
      showMessage(message, error.message || '保存失败', 'error');
    } finally {
      button.disabled = false;
      button.textContent = '保存';
    }
  });

  return { open };
}
