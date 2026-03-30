import { api } from './api.js';
import * as router from './router.js';
import { getState, setState, loadAuth, loadTenantHub, loadWorkspace } from './store.js';
import { toast } from './utils.js';

// Page modules
import * as home from './pages/home.js';
import * as inventory from './pages/inventory.js';
import * as documents from './pages/documents.js';
import * as account from './pages/account.js';
import * as products from './pages/products.js';
import * as suppliers from './pages/suppliers.js';
import * as customers from './pages/customers.js';
import * as tenants from './pages/tenants.js';
import * as tenantDetail from './pages/tenant-detail.js';
import * as purchase from './pages/purchase.js';
import * as sale from './pages/sale.js';
import * as adjustment from './pages/adjustment.js';

const FLASH_KEY = 'jiancang_flash';
const AUTH_PATH = '/';

// Route definitions
const ROUTES = {
  '/':           { module: home,       title: '简仓' },
  '/inventory':  { module: inventory,  title: '库存查询' },
  '/documents':  { module: documents,  title: '单据列表' },
  '/account':    { module: account,    title: '账号管理' },
  '/products':   { module: products,   title: '商品列表' },
  '/products/create': { module: products, title: '新增商品', parent: '/products' },
  '/products/detail': { module: products, title: '商品详情', parent: '/products' },
  '/suppliers':  { module: suppliers,  title: '供应商列表' },
  '/suppliers/create': { module: suppliers, title: '新增供应商' },
  '/suppliers/detail': { module: suppliers, title: '供应商详情' },
  '/customers':  { module: customers,  title: '客户列表' },
  '/customers/create': { module: customers, title: '新增客户', parent: '/customers' },
  '/customers/detail': { module: customers, title: '客户详情', parent: '/customers' },
  '/tenants':    { module: tenants,    title: '团队管理' },
  '/tenants/detail': { module: tenantDetail, title: '团队详情', parent: '/tenants' },
  '/purchase':   { module: purchase,   title: '采购入库' },
  '/sale':       { module: sale,       title: '销售出库' },
  '/adjustment': { module: adjustment, title: '库存调整' },
};

async function boot() {
  bindViewportOffset();

  try {
    await loadAuth();
    await loadTenantHub();

    const { auth } = getState();
    if (auth?.current_tenant) {
      await loadWorkspace();
    }
  } catch (err) {
    if (err.message === 'Unauthorized') return;
    redirectToAuth(err.message || '会话恢复失败');
    return;
  }

  // Register routes
  for (const [path, config] of Object.entries(ROUTES)) {
    router.register(path, config);
  }

  // Start router
  const container = document.getElementById('page');
  const title = document.getElementById('header-title');

  router.start(container, title);

  // Update drawer user info
  const { auth, tenantHub } = getState();
  const tenants = tenantHub?.accessible_tenants || auth?.available_tenants || [];
  const displayName = auth?.user?.display_name || auth?.user?.username || '';
  const tenantName = tenants.find(t => t.id === auth?.current_tenant)?.name || '';
  router.updateDrawerUser(displayName, tenantName, auth?.user?.avatar_data);
  if (!auth?.current_tenant) {
    router.navigate('/tenants');
  }

  // Consume flash message
  const flash = consumeFlash();
  if (flash) toast(flash, 'success');
}

function bindViewportOffset() {
  const update = () => {
    const vp = window.visualViewport;
    if (!vp) return;
    const offset = Math.max(0, window.innerHeight - vp.height - vp.offsetTop);
    document.documentElement.style.setProperty('--viewport-offset-bottom', `${Math.round(offset)}px`);
  };
  update();
  window.addEventListener('resize', update, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', update, { passive: true });
    window.visualViewport.addEventListener('scroll', update, { passive: true });
  }
}

function consumeFlash() {
  const msg = sessionStorage.getItem(FLASH_KEY);
  sessionStorage.removeItem(FLASH_KEY);
  return msg;
}

function redirectToAuth(message = '') {
  if (message) sessionStorage.setItem(FLASH_KEY, message);
  window.location.replace(AUTH_PATH);
}

// Expose globally for page modules
window.__app = {
  getState,
  api,
  toast,
  refreshData: async function(successMsg) {
    try {
      await loadAuth();
      await loadTenantHub();
      const { auth } = getState();
      if (auth?.current_tenant) {
        await loadWorkspace();
      }
      // Update tenant name display
      const { tenantHub } = getState();
      const tenants = tenantHub?.accessible_tenants || auth?.available_tenants || [];
      const displayName = auth?.user?.display_name || auth?.user?.username || '';
      const tenantName = tenants.find(t => t.id === auth?.current_tenant)?.name || '';
      router.updateDrawerUser(displayName, tenantName, auth?.user?.avatar_data);
      const hash = router.currentPath();
      const resolved = router.resolveRoute(hash);
      if (resolved) {
        const container = document.getElementById('page');
        container.innerHTML = '';
        resolved.config.module.mount(container);
      }
      if (successMsg) toast(successMsg, 'success');
    } catch (err) {
      if (err.message === 'Unauthorized') {
        redirectToAuth('登录已失效，请重新登录');
        return;
      }
      toast(err.message || '刷新数据失败', 'error');
    }
  },
  logout: async function() {
    try {
      await api.logout();
    } catch { /* ignore */ }
    redirectToAuth();
  },
  navigate: router.navigate,
};

boot();
