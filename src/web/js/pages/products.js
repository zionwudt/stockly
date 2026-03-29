import { getState } from '../store.js';
import { api } from '../api.js';
import {
  formatCurrency,
  formatDateTime,
  formatQuantity,
  escapeHtml,
  toast,
} from '../utils.js';

export function mount(container) {
  const { products } = getState();
  const route = getRouteState();

  if (route.path === '/products/create') {
    container.innerHTML = renderCreateView();
    bindCreateEvents(container);
    return;
  }

  if (route.path === '/products/detail') {
    const product = products.find((item) => String(item.id) === route.params.get('id'));
    container.innerHTML = renderDetailView(product);
    bindDetailEvents(container, product);
    return;
  }

  container.innerHTML = renderListView(products);
  renderList(container, products);
  bindListEvents(container);
}

function renderListView(products) {
  return `
    <div class="page-section">
      <div class="card-list" id="product-list"></div>
      <button type="button" class="btn-fab" id="product-create-btn">+</button>
    </div>
  `;
}

function renderCreateView() {
  return `
    <div class="page-section">
      <div class="section-header">
        <h3>新增商品</h3>
        <span class="section-hint">保存后返回列表</span>
      </div>
      ${renderProductForm({
        submitText: '保存商品',
        secondaryText: '返回列表',
        secondaryAction: 'back',
      })}
    </div>
  `;
}

function renderDetailView(product) {
  if (!product) {
    return `
      <div class="empty-state">
        <p>商品不存在或已被删除</p>
        <button type="button" class="btn btn-primary" id="product-missing-back">返回商品列表</button>
      </div>
    `;
  }

  return `
    <div class="page-section">
      <div class="section-header">
        <h3>商品详情</h3>
        <span class="section-hint">支持修改和删除</span>
      </div>
      ${renderProductForm({
        product,
        submitText: '保存修改',
        secondaryText: '删除商品',
        secondaryAction: 'delete',
      })}
    </div>
  `;
}

function renderProductForm({
  product = {},
  submitText,
  secondaryText,
  secondaryAction,
}) {
  return `
    <form id="product-form" class="form-card">
      <div class="form-field">
        <label>SKU</label>
        <input name="sku" type="text" placeholder="JC-001" value="${fieldValue(product.sku)}" required>
      </div>
      <div class="form-field">
        <label>商品名称</label>
        <input name="name" type="text" placeholder="商品名称" value="${fieldValue(product.name)}" required>
      </div>
      <div class="form-field">
        <label>分类</label>
        <input name="category" type="text" placeholder="分类" value="${fieldValue(product.category)}">
      </div>
      <div class="form-field">
        <label>单位</label>
        <input name="unit" type="text" value="${fieldValue(product.unit || '件')}">
      </div>
      <div class="form-field">
        <label>安全库存</label>
        <input name="safety_stock" type="number" min="0" step="0.01" value="${fieldValue(numberValue(product.safety_stock, '0'))}">
      </div>
      <div class="form-field">
        <label>采购价</label>
        <input name="purchase_price" type="number" min="0" step="0.01" value="${fieldValue(numberValue(product.purchase_price, '0'))}">
      </div>
      <div class="form-field">
        <label>销售价</label>
        <input name="sale_price" type="number" min="0" step="0.01" value="${fieldValue(numberValue(product.sale_price, '0'))}">
      </div>
      <div class="form-row">
        <button type="button" class="btn ${secondaryAction === 'delete' ? 'btn-danger' : 'btn-secondary'} btn-block" data-action="${secondaryAction}">
          ${secondaryText}
        </button>
        <button type="submit" class="btn btn-primary btn-block">${submitText}</button>
      </div>
    </form>
  `;
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
        <div class="list-item-sub">查看详情</div>
      </div>
    </div>
  `).join('');
}

function bindListEvents(container) {
  container.querySelector('#product-create-btn').addEventListener('click', () => {
    window.__app.navigate('/products/create');
  });

  container.querySelector('#product-list').addEventListener('click', (e) => {
    const item = e.target.closest('.list-item');
    if (!item) return;
    window.__app.navigate(`/products/detail?id=${item.dataset.id}`);
  });
}

function bindCreateEvents(container) {
  const form = container.querySelector('#product-form');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));

    try {
      await api.createProduct(data);
      window.__app.navigate('/products');
      await window.__app.refreshData('商品已创建');
    } catch (err) {
      toast(err.message || '新增商品失败', 'error');
    }
  });

  container.querySelector('[data-action="back"]').addEventListener('click', () => {
    window.__app.navigate('/products');
  });
}

function bindDetailEvents(container, product) {
  if (!product) {
    container.querySelector('#product-missing-back').addEventListener('click', () => {
      window.__app.navigate('/products');
    });
    return;
  }

  const form = container.querySelector('#product-form');
  const deleteBtn = container.querySelector('[data-action="delete"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));

    try {
      await api.updateProduct(product.id, data);
      await window.__app.refreshData('商品已更新');
    } catch (err) {
      toast(err.message || '更新商品失败', 'error');
    }
  });

  deleteBtn.addEventListener('click', async () => {
    if (!confirm(`确定要删除商品“${product.name}”吗？`)) return;

    try {
      await api.deleteProduct(product.id);
      window.__app.navigate('/products');
      await window.__app.refreshData('商品已删除');
    } catch (err) {
      toast(err.message || '删除商品失败', 'error');
    }
  });
}

function getRouteState() {
  const hash = window.location.hash.slice(1) || '/products';
  const [path, query = ''] = hash.split('?');
  return {
    path,
    params: new URLSearchParams(query),
  };
}

function isLowStock(product) {
  return (product.on_hand || 0) <= (product.safety_stock || 0) && (product.safety_stock || 0) > 0;
}

function fieldValue(value) {
  return escapeHtml(String(value ?? ''));
}

function numberValue(value, fallback) {
  return value ?? fallback;
}

export function unmount() {}
