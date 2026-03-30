const refs = {
  pageHeader: document.querySelector("#page-header"),
  pageHeaderKicker: document.querySelector("#page-header-kicker"),
  pageHeaderTitle: document.querySelector("#page-header-title"),
  pageHeaderNote: document.querySelector("#page-header-note"),
  moreHome: document.querySelector("[data-more-home]"),
  moreDetailHead: document.querySelector("[data-more-detail-head]"),
  moreDetailKicker: document.querySelector("#more-detail-kicker"),
  moreDetailTitle: document.querySelector("#more-detail-title"),
  moreDetailNote: document.querySelector("#more-detail-note"),
  moreBackButton: document.querySelector("[data-more-back]"),
  tenantBadge: document.querySelector("#tenant-badge"),
  userBadge: document.querySelector("#user-badge"),
  statusSummary: document.querySelector("#status-summary"),
  metricsSection: document.querySelector("#metrics-section"),
  metricsGrid: document.querySelector("#metrics-grid"),
  inventorySummary: document.querySelector("#inventory-summary"),
  documentSummary: document.querySelector("#document-summary"),
  statsRangeSummary: document.querySelector("#stats-range-summary"),
  statsOverviewGrid: document.querySelector("#stats-overview-grid"),
  statsTrendChart: document.querySelector("#stats-trend-chart"),
  statsTrendCaption: document.querySelector("#stats-trend-caption"),
  statsMixChart: document.querySelector("#stats-mix-chart"),
  statsTopProducts: document.querySelector("#stats-top-products"),
  statsTopCaption: document.querySelector("#stats-top-caption"),
  tenantMoreSummary: document.querySelector("#tenant-more-summary"),
  tenantRequestSummary: document.querySelector("#tenant-request-summary"),
  tenantApprovalSummary: document.querySelector("#tenant-approval-summary"),
  tenantAccessList: document.querySelector("#tenant-access-list"),
  myJoinRequestList: document.querySelector("#my-join-request-list"),
  tenantApprovalList: document.querySelector("#tenant-approval-list"),
  statsStartInput: document.querySelector("#stats-start-date"),
  statsEndInput: document.querySelector("#stats-end-date"),
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
  composerTrigger: document.querySelector("#composer-trigger"),
  views: Array.from(document.querySelectorAll(".app-view")),
  viewButtons: Array.from(document.querySelectorAll("[data-view-btn]")),
  stockFilterButtons: Array.from(document.querySelectorAll("[data-stock-filter]")),
  documentFilterButtons: Array.from(document.querySelectorAll("[data-document-filter]")),
  statsPresetButtons: Array.from(document.querySelectorAll("[data-stats-preset]")),
  moreTabButtons: Array.from(document.querySelectorAll("[data-more-tab]")),
  morePanels: Array.from(document.querySelectorAll("[data-more-panel]")),
  tenantActionTabButtons: Array.from(document.querySelectorAll("[data-tenant-tab]")),
  tenantActionPanels: Array.from(document.querySelectorAll("[data-tenant-panel]")),
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
  renderPageHeader(state.ui || {}, state.auth || null);
  renderMoreDetail(state.ui || {}, state.auth || null);
  renderIdentity(state.auth || null);
  renderStatusSummary(state.auth || null, state.summary?.metrics || {});
  renderMetrics(state.summary?.metrics || {}, Boolean(state.auth?.current_tenant));
  renderAlerts(state.summary?.alerts || []);
  renderStock(state.stock || [], state.ui?.inventoryQuery || "", state.ui?.inventoryFilter || "all");
  renderMovements(state.movements || []);
  renderDocuments(state.documents || [], state.ui?.documentFilter || "all");
  renderStatistics(state.statistics || null, state.ui || {}, Boolean(state.auth?.current_tenant));
  renderTenantHub(state.auth || null, state.tenantHub || null);
  renderMiniList(refs.productList, state.products || [], (item) => renderProductRow(item, state.stock || []));
  renderMiniList(refs.supplierList, state.suppliers || [], (item) => renderPartnerRow(item, "supplier"));
  renderMiniList(refs.customerList, state.customers || [], (item) => renderPartnerRow(item, "customer"));
  renderPartnerSelect(refs.purchasePartnerSelect, state.suppliers || [], "请选择供应商");
  renderPartnerSelect(refs.salePartnerSelect, state.customers || [], "请选择客户");
  renderProductSelect(refs.adjustmentProductSelect, state.products || [], "请选择商品");
  ensureLineItems("purchase", state.products || []);
  ensureLineItems("sale", state.products || []);
  applyUiState(state.ui || {}, state.auth || null);
}

