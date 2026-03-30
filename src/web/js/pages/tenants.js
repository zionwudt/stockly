import { getState, loadTenantHub } from '../store.js';
import { api } from '../api.js';
import { escapeHtml, formatDateTime, toast } from '../utils.js';
import { openModal, closeModal, navigate } from '../router.js';

const CHEVRON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;

export function mount(container) {
  render(container);
  bindEvents(container);
}

function render(container) {
  const { auth, tenantHub } = getState();
  const tenants = tenantHub?.accessible_tenants || auth?.available_tenants || [];
  const myRequests = tenantHub?.my_join_requests || [];
  const pendingApprovals = tenantHub?.pending_approvals || [];
  const currentTenant = tenants.find(t => t.is_current);

  container.innerHTML = `
    <div class="page-section">
      <div class="section-header">
        <h3>当前团队</h3>
      </div>
      ${currentTenant ? `
      <div class="current-tenant-card" data-action="switch-current" style="cursor:pointer;">
        <div class="current-tenant-main">
          <div class="current-tenant-name">${escapeHtml(currentTenant.name)}</div>
          <div class="current-tenant-meta">${escapeHtml(currentTenant.slug)} · ${currentTenant.member_count || 1} 人</div>
        </div>
        <span class="text-text-4">${CHEVRON}</span>
      </div>` : '<div class="empty-hint">暂无当前团队</div>'}
    </div>

    ${tenants.length ? `
    <div class="page-section">
      <div class="section-header">
        <h3>团队列表</h3>
        <span class="section-hint">${tenants.length} 个</span>
      </div>
      <div class="card-list" id="tenant-list">
        ${tenants.map(t => `
          <div class="list-item list-item-row" data-view-detail="${t.id}">
            <div class="list-item-main">
              <div class="list-item-title">
                ${escapeHtml(t.name)}
                ${t.is_current ? '<span class="tag tag-green" style="margin-left:6px;font-size:11px;">当前</span>' : ''}
              </div>
              <div class="list-item-desc">
                ${escapeHtml(t.slug)} · ${t.member_count || 1} 人
                ${t.pending_request_count ? ' · <span class="text-warning">' + t.pending_request_count + ' 待审批</span>' : ''}
              </div>
            </div>
            <div class="tenant-item-right">
              ${t.is_owner ? '<span class="tag tag-green" style="margin-right:6px">所有者</span>' : t.is_admin ? '<span class="tag tag-blue" style="margin-right:6px">管理员</span>' : ''}
              <span class="text-text-4 list-chevron">${CHEVRON}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}

    <div class="page-section" style="padding-top:0;">
      <div class="tenant-action-btns">
        <button class="btn btn-primary" data-action="create">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="margin-right:6px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新建团队
        </button>
        <button class="btn btn-secondary" data-action="join">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          申请加入
        </button>
      </div>
    </div>

    ${pendingApprovals.length ? `
    <div class="page-section" style="padding-top:0;">
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

    ${myRequests.length ? `
    <div class="page-section" style="padding-top:0;">
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
  `;
}

function bindEvents(container) {
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

    const switchCurrentBtn = e.target.closest('[data-action="switch-current"]');
    if (switchCurrentBtn) {
      openSwitchTenantModal();
      return;
    }

    // View tenant detail — click on any list-item row
    const viewDetailRow = e.target.closest('[data-view-detail]');
    if (viewDetailRow) {
      const tenantId = Number(viewDetailRow.dataset.viewDetail);
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
        <input name="name" class="form-input" type="text" placeholder="例如 华东仓" required>
      </div>
    </form>
  `;
  openModal('新建团队', bodyHtml, async () => {
    const form = document.getElementById('modal-create-form');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const data = Object.fromEntries(new FormData(form));
    try {
      const result = await api.createTenant(data);
      closeModal();
      await window.__app.refreshData(result.message || '团队已创建');
    } catch (err) {
      toast(err.message || '创建团队失败', 'error');
    }
  });
}

function openJoinTenantModal() {
  const bodyHtml = `
    <form id="modal-join-form">
      <div class="form-field">
        <label>团队标识</label>
        <input name="tenant_slug" class="form-input" type="text" placeholder="请输入团队标识" required>
      </div>
      <div class="form-field">
        <label>申请说明</label>
        <textarea name="note" class="form-input" rows="3" placeholder="团队身份、用途或补充说明"></textarea>
      </div>
    </form>
  `;
  openModal('申请加入团队', bodyHtml, async () => {
    const form = document.getElementById('modal-join-form');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const data = Object.fromEntries(new FormData(form));
    try {
      const result = await api.joinRequest(data);
      closeModal();
      await window.__app.refreshData(result.message || '申请已提交');
    } catch (err) {
      toast(err.message || '申请失败', 'error');
    }
  });
}

function openSwitchTenantModal() {
  const { auth, tenantHub } = getState();
  const tenants = tenantHub?.accessible_tenants || auth?.available_tenants || [];
  if (tenants.length === 0) return;

  const bodyHtml = `
    <div class="card-list" id="modal-tenant-list">
      ${tenants.map(t => {
        const isCurrent = t.id === auth?.current_tenant;
        return `
        <div class="list-item list-item-row${isCurrent ? ' list-item-active' : ''}" data-pick-tenant="${t.id}" style="cursor:pointer;">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(t.name)}</div>
            <div class="list-item-desc">${escapeHtml(t.slug)} · ${t.member_count || 1} 人</div>
          </div>
          ${isCurrent ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
        </div>`;
      }).join('')}
    </div>
  `;

  openModal('切换团队', bodyHtml, null, { hideOk: true });

  const list = document.getElementById('modal-tenant-list');
  if (list) {
    list.addEventListener('click', async (e) => {
      const item = e.target.closest('[data-pick-tenant]');
      if (!item) return;
      const tenantId = Number(item.dataset.pickTenant);
      if (tenantId === auth?.current_tenant) {
        closeModal();
        return;
      }
      closeModal();
      await switchToTenant(tenantId);
    });
  }
}

async function switchToTenant(tenantId) {
  try {
    await api.switchTenant({ tenant_id: tenantId });
    const { auth, tenantHub } = getState();
    const tenants = tenantHub?.accessible_tenants || auth?.available_tenants || [];
    const tenant = tenants.find(t => t.id === tenantId);
    const tenantName = tenant ? escapeHtml(tenant.name) : tenantId;
    await window.__app.refreshData(`已切换到团队 ${tenantName}`);
  } catch (err) {
    toast(err.message || '切换团队失败', 'error');
  }
}

export function unmount() {}
