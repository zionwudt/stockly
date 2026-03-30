import { api } from '../api.js';
import { escapeHtml, formatDateTime, toast } from '../utils.js';
import { openConfirm, openModal, closeModal } from '../router.js';
import { navigate } from '../router.js';

const CHEVRON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;

let tenantDetail = null;
let currentTenantId = null;

export function mount(container) {
  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  currentTenantId = Number(urlParams.get('id'));

  if (!currentTenantId) {
    navigate('/tenants');
    return;
  }

  container.innerHTML = '<div class="page-section"><div class="empty-hint">加载中...</div></div>';
  loadTenantDetail(container);
}

async function loadTenantDetail(container) {
  try {
    tenantDetail = await api.getTenantDetail(currentTenantId);
    render(container);
    bindEvents(container);
  } catch (err) {
    toast(err.message || '加载团队详情失败', 'error');
  }
}

function render(container) {
  if (!tenantDetail) return;

  const { tenant, members, pending_approvals, user_role } = tenantDetail;
  const isOwner = user_role === 'owner';
  const isAdmin = user_role === 'owner' || user_role === 'admin';

  container.innerHTML = `
    <div class="account-page">
      <!-- 团队信息 -->
      <div class="settings-section">
        <div class="section-header"><h3>团队信息</h3></div>
        <div class="settings-card">
          <div class="settings-menu">
            ${isOwner ? `
            <div class="settings-item profile-row" id="edit-name-row" role="button" tabindex="0">
              <span class="settings-text">团队名称</span>
              <span class="settings-item-value">${escapeHtml(tenant.name)}</span>
              <div class="settings-arrow">${CHEVRON}</div>
            </div>
            ` : `
            <div class="settings-item">
              <span class="settings-text">团队名称</span>
              <span class="settings-item-value">${escapeHtml(tenant.name)}</span>
            </div>
            `}
            <div class="settings-item">
              <span class="settings-text">团队标识</span>
              <span class="settings-item-value">${escapeHtml(tenant.slug)}</span>
            </div>
            <div class="settings-item">
              <span class="settings-text">所有者</span>
              <span class="settings-item-value">${escapeHtml(tenant.owner_display_name || tenant.owner_username)}</span>
            </div>
            <div class="settings-item">
              <span class="settings-text">创建时间</span>
              <span class="settings-item-value">${formatDateTime(tenant.created_at)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 成员列表 -->
      <div class="settings-section">
        <div class="section-header">
          <h3>成员列表</h3>
          <span class="section-hint">${members.length} 人</span>
        </div>
        <div class="settings-card">
          <div class="settings-menu">
            ${members.map(m => {
              const canManage = isOwner && m.role !== 'owner';
              const roleLabel = { owner: '所有者', admin: '管理员', member: '成员' }[m.role] || m.role;
              const roleClass = m.role === 'owner' ? 'tag-green' : m.role === 'admin' ? 'tag-blue' : 'tag-orange';
              return `
              <div class="settings-item member-item${canManage ? ' profile-row' : ''}"
                ${canManage ? `data-member-id="${m.user_id}" data-member-role="${m.role}" data-member-name="${escapeHtml(m.display_name || m.username)}"` : ''}
                ${canManage ? 'role="button" tabindex="0"' : ''}>
                <div class="member-item-avatar">${(m.display_name || m.username || '?')[0].toUpperCase()}</div>
                <div class="member-item-info">
                  <div class="member-item-name">${escapeHtml(m.display_name || m.username)}</div>
                  <div class="member-item-meta">${formatDateTime(m.joined_at)}</div>
                </div>
                <span class="tag ${roleClass}" style="flex-shrink:0;margin-right:${canManage ? '6px' : '0'}">${roleLabel}</span>
                ${canManage ? `<div class="settings-arrow">${CHEVRON}</div>` : ''}
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      ${isAdmin && pending_approvals.length ? `
      <!-- 待审批 -->
      <div class="settings-section">
        <div class="section-header">
          <h3>待审批申请</h3>
          <span class="section-hint text-warning">${pending_approvals.length} 条</span>
        </div>
        <div class="settings-card">
          <div class="settings-menu">
            ${pending_approvals.map(r => `
              <div class="settings-item">
                <span class="settings-text">
                  ${escapeHtml(r.display_name || r.username)}
                  ${r.note ? `<span style="font-size:12px;color:var(--text-3);margin-left:6px">${escapeHtml(r.note)}</span>` : ''}
                </span>
                <div style="display:flex;gap:6px;flex-shrink:0">
                  <button class="btn btn-sm btn-success" data-action="approve" data-request-id="${r.id}" style="height:28px;padding:0 10px;font-size:12px">同意</button>
                  <button class="btn btn-sm btn-ghost" data-action="reject" data-request-id="${r.id}" style="height:28px;padding:0 10px;font-size:12px">拒绝</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      ` : ''}
    </div>
  `;
}

function bindEvents(container) {
  container.addEventListener('click', async (e) => {
    // Edit name
    const editRow = e.target.closest('#edit-name-row');
    if (editRow) {
      openEditNameModal(container);
      return;
    }

    // Member management
    const memberRow = e.target.closest('[data-member-id]');
    if (memberRow) {
      const userId = Number(memberRow.dataset.memberId);
      const currentRole = memberRow.dataset.memberRole;
      const memberName = memberRow.dataset.memberName;
      openMemberActionModal(container, userId, currentRole, memberName);
      return;
    }

    // Approve
    const approveBtn = e.target.closest('[data-action="approve"]');
    if (approveBtn) {
      const requestId = Number(approveBtn.dataset.requestId);
      openConfirm('同意申请', '确定要同意该申请吗？', async () => {
        try {
          await api.approveJoin(requestId);
          await loadTenantDetail(container);
          toast('已同意申请', 'success');
        } catch (err) {
          toast(err.message || '操作失败', 'error');
        }
      });
      return;
    }

    // Reject
    const rejectBtn = e.target.closest('[data-action="reject"]');
    if (rejectBtn) {
      const requestId = Number(rejectBtn.dataset.requestId);
      openConfirm('拒绝申请', '确定要拒绝该申请吗？', async () => {
        try {
          await api.rejectJoin(requestId);
          await loadTenantDetail(container);
          toast('已拒绝申请', 'success');
        } catch (err) {
          toast(err.message || '操作失败', 'error');
        }
      });
      return;
    }
  });
}

function openEditNameModal(container) {
  openModal(
    '编辑团队名称',
    `<div class="modal-form-group">
       <input type="text" id="modal-tenant-name" class="form-input" value="${escapeHtml(tenantDetail.tenant.name)}" placeholder="请输入团队名称" required>
     </div>`,
    async () => {
      const input = document.getElementById('modal-tenant-name');
      const value = input?.value.trim();
      if (!value) { toast('团队名称不能为空', 'error'); return; }
      try {
        await api.updateTenantName(currentTenantId, { name: value });
        toast('团队名称已更新', 'success');
        closeModal();
        await loadTenantDetail(container);
      } catch (err) {
        toast(err.message || '更新失败', 'error');
      }
    },
  );
  requestAnimationFrame(() => document.getElementById('modal-tenant-name')?.focus());
}

function openMemberActionModal(container, userId, currentRole, memberName) {
  const isAdmin = currentRole === 'admin';
  const toggleRoleLabel = isAdmin ? '撤销管理员' : '设为管理员';
  const toggleRoleIcon = isAdmin
    ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`
    : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`;

  openModal(
    `成员管理`,
    `<p class="modal-member-name">${escapeHtml(memberName)}</p>
     <div class="settings-card" style="margin-top:10px">
       <div class="settings-menu">
         <button class="settings-item profile-row" id="modal-transfer-owner">
           <div class="menu-icon menu-icon-blue" style="width:30px;height:30px;border-radius:8px;flex-shrink:0">
             <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
           </div>
           <span class="settings-text">转让所有权</span>
           <div class="settings-arrow">${CHEVRON}</div>
         </button>
         <button class="settings-item profile-row" id="modal-change-role">
           <div class="menu-icon ${isAdmin ? 'menu-icon-orange' : 'menu-icon-blue'}" style="width:30px;height:30px;border-radius:8px;flex-shrink:0">
             ${toggleRoleIcon}
           </div>
           <span class="settings-text">${toggleRoleLabel}</span>
           <div class="settings-arrow">${CHEVRON}</div>
         </button>
         <button class="settings-item profile-row" id="modal-remove-member" style="color:var(--danger)">
           <div class="menu-icon menu-icon-red" style="width:30px;height:30px;border-radius:8px;flex-shrink:0">
             <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
           </div>
           <span class="settings-text" style="color:var(--danger)">移除成员</span>
           <div class="settings-arrow">${CHEVRON}</div>
         </button>
       </div>
     </div>`,
    () => closeModal(),
    { okText: '关闭', hideCancel: true },
  );

  requestAnimationFrame(() => {
    document.getElementById('modal-transfer-owner')?.addEventListener('click', () => {
      closeModal();
      openConfirm(
        '转让所有权',
        `确定要将团队所有权转让给 ${memberName} 吗？转让后你将成为管理员。`,
        async () => {
          try {
            await api.transferOwnership(currentTenantId, { user_id: userId });
            await loadTenantDetail(container);
            toast('所有权已转让', 'success');
          } catch (err) {
            toast(err.message || '转让失败', 'error');
          }
        }
      );
    });

    document.getElementById('modal-change-role')?.addEventListener('click', () => {
      closeModal();
      const newRole = isAdmin ? 'member' : 'admin';
      openConfirm(
        '确认修改角色',
        `确定要将 ${memberName} ${toggleRoleLabel}吗？`,
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
    });

    document.getElementById('modal-remove-member')?.addEventListener('click', () => {
      closeModal();
      openConfirm(
        '确认移除成员',
        `确定要移除 ${memberName} 吗？此操作不可撤销。`,
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
    });
  });
}

export function unmount() {
  tenantDetail = null;
  currentTenantId = null;
}

