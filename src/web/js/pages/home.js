import { getState, loadSummary, loadStock, loadMovements } from '../store.js';
import { formatCurrency, formatShortCurrency, formatQuantity, formatDateTime, typeTag, escapeHtml } from '../utils.js';

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
        <button class="quick-btn" data-action="stats">
          <span class="quick-icon quick-icon-purple">统</span>
          <span>统计分析</span>
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

  // Bind quick action clicks
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'stats') {
        window.__app.navigate('/stats');
      } else {
        window.__app.navigate('/' + action);
      }
    });
  });
}

export function unmount() {}
