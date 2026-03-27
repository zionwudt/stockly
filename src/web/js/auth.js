import { api } from './api.js';
import { toast } from './utils.js';

const FLASH_KEY = 'jiancang_flash';

function boot() {
  bindEvents();
  consumeFlash();
  restoreSession();
}

function bindEvents() {
  // Tab switching
  document.querySelectorAll('.auth-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('register-form').addEventListener('submit', handleRegister);
}

function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('login-form').hidden = tab !== 'login';
  document.getElementById('register-form').hidden = tab !== 'register';
  hideError();
}

async function restoreSession() {
  try {
    await api.me();
    goToApp();
  } catch {
    // Not logged in, stay on auth page
  }
}

async function handleLogin(e) {
  e.preventDefault();
  hideError();
  const form = e.currentTarget;
  const data = Object.fromEntries(new FormData(form));

  try {
    const auth = await api.login(data);
    if (auth.current_tenant) {
      setFlash(`欢迎回来，已进入 ${auth.current_tenant.name}`);
    } else {
      setFlash('登录成功，请先创建或加入一个团队');
    }
    goToApp();
  } catch (err) {
    showError(err.message || '登录失败');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  hideError();
  const form = e.currentTarget;
  const data = Object.fromEntries(new FormData(form));

  try {
    const auth = await api.register(data);
    setFlash(`注册成功，已进入 ${auth.current_tenant?.name || '默认团队'}`);
    goToApp();
  } catch (err) {
    showError(err.message || '注册失败');
  }
}

function showError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.hidden = false;
}

function hideError() {
  const el = document.getElementById('auth-error');
  el.textContent = '';
  el.hidden = true;
}

function setFlash(msg) {
  sessionStorage.setItem(FLASH_KEY, msg);
}

function consumeFlash() {
  const msg = sessionStorage.getItem(FLASH_KEY);
  sessionStorage.removeItem(FLASH_KEY);
  if (msg) toast(msg, 'success');
}

function goToApp() {
  window.location.replace('/app');
}

boot();