function renderPageHeader(ui, auth) {
  if (!refs.pageHeaderTitle || !refs.pageHeaderNote || !refs.pageHeaderKicker) {
    return;
  }

  const activeView = ui.activeView || "inventory";
  const headerMap = {
    inventory: {
      kicker: "工作台",
      title: "库存",
      note: auth?.current_tenant ? "查看库存状态、预警商品和最近流水。" : "登录后可在这里查看库存与出入库动态。",
    },
    documents: {
      kicker: "业务中心",
      title: "单据",
      note: auth?.current_tenant ? "集中查看采购、销售和调整记录。" : "选择租户后可查看业务单据。",
    },
    stats: {
      kicker: "分析视图",
      title: "统计",
      note: auth?.current_tenant ? "按时间区间查看经营趋势与关键指标。" : "选择租户后可查看经营趋势。",
    },
    more: {
      kicker: "配置和管理",
      title: "更多",
      note: "在这里选择具体配置模块，再进入二级页面处理。",
    },
  };

  let header = headerMap[activeView] || headerMap.inventory;
  if (activeView === "more" && ui.activeMoreTab && ui.activeMoreTab !== "menu") {
    const moreHeaders = {
      tenants: {
        kicker: "空间管理",
        title: "租户",
        note: "处理工作租户、创建加入申请和审批协作成员。",
      },
      products: {
        kicker: "基础资料",
        title: "商品",
        note: "维护商品档案、售价和库存基础信息。",
      },
      suppliers: {
        kicker: "采购资料",
        title: "供应商",
        note: "维护采购合作方及其联系人信息。",
      },
      customers: {
        kicker: "销售资料",
        title: "客户",
        note: "维护客户档案和销售往来信息。",
      },
    };
    header = moreHeaders[ui.activeMoreTab] || header;
  }
  refs.pageHeaderKicker.textContent = header.kicker;
  refs.pageHeaderTitle.textContent = header.title;
  refs.pageHeaderNote.textContent = header.note;
}

