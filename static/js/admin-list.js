import { $, esc } from './ui.js';
import { adminRequest } from './admin-request.js';

// 审核列表及其操作；按钮通过容器事件委托处理，不依赖全局函数。
export function createAdminList({ filters, openEdit, openLightbox }) {
  const list = $('#adminList');
  const label = $('#listLabel');
  const approveAllButton = $('#approveAllBtn');
  let currentStatus = 'pending';
  let currentRows = [];

  async function load(status = currentStatus) {
    currentStatus = status;
    document.querySelectorAll('.admin-tabs .chip').forEach(button =>
      button.classList.toggle('active', button.dataset.status === status));
    $('#listPanel').hidden = false;
    approveAllButton.hidden = status !== 'pending';
    list.innerHTML = '<div class="loading-text">加载中...</div>';
    const labels = {
      pending: '待审核条目',
      approved: '已审核条目',
      rejected: '已拒绝条目（记录与图片保留，可恢复或彻底删除）',
    };
    label.textContent = labels[status] || '条目列表';

    const params = filters.appendTo(new URLSearchParams({ status }));
    try {
      const response = await adminRequest('/admin/pending?' + params.toString());
      if (!response) return;
      const rows = response.data;
      // 筛选或标签已变化时，不显示过期请求的结果。
      if (status !== currentStatus || params.toString() !== filters.appendTo(new URLSearchParams({ status: currentStatus })).toString()) return;
      currentRows = rows;
      list.innerHTML = rows.length ? rows.map((row, index) => cardHTML(row, index, status)).join('') :
        '<div class="empty">暂无记录</div>';
    } catch (error) {
      list.innerHTML = '<div class="loading-text">加载失败</div>';
    }
  }

  function cardHTML(row, index, status) {
    const imageCount = row.images && row.images.length ? row.images.length : 1;
    return `
      <div class="admin-card glass animate-fadeInUp grid-item-${(index % 8) + 1}" data-id="${row.id}">
        <div class="admin-thumb-wrap">
          <img class="admin-thumb" src="${esc(row.thumb_url)}" alt="缩略图" loading="lazy">
          ${imageCount > 1 ? `<span class="multi-badge">×${imageCount}</span>` : ''}
        </div>
        <div class="admin-info">
          <div class="admin-title">${esc(row.title)}</div>
          <div class="admin-meta">${esc(row.category_l1)} · ${esc(row.map_group_l2)} · ${esc((row.maps && row.maps.length ? row.maps : [row.map_name_l3]).join(' / '))}</div>
          ${row.tags ? `<div class="admin-meta">标签：${esc(row.tags)}</div>` : ''}
          ${row.description ? `<div class="admin-meta">描述：${esc(row.description)}</div>` : ''}
          ${row.submitter ? `<div class="admin-meta">投稿人：${esc(row.submitter)}</div>` : ''}
          <div class="admin-meta">投稿时间：${esc(row.created_at)}</div>
          ${row.submitter_email ? `<div class="admin-meta">邮箱：${esc(row.submitter_email)}</div>` : ''}
        </div>
        <div class="admin-actions">
          <button type="button" class="btn-ghost" data-action="edit">编辑</button>
          ${status === 'pending' ? `
          <button type="button" class="btn-ok" data-action="approve">通过</button>
          <button type="button" class="btn-no" data-action="reject">拒绝</button>` : ''}
          ${status === 'rejected' ? '<button type="button" class="btn-ok" data-action="restore">恢复</button>' : ''}
          <button type="button" class="btn-no" data-action="delete">删除</button>
        </div>
      </div>`;
  }

  async function act(row, action) {
    let body;
    if (action === 'reject') {
      const reason = prompt('请输入拒绝原因（选填，将发送给投稿人）：');
      if (reason === null) return;
      if (!confirm('确定拒绝该投稿？拒绝后将移入「已拒绝」列表，不再展示（可再恢复或彻底删除）。')) return;
      body = new URLSearchParams({ reason: reason.trim() });
    } else if (action === 'restore') {
      if (!confirm('确定将该投稿恢复为待审核？')) return;
    } else if (action === 'delete') {
      if (!confirm('确定删除该点位？删除后不可恢复。')) return;
    }
    const endpoint = action === 'delete' ? 'delete' : action;
    try {
      const result = await adminRequest(`/admin/${endpoint}/${row.id}`, { method: 'POST', body });
      if (result !== null) load();
    } catch (error) {
      alert(error.message || '操作失败');
    }
  }

  list.addEventListener('click', event => {
    const card = event.target.closest('.admin-card');
    if (!card || !list.contains(card)) return;
    const row = currentRows.find(item => item.id === Number(card.dataset.id));
    if (!row) return;
    const button = event.target.closest('[data-action]');
    if (!button) { openLightbox(row); return; }
    if (button.dataset.action === 'edit') openEdit(row);
    else act(row, button.dataset.action);
  });

  document.querySelectorAll('.admin-tabs .chip').forEach(button =>
    button.addEventListener('click', () => load(button.dataset.status)));

  approveAllButton.addEventListener('click', async () => {
    const scope = filters.scope();
    const count = currentRows.length;
    const message = scope.length
      ? `确定通过当前筛选（${scope.join(' / ')}）下的 ${count} 条待审核条目？筛选之外的其他待审核投稿不受影响。`
      : `确定通过全部 ${count} 条待审核条目？`;
    if (!confirm(message)) return;
    const params = filters.appendTo(new URLSearchParams());
    const query = params.toString();
    try {
      const result = await adminRequest('/admin/approve_all' + (query ? '?' + query : ''), { method: 'POST' });
      if (result !== null) load();
    } catch (error) {
      alert(error.message || '操作失败');
    }
  });

  return { load };
}
