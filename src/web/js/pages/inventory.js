import { getState, loadStock, loadMovements } from '../store.js';
import { formatCurrency, formatQuantity, signedQuantity, formatDateTime, typeTag, escapeHtml } from '../utils.js';
import { openAdjustmentModal } from './adjustment.js';

let searchQuery = '';
let filter = 'all';

export function mount(container) {
  const { stock, movements } = getState();

  container.innerHTML = `
    <div class="page-section">
      <div class="search-bar">
        <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="search" id="inv-search" placeholder="搜索商品 / SKU / 分类" value="${escapeHtml(searchQuery)}">
      </div>
      <div class="filter-row">
        <button class="filter-btn ${filter === 'all' ? 'active' : ''}" data-filter="all">全部</button>
        <button class="filter-btn ${filter === 'warn' ? 'active' : ''}" data-filter="warn">仅预警</button>
        <button class="filter-btn ${filter === 'instock' ? 'active' : ''}" data-filter="instock">有库存</button>
      </div>
    </div>

    <div class="page-section">
      <div class="section-header">
        <h3>库存列表</h3>
        <span class="section-hint">${stock.length} 项</span>
      </div>
      <div class="card-list" id="stock-list"></div>
    </div>

    <div class="page-section">
      <div class="section-header">
        <h3>最近流水</h3>
        <span class="section-hint">最近 30 条</span>
      </div>
      <div class="card-list" id="movement-list"></div>
    </div>
  `;

  renderStockList(container, stock);
  renderMovementList(container, movements);
  bindEvents(container);
}

function renderStockList(container, stock) {
  let filtered = stock;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.sku.toLowerCase().includes(q) ||
      (s.category || '').toLowerCase().includes(q)
    );
  }
  if (filter === 'warn') {
    filtered = filtered.filter(s => s.in_alert);
  } else if (filter === 'instock') {
    filtered = filtered.filter(s => s.on_hand > 0);
  }

  const el = container.querySelector('#stock-list');
  if (!filtered.length) {
    el.innerHTML = '<div class="empty-hint">暂无数据</div>';
    return;
  }

  el.innerHTML = filtered.map(s => `
    <div class="list-item">
      <div class="list-item-main">
        <div class="list-item-title">
          ${s.in_alert ? '<span class="dot dot-danger"></span>' : ''}
          ${escapeHtml(s.name)}
        </div>
        <div class="list-item-desc">${escapeHtml(s.sku)}${s.category ? ' · ' + escapeHtml(s.category) : ''}</div>
      </div>
      <div class="list-item-right" style="display:flex;align-items:center;gap:10px">
        <div>
          <div class="font-num ${s.in_alert ? 'text-danger' : ''}">${formatQuantity(s.on_hand)} ${escapeHtml(s.unit || '')}</div>
          <div class="list-item-sub">${formatCurrency(s.inventory_value)}</div>
        </div>
        <button class="btn btn-sm btn-outline" data-adjust-id="${s.id}" data-adjust-name="${escapeHtml(s.name)}" style="padding:0 8px;height:28px;font-size:11px">调整</button>
      </div>
    </div>
  `).join('');
}

function renderMovementList(container, movements) {
  const el = container.querySelector('#movement-list');
  if (!movements.length) {
    el.innerHTML = '<div class="empty-hint">暂无流水记录</div>';
    return;
  }

  el.innerHTML = movements.map(m => `
    <div class="list-item">
      <div class="list-item-main">
        <div class="list-item-title">${typeTag(m.movement_type)} ${escapeHtml(m.product_name)}</div>
        <div class="list-item-desc">${escapeHtml(m.doc_no)} · ${formatDateTime(m.created_at)}</div>
      </div>
      <div class="list-item-right">
        <span class="font-num ${m.quantity_delta > 0 ? 'text-success' : 'text-danger'}">${signedQuantity(m.quantity_delta)}</span>
      </div>
    </div>
  `).join('');
}

function bindEvents(container) {
  const searchInput = container.querySelector('#inv-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      renderStockList(container, getState().stock);
    });
  }

  container.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      filter = btn.dataset.filter;
      container.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
      renderStockList(container, getState().stock);
    });
  });

  // Adjust stock button — delegate on stock-list
  container.querySelector('#stock-list').addEventListener('click', (e) => {
    const adjustBtn = e.target.closest('[data-adjust-id]');
    if (!adjustBtn) return;
    e.stopPropagation();
    const productId = Number(adjustBtn.dataset.adjustId);
    openAdjustmentModal(productId);
  });
}

export function unmount() {}

