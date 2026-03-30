import { getState } from '../store.js';
import { api } from '../api.js';
import { formatCurrency, formatShortCurrency, formatQuantity, formatDateTime, typeTag, escapeHtml, toast } from '../utils.js';
import { openPurchaseModal } from './purchase.js';
import { openSaleModal } from './sale.js';
import { openAdjustmentModal } from './adjustment.js';
import { openDocumentDetailModal } from './document-detail.js';

export function mount(container) {
  const { auth, summary, stock, movements } = getState();

  if (!auth?.current_tenant) {
    container.innerHTML = `<div class="empty-state"><p>请先创建或加入一个团队</p><button class="btn btn-primary" onclick="window.__app.navigate('/tenants')">去设置</button></div>`;
    return;
  }

  const metrics = summary?.metrics || {};
  const alerts = summary?.alerts || [];
  const recentDocs = summary?.recent_documents || [];

  container.innerHTML = `
    <div class="page-section">
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-value">${formatShortCurrency(metrics.stock_value || 0)}</div>
          <div class="metric-label">库存总值</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${metrics.product_count || 0}</div>
          <div class="metric-label">商品数</div>
        </div>
        <div class="metric-card">
          <div class="metric-value text-warning">${metrics.alert_count || 0}</div>
          <div class="metric-label">预警商品</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${(metrics.purchase_count || 0) + (metrics.sale_count || 0)}</div>
          <div class="metric-label">单据总数</div>
        </div>
      </div>
    </div>

    <div class="page-section">
      <div class="section-header">
        <h3>快捷操作</h3>
      </div>
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

    <div class="page-section" id="stats-section">
      <div class="section-header">
        <h3>统计分析</h3>
      </div>
      <div class="filter-row">
        <button class="filter-btn active" data-preset="thisMonth">本月</button>
        <button class="filter-btn" data-preset="last3Months">近 3 月</button>
        <button class="filter-btn" data-preset="last6Months">近 6 月</button>
      </div>
      <div class="stats-loading">加载中...</div>
    </div>

    ${recentDocs.length > 0 ? `
    <div class="page-section">
      <div class="section-header">
        <h3>最近单据</h3>
        <a class="section-link" href="#/documents">查看全部</a>
      </div>
      <div class="card-list" id="home-recent-doc-list">
        ${recentDocs.map(d => `
          <div class="list-item ${d.status === 'void' ? 'voided' : ''}" data-recent-doc-no="${escapeHtml(d.doc_no)}">
            <div class="list-item-main">
              <div class="list-item-title">
                ${typeTag(d.doc_type)}
                <span class="doc-no-text">${escapeHtml(d.doc_no)}</span>
                ${d.status === 'void' ? '<span class="badge-void">已作废</span>' : ''}
              </div>
              <div class="list-item-desc">${escapeHtml(d.partner_name || '')} · ${formatDateTime(d.created_at)}</div>
            </div>
            <div class="list-item-right">
              <span class="font-num">${formatCurrency(d.total_amount)}</span>
              ${d.status === 'void' ? '<div class="list-item-sub">已作废</div>' : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}
  `;

  const statsSection = container.querySelector('#stats-section');
  if (statsSection) {
    loadStatistics();
  }

  // 绑定快捷操作
  const actionMap = {
    purchase: openPurchaseModal,
    sale: openSaleModal,
    adjustment: openAdjustmentModal,
  };
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const fn = actionMap[btn.dataset.action];
      if (fn) fn();
    });
  });

  // 绑定统计分析时间范围选择
  container.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadStatistics(btn.dataset.preset);
    });
  });

  const recentDocList = container.querySelector('#home-recent-doc-list');
  if (recentDocList) {
    recentDocList.addEventListener('click', (e) => {
      const item = e.target.closest('.list-item[data-recent-doc-no]');
      if (!item) return;
      const docNo = item.dataset.recentDocNo;
      if (!docNo) return;

      const fullDoc = (getState().documents || []).find(d => d.doc_no === docNo);
      if (fullDoc) {
        openDocumentDetailModal(fullDoc, '单据详情');
        return;
      }

      const fallbackDoc = recentDocs.find(d => d.doc_no === docNo);
      if (!fallbackDoc) return;
      openDocumentDetailModal({
        ...fallbackDoc,
        item_count: null,
        items: [],
        note: '',
      }, '单据详情');
    });
  }

  async function loadStatistics(preset = 'thisMonth') {
    const statsSection = container.querySelector('#stats-section');
    if (!statsSection) return;
    const loadingEl = statsSection.querySelector('.stats-loading');
    if (loadingEl) loadingEl.style.display = 'block';
    
    try {
      let startDate, endDate;
      const now = new Date();
      
      switch (preset) {
        case 'thisMonth':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = now;
          break;
        case 'last3Months':
          startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
          endDate = now;
          break;
        case 'last6Months':
          startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
          endDate = now;
          break;
      }
      
      const stats = await api.getStatistics(
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );
      
      renderStatistics(statsSection, stats, preset);
    } catch (err) {
      toast(err.message || '加载统计数据失败', 'error');
      if (loadingEl) loadingEl.textContent = '加载失败';
    }
  }

  function renderStatistics(container, stats, preset = 'thisMonth') {
    if (!stats) {
      container.innerHTML = '<div class="empty-state"><p>暂无统计数据</p></div>';
      return;
    }

    const ov = stats.overview || {};
    const monthly = stats.monthly || [];
    const mix = stats.mix || [];
    const topProducts = stats.top_products || [];

    container.innerHTML = `
      <div class="section-header">
        <h3>统计分析</h3>
      </div>
      <div class="filter-row">
        <button class="filter-btn ${preset === 'thisMonth' ? 'active' : ''}" data-preset="thisMonth">本月</button>
        <button class="filter-btn ${preset === 'last3Months' ? 'active' : ''}" data-preset="last3Months">近 3 月</button>
        <button class="filter-btn ${preset === 'last6Months' ? 'active' : ''}" data-preset="last6Months">近 6 月</button>
      </div>
      
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-value">${formatShortCurrency(ov.sale_amount || 0)}</div>
          <div class="metric-label">销售额</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${formatShortCurrency(ov.purchase_amount || 0)}</div>
          <div class="metric-label">采购额</div>
        </div>
      </div>

      ${monthly.length ? `
      <div class="chart-container">
        ${renderLineChart(monthly)}
      </div>` : ''}

      ${mix.length ? `
      <div class="card-list" style="margin-top: 12px;">
        ${mix.map(m => {
          const maxAmount = Math.max(...mix.map(x => Math.abs(x.amount || 0)), 1);
          const pct = Math.abs(m.amount || 0) / maxAmount * 100;
          return `
            <div class="list-item">
              <div class="list-item-main">
                <div class="list-item-title">${escapeHtml(m.label)}</div>
                <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
              </div>
              <div class="list-item-right">
                <div class="font-num">${formatCurrency(m.amount)}</div>
                <div class="list-item-sub">${m.count || 0} 单</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>` : ''}

      ${topProducts.length ? `
      <div class="card-list" style="margin-top: 12px;">
        <div class="section-header"><h3>商品排行</h3><span class="section-hint">TOP ${topProducts.length}</span></div>
        ${topProducts.map((p, i) => `
          <div class="list-item">
            <div class="list-item-rank">${i + 1}</div>
            <div class="list-item-main">
              <div class="list-item-title">${escapeHtml(p.name)}</div>
              <div class="list-item-desc">${escapeHtml(p.sku)} · 销${formatQuantity(p.sale_quantity || 0)} · 购${formatQuantity(p.purchase_quantity || 0)}</div>
            </div>
            <div class="list-item-right">
              <div class="font-num">${formatCurrency(p.activity_amount || 0)}</div>
            </div>
          </div>
        `).join('')}
      </div>` : ''}
    `;

    // 重新绑定事件
    container.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadStatistics(btn.dataset.preset);
      });
    });
  }

  function renderLineChart(monthly) {
    if (!monthly.length) return '';
    const chartHeight = 220;
    const chartWidth = Math.max(320, monthly.length * 72);
    const margin = { top: 14, right: 12, bottom: 34, left: 44 };
    const maxVal = Math.max(
      ...monthly.map(m => Math.max(Number(m.purchase_amount) || 0, Number(m.sale_amount) || 0)),
      1
    );
    const drawWidth = chartWidth - margin.left - margin.right;
    const drawHeight = chartHeight - margin.top - margin.bottom;
    const stepX = monthly.length > 1 ? drawWidth / (monthly.length - 1) : 0;

    const toY = (value) => margin.top + drawHeight - (Math.max(0, Number(value) || 0) / maxVal) * drawHeight;
    const buildPoints = (field) => monthly.map((item, idx) => ({
      x: margin.left + stepX * idx,
      y: toY(item[field]),
      value: Number(item[field]) || 0,
      label: formatMonthLabel(item.month),
    }));
    const toPath = (points) => points
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');

    const purchasePoints = buildPoints('purchase_amount');
    const salePoints = buildPoints('sale_amount');

    return `
      <div class="line-chart">
        <div class="line-chart-scroll">
          <svg class="line-chart-svg" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="月度采购与销售趋势图">
            ${[1, 0.75, 0.5, 0.25, 0].map(level => {
              const y = margin.top + drawHeight * (1 - level);
              return `
                <line x1="${margin.left}" y1="${y}" x2="${chartWidth - margin.right}" y2="${y}" class="line-grid"></line>
                <text x="${margin.left - 8}" y="${y + 4}" class="line-grid-label">${formatShortCurrency(maxVal * level)}</text>
              `;
            }).join('')}

            <path d="${toPath(purchasePoints)}" class="line-path line-path-purchase"></path>
            <path d="${toPath(salePoints)}" class="line-path line-path-sale"></path>

            ${purchasePoints.map(p => `
              <circle cx="${p.x}" cy="${p.y}" r="3.5" class="line-point line-point-purchase">
                <title>${p.label} 采购 ${formatCurrency(p.value)}</title>
              </circle>
            `).join('')}
            ${salePoints.map(p => `
              <circle cx="${p.x}" cy="${p.y}" r="3.5" class="line-point line-point-sale">
                <title>${p.label} 销售 ${formatCurrency(p.value)}</title>
              </circle>
            `).join('')}

            ${monthly.map((item, idx) => `
              <text x="${margin.left + stepX * idx}" y="${chartHeight - 12}" text-anchor="middle" class="line-axis-label">${formatMonthLabel(item.month)}</text>
            `).join('')}
          </svg>
        </div>
        <div class="chart-legend">
          <span class="legend-item"><span class="legend-dot legend-purchase"></span>采购</span>
          <span class="legend-item"><span class="legend-dot legend-sale"></span>销售</span>
        </div>
      </div>
    `;
  }

  function formatMonthLabel(month) {
    if (!month) return '';
    const parts = month.split('-');
    return `${parts[1]}月`;
  }
}

export function unmount() {}
