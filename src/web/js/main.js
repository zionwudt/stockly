import { api } from "./api.js";
import { appendLineItem, removeLineItem, renderApp, showToast } from "./ui.js";

const state = {
  auth: null,
  summary: null,
  products: [],
  suppliers: [],
  customers: [],
  stock: [],
  movements: [],
  documents: [],
  ui: {
    activeView: "inventory",
    inventoryQuery: "",
    inventoryFilter: "all",
    documentFilter: "all",
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
  refreshButton: document.querySelector("#refresh-button"),
  logoutButton: document.querySelector("#logout-button"),
  inventorySearch: document.querySelector("#inventory-search"),
  composerTrigger: document.querySelector("#composer-trigger"),
  productForm: document.querySelector("#product-form"),
  supplierForm: document.querySelector("#supplier-form"),
  customerForm: document.querySelector("#customer-form"),
  purchaseForm: document.querySelector("#purchase-form"),
  saleForm: document.querySelector("#sale-form"),
  adjustmentForm: document.querySelector("#adjustment-form"),
};

async function boot() {
  bindEvents();
  refs.loginForm.elements.tenant_slug.value = "demo";
  refs.loginForm.elements.username.value = "admin";
  await restoreSession();
}

function bindEvents() {
  refs.loginForm.addEventListener("submit", handleLoginSubmit);
  refs.refreshButton.addEventListener("click", () => refreshData("数据已同步。"));
  refs.logoutButton.addEventListener("click", handleLogout);
  refs.composerTrigger.addEventListener("click", () => openComposer("purchase"));
  refs.inventorySearch.addEventListener("input", (event) => {
    state.ui.inventoryQuery = event.currentTarget.value.trim();
    renderApp(state);
  });

  refs.productForm.addEventListener("submit", handleProductSubmit);
  refs.supplierForm.addEventListener("submit", (event) => handlePartnerSubmit(event, "supplier"));
  refs.customerForm.addEventListener("submit", (event) => handlePartnerSubmit(event, "customer"));
  refs.purchaseForm.addEventListener("submit", (event) => handleDocumentSubmit(event, "purchase"));
  refs.saleForm.addEventListener("submit", (event) => handleDocumentSubmit(event, "sale"));
  refs.adjustmentForm.addEventListener("submit", handleAdjustmentSubmit);

  document.addEventListener("click", (event) => {
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

    const viewButton = event.target.closest("[data-view-btn]");
    if (viewButton) {
      setActiveView(viewButton.dataset.viewBtn);
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
      return;
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

async function refreshData(successMessage = "") {
  try {
    const [summary, products, suppliers, customers, stock, movements, documents] = await Promise.all([
      api.getSummary(),
      api.getProducts(),
      api.getSuppliers(),
      api.getCustomers(),
      api.getStock(),
      api.getMovements(),
      api.getDocuments(),
    ]);

    state.summary = summary;
    state.products = products;
    state.suppliers = suppliers;
    state.customers = customers;
    state.stock = stock;
    state.movements = movements;
    state.documents = documents;
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

async function restoreSession() {
  try {
    const auth = await api.getMe();
    state.auth = auth;
    showAppShell();
    await refreshData("已恢复登录状态。");
  } catch (error) {
    if (error.status === 401) {
      showAuthScreen();
      return;
    }
    showAuthScreen();
    showToast(error.message || "会话恢复失败。");
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToObject(form);

  try {
    state.auth = await api.login(payload);
    clearDomainState();
    form.elements.password.value = "";
    showAppShell();
    await refreshData("登录成功。");
  } catch (error) {
    showToast(error.message || "登录失败。");
  }
}

async function handleLogout() {
  try {
    await api.logout();
  } catch (error) {
    showToast(error.message || "退出登录失败。");
  } finally {
    state.auth = null;
    clearDomainState();
    closeComposerSheet();
    showAuthScreen();
  }
}

async function handleProductSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToObject(form);

  try {
    await api.createProduct(payload);
    form.reset();
    form.elements.unit.value = "件";
    form.elements.purchase_price.value = "0";
    form.elements.sale_price.value = "0";
    form.elements.safety_stock.value = "0";
    state.ui.activeView = "more";
    state.ui.activeMoreTab = "products";
    await refreshData("商品已创建。");
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
    await refreshData(partnerType === "supplier" ? "供应商已创建。" : "客户已创建。");
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
    await refreshData(docType === "purchase" ? "采购入库完成。" : "销售出库完成。");
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
    await refreshData("库存调整完成。");
  } catch (error) {
    showToast(error.message || "库存调整失败。");
  }
}

function setActiveView(viewName) {
  state.ui.activeView = viewName;
  renderApp(state);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openComposer(type = "purchase", productId = null) {
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
  state.auth = null;
  clearDomainState();
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
  state.products = [];
  state.suppliers = [];
  state.customers = [];
  state.stock = [];
  state.movements = [];
  state.documents = [];
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

boot();
