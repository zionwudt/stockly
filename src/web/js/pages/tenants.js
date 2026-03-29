import { getState, loadTenantHub } from '../store.js';
import { api } from '../api.js';
import { escapeHtml, formatDateTime, toast } from '../utils.js';
import { openModal, closeModal } from '../router.js';
import { navigate } from '../router.js';

export function mount(container) {
  render(container);
  bindEvents(container);
}

function render(container) {
  const { auth, tenantHub } = getState();
  const tenants = tenantHub?.accessible_tenants || auth?.available_tenants || [];
  const myRequests = tenantHub?.my_join_requests || [];
  const pendingApprovals = tenantHub?.pending_approvals || [];

  container.innerHTML = `
    <div class="page-section">
      <div class="section-header"><h3>我的团队</h3><span class="section-hint">${tenants.length} 个</span></div>
      <div class="card-list" id="tenant-list">
        ${tenants.length ? tenants.map(t => `
          <div class="list-item ${t.is_current ? 'list-item-active' : ''}" ${t.is_owner ? `data-view-detail="${t.id}"` : ''}>
            <div class="list-item-main">
              <div class="list-item-title">
                ${escapeHtml(t.name)}
                ${t.is_current ? '<span class="tag tag-blue">当前</span>' : ''}
                ${t.is_owner ? '<span class="tag tag-green">创建者</span>' : ''}
              </div>
              <div class="list-item-desc">
                ${escapeHtml(t.slug)} · ${t.member_count || 1} 人
                ${t.pending_request_count ? ' · <span class="text-warning">' + t.pending_request_count + ' 待审批</span>' : ''}
              </div>
            </div>
            ${t.is_owner ? '<div class="list-item-right"><span class="text-primary">详情</span></div>' : ''}
          </div>
        `).join('') : '<div class="empty-hint">暂无团队</div>'}
      </div>
    </div>

    <div class="page-section">
      <div class="section-header"><h3>创建或加入</h3></div>
      <div class="filter-row">
        <button class="btn btn-primary" data-action="create">新建团队</button>
        <button class="btn btn-secondary" data-action="join">申请加入</button>
      </div>
    </div>

    ${myRequests.length ? `
    <div class="page-section">
      <div class="section-header"><h3>我的申请</h3><span class="section-hint">${myRequests.length} 条</span></div>
      <div class="card-list">
        ${myRequests.map(r => `
          <div class="list-item">
            <div class="list-item-main">
              <div class="list-item-title">${escapeHtml(r.tenant_name)}</div>
              <div class="list-item-desc">${formatDateTime(r.created_at)}${r.note ? ' · ' + escapeHtml(r.note) : ''}</div>
            </div>
            <div class="list-item-right">
              <span class="tag ${r.status === 'approved' ? 'tag-green' : r.status === 'rejected' ? 'tag-red' : 'tag-orange'}">
                ${{ pending: '待处理', approved: '已通过', rejected: '已拒绝' }[r.status] || r.status}
              </span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}

    ${pendingApprovals.length ? `
    <div class="page-section">
      <div class="section-header"><h3>待我审批</h3><span class="section-hint text-warning">${pendingApprovals.length} 条</span></div>
      <div class="card-list">
        ${pendingApprovals.map(r => `
          <div class="list-item">
            <div class="list-item-main">
              <div class="list-item-title">${escapeHtml(r.display_name || r.username)}</div>
              <div class="list-item-desc">申请加入 ${escapeHtml(r.tenant_name)} · ${formatDateTime(r.created_at)}</div>
              ${r.note ? `<div class="list-item-note">${escapeHtml(r.note)}</div>` : ''}
            </div>
            <div class="list-item-actions">
              <button class="btn btn-small btn-success" data-approve="${r.id}">同意</button>
              <button class="btn btn-small btn-outline" data-reject="${r.id}">拒绝</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}
  `;
}

function bindEvents(container) {
  // Action buttons
  container.addEventListener('click', async (e) => {
    const createBtn = e.target.closest('[data-action="create"]');
    if (createBtn) {
      openCreateTenantModal();
      return;
    }

    const joinBtn = e.target.closest('[data-action="join"]');
    if (joinBtn) {
      openJoinTenantModal();
      return;
    }

    // View tenant detail
    const viewDetailBtn = e.target.closest('[data-view-detail]');
    if (viewDetailBtn) {
      const tenantId = Number(viewDetailBtn.dataset.viewDetail);
      navigate(`/tenants/detail?id=${tenantId}`);
      return;
    }

    // Approve
    const approveBtn = e.target.closest('[data-approve]');
    if (approveBtn) {
      try {
        await api.approveJoin(Number(approveBtn.dataset.approve));
        await window.__app.refreshData('已同意申请');
      } catch (err) {
        toast(err.message || '操作失败', 'error');
      }
      return;
    }

    // Reject
    const rejectBtn = e.target.closest('[data-reject]');
    if (rejectBtn) {
      try {
        await api.rejectJoin(Number(rejectBtn.dataset.reject));
        await window.__app.refreshData('已拒绝申请');
      } catch (err) {
        toast(err.message || '操作失败', 'error');
      }
    }
  });
}

function openCreateTenantModal() {
  const bodyHtml = `
    <form id="modal-create-form">
      <div class="form-field">
        <label>团队名称</label>
        <input name="name" type="text" placeholder="例如 华东仓" required>
      </div>
    </form>
  `;
  
  openModal('新建团队', bodyHtml, null);
  
  // 绑定确定按钮点击事件
  const okBtn = document.getElementById('modal-ok');
  const originalOnClick = okBtn.onclick;
  
  okBtn.onclick = async () => {
    const form = document.getElementById('modal-create-form');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const data = Object.fromEntries(new FormData(form));
    try {
      const result = await api.createTenant(data);
      closeModal();
      await window.__app.refreshData(result.message || '团队已创建');
    } catch (err) {
      toast(err.message || '创建团队失败', 'error');
    }
  };
  
  // 恢复原来的点击事件
  const cancelBtn = document.getElementById('modal-cancel');
  const originalCancelOnClick = cancelBtn.onclick;
  cancelBtn.onclick = () => {
    okBtn.onclick = originalOnClick;
    cancelBtn.onclick = originalCancelOnClick;
    closeModal();
  };
}

function openJoinTenantModal() {
  const bodyHtml = `
    <form id="modal-join-form">
      <div class="form-field">
        <label>团队标识</label>
        <input name="tenant_slug" type="text" placeholder="请输入团队标识" required>
      </div>
      <div class="form-field">
        <label>申请说明</label>
        <textarea name="note" rows="3" placeholder="团队身份、用途或补充说明"></textarea>
      </div>
    </form>
  `;
  
  openModal('申请加入团队', bodyHtml, null);
  
  // 绑定确定按钮点击事件
  const okBtn = document.getElementById('modal-ok');
  const originalOnClick = okBtn.onclick;
  
  okBtn.onclick = async () => {
    const form = document.getElementById('modal-join-form');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const data = Object.fromEntries(new FormData(form));
    try {
      const result = await api.joinRequest(data);
      closeModal();
      await window.__app.refreshData(result.message || '已提交加入申请');
    } catch (err) {
      toast(err.message || '提交申请失败', 'error');
    }
  };
  
  // 恢复原来的点击事件
  const cancelBtn = document.getElementById('modal-cancel');
  const originalCancelOnClick = cancelBtn.onclick;
  cancelBtn.onclick = () => {
    okBtn.onclick = originalOnClick;
    cancelBtn.onclick = originalCancelOnClick;
    closeModal();
  };
}

export function unmount() {}