function renderMoreDetail(ui, auth) {
  if (!refs.moreDetailHead || !refs.moreDetailTitle || !refs.moreDetailNote || !refs.moreDetailKicker) {
    return;
  }

  const activeTab = ui.activeMoreTab || "menu";
  if (activeTab === "menu") {
    refs.moreDetailHead.hidden = true;
    return;
  }

  const detailMap = {
    tenants: {
      kicker: "空间管理",
      title: "租户",
      note: "管理当前工作空间、加入申请以及待处理审批。",
    },
    products: {
      kicker: "基础资料",
      title: "商品",
      note: "在这里新增商品，并查看已有商品档案。",
    },
    suppliers: {
      kicker: "采购资料",
      title: "供应商",
      note: "集中维护采购合作方联系人与备注信息。",
    },
    customers: {
      kicker: "销售资料",
      title: "客户",
      note: "维护客户档案，便于销售开单时快速选择。",
    },
  };

  const detail = detailMap[activeTab] || detailMap.tenants;
  refs.moreDetailHead.hidden = false;
  refs.moreDetailKicker.textContent = detail.kicker;
  refs.moreDetailTitle.textContent = detail.title;
  refs.moreDetailNote.textContent = detail.note;
  if (refs.moreBackButton) {
    refs.moreBackButton.hidden = !auth?.current_tenant;
  }
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

function renderStatusSummary(auth, metrics) {
  if (!auth) {
    refs.statusSummary.textContent = "登录后可创建租户、申请加入现有租户，并进入对应工作区。";
    return;
  }

  if (!auth.current_tenant) {
    refs.statusSummary.textContent =
      `当前账号 ${auth.user.display_name} 还没有选中租户，请先在租户中心创建租户或申请加入一个已有租户。`;
    return;
  }

  refs.statusSummary.textContent =
    `当前租户库存货值 ${formatShortCurrency(metrics.stock_value ?? 0)}，共有 ${metrics.product_count ?? 0} 个 SKU，${metrics.alert_count ?? 0} 个商品需要关注。`;
}

function renderIdentity(auth) {
  if (!auth) {
    refs.tenantBadge.textContent = "未选择租户";
    refs.userBadge.textContent = "未登录";
    return;
  }

  if (!auth.current_tenant) {
    refs.tenantBadge.textContent = "未选择租户";
  } else {
    refs.tenantBadge.textContent = `${auth.current_tenant.name} · ${auth.current_tenant.slug}`;
  }
  refs.userBadge.textContent = `${auth.user.display_name} · ${auth.user.username}`;
}

function renderMetrics(metrics, hasCurrentTenant) {
  refs.metricsSection.hidden = !hasCurrentTenant;
  if (!hasCurrentTenant) {
    refs.metricsGrid.innerHTML = "";
    return;
  }

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

function renderStatistics(statistics, ui, hasCurrentTenant) {
  refs.statsStartInput.value = ui.statsStartDate || "";
  refs.statsEndInput.value = ui.statsEndDate || "";

  if (!hasCurrentTenant) {
    refs.statsRangeSummary.textContent = "选择租户后可查看";
    refs.statsOverviewGrid.innerHTML = "";
    refs.statsTrendCaption.textContent = "按月汇总";
    refs.statsTrendChart.innerHTML = "";
    refs.statsMixChart.innerHTML = "";
    refs.statsTopCaption.textContent = "按区间活跃度排序";
    refs.statsTopProducts.innerHTML = "";
    return;
  }

  if (!statistics) {
    refs.statsRangeSummary.textContent = `${ui.statsStartDate || "-"} 至 ${ui.statsEndDate || "-"}`;
    refs.statsOverviewGrid.innerHTML = `<div class="empty-state">统计数据加载中，请稍候。</div>`;
    refs.statsTrendCaption.textContent = "按月汇总";
    refs.statsTrendChart.innerHTML = `<div class="empty-state">正在整理趋势数据。</div>`;
    refs.statsMixChart.innerHTML = `<div class="empty-state">正在整理业务构成。</div>`;
    refs.statsTopProducts.innerHTML = `<div class="empty-state">正在计算商品活跃度。</div>`;
    return;
  }

  refs.statsRangeSummary.textContent = `${statistics.range.label} · ${statistics.overview.document_count} 张单据`;
  refs.statsOverviewGrid.innerHTML = buildStatisticsOverview(statistics.overview || {});
  refs.statsTrendCaption.textContent = `共 ${statistics.range.month_count} 个月，按月汇总`;
  refs.statsTopCaption.textContent = statistics.top_products?.length
    ? `区间内最活跃 ${statistics.top_products.length} 个商品`
    : "所选区间内暂无活跃商品";

  renderStatisticsTrend(statistics.monthly || []);
  renderStatisticsMix(statistics.mix || []);
  renderStatisticsTopProducts(statistics.top_products || []);
}

function renderMiniList(container, items, itemRenderer) {
  if (!container) {
    return;
  }
  if (!items.length) {
    container.innerHTML = `<div class="empty-state">还没有数据，先新增一条试试。</div>`;
    return;
  }
  container.innerHTML = items.map(itemRenderer).join("");
}

function renderTenantHub(auth, tenantHub) {
  if (!refs.tenantAccessList || !refs.myJoinRequestList || !refs.tenantApprovalList) {
    return;
  }

  const accessibleTenants = tenantHub?.accessible_tenants || auth?.available_tenants || [];
  const myRequests = tenantHub?.my_join_requests || [];
  const pendingApprovals = tenantHub?.pending_approvals || [];

  refs.tenantMoreSummary.textContent = buildTenantSummary(auth, accessibleTenants.length);
  refs.tenantRequestSummary.textContent = buildTenantRequestSummary(myRequests.length);
  refs.tenantApprovalSummary.textContent = buildTenantApprovalSummary(pendingApprovals.length);

  renderTenantAccessList(accessibleTenants);
  renderTenantRequestList(myRequests);
  renderTenantApprovalList(pendingApprovals);
}

function renderTenantAccessList(items) {
  if (!items.length) {
    refs.tenantAccessList.innerHTML = `<div class="empty-state">当前没有可访问租户。创建一个新租户，或提交加入申请后等待管理员审批。</div>`;
    return;
  }

  refs.tenantAccessList.innerHTML = items
    .map(
      (item) => `
        <article class="dense-row more-entry more-entry--tenant">
          ${buildMoreEntryIcon("租", item.is_current ? "violet" : "sky")}
          <div class="more-entry__body">
            <div class="more-entry__top">
              <div class="row-main">
              <div class="row-title">${escapeHtml(item.name)}</div>
              <div class="row-subtitle">${escapeHtml(item.slug)} · ${item.is_owner ? "所有者" : "成员"}</div>
              </div>
              <div class="more-entry__meta">
                <span class="status-chip ${item.is_current ? "safe" : "info"}">${item.is_current ? "使用中" : item.is_owner ? "所有者" : "成员"}</span>
              ${
                item.is_current
                  ? `<span class="mini-text">当前使用中</span>`
                  : `<button type="button" class="ghost-button small" data-enter-tenant="${item.id}">切换到此租户</button>`
              }
              </div>
            </div>
            <div class="row-stats">
              <span class="stat-pill"><span>成员</span>${item.member_count}</span>
              <span class="stat-pill"><span>待审批</span>${item.pending_request_count}</span>
            </div>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderTenantRequestList(items) {
  if (!items.length) {
    refs.myJoinRequestList.innerHTML = `<div class="empty-state">还没有加入申请。需要新增协作租户时，可以在这里直接提交申请。</div>`;
    return;
  }

  refs.myJoinRequestList.innerHTML = items
    .map(
      (item) => `
        <article class="dense-row more-entry more-entry--request">
          ${buildMoreEntryIcon("申", "amber")}
          <div class="more-entry__body">
            <div class="more-entry__top">
              <div class="row-main">
              <div class="row-title">${escapeHtml(item.tenant_name)}</div>
              <div class="row-subtitle">${escapeHtml(item.tenant_slug)} · 提交于 ${formatDateTime(item.created_at)}</div>
              </div>
              <div class="more-entry__meta">
                <span class="status-chip ${requestStatusClass(item.status)}">${requestStatusLabel(item.status)}</span>
              </div>
            </div>
            <div class="row-note">${escapeHtml(item.note || "未填写申请说明")}</div>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderTenantApprovalList(items) {
  if (!items.length) {
    refs.tenantApprovalList.innerHTML = `<div class="empty-state">当前没有待你处理的加入申请。</div>`;
    return;
  }

  refs.tenantApprovalList.innerHTML = items
    .map(
      (item) => `
        <article class="dense-row more-entry more-entry--approval">
          ${buildMoreEntryIcon("审", "mint")}
          <div class="more-entry__body">
            <div class="more-entry__top">
              <div class="row-main">
              <div class="row-title">${escapeHtml(item.display_name || item.username)}</div>
              <div class="row-subtitle">${escapeHtml(item.username)} · 申请加入 ${escapeHtml(item.tenant_name)} (${escapeHtml(item.tenant_slug)})</div>
              </div>
              <div class="more-entry__meta">
                <span class="status-chip warn">待审批</span>
              </div>
            </div>
            <div class="row-note">${escapeHtml(item.note || "未填写申请说明")}</div>
            <div class="row-actions">
              <button type="button" class="quick-button quick-button--approve" data-approve-request="${item.id}">同意</button>
              <button type="button" class="quick-button quick-button--reject" data-reject-request="${item.id}">拒绝</button>
            </div>
          </div>
        </article>
      `,
    )
    .join("");
}

function buildTenantSummary(auth, accessibleCount) {
  if (!auth?.current_tenant) {
    return "当前还没有工作租户。创建一个租户后会立即切换进入；加入申请需要等待管理员审批。";
  }
  if (accessibleCount <= 1) {
    return `当前正在 ${auth.current_tenant.name} 工作。后续新增租户或申请加入其他空间，都在这里处理。`;
  }
  return `当前正在 ${auth.current_tenant.name} 工作，并可访问 ${accessibleCount} 个租户。你可以在这里切换工作空间。`;
}

function buildTenantRequestSummary(requestCount) {
  if (!requestCount) {
    return "提交加入申请后，会在这里看到最新状态。";
  }
  return `当前共有 ${requestCount} 条申请记录，审批通过后会新增对应租户访问权限，你可以随时在这里切换。`;
}

function buildTenantApprovalSummary(approvalCount) {
  if (!approvalCount) {
    return "如果你是租户创建者，这里会显示待处理申请。";
  }
  return `当前共有 ${approvalCount} 条待处理申请，处理后会立即更新成员权限。`;
}

function renderProductRow(item, stock) {
  const stockRecord = stock.find((entry) => Number(entry.id) === Number(item.id));
  const currentStock = stockRecord ? stockRecord.on_hand : 0;
  const inAlert = Number(currentStock) <= Number(item.safety_stock);
  return `
    <article class="dense-row more-entry more-entry--product">
      ${buildMoreEntryIcon("品", inAlert ? "amber" : "sky")}
      <div class="more-entry__body">
        <div class="more-entry__top">
          <div class="row-main">
          <div class="row-title">${escapeHtml(item.name)}</div>
          <div class="row-subtitle">${escapeHtml(item.sku)} · ${escapeHtml(item.category || "未分类")} · ${escapeHtml(item.unit || "件")}</div>
          </div>
          <div class="more-entry__meta">
            <span class="status-chip ${inAlert ? "warn" : "safe"}">${inAlert ? "待补" : "正常"}</span>
          </div>
        </div>
        <div class="row-stats">
          <span class="stat-pill"><span>库存</span>${formatQuantity(currentStock)}</span>
          <span class="stat-pill"><span>售价</span>${formatCurrency(item.sale_price || 0)}</span>
        </div>
      </div>
    </article>
  `;
}

function renderPartnerRow(item, partnerType) {
  const iconLabel = partnerType === "supplier" ? "供" : "客";
  const tone = partnerType === "supplier" ? "mint" : "violet";
  return `
    <article class="dense-row more-entry more-entry--partner">
      ${buildMoreEntryIcon(iconLabel, tone)}
      <div class="more-entry__body">
        <div class="row-title">${escapeHtml(item.name)}</div>
        <div class="row-subtitle">${escapeHtml(item.contact || "未填写联系人")} · ${escapeHtml(item.phone || "未填写电话")}</div>
        <div class="row-note">${escapeHtml(item.note || "暂未补充备注")}</div>
      </div>
    </article>
  `;
}

function buildMoreEntryIcon(label, tone) {
  return `<span class="more-entry__icon more-entry__icon--${tone}">${label}</span>`;
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
      <select name="product_id" class="form-input" required>${productOptions(products, "请选择商品")}</select>
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

function applyUiState(ui, auth) {
  refs.views.forEach((view) => {
    const isActive = view.dataset.view === ui.activeView;
    view.hidden = !isActive;
  });

  refs.viewButtons.forEach((button) => {
    const viewName = button.dataset.viewBtn;
    const disabled = !auth || !auth.current_tenant;
    const isActive = Boolean(auth) && viewName === ui.activeView;
    button.classList.toggle("is-active", isActive);
    button.classList.toggle("is-disabled", disabled);
    button.toggleAttribute("disabled", disabled);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });

  refs.stockFilterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.stockFilter === ui.inventoryFilter);
  });

  refs.documentFilterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.documentFilter === ui.documentFilter);
  });

  refs.statsPresetButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.statsPreset === ui.statsPreset);
  });

  refs.moreTabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.moreTab === ui.activeMoreTab);
  });

  if (refs.moreHome) {
    refs.moreHome.hidden = ui.activeMoreTab !== "menu";
  }

  refs.morePanels.forEach((panel) => {
    panel.hidden = ui.activeMoreTab === "menu" || panel.dataset.morePanel !== ui.activeMoreTab;
  });

  refs.tenantActionTabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tenantTab === ui.activeActionTab);
  });

  refs.tenantActionPanels.forEach((panel) => {
    panel.hidden = panel.dataset.tenantPanel !== ui.activeActionTab;
  });

  refs.composerTrigger.hidden = !auth?.current_tenant || ui.activeView === "more";
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

