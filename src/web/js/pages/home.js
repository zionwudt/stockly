import { getState } from '../store.js';
import { api } from '../api.js';
import { formatShortCurrency, formatQuantity, escapeHtml, toast } from '../utils.js';
import { openPurchaseModal } from './purchase.js';
import { openSaleModal } from './sale.js';
import { openAdjustmentModal } from './adjustment.js';

const PRESETS = [
  { key: 'last1Month',  label: '近1月',  granularity: 'daily'   },
  { key: 'last3Months', label: '近3月',  granularity: 'daily'   },
  { key: 'last6Months', label: '近半年', granularity: 'monthly' },
  { key: 'lastYear',    label: '近一年', granularity: 'monthly' },
];

function resolveRange(preset) {
  const now = new Date();
  switch (preset) {
    case 'last1Month':
      return { start: new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()), end: now };
    case 'last3Months':
      return { start: new Date(now.getFullYear(), now.getMonth() - 2, 1), end: now };
    case 'last6Months':
      return { start: new Date(now.getFullYear(), now.getMonth() - 5, 1), end: now };
    case 'lastYear':
      return { start: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()), end: now };
    default:
      return { start: new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()), end: now };
  }
}

const PIE_COLORS = ['#1677ff', '#00b578', '#ff8f1f', '#7265e6', '#ff3141', '#13c2c2', '#faad14', '#eb2f96'];

