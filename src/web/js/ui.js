const refs = {
  tenantBadge: document.querySelector("#tenant-badge"),
  userBadge: document.querySelector("#user-badge"),
  statusSummary: document.querySelector("#status-summary"),
  metricsGrid: document.querySelector("#metrics-grid"),
  inventorySummary: document.querySelector("#inventory-summary"),
  documentSummary: document.querySelector("#document-summary"),
  alertList: document.querySelector("#alert-list"),
  stockList: document.querySelector("#stock-list"),
  movementList: document.querySelector("#movement-list"),
  documentList: document.querySelector("#document-list"),
  productList: document.querySelector("#product-list"),
  supplierList: document.querySelector("#supplier-list"),
  customerList: document.querySelector("#customer-list"),
  purchasePartnerSelect: document.querySelector("#purchase-partner-select"),
  salePartnerSelect: document.querySelector("#sale-partner-select"),
  adjustmentProductSelect: document.querySelector("#adjustment-product-select"),
  purchaseItems: document.querySelector("#purchase-items"),
  saleItems: document.querySelector("#sale-items"),
  inventorySearch: document.querySelector("#inventory-search"),
  views: Array.from(document.querySelectorAll(".app-view")),
  viewButtons: Array.from(document.querySelectorAll("[data-view-btn]")),
  stockFilterButtons: Array.from(document.querySelectorAll("[data-stock-filter]")),
  documentFilterButtons: Array.from(document.querySelectorAll("[data-document-filter]")),
  moreTabButtons: Array.from(document.querySelectorAll("[data-more-tab]")),
  morePanels: Array.from(document.querySelectorAll("[data-more-panel]")),
  composerOverlay: document.querySelector("#composer-overlay"),
  composerTabButtons: Array.from(document.querySelectorAll("[data-composer-tab]")),
  composerPanels: Array.from(document.querySelectorAll("[data-composer-panel]")),
  toast: document.querySelector("#toast"),
};

const metricLabels = [
  ["stock_value", "库存货值", "按采购价估算"],
  ["product_count", "商品数", "当前建档 SKU"],
  ["alert_count", "预警商品", "建议优先补货"],
  ["document_total", "最近单据", "采购与销售累计"],
];

export function renderApp(state) {
  renderIdentity(state.auth || null);
  renderStatusSummary(state.summary?.metrics || {});
  renderMetrics(state.summary?.metrics || {});
  renderAlerts(state.summary?.alerts || []);
  renderStock(state.stock || [], state.ui?.inventoryQuery || "", state.ui?.inventoryFilter || "all");
  renderMovements(state.movements || []);
  renderDocuments(state.documents || [], state.ui?.documentFilter || "all");
  renderMiniList(refs.productList, state.products || [], (item) => renderProductRow(item, state.stock || []));
  renderMiniList(refs.supplierList, state.suppliers || [], renderPartnerRow);
  renderMiniList(refs.customerList, state.customers || [], renderPartnerRow);
  renderPartnerSelect(refs.purchasePartnerSelect, state.suppliers || [], "请选择供应商");
  renderPartnerSelect(refs.salePartnerSelect, state.customers || [], "请选择客户");
  renderProductSelect(refs.adjustmentProductSelect, state.products || [], "请选择商品");
  ensureLineItems("purchase", state.products || []);
  ensureLineItems("sale", state.products || []);
  applyUiState(state.ui || {});
}

export function appendLineItem(kind, products) {
  const container = kind === "purchase" ? refs.purchaseItems : refs.saleItems;
  container.append(buildLineItem(products, kind));
}

export function removeLineItem(button) {
  const container = button.closest(".line-items");
  const row = button.closest(".line-item");
  if (!container || !row) {
    return;
  }
  if (container.children.length === 1) {
    showToast("至少保留一条商品明细。");
    return;
  }
  row.remove();
}

export function showToast(message, duration = 2200) {
  refs.toast.textContent = message;
  refs.toast.classList.add("visible");
  window.clearTimeout(showToast.timerId);
  showToast.timerId = window.setTimeout(() => {
    refs.toast.classList.remove("visible");
  }, duration);
}