function buildStatisticsOverview(overview) {
  const cards = [
    {
      key: "net_amount",
      label: "交易净额",
      value: formatSignedCurrency(overview.net_amount || 0),
      note: "销售额减去采购额",
    },
    {
      key: "sale_amount",
      label: "销售额",
      value: formatCurrency(overview.sale_amount || 0),
      note: `${overview.sale_docs || 0} 张销售单`,
    },
    {
      key: "purchase_amount",
      label: "采购额",
      value: formatCurrency(overview.purchase_amount || 0),
      note: `${overview.purchase_docs || 0} 张采购单`,
    },
    {
      key: "document_count",
      label: "单据数",
      value: String(overview.document_count || 0),
      note: `调整 ${overview.adjustment_docs || 0} 张`,
    },
    {
      key: "active_days",
      label: "活跃天数",
      value: String(overview.active_days || 0),
      note: `销售 ${formatQuantity(overview.sale_quantity || 0)} / 采购 ${formatQuantity(overview.purchase_quantity || 0)}`,
    },
  ];

  return cards
    .map(
      (item) => `
        <article class="stats-card stats-card--${item.key}">
          <p class="stats-card__label">${item.label}</p>
          <div class="stats-card__value">${item.value}</div>
          <p class="stats-card__note">${item.note}</p>
        </article>
      `,
    )
    .join("");
}

