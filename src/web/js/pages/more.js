import { getState } from '../store.js';
import { escapeHtml } from '../utils.js';

export function mount(container) {
  const { auth, summary } = getState();
  const tenant = auth?.current_tenant;
  const user = auth?.user;
  const metrics = summary?.metrics || {};

  container.innerHTML = `
    <div class="page-section">
      <div class="profile-card">
        <div class="profile-avatar">${escapeHtml((user?.display_name || user?.username || '?')[0])}</div>
        <div class="profile-info">
          <div class="profile-name">${escapeHtml(user?.display_name || user?.username || '')}</div>
          <div class="profile-tenant">${tenant ? escapeHtml(tenant.name) : '未选择团队'}</div>
        </div>
      </div>
    </div>

    ${tenant ? `
    <div class="page-section">
      <div class="section-header"><h3>数据概览</h3></div>
      <div class="overview-grid">
        <div class="overview-item">
          <span class="overview-num">${metrics.product_count || 0}</span>
          <span class="overview-label">商品</span>
        </div>
        <div class="overview-item">
          <span class="overview-num">${metrics.supplier_count || 0}</span>
          <span class="overview-label">供应商</span>
        </div>
        <div class="overview-item">
          <span class="overview-num">${metrics.customer_count || 0}</span>
          <span class="overview-label">客户</span>
        </div>
      </div>
    </div>
    ` : ''}

    <div class="page-section">
      <div class="section-header"><h3>功能管理</h3></div>
      <div class="menu-list">
        <a class="menu-item" href="#/products">
          <span class="menu-icon menu-icon-blue">品</span>
          <span class="menu-text">商品管理</span>
          <svg class="menu-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </a>
        <a class="menu-item" href="#/suppliers">
          <span class="menu-icon menu-icon-orange">供</span>
          <span class="menu-text">供应商管理</span>
          <svg class="menu-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </a>
        <a class="menu-item" href="#/customers">
          <span class="menu-icon menu-icon-green">客</span>
          <span class="menu-text">客户管理</span>
          <svg class="menu-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </a>
        <a class="menu-item" href="#/stats">
          <span class="menu-icon menu-icon-purple">统</span>
          <span class="menu-text">统计分析</span>
          <svg class="menu-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </a>
      </div>
    </div>

    <div class="page-section">
      <div class="section-header"><h3>系统设置</h3></div>
      <div class="menu-list">
        <a class="menu-item" href="#/tenants">
          <span class="menu-icon menu-icon-gray">租</span>
          <span class="menu-text">团队管理</span>
          <svg class="menu-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </a>
        <button class="menu-item" id="sync-btn">
          <span class="menu-icon menu-icon-gray">刷</span>
          <span class="menu-text">同步数据</span>
          <svg class="menu-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button class="menu-item" id="logout-btn">
          <span class="menu-icon menu-icon-red">退</span>
          <span class="menu-text">退出登录</span>
          <svg class="menu-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    </div>
  `;

  container.querySelector('#sync-btn')?.addEventListener('click', () => window.__app.refreshData('数据已同步'));
  container.querySelector('#logout-btn')?.addEventListener('click', () => window.__app.logout());
}

export function unmount() {}
