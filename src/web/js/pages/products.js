import { getState } from '../store.js';
import { api } from '../api.js';
import { openModal, closeModal, openConfirm } from '../router.js';
import {
  formatCurrency,
  formatQuantity,
  escapeHtml,
  toast,
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

  container.querySelector('#product-create-btn').addEventListener('click', () => {
    openProductModal();
  });

  container.querySelector('#product-list').addEventListener('click', (e) => {
    const item = e.target.closest('.list-item');
    if (!item) return;
    const product = products.find(p => String(p.id) === item.dataset.id);
    if (product) openProductModal(product);
  });
}

function renderList(container, products) {
  const el = container.querySelector('#product-list');
  if (!products.length) {
    el.innerHTML = '<div class="empty-hint">暂无商品，点击右下角新增</div>';
    return;
  }

  el.innerHTML = products.map((product) => `
    <div class="list-item" data-id="${product.id}">
      <div class="list-item-main">
        <div class="list-item-title">${escapeHtml(product.name)}</div>
        <div class="list-item-desc">
          ${escapeHtml(product.sku)}${product.category ? ' · ' + escapeHtml(product.category) : ''} · ${escapeHtml(product.unit || '件')}
        </div>
        <div class="list-item-desc">
          采购价 ${formatCurrency(product.purchase_price)} · 销售价 ${formatCurrency(product.sale_price)}
        </div>
      </div>
      <div class="list-item-right">
        <div class="font-num ${isLowStock(product) ? 'text-danger' : ''}">${formatQuantity(product.on_hand || 0)}</div>
        <div class="list-item-sub">库存</div>
      </div>
    </div>
  `).join('');
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
      ${isEdit ? '<button type="button" class="btn btn-danger btn-block btn-sm" id="modal-delete-product" style="margin-top:8px">删除商品</button>' : ''}
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

  if (isEdit) {
    requestAnimationFrame(() => {
      document.getElementById('modal-delete-product')?.addEventListener('click', () => {
        closeModal();
        openConfirm('删除商品', `确定要删除商品"${product.name}"吗？`, async () => {
          try {
            await api.deleteProduct(product.id);
            await window.__app.refreshData('商品已删除');
          } catch (err) {
            toast(err.message || '删除失败', 'error');
          }
        });
      });
    });
  }
}

function isLowStock(product) {
  return (product.on_hand || 0) <= (product.safety_stock || 0) && (product.safety_stock || 0) > 0;
}

function fv(value) { return escapeHtml(String(value ?? '')); }
function nv(value, fallback) { return value ?? fallback; }

export function unmount() {}

