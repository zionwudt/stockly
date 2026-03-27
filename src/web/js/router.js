// Hash-based router — survives browser refresh
let routes = {};
let currentPage = null;
let pageContainer = null;
let headerTitle = null;
let headerBack = null;
let tabBar = null;

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
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
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

  // Update header
  headerTitle.textContent = route.title;
  if (route.tab) {
    headerBack.hidden = true;
  } else {
    headerBack.hidden = false;
  }

  // Update tab bar
  const tabPath = route.tab ? hash : (route.parent || '/');
  tabBar.querySelectorAll('.tab-item').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabPath);
  });

  // Show/hide tab bar on form pages
  const hideTabs = ['/purchase', '/sale', '/adjustment'].includes(hash);
  tabBar.classList.toggle('hidden', hideTabs);
}