function renderStatisticsTrend(items) {
  const hasData = items.some(
    (item) =>
      Number(item.sale_amount || 0) > 0 ||
      Number(item.purchase_amount || 0) > 0 ||
      Number(item.document_count || 0) > 0,
  );

  if (!hasData) {
    refs.statsTrendChart.innerHTML = `<div class="empty-state">所选时间范围内还没有可展示的月度数据。</div>`;
    return;
  }

  const chartWidth = Math.max(540, items.length * 92);
  const chartHeight = 280;
  const margin = { top: 24, right: 18, bottom: 46, left: 56 };
  const plotWidth = chartWidth - margin.left - margin.right;
  const plotHeight = chartHeight - margin.top - margin.bottom;
  const maxValue = Math.max(
    1,
    ...items.flatMap((item) => [Number(item.sale_amount || 0), Number(item.purchase_amount || 0)]),
  );
  const step = plotWidth / items.length;
  const groupWidth = Math.min(46, step * 0.7);
  const barGap = 6;
  const barWidth = Math.max(10, (groupWidth - barGap) / 2);
  const baseline = margin.top + plotHeight;
  const gridFractions = [1, 0.75, 0.5, 0.25, 0];

  const gridLines = gridFractions
    .map((fraction) => {
      const y = margin.top + plotHeight * (1 - fraction);
      return `
        <line x1="${margin.left}" y1="${y}" x2="${chartWidth - margin.right}" y2="${y}" class="stats-grid-line"></line>
        <text x="${margin.left - 10}" y="${y + 4}" class="stats-grid-label">${escapeHtml(formatShortCurrency(maxValue * fraction))}</text>
      `;
    })
    .join("");

  const bars = items
    .map((item, index) => {
      const x = margin.left + step * index + (step - groupWidth) / 2;
      const purchaseHeight = (Number(item.purchase_amount || 0) / maxValue) * plotHeight;
      const saleHeight = (Number(item.sale_amount || 0) / maxValue) * plotHeight;
      const labelX = margin.left + step * index + step / 2;
      return `
        <g>
          <rect
            x="${x}"
            y="${baseline - purchaseHeight}"
            width="${barWidth}"
            height="${purchaseHeight}"
            rx="4"
            class="stats-bar stats-bar--purchase"
          ></rect>
          <rect
            x="${x + barWidth + barGap}"
            y="${baseline - saleHeight}"
            width="${barWidth}"
            height="${saleHeight}"
            rx="4"
            class="stats-bar stats-bar--sale"
          ></rect>
          <text x="${labelX}" y="${chartHeight - 14}" text-anchor="middle" class="stats-axis-label">${escapeHtml(formatMonthLabel(item.month))}</text>
        </g>
      `;
    })
    .join("");

  const totals = items.reduce(
    (accumulator, item) => {
      accumulator.sale += Number(item.sale_amount || 0);
      accumulator.purchase += Number(item.purchase_amount || 0);
      return accumulator;
    },
    { sale: 0, purchase: 0 },
  );

  refs.statsTrendChart.innerHTML = `
    <div class="stats-legend">
      <span class="stats-legend__item"><i class="stats-swatch stats-swatch--purchase"></i>采购 ${formatCurrency(totals.purchase)}</span>
      <span class="stats-legend__item"><i class="stats-swatch stats-swatch--sale"></i>销售 ${formatCurrency(totals.sale)}</span>
    </div>
    <div class="stats-chart-scroll">
      <svg class="stats-svg" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="月度采购与销售趋势图">
        ${gridLines}
        ${bars}
      </svg>
    </div>
  `;
}

