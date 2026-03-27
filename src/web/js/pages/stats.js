import { getState, loadStatistics } from '../store.js';
import { api } from '../api.js';
import { formatCurrency, formatShortCurrency, formatQuantity, formatMonthLabel, escapeHtml, toast } from '../utils.js';

let statsPreset = 'last6Months';
let startDate = '';
let endDate = '';

function ensureRange() {
  if (startDate && endDate) return;
  const range = buildRange(statsPreset);
  startDate = range.start;
  endDate = range.end;
}

function buildRange(preset) {
  const today = new Date();
  let start = new Date(today.getFullYear(), today.getMonth(), 1);
  if (preset === 'last3Months') start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  else if (preset === 'last6Months') start = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  else if (preset === 'thisYear') start = new Date(today.getFullYear(), 0, 1);
  return { start: toISO(start), end: toISO(today) };
}

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function mount(container) {
  ensureRange();

  let { statistics } = getState();
  if (!statistics) {
    try {
      statistics = await api.statistics(startDate, endDate);
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><p>加载统计数据失败</p></div>`;
      return;
    }
  }

  render(container, statistics);
  bindEvents(container);
}

function render(container, stats) {
  if (!stats) {
    container.innerHTML = '<div class="empty-state"><p>暂无统计数据</p></div>';
    return;
  }

  const ov = stats.overview || {};
  const monthly = stats.monthly || [];
  const mix = stats.mix || [];
  const topProducts = stats.top_products || [];

  container.innerHTML = `
    <div class="page-section">
      <div class="filter-row">
        <button class="filter-btn ${statsPreset === 'thisMonth' ? 'active' : ''}" data-preset="thisMonth">本月</button>
        <button class="filter-btn ${statsPreset === 'last3Months' ? 'active' : ''}" data-preset="last3Months">近 3 月</button>
        <button class="filter-btn ${statsPreset === 'last6Months' ? 'active' : ''}" data-preset="last6Months">近 6 月</button>
        <button class="filter-btn ${statsPreset === 'thisYear' ? 'active' : ''}" data-preset="thisYear">今年</button>
      </div>
      <form id="stats-range-form" class="form-row form-row-inline">
        <div class="form-field">
          <input type="date" name="start_date" value="${startDate}">
        </div>
        <div class="form-field">
          <input type="date" name="end_date" value="${endDate}">
        </div>
        <button type="submit" class="btn btn-small btn-outline">查询</button>
      </form>
    </div>

    <div class="page-section">
      <div class="section-header"><h3>核心指标</h3></div>
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
    </div>

    ${monthly.length ? `
    <div class="page-section">
      <div class="section-header"><h3>月度趋势</h3></div>
      <div class="chart-container">
        ${renderBarChart(monthly)}
      </div>
    </div>` : ''}

    ${mix.length ? `
    <div class="page-section">
      <div class="section-header"><h3>业务构成</h3></div>
      <div class="card-list">
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
      </div>
    </div>` : ''}

    ${topProducts.length ? `
    <div class="page-section">
      <div class="section-header"><h3>商品排行</h3><span class="section-hint">TOP ${topProducts.length}</span></div>
      <div class="card-list">
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
      </div>
    </div>` : ''}
  `;
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

function bindEvents(container) {
  container.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', async () => {
      statsPreset = btn.dataset.preset;
      const range = buildRange(statsPreset);
      startDate = range.start;
      endDate = range.end;
      await refreshStats(container);
    });
  });

  container.querySelector('#stats-range-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const sd = form.elements.start_date.value;
    const ed = form.elements.end_date.value;
    if (!sd || !ed) { toast('请选择日期范围', 'error'); return; }
    if (sd > ed) { toast('开始日期不能晚于结束日期', 'error'); return; }
    startDate = sd;
    endDate = ed;
    statsPreset = 'custom';
    await refreshStats(container);
  });
}

async function refreshStats(container) {
  try {
    const data = await api.statistics(startDate, endDate);
    render(container, data);
    bindEvents(container);
    toast('统计已更新', 'success');
  } catch (err) {
    toast(err.message || '加载统计失败', 'error');
  }
}

export function unmount() {}
