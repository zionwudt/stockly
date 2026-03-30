import { getState } from '../store.js';
import { api } from '../api.js';
import { openModal, closeModal, openConfirm, setHeaderAction } from '../router.js';
import { escapeHtml, toast } from '../utils.js';

const PAGE_SIZE = 50;
let visibleCount = PAGE_SIZE;
let keyword = '';

export function mount(container) {
  visibleCount = PAGE_SIZE;
  keyword = '';
  render(container);
  bindEvents(container);

  setHeaderAction(
    `<button class="header-add-btn" id="header-customer-add-btn" aria-label="新增客户">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>`,
    () => openCustomerModal()
  );
}

function render(container) {
  const { customers } = getState();

  container.innerHTML = `
    <div class="page-section">
      <div class="search-bar">
        <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input id="customer-search" type="text" placeholder="搜索客户" value="${escapeHtml(keyword)}">
      </div>
    </div>
    <div class="page-section" style="padding-top:0;">
      <div id="customer-list"></div>
      <div id="customer-load-more" class="load-more-hint" style="display:none;">下拉加载更多</div>
    </div>
  `;

  renderList(container, customers);
  bindScrollEvents(container);
}

function getFiltered(customers) {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return customers;
  return customers.filter(c =>
    String(c.name || '').toLowerCase().includes(kw) ||
    String(c.contact || '').toLowerCase().includes(kw) ||
    String(c.phone || '').toLowerCase().includes(kw)
  );
}

function renderList(container, customers) {
  const filtered = getFiltered(customers);
  const el = container.querySelector('#customer-list');
  const loadMoreEl = container.querySelector('#customer-load-more');
  if (!filtered.length) {
    el.innerHTML = '<div class="empty-hint">暂无客户</div>';
    if (loadMoreEl) loadMoreEl.style.display = 'none';
    return;
  }

  const slice = filtered.slice(0, visibleCount);
  el.innerHTML = slice.map(c => renderCustomerCard(c)).join('');
  if (loadMoreEl) {
    loadMoreEl.style.display = filtered.length > visibleCount ? 'block' : 'none';
  }
}

function renderCustomerCard(c) {
  const initials = (c.name || '客')[0];
  return `
    <div class="item-card" data-id="${c.id}">
      <div class="item-card-main">
        <div class="item-card-header">
          <div class="item-card-avatar item-card-avatar-orange">${escapeHtml(initials)}</div>
          <div class="item-card-info">
            <div class="item-card-title">${escapeHtml(c.name)}</div>
            ${(c.contact || c.phone) ? `<div class="item-card-meta">${[c.contact, c.phone].filter(Boolean).map(escapeHtml).join(' · ')}</div>` : ''}
          </div>
        </div>
        ${c.note ? `<div class="item-card-note">${escapeHtml(c.note)}</div>` : ''}
      </div>
      <div class="item-card-footer">
        <button class="item-action-btn" data-edit-id="${c.id}">编辑</button>
        <button class="item-action-btn btn-danger" data-delete-id="${c.id}" data-delete-name="${escapeHtml(c.name)}">删除</button>
      </div>
    </div>
  `;
}

function bindEvents(container) {
  const searchInput = container.querySelector('#customer-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      keyword = searchInput.value || '';
      visibleCount = PAGE_SIZE;
      renderList(container, getState().customers);
    });
  }

  const customerList = container.querySelector('#customer-list');
  if (!customerList) return;

  customerList.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.item-action-btn[data-edit-id]');
    if (editBtn) {
      const customer = getState().customers.find(c => String(c.id) === editBtn.dataset.editId);
      if (customer) openCustomerModal(customer);
      return;
    }

    const deleteBtn = e.target.closest('.item-action-btn[data-delete-id]');
    if (deleteBtn) {
      const id = deleteBtn.dataset.deleteId;
      const name = deleteBtn.dataset.deleteName || '';
      openConfirm('删除客户', `确定要删除客户"${name}"吗？`, async () => {
        try {
          await api.deleteCustomer(Number(id));
          await window.__app.refreshData('客户已删除');
        } catch (err) {
          toast(err.message || '删除失败', 'error');
        }
      });
    }
  });
}

function bindScrollEvents(container) {
  const scroller = document.querySelector('.app-content') || window;
  const loadMoreEl = container.querySelector('#customer-load-more');
  const onScroll = () => {
    const scrollEl = scroller === window ? document.documentElement : scroller;
    const distFromBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
    if (distFromBottom < 120 && loadMoreEl && loadMoreEl.style.display !== 'none') {
      visibleCount += PAGE_SIZE;
      renderList(container, getState().customers);
    }
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });
  container._customerScrollCleanup = () => scroller.removeEventListener('scroll', onScroll);
}

function openCustomerModal(customer = null) {
  const isEdit = !!customer;
  const title = isEdit ? '编辑客户' : '新增客户';
  const c = customer || {};

  const body = `
    <form id="modal-customer-form">
      <div class="form-field">
        <label>客户名称</label>
        <input name="name" class="form-input" type="text" placeholder="客户名称" value="${escapeHtml(c.name || '')}" required>
      </div>
      <div class="form-field">
        <label>联系人</label>
        <input name="contact" class="form-input" type="text" placeholder="联系人" value="${escapeHtml(c.contact || '')}">
      </div>
      <div class="form-field">
        <label>电话</label>
        <input name="phone" class="form-input" type="text" placeholder="联系电话" value="${escapeHtml(c.phone || '')}">
      </div>
      <div class="form-field">
        <label>备注</label>
        <input name="note" class="form-input" type="text" placeholder="渠道、结算方式" value="${escapeHtml(c.note || '')}">
      </div>
    </form>
  `;

  openModal(title, body, async () => {
    const form = document.getElementById('modal-customer-form');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const data = Object.fromEntries(new FormData(form));
    try {
      if (isEdit) {
        await api.updateCustomer(customer.id, data);
      } else {
        await api.createCustomer(data);
      }
      closeModal();
      await window.__app.refreshData(isEdit ? '客户已更新' : '客户已创建');
    } catch (err) {
      toast(err.message || '操作失败', 'error');
    }
  });
}

export function unmount() {
  const container = document.getElementById('page');
  if (container && container._customerScrollCleanup) {
    container._customerScrollCleanup();
    delete container._customerScrollCleanup;
  }
}

