// Hash-based router — survives browser refresh
let routes = {};
let currentPage = null;
let pageContainer = null;
let headerTitle = null;
let headerMenuBtn = null;
let headerBackBtn = null;
let drawer = null;
let drawerBackdrop = null;
let drawerNav = null;
let drawerOpen = false;
let confirmBackdrop = null;
let confirmDialog = null;
let confirmTitleEl = null;
let confirmMessageEl = null;
let confirmCancelBtn = null;
let confirmOkBtn = null;
let confirmCallback = null;
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

export function start(container, header) {
  pageContainer = container;
  headerTitle = header;

  drawer = document.getElementById('drawer');
  drawerBackdrop = document.getElementById('drawer-backdrop');
  drawerNav = document.getElementById('drawer-nav');
  headerMenuBtn = document.getElementById('header-menu');
  headerBackBtn = document.getElementById('header-back');

  confirmBackdrop = document.getElementById('confirm-backdrop');
  confirmDialog = document.getElementById('confirm-dialog');
  confirmTitleEl = document.getElementById('confirm-title');
  confirmMessageEl = document.getElementById('confirm-message');
  confirmCancelBtn = document.getElementById('confirm-cancel');
  confirmOkBtn = document.getElementById('confirm-ok');

  modalBackdrop = document.getElementById('modal-backdrop');
  modalDialog = document.getElementById('modal-dialog');
  modalTitleEl = document.getElementById('modal-title');
  modalBodyEl = document.getElementById('modal-body');
  modalCancelBtn = document.getElementById('modal-cancel');
  modalOkBtn = document.getElementById('modal-ok');

  headerMenuBtn.addEventListener('click', toggleDrawer);
  headerBackBtn.addEventListener('click', back);
  drawerBackdrop.addEventListener('click', closeDrawer);

  confirmCancelBtn.addEventListener('click', closeConfirm);
  confirmOkBtn.addEventListener('click', () => {
    const cb = confirmCallback;
    closeConfirm();
    if (cb) cb();
  });
  confirmBackdrop.addEventListener('click', closeConfirm);

  modalCancelBtn.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', closeModal);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawerOpen) closeDrawer();
    if (e.key === 'Escape' && confirmDialog.classList.contains('show')) closeConfirm();
    if (e.key === 'Escape' && modalDialog.classList.contains('show')) closeModal();
  });

  renderDrawer();
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

export function toggleDrawer() {
  if (drawerOpen) { closeDrawer(); } else { openDrawer(); }
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

export function openModal(title, body, onOk, options = {}) {
  const {
    hideCancel = false,
    hideOk = false,
    cancelText = '取消',
    okText = '确定',
  } = options;

  modalTitleEl.textContent = title;
  modalBodyEl.innerHTML = body;
  modalOnOk = onOk;
  modalCancelBtn.hidden = !!hideCancel;
  modalOkBtn.hidden = !!hideOk;
  modalCancelBtn.textContent = cancelText;
  modalOkBtn.textContent = okText;
  modalBackdrop.classList.add('show');
  modalDialog.classList.add('show');
  document.body.style.overflow = 'hidden';
  modalOkBtn.onclick = () => { if (modalOnOk) modalOnOk(); else closeModal(); };
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
        openConfirm('退出登录', '确定要退出登录吗？', () => window.__app.logout());
      });
    } else {
      el.addEventListener('click', () => closeDrawer());
    }
  });
}

export function updateDrawerUser(name, tenant, avatarData) {
  const nameEl = document.getElementById('drawer-name');
  const tenantEl = document.getElementById('drawer-tenant');
  const avatarEl = document.getElementById('drawer-avatar');

  if (nameEl) nameEl.textContent = name || '简仓';
  if (tenantEl) tenantEl.textContent = tenant || '进销存管理系统';
  if (avatarEl) {
    if (avatarData) {
      avatarEl.innerHTML = `<img src="${avatarData}" alt="头像" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else {
      avatarEl.textContent = name ? name[0].toUpperCase() : '仓';
    }
  }
}

export function currentPath() {
  return window.location.hash.slice(1) || '/';
}

// Allow pages to inject an action button into the header-right area
export function setHeaderAction(html, onClick) {
  const right = document.getElementById('header-right-action');
  if (!right) return;
  right.innerHTML = html;
  if (onClick) {
    const btn = right.querySelector('button, a');
    if (btn) btn.addEventListener('click', onClick);
  }
}

export function clearHeaderAction() {
  const right = document.getElementById('header-right-action');
  if (right) right.innerHTML = '';
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
  if (!resolved) { navigate('/'); return; }

  if (currentPage && currentPage.unmount) currentPage.unmount();

  // Clear any page-specific header action
  clearHeaderAction();

  pageContainer.innerHTML = '';
  currentPage = resolved.config.module;
  currentPage.mount(pageContainer);

  headerTitle.textContent = resolved.config.title;

  // 二级页面：显示返回按钮，隐藏汉堡菜单；一级页面反之
  const isSubPage = !!resolved.config.parent;
  headerMenuBtn.hidden = isSubPage;
  headerBackBtn.hidden = !isSubPage;

  renderDrawer();
}
