import { getState } from '../store.js';
import { api } from '../api.js';
import { formatCurrency, formatDateTime, formatQuantity, typeTag, escapeHtml, toast } from '../utils.js';
import { openConfirm, openModal, closeModal, setHeaderAction } from '../router.js';
import { openPurchaseModal } from './purchase.js';
import { openSaleModal } from './sale.js';

const PAGE_SIZE = 50;

let docFilter = 'all';
let docItemKeyword = '';
let dateFrom = '';
let dateTo = '';
let visibleCount = PAGE_SIZE;

export function mount(container) {
  visibleCount = PAGE_SIZE;
  render(container);
  bindEvents(container);

  // Header add button
  setHeaderAction(
    `<button class="header-add-btn" id="header-new-doc-btn" aria-label="新建单据">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>`,
    () => openNewDocModal()
  );
}

function render(container) {
  const { documents } = getState();

  container.innerHTML = `
    <div class="page-section">
      <div class="doc-filter-bar">
        <div class="filter-row doc-filter-chip-row">
          <button class="filter-btn ${docFilter === 'all' ? 'active' : ''}" data-filter="all">全部</button>
          <button class="filter-btn ${docFilter === 'purchase' ? 'active' : ''}" data-filter="purchase">采购</button>
          <button class="filter-btn ${docFilter === 'sale' ? 'active' : ''}" data-filter="sale">销售</button>
          <button class="filter-btn ${docFilter === 'adjustment' ? 'active' : ''}" data-filter="adjustment">调整</button>
        </div>
        <div class="doc-filter-controls">
          <div class="date-range-row doc-filter-range">
            <input type="date" class="date-input" id="date-from" value="${dateFrom}" placeholder="开始日期">
            <span class="date-sep">—</span>
            <input type="date" class="date-input" id="date-to" value="${dateTo}" placeholder="结束日期">
            <button class="date-clear-btn" id="date-clear" title="清除">✕</button>
          </div>
          <div class="search-bar doc-filter-search">
            <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input id="doc-item-search" type="text" placeholder="按商品名搜索" value="${escapeHtml(docItemKeyword)}" />
          </div>
        </div>
      </div>
    </div>
    <div class="page-section" style="padding-top:0;">
      <div id="doc-list"></div>
      <div id="doc-load-more" class="load-more-hint" style="display:none;">下拉加载更多</div>
    </div>
  `;

  renderDocList(container, documents);
}

function getFiltered(docs) {
  let filtered = docs;
  if (docFilter !== 'all') {
    filtered = filtered.filter(d => d.doc_type === docFilter);
  }
  if (dateFrom) {
    filtered = filtered.filter(d => d.created_at && d.created_at.slice(0, 10) >= dateFrom);
  }
  if (dateTo) {
    filtered = filtered.filter(d => d.created_at && d.created_at.slice(0, 10) <= dateTo);
  }
  const keyword = docItemKeyword.trim().toLowerCase();
  if (keyword) {
    filtered = filtered.filter(doc => (doc.items || []).some(item =>
      String(item.product_name || '').toLowerCase().includes(keyword)
    ));
  }
  return filtered;
}

function renderDocList(container, docs) {
  const filtered = getFiltered(docs);
  const el = container.querySelector('#doc-list');
  const loadMoreEl = container.querySelector('#doc-load-more');
  if (!filtered.length) {
    el.innerHTML = '<div class="empty-hint">暂无单据</div>';
    if (loadMoreEl) loadMoreEl.style.display = 'none';
    return;
  }

  const slice = filtered.slice(0, visibleCount);
  el.innerHTML = slice.map(d => renderDocCard(d)).join('');

  if (loadMoreEl) {
    loadMoreEl.style.display = filtered.length > visibleCount ? 'block' : 'none';
  }
}

