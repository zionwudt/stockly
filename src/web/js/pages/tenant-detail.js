import { api } from '../api.js';
import { escapeHtml, formatDateTime, toast } from '../utils.js';
import { openConfirm, openModal, closeModal } from '../router.js';
import { navigate, back } from '../router.js';

let tenantDetail = null;
let currentTenantId = null;

export function mount(container) {
  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  currentTenantId = Number(urlParams.get('id'));
  
  if (!currentTenantId) {
    navigate('/tenants');
    return;
  }
  
  render(container);
  loadTenantDetail(container);
  bindEvents(container);
}

async function loadTenantDetail(container) {
  try {
    tenantDetail = await api.getTenantDetail(currentTenantId);
    render(container);
  } catch (err) {
    toast(err.message || '加载团队详情失败', 'error');
  }
}

function render(container) {
  if (!tenantDetail) {
    container.innerHTML = `
      <div class="page-section">
        <div class="empty-hint">加载中...</div>
      </div>
    `;
    return;
  }

  const { tenant, members, pending_approvals, user_role } = tenantDetail;
  const isOwner = user_role === 'owner';
  const isAdmin = user_role === 'owner' || user_role === 'admin';

  container.innerHTML = `
    <div class="page-section">
      <div class="section-header">
        <h3>团队信息</h3>
        ${isOwner ? `<button class="btn btn-small btn-primary" data-action="edit-name">编辑</button>` : ''}
      </div>
      <div class="card-list">
        <div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">团队名称</div>
            <div class="list-item-desc">${escapeHtml(tenant.name)}</div>
          </div>
        </div>
        <div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">团队标识</div>
            <div class="list-item-desc">${escapeHtml(tenant.slug)}</div>
          </div>
        </div>
        <div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">创建者</div>
            <div class="list-item-desc">${escapeHtml(tenant.owner_display_name || tenant.owner_username)}</div>
          </div>
        </div>
        <div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">创建时间</div>
            <div class="list-item-desc">${formatDateTime(tenant.created_at)}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="page-section">
      <div class="section-header">
        <h3>成员列表</h3>
        <span class="section-hint">${members.length} 人</span>
      </div>
      <div class="card-list">
        ${members.map(m => `
          <div class="list-item">
            <div class="list-item-main">
              <div class="list-item-title">
                ${escapeHtml(m.display_name || m.username)}
                <span class="tag ${m.role === 'owner' ? 'tag-green' : m.role === 'admin' ? 'tag-blue' : 'tag-orange'}">
                  ${{ owner: '创建者', admin: '管理员', member: '成员' }[m.role] || m.role}
                </span>
              </div>
              <div class="list-item-desc">加入时间: ${formatDateTime(m.joined_at)}</div>
            </div>
            ${isOwner && m.role !== 'owner' ? `
              <div class="list-item-actions">
                <button class="btn btn-small" data-action="change-role" data-user-id="${m.user_id}" data-current-role="${m.role}">
                  ${m.role === 'admin' ? '降为成员' : '设为管理员'}
                </button>
                <button class="btn btn-small btn-danger" data-action="remove-member" data-user-id="${m.user_id}">
                  移除
                </button>
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>

    ${isAdmin && pending_approvals.length ? `
    <div class="page-section">
      <div class="section-header">
        <h3>待审批申请</h3>
        <span class="section-hint text-warning">${pending_approvals.length} 条</span>
      </div>
      <div class="card-list">
        ${pending_approvals.map(r => `
          <div class="list-item">
            <div class="list-item-main">
              <div class="list-item-title">${escapeHtml(r.display_name || r.username)}</div>
              <div class="list-item-desc">申请时间: ${formatDateTime(r.created_at)}</div>
              ${r.note ? `<div class="list-item-note">${escapeHtml(r.note)}</div>` : ''}
            </div>
            <div class="list-item-actions">
              <button class="btn btn-small btn-success" data-action="approve" data-request-id="${r.id}">同意</button>
              <button class="btn btn-small btn-outline" data-action="reject" data-request-id="${r.id}">拒绝</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}
  `;
}

function bindEvents(container) {
  container.addEventListener('click', async (e) => {
    const editNameBtn = e.target.closest('[data-action="edit-name"]');
    if (editNameBtn) {
      openEditNameModal(container);
      return;
    }

    const changeRoleBtn = e.target.closest('[data-action="change-role"]');
    if (changeRoleBtn) {
      const userId = Number(changeRoleBtn.dataset.userId);
      const currentRole = changeRoleBtn.dataset.currentRole;
      const newRole = currentRole === 'admin' ? 'member' : 'admin';
      openConfirm(
        '确认修改角色',
        `确定要将该成员${newRole === 'admin' ? '设为管理员' : '降为成员'}吗？`,
        async () => {
          try {
            await api.updateMemberRole(currentTenantId, userId, { role: newRole });
            await loadTenantDetail(container);
            toast('角色已更新', 'success');
          } catch (err) {
            toast(err.message || '修改角色失败', 'error');
          }
        }
      );
      return;
    }

    const removeMemberBtn = e.target.closest('[data-action="remove-member"]');
    if (removeMemberBtn) {
      const userId = Number(removeMemberBtn.dataset.userId);
      openConfirm(
        '确认移除成员',
        '确定要移除该成员吗？此操作不可撤销。',
        async () => {
          try {
            await api.removeMember(currentTenantId, userId);
            await loadTenantDetail(container);
            toast('成员已移除', 'success');
          } catch (err) {
            toast(err.message || '移除成员失败', 'error');
          }
        }
      );
      return;
    }

    const approveBtn = e.target.closest('[data-action="approve"]');
    if (approveBtn) {
      const requestId = Number(approveBtn.dataset.requestId);
      openConfirm(
        '同意申请',
        '确定要同意该申请吗？',
        async () => {
          try {
            await api.approveJoin(requestId);
            await loadTenantDetail(container);
            toast('已同意申请', 'success');
          } catch (err) {
            toast(err.message || '操作失败', 'error');
          }
        }
      );
      return;
    }

    const rejectBtn = e.target.closest('[data-action="reject"]');
    if (rejectBtn) {
      const requestId = Number(rejectBtn.dataset.requestId);
      openConfirm(
        '拒绝申请',
        '确定要拒绝该申请吗？',
        async () => {
          try {
            await api.rejectJoin(requestId);
            await loadTenantDetail(container);
            toast('已拒绝申请', 'success');
          } catch (err) {
            toast(err.message || '操作失败', 'error');
          }
        }
      );
      return;
    }
  });
}

function openEditNameModal(container) {
  const bodyHtml = `
    <form id="modal-edit-name-form">
      <div class="form-field">
        <label>团队名称</label>
        <input name="name" type="text" value="${escapeHtml(tenantDetail.tenant.name)}" required>
      </div>
    </form>
  `;
  
  openModal('编辑团队名称', bodyHtml, null);
  
  const okBtn = document.getElementById('modal-ok');
  const originalOnClick = okBtn.onclick;
  
  okBtn.onclick = async () => {
    const form = document.getElementById('modal-edit-name-form');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const data = Object.fromEntries(new FormData(form));
    try {
      await api.updateTenantName(currentTenantId, data);
      closeModal();
      await loadTenantDetail(container);
      toast('团队名称已更新', 'success');
    } catch (err) {
      toast(err.message || '更新失败', 'error');
    }
  };
  
  const cancelBtn = document.getElementById('modal-cancel');
  const originalCancelOnClick = cancelBtn.onclick;
  cancelBtn.onclick = () => {
    okBtn.onclick = originalOnClick;
    cancelBtn.onclick = originalCancelOnClick;
    closeModal();
  };
}

export function unmount() {
  tenantDetail = null;
  currentTenantId = null;
}
