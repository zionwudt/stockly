import { getState, loadTenantHub } from '../store.js';
import { api } from '../api.js';
import { escapeHtml, formatDateTime, toast } from '../utils.js';

let actionTab = 'create';

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
          <div class="list-item ${t.is_current ? 'list-item-active' : ''}" data-enter-tenant="${t.id}">
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
            ${!t.is_current ? '<div class="list-item-right"><span class="text-primary">切换</span></div>' : ''}
          </div>
        `).join('') : '<div class="empty-hint">暂无团队</div>'}
      </div>
    </div>

    <div class="page-section">
      <div class="section-header"><h3>创建或加入</h3></div>
      <div class="filter-row">
        <button class="filter-btn ${actionTab === 'create' ? 'active' : ''}" data-action-tab="create">新建团队</button>
        <button class="filter-btn ${actionTab === 'join' ? 'active' : ''}" data-action-tab="join">申请加入</button>
      </div>

      <form id="tenant-create-form" class="form-card" ${actionTab !== 'create' ? 'hidden' : ''}>
        <div class="form-field">
          <label>团队名称</label>
          <input name="name" type="text" placeholder="例如 华东仓" required>
        </div>
        <button type="submit" class="btn btn-primary btn-block">创建并切换</button>
      </form>

      <form id="tenant-join-form" class="form-card" ${actionTab !== 'join' ? 'hidden' : ''}>
        <div class="form-field">
          <label>团队标识</label>
          <input name="tenant_slug" type="text" placeholder="请输入团队标识" required>
        </div>
        <div class="form-field">
          <label>申请说明</label>
          <textarea name="note" rows="3" placeholder="团队身份、用途或补充说明"></textarea>
        </div>
        <button type="submit" class="btn btn-secondary btn-block">提交申请</button>
      </form>
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
  // Action tab switching
  container.addEventListener('click', async (e) => {
    const tabBtn = e.target.closest('[data-action-tab]');
    if (tabBtn) {
      actionTab = tabBtn.dataset.actionTab;
      container.querySelectorAll('[data-action-tab]').forEach(b => b.classList.toggle('active', b.dataset.actionTab === actionTab));
      container.querySelector('#tenant-create-form').hidden = actionTab !== 'create';
      container.querySelector('#tenant-join-form').hidden = actionTab !== 'join';
      return;
    }

    // Enter/switch tenant
    const enterBtn = e.target.closest('[data-enter-tenant]');
    if (enterBtn) {
      const tenantId = Number(enterBtn.dataset.enterTenant);
      const { tenantHub, auth } = getState();
      const tenants = tenantHub?.accessible_tenants || auth?.available_tenants || [];
      const tenant = tenants.find(t => t.id === tenantId);
      if (!tenant) return;
      if (tenant.is_current) {
        toast(`当前正在使用 ${tenant.name}`, 'info');
        return;
      }
      try {
        await api.switchTenant({ tenant_id: tenantId });
        await window.__app.refreshData(`已切换到 ${tenant.name}`);
      } catch (err) {
        toast(err.message || '切换团队失败', 'error');
      }
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

  // Create tenant form
  container.querySelector('#tenant-create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    try {
      const result = await api.createTenant(data);
      form.reset();
      await window.__app.refreshData(result.message || '团队已创建');
    } catch (err) {
      toast(err.message || '创建团队失败', 'error');
    }
  });

  // Join tenant form
  container.querySelector('#tenant-join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    try {
      const result = await api.joinRequest(data);
      form.reset();
      await window.__app.refreshData(result.message || '已提交加入申请');
    } catch (err) {
      toast(err.message || '提交申请失败', 'error');
    }
  });
}

export function unmount() {}
