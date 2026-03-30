import { getState } from '../store.js';
import { api } from '../api.js';
import { openModal, closeModal, openConfirm } from '../router.js';
import {
  formatCurrency,
  formatQuantity,
  escapeHtml,
  toast,
  bindSwipeDelete,
} from '../utils.js';

export function mount(container) {
  const { products } = getState();

  container.innerHTML = `
    <div class="page-section">
      <div class="card-list" id="product-list"></div>
      <button type="button" class="btn-fab" id="product-create-btn">+</button>
    </div>
  `;

  renderList(container, products);
  bindEvents(container, products);
}

function renderList(container, products) {
  const el = container.querySelector('#product-list');
  if (!products.length) {
    el.innerHTML = '<div class="empty-hint">暂无商品，点击右下角新增</div>';
    return;
  }

  el.innerHTML = products.map((p) => `
    <div class="swipe-wrap">
      <div class="swipe-content">
        <div class="list-item" data-id="${p.id}">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(p.name)}</div>
            <div class="list-item-desc">
              ${escapeHtml(p.sku)}${p.category ? ' · ' + escapeHtml(p.category) : ''} · ${escapeHtml(p.unit || '件')}
            </div>
            <div class="list-item-desc">
              采购价 ${formatCurrency(p.purchase_price)} · 销售价 ${formatCurrency(p.sale_price)}
            </div>
          </div>
          <div class="list-item-right">
            <div class="font-num ${isLowStock(p) ? 'text-danger' : ''}">${formatQuantity(p.on_hand || 0)}</div>
            <div class="list-item-sub">库存</div>
          </div>
        </div>
      </div>
      <div class="swipe-action" data-delete-id="${p.id}" data-delete-name="${escapeHtml(p.name)}">删除</div>
    </div>
  `).join('');
}

function bindEvents(container, products) {
  container.querySelector('#product-create-btn').addEventListener('click', () => {
    openProductModal();
  });

  container.querySelector('#product-list').addEventListener('click', (e) => {
    if (e.target.closest('.swipe-action')) return;
    const item = e.target.closest('.list-item');
    if (!item) return;
    const product = products.find(p => String(p.id) === item.dataset.id);
    if (product) openProductModal(product);
  });

  bindSwipeDelete(container.querySelector('#product-list'), (id, name) => {
    openConfirm('删除商品', `确定要删除商品"${name}"吗？`, async () => {
      try {
        await api.deleteProduct(Number(id));
        await window.__app.refreshData('商品已删除');
      } catch (err) {
        toast(err.message || '删除失败', 'error');
      }
    });
  });
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

export function unmount() {}

