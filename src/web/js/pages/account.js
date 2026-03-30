import { getState, loadAuth } from '../store.js';
import { escapeHtml, toast } from '../utils.js';
import { api } from '../api.js';
import { openModal, closeModal } from '../router.js';

const CHEVRON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

function avatarHtml(user, size = 'sm') {
  if (user?.avatar_data) {
    const cls = size === 'sm' ? 'avatar-circle-sm avatar-img' : 'avatar-circle avatar-img';
    return `<img class="${cls}" src="${escapeHtml(user.avatar_data)}" alt="头像">`;
  }
  const initial = escapeHtml((user?.display_name || user?.username || '?')[0]);
  const cls = size === 'sm' ? 'avatar-circle-sm' : 'avatar-circle';
  return `<div class="${cls}">${initial}</div>`;
}

export async function mount(container) {
  const { auth } = getState();
  const user = auth?.user;
  const displayName = escapeHtml(user?.display_name || user?.username || '');
  const username = escapeHtml(user?.username || '');

  container.innerHTML = `
    <div class="account-page">
      <div class="settings-section">
        <div class="settings-card">
          <div class="settings-menu">
            <div class="settings-item" id="username-item">
              <span class="settings-text">账号</span>
              <span class="settings-item-value">${username}</span>
            </div>
            <div class="settings-item profile-row" id="edit-avatar-item" role="button" tabindex="0">
              <span class="settings-text">头像</span>
              <div class="settings-item-avatar">${avatarHtml(user, 'sm')}</div>
              <div class="settings-arrow">${CHEVRON}</div>
            </div>
            <div class="settings-item profile-row" id="edit-name-item" role="button" tabindex="0">
              <span class="settings-text">昵称</span>
              <span class="settings-item-value">${displayName}</span>
              <div class="settings-arrow">${CHEVRON}</div>
            </div>
            <div class="settings-item profile-row" id="edit-password-item" role="button" tabindex="0">
              <span class="settings-text">密码</span>
              <span class="settings-item-value">••••••</span>
              <div class="settings-arrow">${CHEVRON}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#edit-name-item').addEventListener('click', () => openNameModal(container, user));
  container.querySelector('#edit-avatar-item').addEventListener('click', () => openAvatarModal(container, user));
  const pwdEl = container.querySelector('#edit-password-item');
  if (pwdEl) pwdEl.addEventListener('click', () => openChangePasswordModal(container, user));
}

function openNameModal(container, user) {
  const current = escapeHtml(user?.display_name || '');
  openModal(
    '修改昵称',
    `<div class="modal-form-group">
       <input type="text" id="modal-display-name" class="form-input" value="${current}" placeholder="请输入昵称" maxlength="32">
     </div>`,
    async () => {
      const input = document.getElementById('modal-display-name');
      const value = input?.value.trim();
      if (!value) { toast('昵称不能为空', 'error'); return; }
      try {
        await api.updateProfile({ display_name: value });
        toast('昵称已更新', 'success');
        closeModal();
        await loadAuth();
        await mount(container);
      } catch (err) {
        toast(err.message || '更新失败', 'error');
      }
    },
  );
  requestAnimationFrame(() => document.getElementById('modal-display-name')?.focus());
}

function openAvatarModal(container, user) {
  openModal(
    '更换头像',
    `<div class="avatar-modal-body">
       <div class="avatar-modal-preview" id="avatar-preview-wrap">
         ${avatarHtml(user, 'lg')}
       </div>
       <label class="btn btn-secondary avatar-modal-upload-btn">
         选择图片
         <input type="file" id="modal-avatar-input" accept="image/jpeg,image/png,image/webp,image/gif" style="display:none">
       </label>
       <p class="avatar-modal-hint">支持 JPG / PNG / WebP，不超过 5 MB</p>
     </div>`,
    async () => {
      const input = document.getElementById('modal-avatar-input');
      if (!input?.dataset.base64) {
        closeModal();
        return;
      }
      try {
        await api.updateProfile({ avatar_data: input.dataset.base64 });
        toast('头像已更新', 'success');
        closeModal();
        await loadAuth();
        await mount(container);
      } catch (err) {
        toast(err.message || '更新头像失败', 'error');
      }
    },
  );

  requestAnimationFrame(() => {
    const input = document.getElementById('modal-avatar-input');
    if (!input) return;
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > MAX_AVATAR_BYTES) {
        toast('图片过大，请选择小于 5 MB 的图片', 'error');
        input.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target.result;
        input.dataset.base64 = base64;
        const wrap = document.getElementById('avatar-preview-wrap');
        if (wrap) wrap.innerHTML = `<img class="avatar-circle avatar-img" src="${base64}" alt="头像预览">`;
      };
      reader.readAsDataURL(file);
    });
  });
}

function openChangePasswordModal(container, user) {
  openModal(
    '修改密码',
    `<div class="modal-form-group">
       <input type="password" id="modal-current-password" class="form-input" placeholder="当前密码">
     </div>
     <div class="modal-form-group">
       <input type="password" id="modal-new-password" class="form-input" placeholder="新密码（至少 8 位）">
     </div>
     <div class="modal-form-group">
       <input type="password" id="modal-confirm-password" class="form-input" placeholder="确认新密码">
     </div>`,
    async () => {
      const cur = document.getElementById('modal-current-password')?.value || '';
      const nw = document.getElementById('modal-new-password')?.value || '';
      const cf = document.getElementById('modal-confirm-password')?.value || '';

      if (!cur) { toast('请输入当前密码', 'error'); return; }
      if (!nw) { toast('请输入新密码', 'error'); return; }
      if (nw.length < 8) { toast('密码长度不能少于 8 位。', 'error'); return; }
      if (nw !== cf) { toast('两次输入的密码不一致。', 'error'); return; }

      try {
        await api.changePassword({ current_password: cur, password: nw, password_confirm: cf });
        toast('密码已更新，请使用新密码重新登录', 'success');
        closeModal();
        // Optionally force logout to require re-login; here we just refresh auth state
        await loadAuth();
        await mount(container);
      } catch (err) {
        toast(err.message || '修改密码失败', 'error');
      }
    },
  );
  requestAnimationFrame(() => document.getElementById('modal-current-password')?.focus());
}

export function unmount() {}
