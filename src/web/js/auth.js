import { api } from "./api.js";

const APP_PATH = "/app.html";
const FLASH_KEY = "jiancang_flash";

const refs = {
  feedback: document.querySelector("#auth-feedback"),
  loginForm: document.querySelector("#login-form"),
  registerForm: document.querySelector("#register-form"),
  authTabButtons: Array.from(document.querySelectorAll("[data-auth-tab]")),
  authPanels: Array.from(document.querySelectorAll("[data-auth-panel]")),
};

async function boot() {
  bindEvents();
  applyAuthTab("login");
  consumeFlashMessage();
  await restoreSession();
}

function bindEvents() {
  refs.loginForm.addEventListener("submit", handleLoginSubmit);
  refs.registerForm.addEventListener("submit", handleRegisterSubmit);

  document.addEventListener("click", (event) => {
    const authTab = event.target.closest("[data-auth-tab]");
    if (!authTab) {
      return;
    }
    applyAuthTab(authTab.dataset.authTab);
  });
}

async function restoreSession() {
  try {
    await api.getMe();
    goToApp();
  } catch (error) {
    if (error.status !== 401) {
      showFeedback(error.message || "会话检查失败，请稍后重试。");
    }
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  clearFeedback();

  try {
    const auth = await api.login(formToObject(event.currentTarget));
    if (auth.current_tenant) {
      setFlashMessage(`欢迎回来，已进入 ${auth.current_tenant.name}。`);
      goToApp();
      return;
    }
    setFlashMessage("登录成功，请先创建租户或提交加入申请。");
    goToApp();
  } catch (error) {
    showFeedback(error.message || "登录失败。");
  }
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  clearFeedback();

  try {
    const auth = await api.register(formToObject(event.currentTarget));
    const tenantName = auth.current_tenant?.name || "默认租户";
    setFlashMessage(`注册成功，已自动进入 ${tenantName}。`);
    goToApp();
  } catch (error) {
    showFeedback(error.message || "注册失败。");
  }
}

function applyAuthTab(activeTab) {
  refs.authTabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.authTab === activeTab);
  });

  refs.authPanels.forEach((panel) => {
    panel.hidden = panel.dataset.authPanel !== activeTab;
  });

  clearFeedback();
}

function showFeedback(message) {
  refs.feedback.textContent = message;
  refs.feedback.hidden = false;
}

function clearFeedback() {
  refs.feedback.textContent = "";
  refs.feedback.hidden = true;
}

function setFlashMessage(message) {
  window.sessionStorage.setItem(FLASH_KEY, message);
}

function consumeFlashMessage() {
  const message = window.sessionStorage.getItem(FLASH_KEY) || "";
  window.sessionStorage.removeItem(FLASH_KEY);
  if (message) {
    showFeedback(message);
  }
}

function formToObject(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

function goToApp() {
  window.location.replace(APP_PATH);
}

boot();
