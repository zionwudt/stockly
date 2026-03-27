import { getState } from '../store.js';
import { api } from '../api.js';
import { escapeHtml, toast } from '../utils.js';

export function mount(container) {
  const { products, customers } = getState();

  container.innerHTML = `
    <div class="page-section">
      <form id="sale-form" class="form-card">
        <div class="form-field">
          <label>客户</label>
          <select name="partner_id" required>
            <option value="">请选择客户</option>
            ${customers.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>

        <div class="section-header">
          <h3>商品明细</h3>
          <button type="button" class="btn btn-small btn-outline" id="add-row-btn">添加商品</button>
        </div>

        <div id="line-items" class="line-items">
          ${renderLineItem(products)}
        </div>

        <div class="form-field">
          <label>备注</label>
          <textarea name="note" rows="2" placeholder="订单号、发货说明"></textarea>
        </div>

        <button type="submit" class="btn btn-primary btn-block">提交销售出库</button>
      </form>
    </div>
  `;

  bindEvents(container, products);
}

function renderLineItem(products) {
  return `
    <div class="line-item" data-kind="sale">
      <div class="form-row form-row-3">
        <div class="form-field">
          <label>商品</label>
          <select name="product_id" required>
            <option value="">选择商品</option>
            ${products.map(p => `<option value="${p.id}" data-sale-price="${p.sale_price}">${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label>数量</label>
          <input name="quantity" type="number" min="0.01" step="0.01" placeholder="0" required>
        </div>
        <div class="form-field">
          <label>单价</label>
          <input name="unit_price" type="number" min="0" step="0.01" placeholder="0" required>
        </div>
      </div>
      <button type="button" class="line-item-remove" data-remove-row>删除</button>
    </div>
  `;
}

function bindEvents(container, products) {
  container.querySelector('#add-row-btn').addEventListener('click', () => {
    container.querySelector('#line-items').insertAdjacentHTML('beforeend', renderLineItem(products));
  });

  container.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-remove-row]');
    if (removeBtn) {
      const items = container.querySelectorAll('.line-item');
      if (items.length > 1) removeBtn.closest('.line-item').remove();
    }
  });

  container.addEventListener('change', (e) => {
    const select = e.target.closest('.line-item select[name="product_id"]');
    if (select) {
      const row = select.closest('.line-item');
      const option = select.selectedOptions[0];
      const price = option?.dataset.salePrice || '0';
      row.querySelector('input[name="unit_price"]').value = Number(price).toFixed(2);
    }
  });

  container.querySelector('#sale-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const rows = Array.from(form.querySelectorAll('.line-item'));
    const payload = {
      partner_id: Number(form.elements.partner_id.value),
      note: form.elements.note.value.trim(),
      items: rows.map(row => ({
        product_id: Number(row.querySelector('select[name="product_id"]').value),
        quantity: Number(row.querySelector('input[name="quantity"]').value),
        unit_price: Number(row.querySelector('input[name="unit_price"]').value),
      })),
    };

    try {
      await api.createSale(payload);
      window.__app.navigate('/documents');
      await window.__app.refreshData('销售出库完成');
    } catch (err) {
      toast(err.message || '提交销售单失败', 'error');
    }
  });
}

export function unmount() {}
