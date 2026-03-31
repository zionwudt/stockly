import { getState } from '../store.js';
import { api } from '../api.js';
import { openModal, closeModal, openConfirm, setHeaderAction } from '../router.js';
import { escapeHtml, toast } from '../utils.js';

const PAGE_SIZE = 20;
let visibleCount = PAGE_SIZE;
let keyword = '';

export function mount(container) {
  visibleCount = PAGE_SIZE;
  keyword = '';
  render(container);
  bindEvents(container);

  setHeaderAction(
    `<button class="header-add-btn" id="header-supplier-add-btn" aria-label="新增供应商">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>`,
    () => openSupplierModal()
  );
}

function render(container) {
  const { suppliers } = getState();

  container.innerHTML = `
    <div class="page-section">
      <div class="search-bar">
        <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input id="supplier-search" type="text" placeholder="搜索供应商" value="${escapeHtml(keyword)}">
      </div>
    </div>
    <div class="page-section" style="padding-top:0;">
      <div id="supplier-list"></div>
      <div id="supplier-load-more" class="load-more-hint" style="display:none;">下拉加载更多</div>
    </div>
  `;

  renderList(container, suppliers);
  bindScrollEvents(container);
}

function getFiltered(suppliers) {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return suppliers;
  return suppliers.filter(s =>
    String(s.name || '').toLowerCase().includes(kw) ||
    String(s.contact || '').toLowerCase().includes(kw) ||
    String(s.phone || '').toLowerCase().includes(kw)
  );
}

function renderList(container, suppliers) {
  const filtered = getFiltered(suppliers);
  const el = container.querySelector('#supplier-list');
  const loadMoreEl = container.querySelector('#supplier-load-more');
  if (!filtered.length) {
    el.innerHTML = '<div class="empty-hint">暂无供应商</div>';
    if (loadMoreEl) loadMoreEl.style.display = 'none';
    return;
  }

  const slice = filtered.slice(0, visibleCount);
  el.innerHTML = slice.map(s => renderSupplierCard(s)).join('');
  if (loadMoreEl) {
    loadMoreEl.style.display = filtered.length > visibleCount ? 'block' : 'none';
  }
}

function renderSupplierCard(s) {
  const initials = (s.name || '供')[0];
  return `
    <div class="item-card" data-id="${s.id}">
      <div class="item-card-main">
        <div class="item-card-header">
          <div class="item-card-avatar item-card-avatar-green">${escapeHtml(initials)}</div>
          <div class="item-card-info">
            <div class="item-card-title">${escapeHtml(s.name)}</div>
            ${(s.contact || s.phone) ? `<div class="item-card-meta">${[s.contact, s.phone].filter(Boolean).map(escapeHtml).join(' · ')}</div>` : ''}
          </div>
        </div>
        ${s.note ? `<div class="item-card-note">${escapeHtml(s.note)}</div>` : ''}
      </div>
      <div class="item-card-footer">
        <button class="item-action-btn" data-edit-id="${s.id}">编辑</button>
        <button class="item-action-btn btn-danger" data-delete-id="${s.id}" data-delete-name="${escapeHtml(s.name)}">删除</button>
      </div>
    </div>
  `;
}

function bindEvents(container) {
  const searchInput = container.querySelector('#supplier-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      keyword = searchInput.value || '';
      visibleCount = PAGE_SIZE;
      renderList(container, getState().suppliers);
    });
  }

  const supplierList = container.querySelector('#supplier-list');
  if (!supplierList) return;

  supplierList.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.item-action-btn[data-edit-id]');
    if (editBtn) {
      const supplier = getState().suppliers.find(s => String(s.id) === editBtn.dataset.editId);
      if (supplier) openSupplierModal(supplier);
      return;
    }

    const deleteBtn = e.target.closest('.item-action-btn[data-delete-id]');
    if (deleteBtn) {
      const id = deleteBtn.dataset.deleteId;
      const name = deleteBtn.dataset.deleteName || '';
      openConfirm('删除供应商', `确定要删除供应商"${name}"吗？如存在关联单据将自动归档。`, async () => {
        try {
          const res = await api.deleteSupplier(Number(id));
          await window.__app.refreshData(res.message || '供应商已删除');
        } catch (err) {
          toast(err.message || '删除失败', 'error');
        }
      });
    }
  });
}

function bindScrollEvents(container) {
  const scroller = document.querySelector('.app-content') || window;
  const loadMoreEl = container.querySelector('#supplier-load-more');
  const onScroll = () => {
    const scrollEl = scroller === window ? document.documentElement : scroller;
    const distFromBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
    if (distFromBottom < 120 && loadMoreEl && loadMoreEl.style.display !== 'none') {
      visibleCount += PAGE_SIZE;
      renderList(container, getState().suppliers);
    }
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });
  container._supplierScrollCleanup = () => scroller.removeEventListener('scroll', onScroll);
}

function openSupplierModal(supplier = null) {
  const isEdit = !!supplier;
  const title = isEdit ? '编辑供应商' : '新增供应商';
  const s = supplier || {};

  const body = `
    <form id="modal-supplier-form">
      <div class="form-field">
        <label>供应商名称</label>
        <input name="name" class="form-input" type="text" placeholder="供应商名称" value="${escapeHtml(s.name || '')}" required>
      </div>
      <div class="form-field">
        <label>联系人</label>
        <input name="contact" class="form-input" type="text" placeholder="联系人" value="${escapeHtml(s.contact || '')}">
      </div>
      <div class="form-field">
        <label>电话</label>
        <input name="phone" class="form-input" type="text" placeholder="联系电话" value="${escapeHtml(s.phone || '')}">
      </div>
      <div class="form-field">
        <label>备注</label>
        <input name="note" class="form-input" type="text" placeholder="账期、供货特点" value="${escapeHtml(s.note || '')}">
      </div>
    </form>
  `;

  openModal(title, body, async () => {
    const form = document.getElementById('modal-supplier-form');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const data = Object.fromEntries(new FormData(form));
    try {
      if (isEdit) {
        await api.updateSupplier(supplier.id, data);
      } else {
        await api.createSupplier(data);
      }
      closeModal();
      await window.__app.refreshData(isEdit ? '供应商已更新' : '供应商已创建');
    } catch (err) {
      toast(err.message || '操作失败', 'error');
    }
  });
}

export function unmount() {
  const container = document.getElementById('page');
  if (container && container._supplierScrollCleanup) {
    container._supplierScrollCleanup();
    delete container._supplierScrollCleanup;
  }
}

