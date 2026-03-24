import { api } from "./api.js";
import { appendLineItem, removeLineItem, renderApp, showToast } from "./ui.js";

const state = {
  auth: null,
  tenantHub: null,
  summary: null,
  statistics: null,
  products: [],
  suppliers: [],
  customers: [],
  stock: [],
  movements: [],
  documents: [],
  ui: {
    activeAuthTab: "login",
    activeView: "inventory",
    inventoryQuery: "",
    inventoryFilter: "all",
    documentFilter: "all",
    statsPreset: "last6Months",
    statsStartDate: "",
    statsEndDate: "",
    activeMoreTab: "products",
    composerOpen: false,
    activeComposerType: "purchase",
    composerPrefillProductId: null,
  },
};

const refs = {
  authScreen: document.querySelector("#auth-screen"),
  appShell: document.querySelector("#app-shell"),
  loginForm: document.querySelector("#login-form"),
  registerForm: document.querySelector("#register-form"),
  refreshButton: document.querySelector("#refresh-button"),
  logoutButton: document.querySelector("#logout-button"),
  inventorySearch: document.querySelector("#inventory-search"),
  statsRangeForm: document.querySelector("#stats-range-form"),
  statsStartDate: document.querySelector("#stats-start-date"),
  statsEndDate: document.querySelector("#stats-end-date"),
  composerTrigger: document.querySelector("#composer-trigger"),
  productForm: document.querySelector("#product-form"),
  supplierForm: document.querySelector("#supplier-form"),
  customerForm: document.querySelector("#customer-form"),
  purchaseForm: document.querySelector("#purchase-form"),
  saleForm: document.querySelector("#sale-form"),
  adjustmentForm: document.querySelector("#adjustment-form"),
  tenantCreateForm: document.querySelector("#tenant-create-form"),
  tenantJoinForm: document.querySelector("#tenant-join-form"),
};

async function boot() {
  bindEvents();
  refs.loginForm.elements.username.value = "admin";
  refs.loginForm.elements.tenant_slug.value = "demo";
  await restoreSession();
}

function bindEvents() {
  refs.loginForm.addEventListener("submit", handleLoginSubmit);
  refs.registerForm.addEventListener("submit", handleRegisterSubmit);
  refs.refreshButton.addEventListener("click", () => refreshApp("数据已同步。"));
  refs.logoutButton.addEventListener("click", handleLogout);
  refs.composerTrigger.addEventListener("click", () => openComposer("purchase"));
  refs.inventorySearch.addEventListener("input", (event) => {
    state.ui.inventoryQuery = event.currentTarget.value.trim();
    renderApp(state);
  });
  refs.statsRangeForm.addEventListener("submit", handleStatisticsRangeSubmit);

  refs.tenantCreateForm.addEventListener("submit", handleTenantCreateSubmit);
  refs.tenantJoinForm.addEventListener("submit", handleTenantJoinSubmit);
  refs.productForm.addEventListener("submit", handleProductSubmit);
  refs.supplierForm.addEventListener("submit", (event) => handlePartnerSubmit(event, "supplier"));
  refs.customerForm.addEventListener("submit", (event) => handlePartnerSubmit(event, "customer"));
  refs.purchaseForm.addEventListener("submit", (event) => handleDocumentSubmit(event, "purchase"));
  refs.saleForm.addEventListener("submit", (event) => handleDocumentSubmit(event, "sale"));
  refs.adjustmentForm.addEventListener("submit", handleAdjustmentSubmit);

  document.addEventListener("click", (event) => {
    const authTab = event.target.closest("[data-auth-tab]");
    if (authTab) {
      state.ui.activeAuthTab = authTab.dataset.authTab;
      renderApp(state);
      return;
    }

    const addButton = event.target.closest("[data-add-row]");
    if (addButton) {
      appendLineItem(addButton.dataset.addRow, state.products);
      return;
    }

    const removeButton = event.target.closest("[data-remove-row]");
    if (removeButton) {
      removeLineItem(removeButton);
      return;
    }

    const switchTenantButton = event.target.closest("[data-switch-tenant]");
    if (switchTenantButton) {
      void handleTenantSwitch(Number(switchTenantButton.dataset.switchTenant));
      return;
    }

    const prefillTenantButton = event.target.closest("[data-prefill-tenant-slug]");
    if (prefillTenantButton) {
      refs.tenantJoinForm.elements.tenant_slug.value = prefillTenantButton.dataset.prefillTenantSlug || "";
      refs.tenantJoinForm.elements.tenant_slug.focus();
      state.ui.activeView = "tenants";
      renderApp(state);
      window.scrollTo({ top: 0, behavior: "smooth" });
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
      return;
    }

    const viewButton = event.target.closest("[data-view-btn]");
    if (viewButton) {
      setActiveView(viewButton.dataset.viewBtn);
      return;
    }

    const statsPreset = event.target.closest("[data-stats-preset]");
    if (statsPreset) {
      void handleStatisticsPreset(statsPreset.dataset.statsPreset);
      return;
    }

    const stockFilter = event.target.closest("[data-stock-filter]");
    if (stockFilter) {
      state.ui.inventoryFilter = stockFilter.dataset.stockFilter;
      renderApp(state);
      return;
    }

    const documentFilter = event.target.closest("[data-document-filter]");
    if (documentFilter) {
      state.ui.documentFilter = documentFilter.dataset.documentFilter;
      renderApp(state);
      return;
    }

    const moreTab = event.target.closest("[data-more-tab]");
    if (moreTab) {
      state.ui.activeMoreTab = moreTab.dataset.moreTab;
      renderApp(state);
      return;
    }

    const composerTab = event.target.closest("[data-composer-tab]");
    if (composerTab) {
      state.ui.activeComposerType = composerTab.dataset.composerTab;
      renderApp(state);
      applyComposerPrefill();
      return;
    }

    const closeComposer = event.target.closest("[data-close-composer]");
    if (closeComposer) {
      closeComposerSheet();
      return;
    }

    const quickDoc = event.target.closest("[data-quick-doc]");
    if (quickDoc) {
      openComposer(quickDoc.dataset.quickDoc, Number(quickDoc.dataset.productId));
    }
  });

  document.addEventListener("change", (event) => {
    const productSelect = event.target.closest(".line-item select[name='product_id']");
    if (productSelect) {
      syncLineItemPrice(productSelect);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.ui.composerOpen) {
      closeComposerSheet();
    }
  });
}

