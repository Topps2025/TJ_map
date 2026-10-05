import { $ } from './ui.js';
import { createAdminFilters } from './admin-filters.js';
import { createAdminList } from './admin-list.js';
import { createAdminEdit } from './admin-edit.js';
import { createAdminLightbox } from './admin-lightbox.js';

// 后台入口只连接模块并启动列表。
const lightbox = createAdminLightbox();
const filters = createAdminFilters({ onChange: () => list.load() });
const list = createAdminList({
  filters,
  openEdit: row => editor.open(row),
  openLightbox: lightbox.open,
});
const editor = createAdminEdit({ onSaved: () => list.load() });

$('#logoutBtn').addEventListener('click', async () => {
  await fetch('/admin/logout', { method: 'POST' });
  location.href = '/admin';
});

list.load('pending');
