import { getState, loadAuth } from '../store.js';
import { escapeHtml, toast } from '../utils.js';
import { api } from '../api.js';

export async function mount(container) {
  const { auth } = getState();
  const user = auth?.user;

  container.innerHTML = `
    <div class="account-page">
      <!-- 个人信息展示 -->
      <div class="settings-section">
        <h3 class="section-title">个人信息</h3>
        <div class="settings-card">
          <div class="profile-display">
            <div class="profile-avatar-display">
              <div class="avatar-circle">${escapeHtml((user?.display_name || user?.username || '?')[0])}</div>
            </div>
            <div class="profile-info-display">
              <div class="profile-name-display">${escapeHtml(user?.display_name || user?.username || '')}</div>
              <div class="profile-email-display">${user?.email || ''}</div>
              <div class="profile-username-display">@${escapeHtml(user?.username || '')}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 修改个人信息 -->
      <div class="settings-section">
        <h3 class="section-title">修改个人信息</h3>
        <div class="settings-card">
          <div class="form-group">
            <label class="form-label">昵称</label>
            <input type="text" id="display-name" class="form-input" value="${escapeHtml(user?.display_name || '')}" placeholder="请输入昵称">
          </div>
          <div class="form-group">
            <label class="form-label">头像</label>
            <div class="avatar-uploader">
              <div class="avatar-preview">
                <span>${escapeHtml((user?.display_name || user?.username || '?')[0])}</span>
              </div>
              <input type="file" id="avatar-upload" accept="image/*" class="avatar-input">
              <button type="button" class="btn btn-secondary" id="change-avatar-btn">更换头像</button>
            </div>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-primary" id="save-profile">保存</button>
          </div>
        </div>
      </div>

      <!-- 账户设置 -->
      <div class="settings-section">
        <h3 class="section-title">账户设置</h3>
        <div class="settings-card">
          <div class="settings-menu">
            <a href="#/tenants" class="settings-item">
              <div class="settings-icon">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <span class="settings-text">团队管理</span>
              <div class="settings-arrow">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  `;

  // 绑定事件
  container.querySelector('#save-profile')?.addEventListener('click', async () => {
    const displayName = container.querySelector('#display-name').value.trim();
    
    try {
      await api.updateProfile({ display_name: displayName });
      toast('个人信息已更新', 'success');
      await loadAuth();
      await mount(container);
    } catch (err) {
      toast(err.message || '更新个人信息失败', 'error');
    }
  });

  // 头像上传处理
  const avatarUpload = container.querySelector('#avatar-upload');
  
  container.querySelector('#change-avatar-btn')?.addEventListener('click', () => {
    avatarUpload.click();
  });

  avatarUpload?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      // 这里可以添加图片预览功能
      toast('头像上传功能开发中', 'info');
    }
  });
}

export function unmount() {}