async function restoreSession() {
  try {
    await loadAppState();
    showAppShell();
    renderApp(state);
    applyComposerPrefill();
    showToast("已恢复登录状态。");
  } catch (error) {
    if (error.status === 401) {
      showAuthScreen();
      return;
    }
    showAuthScreen();
    showToast(error.message || "会话恢复失败。");
  }
}

async function refreshApp(successMessage = "") {
  try {
    await loadAppState();
    showAppShell();
    renderApp(state);
    applyComposerPrefill();
    if (successMessage) {
      showToast(successMessage);
    }
  } catch (error) {
    if (error.status === 401) {
      await handleUnauthorized();
      return;
    }
    showToast(error.message || "加载数据失败。");
  }
}

async function loadAppState() {
  const [auth, tenantHub] = await Promise.all([api.getMe(), api.getTenantHub()]);
  state.auth = auth;
  state.tenantHub = tenantHub;
  ensureStatisticsRange();

  if (auth.current_tenant) {
    await loadWorkspaceData();
  } else {
    clearDomainState();
  }

  normalizeUiState();
}

async function loadWorkspaceData() {
  ensureStatisticsRange();
  const [summary, products, suppliers, customers, stock, movements, documents, statistics] = await Promise.all([
    api.getSummary(),
    api.getProducts(),
    api.getSuppliers(),
    api.getCustomers(),
    api.getStock(),
    api.getMovements(),
    api.getDocuments(),
    api.getStatistics({
      startDate: state.ui.statsStartDate,
      endDate: state.ui.statsEndDate,
    }),
  ]);

  state.summary = summary;
  state.statistics = statistics;
  state.products = products;
  state.suppliers = suppliers;
  state.customers = customers;
  state.stock = stock;
  state.movements = movements;
  state.documents = documents;
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;

  try {
    await api.login(formToObject(form));
    form.elements.password.value = "";
    showAppShell();
    await refreshApp("登录成功。");
  } catch (error) {
    showToast(error.message || "登录失败。");
  }
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;

  try {
    await api.register(formToObject(form));
    form.reset();
    showAppShell();
    await refreshApp("注册成功，请先创建或加入一个租户。");
  } catch (error) {
    showToast(error.message || "注册失败。");
  }
}

async function handleLogout() {
  try {
    await api.logout();
  } catch (error) {
    showToast(error.message || "退出登录失败。");
  } finally {
    clearAllState();
    closeComposerSheet();
    showAuthScreen();
  }
}

async function handleTenantCreateSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;

  try {
    await api.createTenant(formToObject(form));
    form.reset();
    state.ui.activeView = "inventory";
    await refreshApp("租户已创建，并已切换到新租户。");
  } catch (error) {
    showToast(error.message || "创建租户失败。");
  }
}

async function handleTenantJoinSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;

  try {
    await api.createJoinRequest(formToObject(form));
    form.elements.note.value = "";
    await refreshApp("已提交加入申请，请等待租户创建者审批。");
  } catch (error) {
    showToast(error.message || "提交加入申请失败。");
  }
}

