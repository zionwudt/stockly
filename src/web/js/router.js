// Hash-based router — survives browser refresh
let routes = {};
let currentPage = null;
let pageContainer = null;
let headerTitle = null;
let tabBar = null;
let drawer = null;
let drawerBackdrop = null;
let drawerNav = null;
let drawerOpen = false;
let headerTenant = null;
let confirmBackdrop = null;
let confirmDialog = null;
let confirmTitleEl = null;
let confirmMessageEl = null;
let confirmCancelBtn = null;
let confirmOkBtn = null;
let confirmCallback = null;
let dropdownBackdrop = null;
let tenantDropdown = null;
let dropdownOpen = false;
let modalBackdrop = null;
let modalDialog = null;
let modalTitleEl = null;
let modalBodyEl = null;
let modalCancelBtn = null;
let modalOkBtn = null;
let modalOnOk = null;

const NAV_MENU = [
  { group: '', items: [
    { path: '/', title: '首页', icon: 'blue', iconSvg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' },
    { path: '/documents', title: '单据列表', icon: 'purple', iconSvg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' },
    { path: '/inventory', title: '库存查询', icon: 'blue', iconSvg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>' },
  ]},
  { group: '基础资料', items: [
    { path: '/products', title: '商品列表', icon: 'blue', iconSvg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>' },
    { path: '/suppliers', title: '供应商列表', icon: 'green', iconSvg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>' },
    { path: '/customers', title: '客户列表', icon: 'orange', iconSvg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>' },
  ]},
  { group: '系统', items: [
    { path: '/account', title: '账户设置', icon: 'gray', iconSvg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>' },
    { path: '/tenants', title: '团队管理', icon: 'purple', iconSvg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' },
    { type: 'logout', title: '退出登录', icon: 'red', iconSvg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' },
  ]},
];

export function register(path, config) {
  routes[path] = config;
}

export function navigate(path) {
  window.location.hash = path;
}

export function normalizePath(path) {
  const rawPath = path || '/';
  const [pathname] = rawPath.split('?');
  return pathname || '/';
}

export function resolveRoute(path = currentPath()) {
  const normalizedPath = normalizePath(path);
  const config = routes[normalizedPath];
  if (!config) return null;
  return { path: normalizedPath, config };
}

export function back() {
  const resolved = resolveRoute();
  if (resolved?.config.parent) {
    navigate(resolved.config.parent);
  } else {
    navigate('/');
  }
}

export function start(container, header, tabs) {
  pageContainer = container;
  headerTitle = header;
  tabBar = tabs;
  
  drawer = document.getElementById('drawer');
  drawerBackdrop = document.getElementById('drawer-backdrop');
  drawerNav = document.getElementById('drawer-nav');
  headerTenant = document.getElementById('header-tenant');
  
  confirmBackdrop = document.getElementById('confirm-backdrop');
  confirmDialog = document.getElementById('confirm-dialog');
  confirmTitleEl = document.getElementById('confirm-title');
  confirmMessageEl = document.getElementById('confirm-message');
  confirmCancelBtn = document.getElementById('confirm-cancel');
  confirmOkBtn = document.getElementById('confirm-ok');
  
  dropdownBackdrop = document.getElementById('dropdown-backdrop');
  tenantDropdown = document.getElementById('tenant-dropdown');
  
  modalBackdrop = document.getElementById('modal-backdrop');
  modalDialog = document.getElementById('modal-dialog');
  modalTitleEl = document.getElementById('modal-title');
  modalBodyEl = document.getElementById('modal-body');
  modalCancelBtn = document.getElementById('modal-cancel');
  modalOkBtn = document.getElementById('modal-ok');
  
  const headerMenu = document.getElementById('header-menu');
  headerMenu.addEventListener('click', toggleDrawer);
  drawerBackdrop.addEventListener('click', closeDrawer);
  
  confirmCancelBtn.addEventListener('click', closeConfirm);
  confirmOkBtn.addEventListener('click', () => {
    closeConfirm();
    if (confirmCallback) confirmCallback();
  });
  confirmBackdrop.addEventListener('click', closeConfirm);
  
  // 模态框事件
  modalCancelBtn.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', closeModal);
  
  // 租户下拉菜单事件
  headerTenant.addEventListener('click', toggleTenantDropdown);
  dropdownBackdrop.addEventListener('click', closeTenantDropdown);
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawerOpen) {
      closeDrawer();
    }
    if (e.key === 'Escape' && confirmDialog.classList.contains('show')) {
      closeConfirm();
    }
    if (e.key === 'Escape' && dropdownOpen) {
      closeTenantDropdown();
    }
    if (e.key === 'Escape' && modalDialog.classList.contains('show')) {
      closeModal();
    }
  });
  
  renderDrawer();
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

export function toggleDrawer() {
  if (drawerOpen) {
    closeDrawer();
  } else {
    openDrawer();
  }
}

export function openDrawer() {
  drawer.classList.add('show');
  drawerBackdrop.classList.add('show');
  drawerOpen = true;
  document.body.style.overflow = 'hidden';
}

export function closeDrawer() {
  drawer.classList.remove('show');
  drawerBackdrop.classList.remove('show');
  drawerOpen = false;
  document.body.style.overflow = '';
}

// 租户下拉菜单相关函数
export function toggleTenantDropdown() {
  if (dropdownOpen) {
    closeTenantDropdown();
  } else {
    openTenantDropdown();
  }
}

export function openTenantDropdown() {
  const { getState } = window.__app;
  const { auth, tenantHub } = getState();
  const tenants = tenantHub?.accessible_tenants || auth?.available_tenants || [];
  
  if (tenants.length === 0) return;
  
  renderTenantDropdown(tenants, auth?.current_tenant);
  
  dropdownBackdrop.hidden = false;
  tenantDropdown.hidden = false;
  dropdownOpen = true;
}

export function closeTenantDropdown() {
  dropdownBackdrop.hidden = true;
  tenantDropdown.hidden = true;
  dropdownOpen = false;
}

function renderTenantDropdown(tenants, currentTenantId) {
  let html = '';
  
  for (const tenant of tenants) {
    const isCurrent = tenant.id === currentTenantId;
    html += `
      <div class="dropdown-item" data-switch-tenant="${tenant.id}">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
        </svg>
        <span class="dropdown-item-text">${escapeHtml(tenant.name)}</span>
        ${isCurrent ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--success)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      </div>
    `;
  }
  
  // 添加管理团队选项
  html += `
    <div class="dropdown-item" data-navigate-to="/tenants">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
      <span class="dropdown-item-text">管理团队</span>
    </div>
  `;
  
  tenantDropdown.innerHTML = html;
  
  // 绑定切换租户事件
  tenantDropdown.querySelectorAll('[data-switch-tenant]').forEach(el => {
    el.addEventListener('click', async () => {
      const tenantId = Number(el.dataset.switchTenant);
      closeTenantDropdown();
      await switchToTenant(tenantId);
    });
  });
  
  // 绑定导航到租户管理页面事件
  tenantDropdown.querySelectorAll('[data-navigate-to]').forEach(el => {
    el.addEventListener('click', () => {
      const path = el.dataset.navigateTo;
      closeTenantDropdown();
      navigate(path);
    });
  });
}

async function switchToTenant(tenantId) {
  const { getState, api } = window.__app;
  const { tenantHub, auth } = getState();
  const tenants = tenantHub?.accessible_tenants || auth?.available_tenants || [];
  const tenant = tenants.find(t => t.id === tenantId);
  
  if (!tenant) return;
  
  if (tenant.id === auth?.current_tenant) {
    return;
  }
  
  try {
    await api.switchTenant({ tenant_id: tenantId });
    await window.__app.refreshData(`已切换到 ${tenant.name}`);
  } catch (err) {
    const { toast } = window.__app;
    toast(err.message || '切换团队失败', 'error');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function openConfirm(title, message, callback) {
  confirmTitleEl.textContent = title;
  confirmMessageEl.textContent = message;
  confirmCallback = callback;
  confirmBackdrop.classList.add('show');
  confirmDialog.classList.add('show');
}

export function closeConfirm() {
  confirmBackdrop.classList.remove('show');
  confirmDialog.classList.remove('show');
  confirmCallback = null;
}

export function openModal(title, body, onOk) {
  modalTitleEl.textContent = title;
  modalBodyEl.innerHTML = body;
  modalOnOk = onOk;
  modalBackdrop.classList.add('show');
  modalDialog.classList.add('show');
  document.body.style.overflow = 'hidden';
  
  // 设置默认的确定按钮点击事件
  modalOkBtn.onclick = () => {
    if (modalOnOk) {
      modalOnOk();
    } else {
      closeModal();
    }
  };
}

export function closeModal() {
  modalBackdrop.classList.remove('show');
  modalDialog.classList.remove('show');
  modalOnOk = null;
  document.body.style.overflow = '';
}

function renderDrawer() {
  const current = currentNavPath();
  let html = '';
  
  for (const group of NAV_MENU) {
    html += `<div class="drawer-group"><div class="drawer-group-title">${group.group}</div>`;
    for (const item of group.items) {
      if (item.type === 'logout') {
        html += `<button class="drawer-item" data-action="logout">
          <div class="drawer-icon drawer-icon-${item.icon}">${item.iconSvg}</div>
          <span class="drawer-text">${item.title}</span>
        </button>`;
      } else {
        const active = item.path === current ? 'active' : '';
        html += `<a href="#${item.path}" class="drawer-item ${active}" data-path="${item.path}">
          <div class="drawer-icon drawer-icon-${item.icon}">${item.iconSvg}</div>
          <span class="drawer-text">${item.title}</span>
        </a>`;
      }
    }
    html += '</div>';
  }
  
  drawerNav.innerHTML = html;
  
  drawerNav.querySelectorAll('.drawer-item').forEach(el => {
    if (el.dataset.action === 'logout') {
      el.addEventListener('click', () => {
        closeDrawer();
        openConfirm('退出登录', '确定要退出登录吗？', () => {
          window.__app.logout();
        });
      });
    } else {
      el.addEventListener('click', () => {
        closeDrawer();
      });
    }
  });
}

export function updateDrawerUser(name, tenant, avatarData) {
  const nameEl = document.getElementById('drawer-name');
  const tenantEl = document.getElementById('drawer-tenant');
  const avatarEl = document.getElementById('drawer-avatar');

  if (nameEl) nameEl.textContent = '简仓';
  if (tenantEl) tenantEl.textContent = '进销存管理系统';
  if (avatarEl) {
    if (avatarData) {
      avatarEl.innerHTML = `<img src="${avatarData}" alt="头像" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else {
      avatarEl.textContent = name ? name[0] : '简';
    }
  }
  if (headerTenant) {
    headerTenant.textContent = tenant || '';
    if (tenant) {
      headerTenant.style.cursor = 'pointer';
    }
  }
}

export function currentPath() {
  return window.location.hash.slice(1) || '/';
}

function currentNavPath() {
  let resolved = resolveRoute();
  if (!resolved) return normalizePath(currentPath());
  while (resolved.config.parent) {
    const parent = resolveRoute(resolved.config.parent);
    if (!parent) break;
    resolved = parent;
  }
  return resolved.path;
}

function handleRoute() {
  const resolved = resolveRoute();

  if (!resolved) {
    navigate('/');
    return;
  }

  if (currentPage && currentPage.unmount) {
    currentPage.unmount();
  }

  pageContainer.innerHTML = '';
  currentPage = resolved.config.module;
  currentPage.mount(pageContainer);

  headerTitle.textContent = resolved.config.title;
  
  renderDrawer();
}