function renderStatusSummary(metrics) {
  refs.statusSummary.textContent =
    `当前库存货值 ${formatShortCurrency(metrics.stock_value ?? 0)}，共有 ${metrics.product_count ?? 0} 个 SKU，${metrics.alert_count ?? 0} 个商品需要关注。`;
}

function renderIdentity(auth) {
  if (!auth) {
    refs.tenantBadge.textContent = "进销存作业台";
    refs.userBadge.textContent = "未登录";
    return;
  }
  refs.tenantBadge.textContent = `${auth.tenant.name} · ${auth.tenant.slug}`;
  refs.userBadge.textContent = `${auth.user.display_name} · ${auth.user.username}`;
}

function renderMetrics(metrics) {
  const metricData = {
    ...metrics,
    document_total: Number(metrics.purchase_count || 0) + Number(metrics.sale_count || 0),
  };
  refs.metricsGrid.innerHTML = metricLabels
    .map(([key, label, note]) => {
      const rawValue = metricData[key] ?? 0;
      const value = key === "stock_value" ? formatShortCurrency(rawValue) : rawValue;
      return `
        <article class="metric-card metric-card--${key}">
          <p class="metric-label">${label}</p>
          <div class="metric-value">${value}</div>
          <p class="metric-note">${note}</p>
        </article>
      `;
    })
    .join("");
}