async function handleTenantSwitch(tenantId) {
  try {
    await api.switchTenant({ tenant_id: tenantId });
    if (state.ui.activeView === "tenants") {
      state.ui.activeView = "inventory";
    }
    await refreshApp("已切换租户。");
  } catch (error) {
    showToast(error.message || "切换租户失败。");
  }
}

async function handleJoinRequestDecision(requestId, approved) {
  try {
    const result = approved ? await api.approveJoinRequest(requestId) : await api.rejectJoinRequest(requestId);
    await refreshApp(result.message || (approved ? "已同意申请。" : "已拒绝申请。"));
  } catch (error) {
    showToast(error.message || "处理申请失败。");
  }
}

async function handleProductSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;

  try {
    await api.createProduct(formToObject(form));
    form.reset();
    form.elements.unit.value = "件";
    form.elements.purchase_price.value = "0";
    form.elements.sale_price.value = "0";
    form.elements.safety_stock.value = "0";
    state.ui.activeView = "more";
    state.ui.activeMoreTab = "products";
    await refreshApp("商品已创建。");
  } catch (error) {
    showToast(error.message || "新增商品失败。");
  }
}

async function handlePartnerSubmit(event, partnerType) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToObject(form);
  const action = partnerType === "supplier" ? api.createSupplier : api.createCustomer;

  try {
    await action(payload);
    form.reset();
    state.ui.activeView = "more";
    state.ui.activeMoreTab = partnerType === "supplier" ? "suppliers" : "customers";
    await refreshApp(partnerType === "supplier" ? "供应商已创建。" : "客户已创建。");
  } catch (error) {
    showToast(error.message || "保存往来单位失败。");
  }
}

async function handleDocumentSubmit(event, docType) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    partner_id: Number(form.elements.partner_id.value),
    note: form.elements.note.value.trim(),
    items: collectLineItems(form),
  };

  try {
    if (docType === "purchase") {
      await api.createPurchase(payload);
    } else {
      await api.createSale(payload);
    }
    resetDocumentForm(form, docType);
    closeComposerSheet();
    state.ui.activeView = "documents";
    state.ui.documentFilter = docType;
    await refreshApp(docType === "purchase" ? "采购入库完成。" : "销售出库完成。");
  } catch (error) {
    showToast(error.message || "提交单据失败。");
  }
}

async function handleAdjustmentSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    product_id: Number(form.elements.product_id.value),
    quantity_delta: Number(form.elements.quantity_delta.value),
    reason: form.elements.reason.value.trim(),
    note: form.elements.note.value.trim(),
  };

  try {
    await api.createAdjustment(payload);
    form.reset();
    closeComposerSheet();
    state.ui.activeView = "documents";
    state.ui.documentFilter = "adjustment";
    await refreshApp("库存调整完成。");
  } catch (error) {
    showToast(error.message || "库存调整失败。");
  }
}

async function handleStatisticsPreset(preset) {
  if (!state.auth?.current_tenant) {
    setActiveView("tenants");
    return;
  }

  const range = buildStatisticsRange(preset);
  state.ui.statsPreset = preset;
  state.ui.statsStartDate = range.startDate;
  state.ui.statsEndDate = range.endDate;
  state.ui.activeView = "stats";
  renderApp(state);
  await refreshStatistics("统计区间已更新。");
}

async function handleStatisticsRangeSubmit(event) {
  event.preventDefault();
  const startDate = refs.statsStartDate.value;
  const endDate = refs.statsEndDate.value;

  if (!startDate || !endDate) {
    showToast("请选择开始和结束日期。");
    return;
  }
  if (startDate > endDate) {
    showToast("开始日期不能晚于结束日期。");
    return;
  }

  state.ui.statsStartDate = startDate;
  state.ui.statsEndDate = endDate;
  state.ui.statsPreset = detectStatisticsPreset(startDate, endDate);
  state.ui.activeView = "stats";
  renderApp(state);
  await refreshStatistics("统计区间已更新。");
}

