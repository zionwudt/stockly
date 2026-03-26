import { api } from "./api.js";

const APP_PATH = "/app.html";
const TENANT_PATH = "/tenant.html";
const FLASH_KEY = "jiancang_flash";
const TENANT_AUTO_ENTER_KEY = "jiancang_tenant_auto_enter";

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
    const auth = await api.getMe();
    if (auth.current_tenant) {
      goToApp();
      return;
    }
    goToTenant(true);
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
    await api.login(formToObject(event.currentTarget));
    setFlashMessage("登录成功，请先选择或创建租户。");
    goToTenant(true);
  } catch (error) {
    showFeedback(error.message || "登录失败。");
  }
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  clearFeedback();

  try {
    await api.register(formToObject(event.currentTarget));
    setFlashMessage("注册成功，请先创建或加入一个租户。");
    goToTenant(true);
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

function goToTenant(autoEnter = false) {
  if (autoEnter) {
    window.sessionStorage.setItem(TENANT_AUTO_ENTER_KEY, "1");
  } else {
    window.sessionStorage.removeItem(TENANT_AUTO_ENTER_KEY);
  }
  window.location.replace(TENANT_PATH);
}

boot();
