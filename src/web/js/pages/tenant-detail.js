import { api } from '../api.js';
import { escapeHtml, formatDateTime, toast } from '../utils.js';
import { openConfirm, openModal, closeModal } from '../router.js';
import { navigate, back } from '../router.js';

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
              <span class="settings-text">创建者</span>
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
            ${members.map(m => `
              <div class="settings-item${isOwner && m.role !== 'owner' ? ' profile-row' : ''}" ${isOwner && m.role !== 'owner' ? `data-member-id="${m.user_id}" data-member-role="${m.role}" data-member-name="${escapeHtml(m.display_name || m.username)}" role="button" tabindex="0"` : ''}>
                <span class="settings-text">
                  ${escapeHtml(m.display_name || m.username)}
                  <span class="tag ${m.role === 'owner' ? 'tag-green' : m.role === 'admin' ? 'tag-blue' : 'tag-orange'}" style="margin-left:6px">
                    ${{ owner: '创建者', admin: '管理员', member: '成员' }[m.role] || m.role}
                  </span>
                </span>
                <span class="settings-item-value" style="font-size:12px">${formatDateTime(m.joined_at)}</span>
                ${isOwner && m.role !== 'owner' ? `<div class="settings-arrow">${CHEVRON}</div>` : ''}
              </div>
            `).join('')}
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
  const newRole = currentRole === 'admin' ? 'member' : 'admin';
  const roleLabel = newRole === 'admin' ? '设为管理员' : '降为成员';

  openModal(
    `管理成员`,
    `<div class="settings-card">
       <div class="settings-menu">
         <button class="settings-item profile-row" id="modal-change-role">
           <span class="settings-text">${roleLabel}</span>
           <div class="settings-arrow">${CHEVRON}</div>
         </button>
         <button class="settings-item profile-row danger" id="modal-remove-member">
           <span class="settings-text">移除成员</span>
           <div class="settings-arrow">${CHEVRON}</div>
         </button>
       </div>
     </div>
     <p style="font-size:12px;color:var(--text-3);margin-top:10px;text-align:center">${escapeHtml(memberName)}</p>`,
    () => closeModal(),
  );

  requestAnimationFrame(() => {
    document.getElementById('modal-change-role')?.addEventListener('click', () => {
      closeModal();
      openConfirm(
        '确认修改角色',
        `确定要将 ${memberName} ${roleLabel}吗？`,
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