function renderAlerts(alerts) {
  if (!alerts.length) {
    refs.alertList.innerHTML = `
      <article class="dense-row">
        <div class="row-head">
          <div class="row-main">
            <div class="row-title">库存状态稳定</div>
            <div class="row-subtitle">当前没有低于安全库存的商品，可以继续关注最近流水和新开单据。</div>
          </div>
          <span class="status-chip safe">正常</span>
        </div>
      </article>
    `;
    return;
  }

  refs.alertList.innerHTML = alerts
    .slice(0, 3)
    .map(
      (item) => `
        <article class="dense-row alert-row">
          <div class="row-head">
            <div class="row-main">
              <div class="row-title">${escapeHtml(item.name)}</div>
              <div class="row-subtitle">${escapeHtml(item.sku)} · 当前 ${formatQuantity(item.on_hand)} / 安全 ${formatQuantity(item.safety_stock)}</div>
            </div>
            <span class="status-chip warn">补货</span>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderStock(stock, query, filter) {
  refs.inventorySearch.value = query;
  const filtered = filterStock(stock, query, filter);
  const alertCount = filtered.filter((item) => item.in_alert).length;
  refs.inventorySummary.textContent = `共 ${filtered.length} 条，预警 ${alertCount} 条`;

  if (!filtered.length) {
    refs.stockList.innerHTML = `<div class="empty-state">没有找到符合当前筛选条件的库存记录。</div>`;
    return;
  }

  refs.stockList.innerHTML = filtered
    .map(
      (item) => `
        <article class="dense-row">
          <div class="row-head">
            <div class="row-main">
              <div class="row-title">${escapeHtml(item.name)}</div>
              <div class="row-subtitle">${escapeHtml(item.sku)} · ${escapeHtml(item.category || "未分类")} · ${escapeHtml(item.unit)}</div>
            </div>
            <div class="row-side">
              <span class="status-chip ${item.in_alert ? "warn" : "safe"}">${item.in_alert ? "预警" : "正常"}</span>
              <strong class="row-figure">${formatQuantity(item.on_hand)}</strong>
            </div>
          </div>
          <div class="row-stats">
            <span class="stat-pill"><span>安全</span>${formatQuantity(item.safety_stock)}</span>
            <span class="stat-pill"><span>金额</span>${formatCurrency(item.inventory_value)}</span>
          </div>
          <div class="row-actions">
            <button type="button" class="quick-button" data-quick-doc="purchase" data-product-id="${item.id}">入库</button>
            <button type="button" class="quick-button" data-quick-doc="sale" data-product-id="${item.id}">出库</button>
            <button type="button" class="quick-button" data-quick-doc="adjustment" data-product-id="${item.id}">调整</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderMovements(items) {
  if (!items.length) {
    refs.movementList.innerHTML = `<div class="empty-state">暂无库存流水，完成一笔采购、销售或调整后会显示在这里。</div>`;
    return;
  }

  refs.movementList.innerHTML = items
    .map(
      (item) => `
        <article class="dense-row">
          <div class="row-head">
            <div class="row-main">
              <div class="row-title">${escapeHtml(item.product_name)}</div>
              <div class="row-subtitle">${escapeHtml(item.sku)} · ${formatDateTime(item.created_at)} · ${escapeHtml(item.doc_no || "-")}</div>
            </div>
            <div class="row-side">
              <span class="type-chip ${escapeHtml(item.movement_type)}">${typeLabel(item.movement_type)}</span>
              <strong class="row-figure">${signedQuantity(item.quantity_delta)}</strong>
            </div>
          </div>
          <div class="row-note">${escapeHtml(shortText(item.note || "无备注", 20))}</div>
        </article>
      `,
    )
    .join("");
}

function renderDocuments(items, filter) {
  const filtered = filterDocuments(items, filter);
  refs.documentSummary.textContent = `最近 ${filtered.length} 条`;

  if (!filtered.length) {
    refs.documentList.innerHTML = `<div class="empty-state">当前筛选下没有单据。</div>`;
    return;
  }

  refs.documentList.innerHTML = filtered
    .map(
      (item) => `
        <article class="dense-row">
          <div class="row-head">
            <div class="row-main">
              <div class="row-title">${escapeHtml(item.doc_no)}</div>
              <div class="row-subtitle">${escapeHtml(item.partner_name)} · ${formatDateTime(item.created_at)}</div>
            </div>
            <div class="row-side">
              <span class="type-chip ${escapeHtml(item.doc_type)}">${typeLabel(item.doc_type)}</span>
              <strong class="row-figure">${formatCurrency(item.total_amount || 0)}</strong>
            </div>
          </div>
          <div class="row-stats">
            <span class="stat-pill"><span>明细</span>${item.item_count}</span>
            <span class="stat-pill"><span>备注</span>${escapeHtml(shortText(item.note || "无", 16))}</span>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderMiniList(container, items, itemRenderer) {
  if (!items.length) {
    container.innerHTML = `<div class="empty-state">还没有数据，先新增一条试试。</div>`;
    return;
  }
  container.innerHTML = items.map(itemRenderer).join("");
}

function renderProductRow(item, stock) {
  const stockRecord = stock.find((entry) => Number(entry.id) === Number(item.id));
  const currentStock = stockRecord ? stockRecord.on_hand : 0;
  const inAlert = Number(currentStock) <= Number(item.safety_stock);
  return `
    <article class="dense-row">
      <div class="row-head">
        <div class="row-main">
          <div class="row-title">${escapeHtml(item.name)}</div>
          <div class="row-subtitle">${escapeHtml(item.sku)} · ${escapeHtml(item.category || "未分类")} · ${escapeHtml(item.unit || "件")}</div>
        </div>
        <span class="status-chip ${inAlert ? "warn" : "safe"}">${inAlert ? "待补" : "正常"}</span>
      </div>
      <div class="row-stats">
        <span class="stat-pill"><span>库存</span>${formatQuantity(currentStock)}</span>
        <span class="stat-pill"><span>售价</span>${formatCurrency(item.sale_price || 0)}</span>
      </div>
    </article>
  `;
}

function renderPartnerRow(item) {
  return `
    <article class="dense-row">
      <div class="row-title">${escapeHtml(item.name)}</div>
      <div class="row-subtitle">${escapeHtml(item.contact || "未填写联系人")} · ${escapeHtml(item.phone || "未填写电话")}</div>
      <div class="row-note">${escapeHtml(item.note || "暂未补充备注")}</div>
    </article>
  `;
}

function renderPartnerSelect(select, items, placeholder) {
  const previousValue = select.value;
  select.innerHTML = [
    `<option value="">${placeholder}</option>`,
    ...items.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`),
  ].join("");
  if (items.some((item) => String(item.id) === previousValue)) {
    select.value = previousValue;
  }
}

function renderProductSelect(select, items, placeholder) {
  const previousValue = select.value;
  select.innerHTML = [
    `<option value="">${placeholder}</option>`,
    ...items.map(
      (item) => `<option value="${item.id}">${escapeHtml(item.name)} (${escapeHtml(item.sku)})</option>`,
    ),
  ].join("");
  if (items.some((item) => String(item.id) === previousValue)) {
    select.value = previousValue;
  }
}

function ensureLineItems(kind, products) {
  const container = kind === "purchase" ? refs.purchaseItems : refs.saleItems;
  const existing = Array.from(container.querySelectorAll(".line-item"));
  if (!existing.length) {
    container.append(buildLineItem(products, kind));
    return;
  }

  existing.forEach((row) => {
    const select = row.querySelector("select[name='product_id']");
    const previousValue = select.value;
    select.innerHTML = productOptions(products, "请选择商品");
    if (products.some((item) => String(item.id) === previousValue)) {
      select.value = previousValue;
    }
  });
}

function buildLineItem(products, kind) {
  const wrapper = document.createElement("div");
  wrapper.className = "line-item";
  wrapper.dataset.kind = kind;
  wrapper.innerHTML = `
    <label>
      <span>商品</span>
      <select name="product_id" required>${productOptions(products, "请选择商品")}</select>
    </label>
    <label>
      <span>数量</span>
      <input name="quantity" type="number" min="0.01" step="0.01" value="1" required />
    </label>
    <label>
      <span>单价</span>
      <input name="unit_price" type="number" min="0" step="0.01" value="0" required />
    </label>
    <button type="button" class="ghost-button small" data-remove-row>删除这一行</button>
  `;
  return wrapper;
}

function productOptions(products, placeholder) {
  return [
    `<option value="">${placeholder}</option>`,
    ...products.map(
      (item) => `<option value="${item.id}">${escapeHtml(item.name)} (${escapeHtml(item.sku)})</option>`,
    ),
  ].join("");
}

function applyUiState(ui) {
  refs.views.forEach((view) => {
    const isActive = view.dataset.view === ui.activeView;
    view.hidden = !isActive;
  });

  refs.viewButtons.forEach((button) => {
    const isActive = button.dataset.viewBtn === ui.activeView;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });

  refs.stockFilterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.stockFilter === ui.inventoryFilter);
  });

  refs.documentFilterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.documentFilter === ui.documentFilter);
  });

  refs.moreTabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.moreTab === ui.activeMoreTab);
  });

  refs.morePanels.forEach((panel) => {
    panel.hidden = panel.dataset.morePanel !== ui.activeMoreTab;
  });

  refs.composerOverlay.hidden = !ui.composerOpen;
  document.body.style.overflow = ui.composerOpen ? "hidden" : "";

  refs.composerTabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.composerTab === ui.activeComposerType);
  });

  refs.composerPanels.forEach((panel) => {
    panel.hidden = panel.dataset.composerPanel !== ui.activeComposerType;
  });
}

