import { getState, loadSummary, loadStock, loadMovements } from '../store.js';
import { api } from '../api.js';
import { formatCurrency, formatShortCurrency, formatQuantity, formatDateTime, typeTag, escapeHtml, toast } from '../utils.js';

export function mount(container) {
  const { auth, summary, stock, movements } = getState();

  if (!auth?.current_tenant) {
    container.innerHTML = `<div class="empty-state"><p>请先创建或加入一个团队</p><button class="btn btn-primary" onclick="window.__app.navigate('/tenants')">去设置</button></div>`;
    return;
  }

  const metrics = summary?.metrics || {};
  const alerts = summary?.alerts || [];
  const recentDocs = summary?.recent_documents || [];

  // 初始加载统计数据
  loadStatistics();

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
      <div class="card-list">
        ${recentDocs.map(d => `
          <div class="list-item">
            <div class="list-item-main">
              <div class="list-item-title">${typeTag(d.doc_type)} ${escapeHtml(d.doc_no)}</div>
              <div class="list-item-desc">${escapeHtml(d.partner_name || '')} · ${formatDateTime(d.created_at)}</div>
            </div>
            <div class="list-item-right">
              <span class="font-num">${formatCurrency(d.total_amount)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}
  `;

  // 绑定快捷操作
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      window.__app.navigate('/' + action);
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

  async function loadStatistics(preset = 'thisMonth') {
    const statsSection = container.querySelector('#stats-section');
    statsSection.querySelector('.stats-loading').style.display = 'block';
    
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
      
      renderStatistics(statsSection, stats);
    } catch (err) {
      toast(err.message || '加载统计数据失败', 'error');
      statsSection.querySelector('.stats-loading').textContent = '加载失败';
    }
  }

  function renderStatistics(container, stats) {
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
        <button class="filter-btn active" data-preset="thisMonth">本月</button>
        <button class="filter-btn" data-preset="last3Months">近 3 月</button>
        <button class="filter-btn" data-preset="last6Months">近 6 月</button>
      </div>
      
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-value ${(ov.net_amount || 0) >= 0 ? 'text-success' : 'text-danger'}">${formatShortCurrency(ov.net_amount || 0)}</div>
          <div class="metric-label">净额</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${formatShortCurrency(ov.sale_amount || 0)}</div>
          <div class="metric-label">销售额</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${formatShortCurrency(ov.purchase_amount || 0)}</div>
          <div class="metric-label">采购额</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${ov.document_count || 0}</div>
          <div class="metric-label">单据数</div>
        </div>
      </div>

      ${monthly.length ? `
      <div class="chart-container">
        ${renderBarChart(monthly)}
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

  function renderBarChart(monthly) {
    if (!monthly.length) return '';
    const maxVal = Math.max(...monthly.map(m => Math.max(Math.abs(m.purchase_amount || 0), Math.abs(m.sale_amount || 0))), 1);
    const barWidth = Math.max(20, Math.floor((window.innerWidth - 60) / monthly.length) - 8);

    return `
      <div class="bar-chart">
        <div class="bar-chart-bars">
          ${monthly.map(m => {
            const pH = Math.round(Math.abs(m.purchase_amount || 0) / maxVal * 100);
            const sH = Math.round(Math.abs(m.sale_amount || 0) / maxVal * 100);
            return `
              <div class="bar-group" style="width:${barWidth}px">
                <div class="bar-pair">
                  <div class="bar bar-purchase" style="height:${pH}%" title="采购 ${formatCurrency(m.purchase_amount)}"></div>
                  <div class="bar bar-sale" style="height:${sH}%" title="销售 ${formatCurrency(m.sale_amount)}"></div>
                </div>
                <div class="bar-label">${formatMonthLabel(m.month)}</div>
              </div>
            `;
          }).join('')}
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
