import { getState } from '../store.js';
import { api } from '../api.js';
import { openModal, closeModal, openConfirm, setHeaderAction } from '../router.js';
import {
  formatCurrency,
  formatQuantity,
  escapeHtml,
  toast,
} from '../utils.js';

const PAGE_SIZE = 50;
let visibleCount = PAGE_SIZE;
let keyword = '';

export function mount(container) {
  visibleCount = PAGE_SIZE;
  keyword = '';
  render(container);
  bindEvents(container);

  setHeaderAction(
    `<button class="header-add-btn" id="header-product-add-btn" aria-label="新增商品">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>`,
    () => openProductModal()
  );
}

function render(container) {
  const { products } = getState();

  container.innerHTML = `
    <div class="page-section">
      <div class="search-bar">
        <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input id="product-search" type="text" placeholder="搜索商品名称或SKU" value="${escapeHtml(keyword)}">
      </div>
    </div>
    <div class="page-section" style="padding-top:0;">
      <div id="product-list"></div>
      <div id="product-load-more" class="load-more-hint" style="display:none;">下拉加载更多</div>
    </div>
  `;

  renderList(container, products);
  bindScrollEvents(container, products);
}

function getFiltered(products) {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return products;
  return products.filter(p =>
    String(p.name || '').toLowerCase().includes(kw) ||
    String(p.sku || '').toLowerCase().includes(kw)
  );
}

function renderList(container, products) {
  const filtered = getFiltered(products);
  const el = container.querySelector('#product-list');
  const loadMoreEl = container.querySelector('#product-load-more');
  if (!filtered.length) {
    el.innerHTML = '<div class="empty-hint">暂无商品</div>';
    if (loadMoreEl) loadMoreEl.style.display = 'none';
    return;
  }

  const slice = filtered.slice(0, visibleCount);
  el.innerHTML = slice.map(p => renderProductCard(p)).join('');
  if (loadMoreEl) {
    loadMoreEl.style.display = filtered.length > visibleCount ? 'block' : 'none';
  }
}

function renderProductCard(p) {
  const low = isLowStock(p);
  return `
    <div class="item-card" data-id="${p.id}">
      <div class="item-card-main">
        <div class="item-card-header">
          <span class="item-card-title">${escapeHtml(p.name)}</span>
          <div class="item-card-stock ${low ? 'item-card-stock-low' : ''}">
            <span class="font-num">${formatQuantity(p.on_hand || 0)}</span>
            <span class="item-card-stock-label">库存</span>
          </div>
        </div>
        <div class="item-card-tags">
          <span class="item-tag">${escapeHtml(p.sku)}</span>
          ${p.category ? `<span class="item-tag">${escapeHtml(p.category)}</span>` : ''}
          <span class="item-tag">${escapeHtml(p.unit || '件')}</span>
        </div>
        <div class="item-card-prices">
          <span class="item-price-label">采 <span class="item-price-val">${formatCurrency(p.purchase_price)}</span></span>
          <span class="item-price-sep">·</span>
          <span class="item-price-label">售 <span class="item-price-val">${formatCurrency(p.sale_price)}</span></span>
          ${p.safety_stock ? `<span class="item-price-sep">·</span><span class="item-price-label ${low ? 'text-danger' : ''}">安全库存 ${formatQuantity(p.safety_stock)}</span>` : ''}
        </div>
      </div>
      <div class="item-card-footer">
        <button class="item-action-btn" data-edit-id="${p.id}">编辑</button>
        <button class="item-action-btn btn-danger" data-delete-id="${p.id}" data-delete-name="${escapeHtml(p.name)}">删除</button>
      </div>
    </div>
  `;
}

function bindEvents(container) {
  const searchInput = container.querySelector('#product-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      keyword = searchInput.value || '';
      visibleCount = PAGE_SIZE;
      renderList(container, getState().products);
    });
  }

  const productList = container.querySelector('#product-list');
  if (!productList) return;

  productList.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.item-action-btn[data-edit-id]');
    if (editBtn) {
      const product = getState().products.find(p => String(p.id) === editBtn.dataset.editId);
      if (product) openProductModal(product);
      return;
    }

    const deleteBtn = e.target.closest('.item-action-btn[data-delete-id]');
    if (deleteBtn) {
      const id = deleteBtn.dataset.deleteId;
      const name = deleteBtn.dataset.deleteName || '';
      openConfirm('删除商品', `确定要删除商品"${name}"吗？`, async () => {
        try {
          await api.deleteProduct(Number(id));
          await window.__app.refreshData('商品已删除');
        } catch (err) {
          toast(err.message || '删除失败', 'error');
        }
      });
    }
  });
}

function bindScrollEvents(container, products) {
  const scroller = document.querySelector('.app-content') || window;
  const loadMoreEl = container.querySelector('#product-load-more');
  const onScroll = () => {
    const scrollEl = scroller === window ? document.documentElement : scroller;
    const distFromBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
    if (distFromBottom < 120 && loadMoreEl && loadMoreEl.style.display !== 'none') {
      visibleCount += PAGE_SIZE;
      renderList(container, getState().products);
    }
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });
  container._productScrollCleanup = () => scroller.removeEventListener('scroll', onScroll);
}

function openProductModal(product = null) {
  const isEdit = !!product;
  const title = isEdit ? '编辑商品' : '新增商品';
  const p = product || {};

  const body = `
    <form id="modal-product-form">
      <div class="form-field">
        <label>SKU</label>
        <input name="sku" class="form-input" type="text" placeholder="JC-001" value="${fv(p.sku)}" required>
      </div>
      <div class="form-field">
        <label>商品名称</label>
        <input name="name" class="form-input" type="text" placeholder="商品名称" value="${fv(p.name)}" required>
      </div>
      <div class="form-field">
        <label>分类</label>
        <input name="category" class="form-input" type="text" placeholder="分类" value="${fv(p.category)}">
      </div>
      <div class="form-field">
        <label>单位</label>
        <input name="unit" class="form-input" type="text" value="${fv(p.unit || '件')}">
      </div>
      <div class="form-field">
        <label>安全库存</label>
        <input name="safety_stock" class="form-input" type="number" min="0" step="0.01" value="${nv(p.safety_stock, '0')}">
      </div>
      <div class="form-field">
        <label>采购价</label>
        <input name="purchase_price" class="form-input" type="number" min="0" step="0.01" value="${nv(p.purchase_price, '0')}">
      </div>
      <div class="form-field">
        <label>销售价</label>
        <input name="sale_price" class="form-input" type="number" min="0" step="0.01" value="${nv(p.sale_price, '0')}">
      </div>
    </form>
  `;

  openModal(title, body, async () => {
    const form = document.getElementById('modal-product-form');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const data = Object.fromEntries(new FormData(form));
    try {
      if (isEdit) {
        await api.updateProduct(product.id, data);
      } else {
        await api.createProduct(data);
      }
      closeModal();
      await window.__app.refreshData(isEdit ? '商品已更新' : '商品已创建');
    } catch (err) {
      toast(err.message || '操作失败', 'error');
    }
  });
}

function isLowStock(p) {
  return (p.on_hand || 0) <= (p.safety_stock || 0) && (p.safety_stock || 0) > 0;
}

function fv(value) { return escapeHtml(String(value ?? '')); }
function nv(value, fallback) { return value ?? fallback; }

export function unmount() {
  const container = document.getElementById('page');
  if (container && container._productScrollCleanup) {
    container._productScrollCleanup();
    delete container._productScrollCleanup;
  }
}