function renderDocCard(d) {
  const isVoided = d.status === 'void';
  const actionLabel = isVoided ? '恢复' : '作废';
  const actionType = isVoided ? 'restore' : 'void';
  const actionClass = isVoided ? 'btn-success' : 'btn-warning';

  return `
    <div class="doc-card ${isVoided ? 'doc-card-voided' : ''}" data-doc-id="${d.id}">
      <div class="doc-card-head">
        <div class="doc-card-type-no">
          ${typeTag(d.doc_type)}
          <span class="doc-card-no">${escapeHtml(d.doc_no)}</span>
        </div>
        <span class="${isVoided ? 'badge-void' : 'badge-active'}">${isVoided ? '已作废' : '正常'}</span>
      </div>
      <div class="doc-card-body">
        <div class="doc-card-partner">${escapeHtml(d.partner_name || '—')}</div>
        <div class="doc-card-amount font-num">${formatCurrency(d.total_amount)}</div>
      </div>
      ${renderItemSummary(d.items)}
      ${d.note ? `<div class="doc-card-note">${escapeHtml(d.note)}</div>` : ''}
      <div class="doc-card-foot">
        <span class="doc-card-time">${formatDateTime(d.created_at)}</span>
        <button class="item-action-btn ${actionClass}" data-doc-id="${d.id}" data-doc-action="${actionType}">
          ${actionLabel}
        </button>
      </div>
    </div>
  `;
}

function renderItemSummary(items) {
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) return '<div class="doc-card-items-empty">暂无明细</div>';
  return `
    <div class="doc-card-items">
      ${safeItems.map(item => `
        <div class="doc-card-item-row">
          <span class="doc-card-item-name">${escapeHtml(item.product_name || '未命名商品')}</span>
          <span class="doc-card-item-meta">${formatQuantity(item.quantity || 0)} × ${formatCurrency(item.unit_price || 0)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function bindEvents(container) {
  container.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      docFilter = btn.dataset.filter;
      visibleCount = PAGE_SIZE;
      container.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === docFilter));
      renderDocList(container, getState().documents);
    });
  });

  const searchInput = container.querySelector('#doc-item-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      docItemKeyword = searchInput.value || '';
      visibleCount = PAGE_SIZE;
      renderDocList(container, getState().documents);
    });
  }

  const dateFromInput = container.querySelector('#date-from');
  const dateToInput = container.querySelector('#date-to');
  if (dateFromInput) {
    dateFromInput.addEventListener('change', () => {
      dateFrom = dateFromInput.value;
      visibleCount = PAGE_SIZE;
      renderDocList(container, getState().documents);
    });
  }
  if (dateToInput) {
    dateToInput.addEventListener('change', () => {
      dateTo = dateToInput.value;
      visibleCount = PAGE_SIZE;
      renderDocList(container, getState().documents);
    });
  }
  const clearBtn = container.querySelector('#date-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      dateFrom = ''; dateTo = '';
      if (dateFromInput) dateFromInput.value = '';
      if (dateToInput) dateToInput.value = '';
      visibleCount = PAGE_SIZE;
      renderDocList(container, getState().documents);
    });
  }

  // Infinite scroll / load more
  const loadMoreEl = container.querySelector('#doc-load-more');
  const scroller = document.querySelector('.app-content') || window;
  const onScroll = () => {
    const scrollEl = scroller === window ? document.documentElement : scroller;
    const distFromBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
    if (distFromBottom < 120 && loadMoreEl && loadMoreEl.style.display !== 'none') {
      visibleCount += PAGE_SIZE;
      renderDocList(container, getState().documents);
    }
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });
  container._docScrollCleanup = () => scroller.removeEventListener('scroll', onScroll);

  const docList = container.querySelector('#doc-list');
  if (!docList) return;

  docList.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('.item-action-btn[data-doc-action]');
    if (!actionBtn) return;

    const docId = Number(actionBtn.dataset.docId);
    const actionType = actionBtn.dataset.docAction;
    if (!docId || !actionType) return;

    if (actionType === 'void') {
      openConfirm('作废单据', '确定要作废此单据吗？作废后将冲销库存。', async () => {
        try {
          await api.voidDocument(docId);
          await window.__app.refreshData('单据已作废');
        } catch (err) {
          toast((err && err.message ? err.message : '作废单据失败') + (err && err.stack ? ('\n' + err.stack) : ''), 'error');
        }
      });
      return;
    }

    openConfirm('恢复单据', '确定要恢复此单据吗？恢复后会重新计入库存。', async () => {
      try {
        await api.restoreDocument(docId);
        await window.__app.refreshData('单据已恢复');
      } catch (err) {
        toast((err && err.message ? err.message : '恢复单据失败') + (err && err.stack ? ('\n' + err.stack) : ''), 'error');
      }
    });
  });
}

function openNewDocModal() {
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
}

export function unmount() {
  // Clean up scroll listener if any
  const container = document.getElementById('page');
  if (container && container._docScrollCleanup) {
    container._docScrollCleanup();
    delete container._docScrollCleanup;
  }
}