export function mount(container) {
  const { auth, summary } = getState();

  if (!auth?.current_tenant) {
    container.innerHTML = `<div class="empty-state"><p>请先创建或加入一个团队</p><button class="btn btn-primary" onclick="window.__app.navigate('/tenants')">去设置</button></div>`;
    return;
  }

  const metrics = summary?.metrics || {};
  const alerts = summary?.alerts || [];

  container.innerHTML = `
    <div class="page-section">
      <div class="metric-row-2">
        <div class="metric-card metric-card-sale">
          <div class="metric-label">月销售额</div>
          <div class="metric-value">${formatShortCurrency(metrics.monthly_sale_amount || 0)}</div>
        </div>
        <div class="metric-card metric-card-purchase">
          <div class="metric-label">月采购额</div>
          <div class="metric-value">${formatShortCurrency(metrics.monthly_purchase_amount || 0)}</div>
        </div>
        <div class="metric-card metric-card-sale-year">
          <div class="metric-label">年销售额</div>
          <div class="metric-value">${formatShortCurrency(metrics.yearly_sale_amount || 0)}</div>
        </div>
        <div class="metric-card metric-card-purchase-year">
          <div class="metric-label">年采购额</div>
          <div class="metric-value">${formatShortCurrency(metrics.yearly_purchase_amount || 0)}</div>
        </div>
      </div>
    </div>

    <!-- 快捷操作 -->
    <div class="page-section" style="padding-top:0;">
      <div class="quick-actions">
        <button class="quick-btn" data-action="purchase">
          <span class="quick-icon quick-icon-blue">采</span>
          <span>采购入库</span>
        </button>
        <button class="quick-btn" data-action="sale">
          <span class="quick-icon quick-icon-green">销</span>
          <span>销售出库</span>
        </button>
        <button class="quick-btn" data-action="adjustment">
          <span class="quick-icon quick-icon-orange">调</span>
          <span>库存调整</span>
        </button>
      </div>
    </div>

    <!-- 全局时间范围选择器 -->
    <div class="page-section" style="padding-top:0;">
      <div class="home-preset-row">
        ${PRESETS.map(p => `
          <button class="filter-btn${p.key === 'last1Month' ? ' active' : ''}" data-preset="${p.key}">${p.label}</button>
        `).join('')}
      </div>
    </div>

    <!-- 销采趋势折线图 -->
    <div class="page-section" id="chart-section">
      <div class="chart-container">
        <div class="chart-title-row"><span class="chart-title">销采趋势</span></div>
        <div class="stats-loading">加载中...</div>
      </div>
    </div>

    <!-- 商品销售占比饼图 -->
    <div class="page-section" id="pie-sale-section">
      <div class="chart-container pie-chart-container">
        <div class="chart-title-row"><span class="chart-title">商品销售占比</span></div>
        <div class="stats-loading">加载中...</div>
      </div>
    </div>

    <!-- 商品采购占比饼图 -->
    <div class="page-section" id="pie-purchase-section">
      <div class="chart-container pie-chart-container">
        <div class="chart-title-row"><span class="chart-title">商品采购占比</span></div>
        <div class="stats-loading">加载中...</div>
      </div>
    </div>

    <!-- 客户占比饼图 -->
    <div class="page-section" id="pie-customer-section">
      <div class="chart-container pie-chart-container">
        <div class="chart-title-row"><span class="chart-title">客户销售占比</span></div>
        <div class="stats-loading">加载中...</div>
      </div>
    </div>

    <!-- 供应商占比饼图 -->
    <div class="page-section" id="pie-supplier-section">
      <div class="chart-container pie-chart-container">
        <div class="chart-title-row"><span class="chart-title">供应商采购占比</span></div>
        <div class="stats-loading">加载中...</div>
      </div>
    </div>

    ${alerts.length > 0 ? `
    <div class="page-section">
      <div class="section-header">
        <h3>库存预警</h3>
        <span class="section-hint text-warning">${alerts.length} 项</span>
      </div>
      <div class="card-list">
        ${alerts.map(a => `
          <div class="list-item">
            <div class="list-item-main">
              <div class="list-item-title">${escapeHtml(a.name)}</div>
              <div class="list-item-desc">${escapeHtml(a.sku)} · 安全库存 ${formatQuantity(a.safety_stock)}</div>
            </div>
            <div class="list-item-right">
              <span class="text-danger font-num">${formatQuantity(a.on_hand)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}
  `;

  // 绑定快捷操作
  const actionMap = { purchase: openPurchaseModal, sale: openSaleModal, adjustment: openAdjustmentModal };
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => { const fn = actionMap[btn.dataset.action]; if (fn) fn(); });
  });

  // 当前 preset 状态
  let currentPreset = 'last1Month';

  // 绑定时间范围选择器 — 触发所有图表刷新
  container.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.preset === currentPreset) return;
      currentPreset = btn.dataset.preset;
      container.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadAllCharts(currentPreset);
    });
  });

  // 初始加载
  loadAllCharts(currentPreset);

  // ─── 加载所有图表 ───────────────────────────────────────────
  async function loadAllCharts(preset) {
    const { start, end } = resolveRange(preset);
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    const granularity = PRESETS.find(p => p.key === preset)?.granularity || 'daily';

    // 显示所有 loading
    container.querySelectorAll('.stats-loading').forEach(el => { el.style.display = 'block'; el.textContent = '加载中...'; });

    try {
      const stats = await api.getStatistics(startStr, endStr);
      renderLineChart(stats, granularity);
      renderPieSale(stats.top_products || []);
      renderPiePurchase(stats.top_products || []);
      renderPieCustomer(stats.top_customers || []);
      renderPieSupplier(stats.top_suppliers || []);
    } catch (err) {
      toast(err.message || '加载图表失败', 'error');
      container.querySelectorAll('.stats-loading').forEach(el => { el.textContent = '加载失败'; });
    }
  }

  // ─── 折线图（自适应宽度） ───────────────────────────────────
  function renderLineChart(stats, granularity) {
    const section = container.querySelector('#chart-section .chart-container');
    if (!section) return;
    const titleEl = section.querySelector('.chart-title-row');
    section.innerHTML = '';
    if (titleEl) section.appendChild(titleEl);

    const data = granularity === 'monthly' ? (stats.monthly || []) : (stats.daily || []);
    if (!data.length) {
      section.insertAdjacentHTML('beforeend', '<div class="empty-hint">暂无数据</div>');
      return;
    }
    const svg = granularity === 'monthly'
      ? buildMonthlyLineChartSVG(data)
      : buildDailyLineChartSVG(data);
    section.insertAdjacentHTML('beforeend', svg);
  }

  function buildMonthlyLineChartSVG(monthly) {
    const n = monthly.length;
    const VW = 400, chartHeight = 190;
    const margin = { top: 14, right: 10, bottom: 30, left: 44 };
    const drawW = VW - margin.left - margin.right;
    const drawH = chartHeight - margin.top - margin.bottom;
    const stepX = n > 1 ? drawW / (n - 1) : 0;

    const maxVal = Math.max(
      ...monthly.map(d => Math.max(Number(d.purchase_amount) || 0, Number(d.sale_amount) || 0)),
      1
    );
    const toY = v => margin.top + drawH - (Math.max(0, Number(v) || 0) / maxVal) * drawH;

    const purchasePts = monthly.map((d, i) => ({ x: margin.left + stepX * i, y: toY(d.purchase_amount) }));
    const salePts     = monthly.map((d, i) => ({ x: margin.left + stepX * i, y: toY(d.sale_amount) }));
    const toPath = pts => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const baseY = (margin.top + drawH).toFixed(1);
    const areaClose = pts => ` L${pts[pts.length - 1].x.toFixed(1)} ${baseY} L${pts[0].x.toFixed(1)} ${baseY} Z`;

    const gridLevels = [1, 0.75, 0.5, 0.25, 0];

    // For monthly, show label for every point (or every 2 if many)
    const labelInterval = n > 8 ? 2 : 1;

    return `
      <div class="line-chart">
        <svg class="line-chart-svg-fit" viewBox="0 0 ${VW} ${chartHeight}" preserveAspectRatio="none" role="img" aria-label="月度销采趋势">
          <defs>
            <linearGradient id="gp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#1677ff" stop-opacity="0.16"/>
              <stop offset="100%" stop-color="#1677ff" stop-opacity="0"/>
            </linearGradient>
            <linearGradient id="gs" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#00b578" stop-opacity="0.16"/>
              <stop offset="100%" stop-color="#00b578" stop-opacity="0"/>
            </linearGradient>
          </defs>
          ${gridLevels.map(lv => {
            const y = (margin.top + drawH * (1 - lv)).toFixed(1);
            return `<line x1="${margin.left}" y1="${y}" x2="${VW - margin.right}" y2="${y}" class="line-grid"/>
                    <text x="${margin.left - 4}" y="${(+y + 4).toFixed(1)}" class="line-grid-label">${formatShortCurrency(maxVal * lv)}</text>`;
          }).join('')}
          <path d="${toPath(purchasePts)}${areaClose(purchasePts)}" fill="url(#gp)"/>
          <path d="${toPath(salePts)}${areaClose(salePts)}" fill="url(#gs)"/>
          <path d="${toPath(purchasePts)}" class="line-path line-path-purchase"/>
          <path d="${toPath(salePts)}" class="line-path line-path-sale"/>
          ${purchasePts.map((p, i) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" class="line-point line-point-purchase"/>`).join('')}
          ${salePts.map((p, i) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" class="line-point line-point-sale"/>`).join('')}
          ${monthly.map((d, i) => {
            if (i % labelInterval !== 0 && i !== n - 1) return '';
            const x = (margin.left + stepX * i).toFixed(1);
            const parts = d.month.split('-');
            return `<text x="${x}" y="${chartHeight - 4}" text-anchor="middle" class="line-axis-label">${+parts[1]}月</text>`;
          }).join('')}
        </svg>
        <div class="chart-legend">
          <span class="legend-item"><span class="legend-dot legend-purchase"></span>采购</span>
          <span class="legend-item"><span class="legend-dot legend-sale"></span>销售</span>
        </div>
      </div>`;
  }

  function buildDailyLineChartSVG(daily) {
    const totalDays = daily.length;
    // 自适应：用 viewBox + preserveAspectRatio，宽度铺满容器
    const VW = 400; // viewBox 虚拟宽度
    const chartHeight = 190;
    const margin = { top: 14, right: 10, bottom: 30, left: 44 };
    const drawW = VW - margin.left - margin.right;
    const drawH = chartHeight - margin.top - margin.bottom;
    const stepX = totalDays > 1 ? drawW / (totalDays - 1) : 0;

    const maxVal = Math.max(
      ...daily.map(d => Math.max(Number(d.purchase_amount) || 0, Number(d.sale_amount) || 0)),
      1
    );
    const toY = v => margin.top + drawH - (Math.max(0, Number(v) || 0) / maxVal) * drawH;

    const purchasePts = daily.map((d, i) => ({ x: margin.left + stepX * i, y: toY(d.purchase_amount) }));
    const salePts     = daily.map((d, i) => ({ x: margin.left + stepX * i, y: toY(d.sale_amount) }));
    const toPath = pts => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const baseY = (margin.top + drawH).toFixed(1);
    const areaClose = pts => ` L${pts[pts.length - 1].x.toFixed(1)} ${baseY} L${pts[0].x.toFixed(1)} ${baseY} Z`;

    // 标签间隔
    const labelInterval = totalDays > 90 ? 30 : totalDays > 60 ? 14 : totalDays > 30 ? 7 : totalDays > 14 ? 3 : 1;

    const gridLevels = [1, 0.75, 0.5, 0.25, 0];

    return `
      <div class="line-chart">
        <svg class="line-chart-svg-fit" viewBox="0 0 ${VW} ${chartHeight}" preserveAspectRatio="none" role="img" aria-label="销采趋势">
          <defs>
            <linearGradient id="gp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#1677ff" stop-opacity="0.16"/>
              <stop offset="100%" stop-color="#1677ff" stop-opacity="0"/>
            </linearGradient>
            <linearGradient id="gs" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#00b578" stop-opacity="0.16"/>
              <stop offset="100%" stop-color="#00b578" stop-opacity="0"/>
            </linearGradient>
          </defs>
          ${gridLevels.map(lv => {
            const y = (margin.top + drawH * (1 - lv)).toFixed(1);
            return `<line x1="${margin.left}" y1="${y}" x2="${VW - margin.right}" y2="${y}" class="line-grid"/>
                    <text x="${margin.left - 4}" y="${(+y + 4).toFixed(1)}" class="line-grid-label">${formatShortCurrency(maxVal * lv)}</text>`;
          }).join('')}
          <path d="${toPath(purchasePts)}${areaClose(purchasePts)}" fill="url(#gp)"/>
          <path d="${toPath(salePts)}${areaClose(salePts)}" fill="url(#gs)"/>
          <path d="${toPath(purchasePts)}" class="line-path line-path-purchase"/>
          <path d="${toPath(salePts)}" class="line-path line-path-sale"/>
          ${daily.map((d, i) => {
            if (i % labelInterval !== 0 && i !== totalDays - 1) return '';
            const x = (margin.left + stepX * i).toFixed(1);
            const parts = d.day.split('-');
            const lbl = totalDays <= 14 ? `${parts[1]}/${parts[2]}` : `${+parts[1]}/${+parts[2]}`;
            return `<text x="${x}" y="${chartHeight - 4}" text-anchor="middle" class="line-axis-label">${lbl}</text>`;
          }).join('')}
        </svg>
        <div class="chart-legend">
          <span class="legend-item"><span class="legend-dot legend-purchase"></span>采购</span>
          <span class="legend-item"><span class="legend-dot legend-sale"></span>销售</span>
        </div>
      </div>`;
  }

  // ─── 通用饼图渲染 ──────────────────────────────────────────
  function buildPieHTML(slices, centerLabel, centerSub) {
    const size = 140;
    const cx = size / 2, cy = size / 2, r = 54, ri = 28;

    const arcPath = (sa, ea) => {
      const cos = Math.cos, sin = Math.sin;
      const x1 = cx + r * cos(sa), y1 = cy + r * sin(sa);
      const x2 = cx + r * cos(ea), y2 = cy + r * sin(ea);
      const ix1 = cx + ri * cos(ea), iy1 = cy + ri * sin(ea);
      const ix2 = cx + ri * cos(sa), iy2 = cy + ri * sin(sa);
      const lg = (ea - sa) > Math.PI ? 1 : 0;
      return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${lg} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L${ix1.toFixed(2)} ${iy1.toFixed(2)} A${ri} ${ri} 0 ${lg} 0 ${ix2.toFixed(2)} ${iy2.toFixed(2)}Z`;
    };

    return `
      <div class="pie-chart-wrap">
        <svg class="pie-svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
          ${slices.map(s => `<path d="${arcPath(s.sa, s.ea)}" fill="${s.color}" stroke="#fff" stroke-width="1.5"/>`).join('')}
          <circle cx="${cx}" cy="${cy}" r="${ri - 1}" fill="#fff"/>
          <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="pie-center-label">${centerLabel}</text>
          <text x="${cx}" y="${cy + 12}" text-anchor="middle" class="pie-center-sub">${centerSub}</text>
        </svg>
        <div class="pie-legend">
          ${slices.map(s => `
            <div class="pie-legend-item">
              <span class="pie-legend-dot" style="background:${s.color}"></span>
              <span class="pie-legend-name">${escapeHtml(s.name)}</span>
              <span class="pie-legend-pct">${(s.pct * 100).toFixed(1)}%</span>
              <span class="pie-legend-amount">${formatShortCurrency(s.amount)}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function makeSlices(items, amountKey) {
    const total = items.reduce((s, p) => s + (p[amountKey] || 0), 0);
    if (total === 0) return null;
    let sa = -Math.PI / 2;
    return { total, slices: items.slice(0, 8).map((p, i) => {
      const pct = (p[amountKey] || 0) / total;
      const ea = sa + pct * Math.PI * 2;
      const s = { name: p.name, amount: p[amountKey] || 0, pct, sa, ea, color: PIE_COLORS[i % PIE_COLORS.length] };
      sa = ea;
      return s;
    })};
  }

  function injectPie(sectionId, html, fallback) {
    const el = container.querySelector(`#${sectionId} .pie-chart-container`);
    if (!el) return;
    const titleEl = el.querySelector('.chart-title-row');
    el.innerHTML = '';
    if (titleEl) el.appendChild(titleEl);
    el.insertAdjacentHTML('beforeend', html || `<div class="empty-hint">${fallback}</div>`);
  }

  function renderPieSale(topProducts) {
    const filtered = topProducts.filter(p => (p.sale_amount || 0) > 0);
    const data = makeSlices(filtered, 'sale_amount');
    injectPie('pie-sale-section',
      data ? buildPieHTML(data.slices, formatShortCurrency(data.total), '销售总额') : null,
      '暂无销售数据');
  }

  function renderPiePurchase(topProducts) {
    const filtered = topProducts.filter(p => (p.purchase_amount || 0) > 0);
    const data = makeSlices(filtered, 'purchase_amount');
    injectPie('pie-purchase-section',
      data ? buildPieHTML(data.slices, formatShortCurrency(data.total), '采购总额') : null,
      '暂无采购数据');
  }

  function renderPieCustomer(topCustomers) {
    const data = makeSlices(topCustomers, 'total_amount');
    injectPie('pie-customer-section',
      data ? buildPieHTML(data.slices, formatShortCurrency(data.total), '销售总额') : null,
      '暂无客户数据');
  }

  function renderPieSupplier(topSuppliers) {
    const data = makeSlices(topSuppliers, 'total_amount');
    injectPie('pie-supplier-section',
      data ? buildPieHTML(data.slices, formatShortCurrency(data.total), '采购总额') : null,
      '暂无供应商数据');
  }
}

export function unmount() {}

