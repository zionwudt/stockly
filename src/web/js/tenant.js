import { api } from "./api.js";

const AUTH_PATH = "/";
const APP_PATH = "/app.html";
const FLASH_KEY = "jiancang_flash";
const TENANT_AUTO_ENTER_KEY = "jiancang_tenant_auto_enter";

const state = {
  auth: null,
  tenantHub: null,
};

const refs = {
  tenantShell: document.querySelector("#tenant-shell"),
  heroCopy: document.querySelector("#tenant-hero-copy"),
  currentBadge: document.querySelector("#tenant-current-badge"),
  userBadge: document.querySelector("#tenant-user-badge"),
  workspaceButton: document.querySelector("#tenant-workspace-button"),
  logoutButton: document.querySelector("#tenant-logout-button"),
  summary: document.querySelector("#tenant-summary"),
  summaryCopy: document.querySelector("#tenant-summary-copy"),
  accessList: document.querySelector("#tenant-access-list"),
  directoryList: document.querySelector("#tenant-directory-list"),
  myRequestList: document.querySelector("#my-join-request-list"),
  approvalList: document.querySelector("#tenant-approval-list"),
  createForm: document.querySelector("#tenant-create-form"),
  joinForm: document.querySelector("#tenant-join-form"),
  toast: document.querySelector("#toast"),
};

async function boot() {
  bindEvents();
  await restoreSession();
}

function bindEvents() {
  refs.workspaceButton.addEventListener("click", goToApp);
  refs.logoutButton.addEventListener("click", handleLogout);
  refs.createForm.addEventListener("submit", handleTenantCreateSubmit);
  refs.joinForm.addEventListener("submit", handleTenantJoinSubmit);

  document.addEventListener("click", (event) => {
    const enterTenantButton = event.target.closest("[data-enter-tenant]");
    if (enterTenantButton) {
      const tenantId = Number(enterTenantButton.dataset.enterTenant);
      const tenant = getAccessibleTenants().find((item) => Number(item.id) === tenantId);
      if (tenant) {
        void enterTenant(tenant, tenant.is_current ? `已进入 ${tenant.name}。` : `已切换到 ${tenant.name}。`);
      }
      return;
    }

    const prefillTenantButton = event.target.closest("[data-prefill-tenant-slug]");
    if (prefillTenantButton) {
      refs.joinForm.elements.tenant_slug.value = prefillTenantButton.dataset.prefillTenantSlug || "";
      refs.joinForm.elements.tenant_slug.focus();
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      return;
    }

    const approveButton = event.target.closest("[data-approve-request]");
    if (approveButton) {
      void handleJoinRequestDecision(Number(approveButton.dataset.approveRequest), true);
      return;
    }

    const rejectButton = event.target.closest("[data-reject-request]");
    if (rejectButton) {
      void handleJoinRequestDecision(Number(rejectButton.dataset.rejectRequest), false);
    }
  });
}

async function restoreSession() {
  try {
    await loadTenantState();
    const flashMessage = consumeFlashMessage();
    const shouldAutoEnter = consumeTenantAutoEnter();
    const accessibleTenants = getAccessibleTenants();

    if (shouldAutoEnter && accessibleTenants.length === 1) {
      await enterTenant(accessibleTenants[0], buildAutoEnterMessage(flashMessage, accessibleTenants[0]));
      return;
    }

    showTenantShell();
    renderTenantPage();
    if (flashMessage) {
      showToast(flashMessage);
    }
  } catch (error) {
    if (error.status === 401) {
      redirectToAuth();
      return;
    }
    redirectToAuth(error.message || "租户信息加载失败，请重新登录。");
  }
}

async function loadTenantState() {
  const [auth, tenantHub] = await Promise.all([api.getMe(), api.getTenantHub()]);
  state.auth = auth;
  state.tenantHub = tenantHub;
}

async function refreshTenantPage(successMessage = "") {
  try {
    await loadTenantState();
    showTenantShell();
    renderTenantPage();
    if (successMessage) {
      showToast(successMessage);
    }
  } catch (error) {
    if (error.status === 401) {
      redirectToAuth("登录已失效，请重新登录。");
      return;
    }
    showToast(error.message || "刷新租户信息失败。");
  }
}

async function handleLogout() {
  try {
    await api.logout();
  } catch (error) {
    showToast(error.message || "退出登录失败。");
  } finally {
    redirectToAuth();
  }
}

async function handleTenantCreateSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;

  try {
    const result = await api.createTenant(formToObject(form));
    form.reset();
    setFlashMessage(result.message || "租户已创建。");
    goToApp();
  } catch (error) {
    showToast(error.message || "创建租户失败。");
  }
}

async function handleTenantJoinSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;

  try {
    const result = await api.createJoinRequest(formToObject(form));
    form.elements.note.value = "";
    await refreshTenantPage(result.message || "已提交加入申请，请等待处理。");
  } catch (error) {
    showToast(error.message || "提交加入申请失败。");
  }
}

