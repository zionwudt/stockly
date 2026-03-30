import { getState } from '../store.js';
import { api } from '../api.js';
import { openModal, closeModal } from '../router.js';
import { escapeHtml, toast } from '../utils.js';

export function openSaleModal() {
  const { products, customers } = getState();

  const body = `
    <form id="modal-sale-form">
      <div class="form-field">
        <label>客户</label>
        <select name="partner_id" class="form-input" required>
          <option value="">请选择客户</option>
          ${customers.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:13px;font-weight:600;color:var(--text-2)">商品明细</span>
        <button type="button" class="btn btn-sm btn-outline" id="modal-sale-add-row">添加</button>
      </div>
      <div id="modal-sale-lines">
        ${saleLineHtml(products)}
      </div>
      <div class="form-field">
        <label>备注</label>
        <input name="note" class="form-input" type="text" placeholder="订单号、发货说明">
      </div>
    </form>
  `;

  openModal('销售出库', body, async () => {
    const form = document.getElementById('modal-sale-form');
    if (!form.checkValidity()) { form.reportValidity(); return; }
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
      closeModal();
      await window.__app.refreshData('销售出库完成');
    } catch (err) {
      toast(err.message || '提交销售单失败', 'error');
    }
  });

  requestAnimationFrame(() => {
    const container = document.getElementById('modal-sale-form');
    if (!container) return;

    container.querySelector('#modal-sale-add-row')?.addEventListener('click', () => {
      document.getElementById('modal-sale-lines').insertAdjacentHTML('beforeend', saleLineHtml(products));
    });

    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-row]');
      if (btn && container.querySelectorAll('.line-item').length > 1) {
        btn.closest('.line-item').remove();
      }
    });

    container.addEventListener('change', (e) => {
      const sel = e.target.closest('.line-item select[name="product_id"]');
      if (!sel) return;
      const row = sel.closest('.line-item');
      const price = sel.selectedOptions[0]?.dataset.salePrice || '0';
      row.querySelector('input[name="unit_price"]').value = Number(price).toFixed(2);
    });
  });
}

function saleLineHtml(products) {
  return `
    <div class="line-item">
      <div class="form-row form-row-3">
        <div class="form-field">
          <label>商品</label>
          <select name="product_id" class="form-input" required>
            <option value="">选择</option>
            ${products.map(p => `<option value="${p.id}" data-sale-price="${p.sale_price}">${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label>数量</label>
          <input name="quantity" class="form-input" type="number" min="0.01" step="0.01" placeholder="0" required>
        </div>
        <div class="form-field">
          <label>单价</label>
          <input name="unit_price" class="form-input" type="number" min="0" step="0.01" placeholder="0" required>
        </div>
      </div>
      <button type="button" class="line-item-remove" data-remove-row>删除</button>
    </div>
  `;
}

export function mount(container) {
  openSaleModal();
  container.innerHTML = '';
}
export function unmount() {}