function filterStock(items, query, filter) {
  const normalized = query.trim().toLowerCase();
  return items.filter((item) => {
    const matchesQuery =
      !normalized ||
      [item.name, item.sku, item.category].some((value) => String(value || "").toLowerCase().includes(normalized));

    if (!matchesQuery) {
      return false;
    }
    if (filter === "warn") {
      return Boolean(item.in_alert);
    }
    if (filter === "instock") {
      return Number(item.on_hand || 0) > 0;
    }
    return true;
  });
}

function filterDocuments(items, filter) {
  if (filter === "all") {
    return items;
  }
  return items.filter((item) => item.doc_type === filter);
}

function formatCurrency(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function formatShortCurrency(value) {
  const amount = Number(value || 0);
  if (amount >= 10000) {
    return `¥${(amount / 10000).toFixed(1)}万`;
  }
  return `¥${amount.toFixed(0)}`;
}

function formatQuantity(value) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, "");
}

function signedQuantity(value) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${formatQuantity(number)}`;
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

function typeLabel(type) {
  if (type === "purchase") {
    return "采购";
  }
  if (type === "sale") {
    return "销售";
  }
  if (type === "adjustment") {
    return "调整";
  }
  return type;
}

function shortText(text, maxLength) {
  const normalized = String(text || "");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
