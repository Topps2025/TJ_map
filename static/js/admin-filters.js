import { $, esc } from './ui.js';
import { getJSON } from './api.js';

// 列表筛选只管理下拉选项和当前筛选值。
export function createAdminFilters({ onChange }) {
  const category = $('#filterCat');
  const group = $('#filterGroup');

  async function loadCategories() {
    try {
      const categories = await getJSON('/api/categories');
      category.innerHTML = '<option value="">全部分类</option>' +
        categories.map(item => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join('');
    } catch (error) {
      category.innerHTML = '<option value="">全部分类</option>';
    }
  }

  async function loadGroups(name) {
    group.disabled = true;
    group.innerHTML = '<option value="">全部主题</option>';
    if (!name) return;
    try {
      const groups = await getJSON('/api/groups?l1=' + encodeURIComponent(name));
      // 切换分类时，较早请求的结果不能覆盖新的分类。
      if (category.value !== name) return;
      group.innerHTML = '<option value="">全部主题</option>' +
        groups.map(item => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join('');
      group.disabled = false;
    } catch (error) {
      if (category.value === name) group.innerHTML = '<option value="">全部主题</option>';
    }
  }

  category.addEventListener('change', () => {
    group.value = '';
    loadGroups(category.value);
    onChange();
  });
  group.addEventListener('change', onChange);
  $('#filterReset').addEventListener('click', () => {
    category.value = '';
    loadGroups('');
    onChange();
  });

  loadCategories();

  return {
    appendTo(params) {
      if (category.value) params.set('category_l1', category.value);
      if (group.value) params.set('map_group_l2', group.value);
      return params;
    },
    scope: () => [category.value, group.value].filter(Boolean),
  };
}
