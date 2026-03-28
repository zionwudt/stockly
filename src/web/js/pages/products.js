import { getState, loadProducts } from '../store.js';
import { api } from '../api.js';
import { formatCurrency, formatQuantity, escapeHtml, toast } from '../utils.js';

export function mount(container) {
  const { products } = getState();

  container.innerHTML = `
    <div class="page-section">
      <div class="section-header">
        <h3>新增商品</h3>
      </div>
      <form id="product-form" class="form-card">
        <div class="form-row">
          <div class="form-field">
            <label>SKU</label>
            <input name="sku" type="text" placeholder="JC-001" required>
          </div>
          <div class="form-field">
            <label>商品名称</label>
            <input name="name" type="text" placeholder="商品名称" required>
          </div>
        </div>
        <div class="form-row form-row-3">
          <div class="form-field">
            <label>分类</label>
            <input name="category" type="text" placeholder="分类">
          </div>
          <div class="form-field">
            <label>单位</label>
            <input name="unit" type="text" value="件">
          </div>
          <div class="form-field">
            <label>安全库存</label>
            <input name="safety_stock" type="number" min="0" step="0.01" value="0">
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>采购价</label>
            <input name="purchase_price" type="number" min="0" step="0.01" value="0">
          </div>
          <div class="form-field">
            <label>销售价</label>
            <input name="sale_price" type="number" min="0" step="0.01" value="0">
          </div>
        </div>
        <button type="submit" class="btn btn-primary btn-block">保存商品</button>
      </form>
    </div>

    <div class="page-section">
      <div class="section-header">
        <h3>商品列表</h3>
        <span class="section-hint">${products.length} 项</span>
      </div>
      <div class="card-list" id="product-list"></div>
    </div>
  `;

  renderList(container, products);
  bindEvents(container);
}

function renderList(container, products) {
  const el = container.querySelector('#product-list');
  if (!products.length) {
    el.innerHTML = '<div class="empty-hint">暂无商品</div>';
    return;
  }

  el.innerHTML = products.map(p => `
    <div class="list-item" data-id="${p.id}">
      <div class="list-item-main">
        <div class="list-item-title">${escapeHtml(p.name)}</div>
        <div class="list-item-desc">
          ${escapeHtml(p.sku)}${p.category ? ' · ' + escapeHtml(p.category) : ''}
          · ${escapeHtml(p.unit || '件')}
        </div>
        <div class="list-item-desc">
          采购价 ${formatCurrency(p.purchase_price)} · 销售价 ${formatCurrency(p.sale_price)}
        </div>
      </div>
      <div class="list-item-right">
        <div class="font-num ${(p.on_hand || 0) <= (p.safety_stock || 0) && p.safety_stock > 0 ? 'text-danger' : ''}">${formatQuantity(p.on_hand || 0)}</div>
        <div class="list-item-sub">库存</div>
        <button class="btn-delete" data-id="${p.id}" title="删除">✕</button>
      </div>
    </div>
  `).join('');
}

function bindEvents(container) {
  container.querySelector('#product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    try {
      await api.createProduct(data);
      form.reset();
      form.elements.unit.value = '件';
      form.elements.purchase_price.value = '0';
      form.elements.sale_price.value = '0';
      form.elements.safety_stock.value = '0';
      await window.__app.refreshData('商品已创建');
    } catch (err) {
      toast(err.message || '新增商品失败', 'error');
    }
  });

  container.querySelector('#product-list').addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.btn-delete');
    if (!deleteBtn) return;

    const productId = deleteBtn.dataset.id;
    if (!confirm('确定要删除此商品吗？')) return;

    try {
      await api.deleteProduct(productId);
      await window.__app.refreshData('商品已删除');
    } catch (err) {
      toast(err.message || '删除商品失败', 'error');
    }
  });
}

export function unmount() {}