function renderStatisticsMix(items) {
  const maxCount = Math.max(1, ...items.map((item) => Number(item.count || 0)));
  const hasData = items.some((item) => Number(item.count || 0) > 0 || Number(item.quantity || 0) > 0);

  if (!hasData) {
    refs.statsMixChart.innerHTML = `<div class="empty-state">所选时间范围内没有业务构成数据。</div>`;
    return;
  }

  refs.statsMixChart.innerHTML = items
    .map((item) => {
      const width = Number(item.count || 0) > 0 ? Math.max((Number(item.count || 0) / maxCount) * 100, 10) : 0;
      return `
        <article class="mix-row mix-row--${escapeHtml(item.type)}">
          <div class="mix-row__head">
            <strong>${escapeHtml(item.label)}</strong>
            <span>${item.count} 单 · ${item.type === "adjustment" ? formatQuantity(item.quantity || 0) : formatCurrency(item.amount || 0)}</span>
          </div>
          <div class="mix-row__bar">
            <span style="width: ${width}%"></span>
          </div>
          <div class="mix-row__foot">数量 ${formatQuantity(item.quantity || 0)}</div>
        </article>
      `;
    })
    .join("");
}

function renderStatisticsTopProducts(items) {
  if (!items.length) {
    refs.statsTopProducts.innerHTML = `<div class="empty-state">当前时间范围内还没有活跃商品记录。</div>`;
    return;
  }

  const maxActivity = Math.max(1, ...items.map((item) => Number(item.activity_amount || 0)));
  refs.statsTopProducts.innerHTML = items
    .map((item, index) => {
      const barWidth = Math.max((Number(item.activity_amount || 0) / maxActivity) * 100, 8);
      return `
        <article class="dense-row stats-rank-row">
          <div class="stats-rank-row__index">${String(index + 1).padStart(2, "0")}</div>
          <div class="stats-rank-row__body">
            <div class="row-head">
              <div class="row-main">
                <div class="row-title">${escapeHtml(item.name)}</div>
                <div class="row-subtitle">${escapeHtml(item.sku)} · ${escapeHtml(item.category || "未分类")} · ${escapeHtml(item.unit || "件")}</div>
              </div>
              <div class="row-side">
                <strong class="stats-rank-row__figure">${formatCurrency(item.activity_amount || 0)}</strong>
                <span class="mini-text">区间流水</span>
              </div>
            </div>
            <div class="stats-rank-row__bar">
              <span style="width: ${barWidth}%"></span>
            </div>
            <div class="row-stats">
              <span class="stat-pill"><span>销售</span>${formatQuantity(item.sale_quantity || 0)} ${escapeHtml(item.unit || "件")}</span>
              <span class="stat-pill"><span>采购</span>${formatQuantity(item.purchase_quantity || 0)} ${escapeHtml(item.unit || "件")}</span>
              <span class="stat-pill"><span>调整</span>${signedQuantity(item.adjustment_quantity || 0)} ${escapeHtml(item.unit || "件")}</span>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function formatCurrency(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function formatSignedCurrency(value) {
  const amount = Number(value || 0);
  const prefix = amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${prefix}¥${Math.abs(amount).toFixed(2)}`;
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

function formatMonthLabel(value) {
  if (!value) {
    return "-";
  }
  const parts = String(value).split("-");
  if (parts.length !== 2) {
    return value;
  }
  return `${Number(parts[1])}月`;
}

function shortText(text, maxLength) {
  const normalized = String(text || "");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
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