async function handleJoinRequestDecision(requestId, approved) {
  try {
    const result = approved ? await api.approveJoinRequest(requestId) : await api.rejectJoinRequest(requestId);
    await refreshTenantPage(result.message || (approved ? "已同意申请。" : "已拒绝申请。"));
  } catch (error) {
    showToast(error.message || "处理申请失败。");
  }
}

async function enterTenant(tenant, successMessage) {
  try {
    if (!tenant.is_current) {
      await api.switchTenant({ tenant_id: tenant.id });
    }
    setFlashMessage(successMessage);
    goToApp();
  } catch (error) {
    showToast(error.message || "进入租户失败。");
  }
}

function showTenantShell() {
  refs.tenantShell.hidden = false;
}

function renderTenantPage() {
  const auth = state.auth;
  const accessibleTenants = getAccessibleTenants();
  const discoverableTenants = state.tenantHub?.discoverable_tenants || [];
  const myRequests = state.tenantHub?.my_join_requests || [];
  const pendingApprovals = state.tenantHub?.pending_approvals || [];

  refs.userBadge.textContent = auth ? `${auth.user.display_name} · ${auth.user.username}` : "未登录";
  refs.currentBadge.textContent = auth?.current_tenant
    ? `${auth.current_tenant.name} · ${auth.current_tenant.slug}`
    : "未选择租户";
  refs.workspaceButton.hidden = !auth?.current_tenant;

  refs.summary.textContent = `可访问 ${accessibleTenants.length} 个 · 待审批 ${pendingApprovals.length} 条`;
  refs.summaryCopy.textContent = buildSummaryCopy(accessibleTenants.length, Boolean(auth?.current_tenant));
  refs.heroCopy.textContent = buildHeroCopy(accessibleTenants.length, Boolean(auth?.current_tenant));

  renderTenantAccessList(accessibleTenants);
  renderTenantDirectoryList(discoverableTenants);
  renderMyRequestList(myRequests);
  renderPendingApprovalList(pendingApprovals);
}

