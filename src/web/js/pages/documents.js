import { getState, loadDocuments } from '../store.js';
import { api } from '../api.js';
import { formatCurrency, formatDateTime, typeTag, typeLabel, escapeHtml, toast } from '../utils.js';
import { openConfirm } from '../router.js';
import { openPurchaseModal } from './purchase.js';
import { openSaleModal } from './sale.js';
import { openAdjustmentModal } from './adjustment.js';

let docFilter = 'all';

export function mount(container) {
  render(container);
  bindEvents(container);
}

function render(container) {
  const { documents } = getState();

  container.innerHTML = `
    <div class="page-section">
      <div class="filter-row">
        <button class="filter-btn ${docFilter === 'all' ? 'active' : ''}" data-filter="all">全部</button>
        <button class="filter-btn ${docFilter === 'purchase' ? 'active' : ''}" data-filter="purchase">采购</button>
        <button class="filter-btn ${docFilter === 'sale' ? 'active' : ''}" data-filter="sale">销售</button>
        <button class="filter-btn ${docFilter === 'adjustment' ? 'active' : ''}" data-filter="adjustment">调整</button>
      </div>
    </div>

    <div class="page-section">
      <div class="card-list" id="doc-list"></div>
    </div>

    <div class="fab" id="new-doc-btn">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </div>
  `;

  renderDocList(container, documents);
}

function renderDocList(container, docs) {
  let filtered = docs;
  if (docFilter !== 'all') {
    filtered = docs.filter(d => d.doc_type === docFilter);
  }

  const el = container.querySelector('#doc-list');
  if (!filtered.length) {
    el.innerHTML = '<div class="empty-hint">暂无单据</div>';
    return;
  }

  el.innerHTML = filtered.map(d => `
    <div class="list-item ${d.status === 'void' ? 'voided' : ''}">
      <div class="list-item-main">
        <div class="list-item-title">
          ${typeTag(d.doc_type)} ${escapeHtml(d.doc_no)}
          ${d.status === 'void' ? '<span class="badge-void">已作废</span>' : ''}
        </div>
        <div class="list-item-desc">
          ${escapeHtml(d.partner_name || '')}
          · ${d.item_count || 0} 项
          · ${formatDateTime(d.created_at)}
        </div>
        ${d.note ? `<div class="list-item-note">${escapeHtml(d.note)}</div>` : ''}
      </div>
      <div class="list-item-right">
        <span class="font-num">${formatCurrency(d.total_amount)}</span>
        ${d.status === 'active' ? `<button class="btn-void" data-id="${d.id}" title="作废">作废</button>` : ''}
      </div>
    </div>
  `).join('');
}

function bindEvents(container) {
  container.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      docFilter = btn.dataset.filter;
      container.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === docFilter));
      renderDocList(container, getState().documents);
    });
  });

  const fab = container.querySelector('#new-doc-btn');
  if (fab) {
    fab.addEventListener('click', () => {
      const modalMap = { purchase: openPurchaseModal, sale: openSaleModal, adjustment: openAdjustmentModal };
      const type = docFilter !== 'all' ? docFilter : 'purchase';
      const fn = modalMap[type];
      if (fn) fn();
    });
  }

  container.querySelector('#doc-list').addEventListener('click', async (e) => {
    const voidBtn = e.target.closest('.btn-void');
    if (!voidBtn) return;

    const docId = voidBtn.dataset.id;
    openConfirm('作废单据', '确定要作废此单据吗？作废后将冲销库存。', async () => {
      try {
        await api.voidDocument(docId);
        await window.__app.refreshData('单据已作废');
      } catch (err) {
        toast(err.message || '作废单据失败', 'error');
      }
    });
  });
}

export function unmount() {}