function setActiveView(viewName) {
  if (viewName !== "tenants" && !state.auth?.current_tenant) {
    state.ui.activeView = "tenants";
    renderApp(state);
    showToast("请先创建租户或切换到一个已加入的租户。");
    return;
  }
  state.ui.activeView = viewName;
  renderApp(state);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openComposer(type = "purchase", productId = null) {
  if (!state.auth?.current_tenant) {
    showToast("请先切换到一个租户后再新建单据。");
    return;
  }
  state.ui.composerOpen = true;
  state.ui.activeComposerType = type;
  state.ui.composerPrefillProductId = productId || null;
  renderApp(state);
  applyComposerPrefill();
}

function closeComposerSheet(resetPrefill = true) {
  state.ui.composerOpen = false;
  if (resetPrefill) {
    state.ui.composerPrefillProductId = null;
  }
  renderApp(state);
}

async function handleUnauthorized() {
  clearAllState();
  closeComposerSheet();
  showAuthScreen();
  showToast("登录已失效，请重新登录。");
}

function showAppShell() {
  refs.authScreen.hidden = true;
  refs.appShell.hidden = false;
}

function showAuthScreen() {
  refs.appShell.hidden = true;
  refs.authScreen.hidden = false;
}

function clearDomainState() {
  state.summary = null;
  state.statistics = null;
  state.products = [];
  state.suppliers = [];
  state.customers = [];
  state.stock = [];
  state.movements = [];
  state.documents = [];
}

function clearAllState() {
  state.auth = null;
  state.tenantHub = null;
  clearDomainState();
}

function normalizeUiState() {
  ensureStatisticsRange();
  if (!state.auth?.current_tenant) {
    state.ui.activeView = "tenants";
    state.ui.composerOpen = false;
    state.ui.composerPrefillProductId = null;
  }
}

async function refreshStatistics(successMessage = "") {
  try {
    state.statistics = await api.getStatistics({
      startDate: state.ui.statsStartDate,
      endDate: state.ui.statsEndDate,
    });
    renderApp(state);
    if (successMessage) {
      showToast(successMessage);
    }
  } catch (error) {
    if (error.status === 401) {
      await handleUnauthorized();
      return;
    }
    showToast(error.message || "统计加载失败。");
  }
}

function applyComposerPrefill() {
  if (!state.ui.composerOpen) {
    return;
  }
  const productId = state.ui.composerPrefillProductId;
  if (!productId) {
    return;
  }

  if (state.ui.activeComposerType === "adjustment") {
    refs.adjustmentForm.elements.product_id.value = String(productId);
    return;
  }

  const form = state.ui.activeComposerType === "purchase" ? refs.purchaseForm : refs.saleForm;
  const firstRow = form.querySelector(".line-item");
  const select = firstRow?.querySelector("select[name='product_id']");
  if (!select) {
    return;
  }
  select.value = String(productId);
  syncLineItemPrice(select);
}

function formToObject(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

function collectLineItems(form) {
  const rows = Array.from(form.querySelectorAll(".line-item"));
  return rows.map((row) => ({
    product_id: Number(row.querySelector("select[name='product_id']").value),
    quantity: Number(row.querySelector("input[name='quantity']").value),
    unit_price: Number(row.querySelector("input[name='unit_price']").value),
  }));
}

function resetDocumentForm(form, docType) {
  form.reset();
  const itemsContainer = form.querySelector(".line-items");
  if (itemsContainer) {
    itemsContainer.innerHTML = "";
    appendLineItem(docType, state.products);
  }
  state.ui.composerPrefillProductId = null;
}

function syncLineItemPrice(select) {
  const row = select.closest(".line-item");
  if (!row) {
    return;
  }
  const product = state.products.find((item) => String(item.id) === select.value);
  if (!product) {
    return;
  }
  const priceInput = row.querySelector("input[name='unit_price']");
  const kind = row.dataset.kind;
  const suggestedPrice = kind === "purchase" ? Number(product.purchase_price || 0) : Number(product.sale_price || 0);
  priceInput.value = suggestedPrice.toFixed(2);
}

function ensureStatisticsRange() {
  if (state.ui.statsStartDate && state.ui.statsEndDate) {
    return;
  }
  const range = buildStatisticsRange(state.ui.statsPreset || "last6Months");
  state.ui.statsPreset = state.ui.statsPreset || "last6Months";
  state.ui.statsStartDate = range.startDate;
  state.ui.statsEndDate = range.endDate;
}

function buildStatisticsRange(preset) {
  const today = new Date();
  let startDate = new Date(today.getFullYear(), today.getMonth(), 1);

  if (preset === "last3Months") {
    startDate = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  } else if (preset === "last6Months") {
    startDate = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  } else if (preset === "thisYear") {
    startDate = new Date(today.getFullYear(), 0, 1);
  }

  return {
    startDate: toDateInputValue(startDate),
    endDate: toDateInputValue(today),
  };
}

function detectStatisticsPreset(startDate, endDate) {
  const presets = ["thisMonth", "last3Months", "last6Months", "thisYear"];
  for (const preset of presets) {
    const range = buildStatisticsRange(preset);
    if (range.startDate === startDate && range.endDate === endDate) {
      return preset;
    }
  }
  return "custom";
}

function toDateInputValue(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

boot();
