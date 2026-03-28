// Hash-based router — survives browser refresh
let routes = {};
let currentPage = null;
let pageContainer = null;
let headerTitle = null;
let headerBack = null;
let tabBar = null;
let drawer = null;
let drawerBackdrop = null;
let drawerNav = null;
let drawerOpen = false;

const NAV_MENU = [
  { group: '工作台', items: [
    { path: '/', title: '首页', icon: 'blue', iconSvg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' },
  ]},
  { group: '基础资料', items: [
    { path: '/products', title: '商品管理', icon: 'blue', iconSvg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>' },
    { path: '/suppliers', title: '供应商', icon: 'green', iconSvg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>' },
    { path: '/customers', title: '客户', icon: 'orange', iconSvg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>' },
  ]},
  { group: '单据业务', items: [
    { path: '/documents', title: '单据列表', icon: 'purple', iconSvg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' },
    { path: '/purchase', title: '采购入库', icon: 'blue', iconSvg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>' },
    { path: '/sale', title: '销售出库', icon: 'green', iconSvg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>' },
    { path: '/adjustment', title: '库存调整', icon: 'orange', iconSvg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>' },
  ]},
  { group: '库存与统计', items: [
    { path: '/inventory', title: '库存查询', icon: 'blue', iconSvg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>' },
    { path: '/stats', title: '统计分析', icon: 'purple', iconSvg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>' },
  ]},
  { group: '其他', items: [
    { path: '/tenants', title: '团队管理', icon: 'gray', iconSvg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>' },
  ]},
];

export function register(path, config) {
  routes[path] = config;
}

export function navigate(path) {
  window.location.hash = path;
}

export function back() {
  const hash = window.location.hash.slice(1) || '/';
  const route = routes[hash];
  if (route && route.parent) {
    navigate(route.parent);
  } else {
    navigate('/');
  }
}

export function start(container, header, backBtn, tabs) {
  pageContainer = container;
  headerTitle = header;
  headerBack = backBtn;
  tabBar = tabs;
  
  drawer = document.getElementById('drawer');
  drawerBackdrop = document.getElementById('drawer-backdrop');
  drawerNav = document.getElementById('drawer-nav');
  
  const headerMenu = document.getElementById('header-menu');
  headerMenu.addEventListener('click', toggleDrawer);
  drawerBackdrop.addEventListener('click', closeDrawer);
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawerOpen) {
      closeDrawer();
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

function renderDrawer() {
  const current = currentPath();
  let html = '';
  
  for (const group of NAV_MENU) {
    html += `<div class="drawer-group"><div class="drawer-group-title">${group.group}</div>`;
    for (const item of group.items) {
      const active = item.path === current ? 'active' : '';
      html += `<a href="#${item.path}" class="drawer-item ${active}" data-path="${item.path}">
        <div class="drawer-icon drawer-icon-${item.icon}">${item.iconSvg}</div>
        <span class="drawer-text">${item.title}</span>
      </a>`;
    }
    html += '</div>';
  }
  
  drawerNav.innerHTML = html;
  
  drawerNav.querySelectorAll('.drawer-item').forEach(el => {
    el.addEventListener('click', () => {
      closeDrawer();
    });
  });
}

export function updateDrawerUser(name, tenant) {
  const nameEl = document.getElementById('drawer-name');
  const tenantEl = document.getElementById('drawer-tenant');
  const avatarEl = document.getElementById('drawer-avatar');
  
  if (nameEl) nameEl.textContent = name || '用户';
  if (tenantEl) tenantEl.textContent = tenant || '';
  if (avatarEl) avatarEl.textContent = name ? name.charAt(0) : '用户';
}

export function currentPath() {
  return window.location.hash.slice(1) || '/';
}

function handleRoute() {
  const hash = currentPath();
  const route = routes[hash];

  if (!route) {
    navigate('/');
    return;
  }

  if (currentPage && currentPage.unmount) {
    currentPage.unmount();
  }

  pageContainer.innerHTML = '';
  currentPage = route.module;
  route.module.mount(pageContainer);

  headerTitle.textContent = route.title;
  headerBack.hidden = false;
  
  renderDrawer();
}
