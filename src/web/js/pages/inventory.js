import { getState } from '../store.js';
import { formatCurrency, formatQuantity, signedQuantity, formatDateTime, typeLabel, escapeHtml } from '../utils.js';
import { openModal, closeModal } from '../router.js';
import { openAdjustmentModal } from './adjustment.js';

let searchQuery = '';
let filter = 'all';

export function mount(container) {
  const { stock } = getState();

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
  `;

  renderStockList(container, stock);
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
    <div class="list-item" data-stock-id="${s.id}">
      <div class="list-item-body">
        <div class="list-item-main">
          <div class="list-item-title">
            ${s.in_alert ? '<span class="dot dot-danger"></span>' : ''}
            ${escapeHtml(s.name)}
          </div>
          <div class="list-item-desc">${escapeHtml(s.sku)}${s.category ? ' · ' + escapeHtml(s.category) : ''}</div>
        </div>
        <div class="list-item-right">
          <div class="font-num ${s.in_alert ? 'text-danger' : ''}">${formatQuantity(s.on_hand)} ${escapeHtml(s.unit || '')}</div>
          <div class="list-item-sub">${formatCurrency(s.inventory_value)}</div>
        </div>
      </div>
      <div class="list-item-footer">
        <button class="item-action-btn" data-stock-action="detail" data-stock-id="${s.id}">查看详情</button>
        <button class="item-action-btn btn-accent" data-stock-action="adjust" data-stock-id="${s.id}">调整库存</button>
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

  const stockList = container.querySelector('#stock-list');
  if (!stockList) return;

  stockList.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('.item-action-btn[data-stock-action]');
    if (!actionBtn) return;

    const productId = Number(actionBtn.dataset.stockId);
    if (!productId) return;

    if (actionBtn.dataset.stockAction === 'detail') {
      const product = getState().stock.find(s => Number(s.id) === productId);
      if (product) openStockMovementModal(product);
    } else if (actionBtn.dataset.stockAction === 'adjust') {
      openAdjustmentModal(productId);
    }
  });
}

function openStockMovementModal(stockItem) {
  const movements = (getState().movements || [])
    .filter(m => Number(m.product_id) === Number(stockItem.id))
    .slice(0, 20);

  const movementRows = movements.length ? movements.map(m => `
    <div class="list-item">
      <div class="list-item-main">
        <div class="list-item-title">${movementTag(m.movement_type)} ${escapeHtml(m.product_name || stockItem.name)}</div>
        <div class="list-item-desc">${escapeHtml(m.doc_no || '无单号')} · ${formatDateTime(m.created_at)}</div>
        ${m.note ? `<div class="list-item-note">${escapeHtml(m.note)}</div>` : ''}
      </div>
      <div class="list-item-right">
        <span class="font-num ${m.quantity_delta > 0 ? 'text-success' : 'text-danger'}">${signedQuantity(m.quantity_delta)}</span>
      </div>
    </div>
  `).join('') : '<div class="empty-hint">暂无该商品流水记录</div>';

  const body = `
    <div class="detail-sheet">
      <div class="detail-head">
        <div class="detail-doc-no">${escapeHtml(stockItem.name)}</div>
        <span class="detail-status ${stockItem.in_alert ? 'is-void' : 'is-active'}">库存 ${formatQuantity(stockItem.on_hand)}</span>
      </div>
      <div class="detail-grid">
        ${detailRow('SKU', escapeHtml(stockItem.sku || '-'))}
        ${detailRow('分类', escapeHtml(stockItem.category || '未分类'))}
        ${detailRow('单位', escapeHtml(stockItem.unit || '-'))}
        ${detailRow('库存金额', `<span class="font-num">${formatCurrency(stockItem.inventory_value || 0)}</span>`)}
      </div>
      <div class="detail-section-title">最近流水</div>
      <div class="card-list detail-list">${movementRows}</div>
    </div>
  `;

  openModal('商品流水', body, () => closeModal(), { hideCancel: true, okText: '关闭' });
}

function movementTag(type) {
  const normalized = String(type || '');
  const baseType = normalized.replace(/_(void|restore)$/, '');
  const cls = {
    purchase: 'tag-blue',
    sale: 'tag-green',
    adjustment: 'tag-orange',
  }[baseType] || '';
  return `<span class="tag ${cls}">${escapeHtml(typeLabel(normalized))}</span>`;
}

function detailRow(label, value) {
  return `
    <div class="detail-row">
      <span class="detail-label">${label}</span>
      <span class="detail-value">${value}</span>
    </div>
  `;
}

export function unmount() {}