function renderTenantAccessList(items) {
  if (!items.length) {
    refs.accessList.innerHTML = `<div class="empty-state">你还没有加入任何租户。先新建一个，或申请加入一个现有租户。</div>`;
    return;
  }

  refs.accessList.innerHTML = items
    .map(
      (item) => `
        <article class="dense-row">
          <div class="row-head">
            <div class="row-main">
              <div class="row-title">${escapeHtml(item.name)}</div>
              <div class="row-subtitle">${escapeHtml(item.slug)} · ${item.is_owner ? "创建者" : "成员"}</div>
            </div>
            <div class="row-side tenant-row-side">
              <span class="status-chip ${item.is_current ? "safe" : "info"}">${item.is_current ? "当前" : item.is_owner ? "创建者" : "成员"}</span>
              <button type="button" class="ghost-button small" data-enter-tenant="${item.id}">${item.is_current ? "进入工作台" : "进入此租户"}</button>
            </div>
          </div>
          <div class="row-stats">
            <span class="stat-pill"><span>成员</span>${item.member_count}</span>
            <span class="stat-pill"><span>待审批</span>${item.pending_request_count}</span>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderTenantDirectoryList(items) {
  if (!items.length) {
    refs.directoryList.innerHTML = `<div class="empty-state">当前没有可发现的租户。</div>`;
    return;
  }

  refs.directoryList.innerHTML = items
    .map(
      (item) => `
        <article class="dense-row">
          <div class="row-head">
            <div class="row-main">
              <div class="row-title">${escapeHtml(item.name)}</div>
              <div class="row-subtitle">${escapeHtml(item.slug)} · 创建者 ${escapeHtml(item.owner_display_name)}</div>
            </div>
            <div class="row-side">
              <span class="status-chip ${relationClass(item.relation)}">${relationLabel(item.relation)}</span>
            </div>
          </div>
          <div class="row-stats">
            <span class="stat-pill"><span>成员</span>${item.member_count}</span>
            <span class="stat-pill"><span>创建时间</span>${formatDateTime(item.created_at)}</span>
          </div>
          ${
            item.relation === "none"
              ? `<div class="row-actions"><button type="button" class="ghost-button small" data-prefill-tenant-slug="${escapeHtml(item.slug)}">填写加入申请</button></div>`
              : ""
          }
        </article>
      `,
    )
    .join("");
}

function renderMyRequestList(items) {
  if (!items.length) {
    refs.myRequestList.innerHTML = `<div class="empty-state">你还没有提交过租户加入申请。</div>`;
    return;
  }

  refs.myRequestList.innerHTML = items
    .map(
      (item) => `
        <article class="dense-row">
          <div class="row-head">
            <div class="row-main">
              <div class="row-title">${escapeHtml(item.tenant_name)}</div>
              <div class="row-subtitle">${escapeHtml(item.tenant_slug)} · 提交于 ${formatDateTime(item.created_at)}</div>
            </div>
            <div class="row-side">
              <span class="status-chip ${requestStatusClass(item.status)}">${requestStatusLabel(item.status)}</span>
            </div>
          </div>
          <div class="row-note">${escapeHtml(item.note || "未填写申请说明")}</div>
        </article>
      `,
    )
    .join("");
}

function renderPendingApprovalList(items) {
  if (!items.length) {
    refs.approvalList.innerHTML = `<div class="empty-state">当前没有待你处理的加入申请。</div>`;
    return;
  }

  refs.approvalList.innerHTML = items
    .map(
      (item) => `
        <article class="dense-row">
          <div class="row-head">
            <div class="row-main">
              <div class="row-title">${escapeHtml(item.display_name || item.username)}</div>
              <div class="row-subtitle">${escapeHtml(item.username)} · 申请加入 ${escapeHtml(item.tenant_name)} (${escapeHtml(item.tenant_slug)})</div>
            </div>
            <div class="row-side">
              <span class="status-chip warn">待审批</span>
            </div>
          </div>
          <div class="row-note">${escapeHtml(item.note || "未填写申请说明")}</div>
          <div class="row-actions">
            <button type="button" class="quick-button quick-button--approve" data-approve-request="${item.id}">同意</button>
            <button type="button" class="quick-button quick-button--reject" data-reject-request="${item.id}">拒绝</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function showToast(message, duration = 2200) {
  refs.toast.textContent = message;
  refs.toast.classList.add("visible");
  window.clearTimeout(showToast.timerId);
  showToast.timerId = window.setTimeout(() => {
    refs.toast.classList.remove("visible");
  }, duration);
}

function buildSummaryCopy(accessibleCount, hasCurrentTenant) {
  if (!accessibleCount) {
    return "当前账号还没有可访问的租户。你可以新建一个，或提交加入申请。";
  }
  if (accessibleCount === 1) {
    return hasCurrentTenant
      ? "当前只有一个租户可用。你可以直接进入工作台，也可以继续管理租户关系。"
      : "当前只有一个租户可用。确认后可直接进入对应工作台。";
  }
  return `当前账号可访问 ${accessibleCount} 个租户，请先选择一个工作空间进入。`;
}

function buildHeroCopy(accessibleCount, hasCurrentTenant) {
  if (!accessibleCount) {
    return "先创建一个租户，或申请加入现有租户，再进入业务工作台。";
  }
  if (hasCurrentTenant) {
    return "你可以切换当前租户，或继续维护其他租户的加入与审批关系。";
  }
  return "请选择一个租户作为当前工作空间，进入主程序后所有数据都会归属到该租户。";
}

function buildAutoEnterMessage(flashMessage, tenant) {
  if (flashMessage.startsWith("登录成功")) {
    return `登录成功，已进入 ${tenant.name}。`;
  }
  if (flashMessage.startsWith("注册成功")) {
    return `注册成功，已进入 ${tenant.name}。`;
  }
  return `已进入 ${tenant.name}。`;
}

function getAccessibleTenants() {
  return state.tenantHub?.accessible_tenants || state.auth?.available_tenants || [];
}

function formToObject(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

function setFlashMessage(message) {
  window.sessionStorage.setItem(FLASH_KEY, message);
}

function consumeFlashMessage() {
  const message = window.sessionStorage.getItem(FLASH_KEY) || "";
  window.sessionStorage.removeItem(FLASH_KEY);
  return message;
}

function consumeTenantAutoEnter() {
  const enabled = window.sessionStorage.getItem(TENANT_AUTO_ENTER_KEY) === "1";
  window.sessionStorage.removeItem(TENANT_AUTO_ENTER_KEY);
  return enabled;
}

function goToApp() {
  window.location.replace(APP_PATH);
}

function redirectToAuth(message = "") {
  window.sessionStorage.removeItem(TENANT_AUTO_ENTER_KEY);
  if (message) {
    setFlashMessage(message);
  } else {
    window.sessionStorage.removeItem(FLASH_KEY);
  }
  window.location.replace(AUTH_PATH);
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function relationLabel(relation) {
  if (relation === "member") {
    return "已加入";
  }
  if (relation === "pending") {
    return "待审批";
  }
  return "可申请";
}

function relationClass(relation) {
  if (relation === "member") {
    return "safe";
  }
  if (relation === "pending") {
    return "warn";
  }
  return "info";
}

function requestStatusLabel(status) {
  if (status === "approved") {
    return "已同意";
  }
  if (status === "rejected") {
    return "已拒绝";
  }
  return "待审批";
}

function requestStatusClass(status) {
  if (status === "approved") {
    return "safe";
  }
  if (status === "rejected") {
    return "danger";
  }
  return "warn";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

boot();
