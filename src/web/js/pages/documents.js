import { getState } from '../store.js';
import { api } from '../api.js';
import { formatCurrency, formatDateTime, formatQuantity, typeTag, escapeHtml, toast, bindSwipeActions } from '../utils.js';
import { openConfirm, openModal, closeModal } from '../router.js';
import { openPurchaseModal } from './purchase.js';
import { openSaleModal } from './sale.js';
import { openDocumentDetailModal } from './document-detail.js';

let docFilter = 'all';
let docItemKeyword = '';

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
      <div class="search-bar">
        <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input id="doc-item-search" type="text" placeholder="按商品名搜索单据" value="${escapeHtml(docItemKeyword)}" />
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
    filtered = filtered.filter(d => d.doc_type === docFilter);
  }
  const keyword = docItemKeyword.trim().toLowerCase();
  if (keyword) {
    filtered = filtered.filter(doc => (doc.items || []).some(item =>
      String(item.product_name || '').toLowerCase().includes(keyword)
    ));
  }

  const el = container.querySelector('#doc-list');
  if (!filtered.length) {
    el.innerHTML = '<div class="empty-hint">暂无单据</div>';
    return;
  }

  el.innerHTML = filtered.map(d => {
    const isVoided = d.status === 'void';
    const actionLabel = isVoided ? '恢复' : '作废';
    const actionType = isVoided ? 'restore' : 'void';
    const actionClass = isVoided ? 'swipe-action-success' : 'swipe-action-warning';

    return `
    <div class="swipe-wrap">
      <div class="swipe-content">
        <div class="list-item ${isVoided ? 'voided' : ''}" data-doc-id="${d.id}">
          <div class="list-item-main">
            <div class="list-item-title">
              ${typeTag(d.doc_type)}
              <span class="doc-no-text">${escapeHtml(d.doc_no)}</span>
              ${isVoided ? '<span class="badge-void">已作废</span>' : ''}
            </div>
            <div class="list-item-desc">
              ${escapeHtml(d.partner_name || '')}
              · ${formatDateTime(d.created_at)}
            </div>
            ${renderItemSummary(d.items)}
            ${d.note ? `<div class="list-item-note">${escapeHtml(d.note)}</div>` : ''}
          </div>
          <div class="list-item-right">
            <span class="font-num">${formatCurrency(d.total_amount)}</span>
            <div class="list-item-sub">${isVoided ? '已作废' : '正常'}</div>
          </div>
        </div>
      </div>
      <div class="swipe-action ${actionClass}" data-doc-id="${d.id}" data-doc-action="${actionType}">
        ${actionLabel}
      </div>
    </div>
  `;
  }).join('');
}

function renderItemSummary(items) {
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) return '<div class="list-item-note">暂无明细</div>';
  return `
    <div class="doc-items-preview">
      ${safeItems.map(item => `
        <div class="doc-item-line">
          <span class="doc-item-name">${escapeHtml(item.product_name || '未命名商品')}</span>
          <span class="doc-item-meta">数量 ${formatQuantity(item.quantity || 0)} · 单价 ${formatCurrency(item.unit_price || 0)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function bindEvents(container) {
  container.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      docFilter = btn.dataset.filter;
      container.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === docFilter));
      renderDocList(container, getState().documents);
    });
  });
  const searchInput = container.querySelector('#doc-item-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      docItemKeyword = searchInput.value || '';
      renderDocList(container, getState().documents);
    });
  }

  const fab = container.querySelector('#new-doc-btn');
  if (fab) {
    fab.addEventListener('click', () => {
      openModal('新建单据', `
        <div class="settings-card">
          <div class="settings-menu">
            <button class="settings-item profile-row" data-new-type="purchase">
              <div class="menu-icon menu-icon-blue" style="width:32px;height:32px;border-radius:8px">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
              </div>
              <span class="settings-text">采购入库</span>
              <div class="settings-arrow"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
            </button>
            <button class="settings-item profile-row" data-new-type="sale">
              <div class="menu-icon menu-icon-green" style="width:32px;height:32px;border-radius:8px">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/></svg>
              </div>
              <span class="settings-text">销售出库</span>
              <div class="settings-arrow"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
            </button>
          </div>
        </div>
      `, () => closeModal());

      requestAnimationFrame(() => {
        const body = document.getElementById('modal-body');
        if (!body) return;
        const modalMap = { purchase: openPurchaseModal, sale: openSaleModal };
        body.querySelectorAll('[data-new-type]').forEach(btn => {
          btn.addEventListener('click', () => {
            closeModal();
            const modalFn = modalMap[btn.dataset.newType];
            if (!modalFn) return;
            setTimeout(() => modalFn(), 300);
          });
        });
      });
    });
  }

  const docList = container.querySelector('#doc-list');
  if (!docList) return;

  docList.addEventListener('click', (e) => {
    if (e.target.closest('.swipe-action')) return;
    const item = e.target.closest('.list-item[data-doc-id]');
    if (!item) return;
    const doc = getState().documents.find(d => String(d.id) === item.dataset.docId);
    if (doc) {
      openDocumentDetailModal(doc, '单据详情');
    }
  });

  bindSwipeActions(docList, {
    onAction: (actionBtn) => {
      const docId = Number(actionBtn.dataset.docId);
      const actionType = actionBtn.dataset.docAction;
      if (!docId || !actionType) return;

      if (actionType === 'void') {
        openConfirm('作废单据', '确定要作废此单据吗？作废后将冲销库存。', async () => {
          try {
            await api.voidDocument(docId);
            await window.__app.refreshData('单据已作废');
          } catch (err) {
            toast(err.message || '作废单据失败', 'error');
          }
        });
        return;
      }

      openConfirm('恢复单据', '确定要恢复此单据吗？恢复后会重新计入库存。', async () => {
        try {
          await api.restoreDocument(docId);
          await window.__app.refreshData('单据已恢复');
        } catch (err) {
          toast(err.message || '恢复单据失败', 'error');
        }
      });
    },
  });
}

export function unmount() {}
