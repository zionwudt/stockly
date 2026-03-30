import { getState } from '../store.js';
import { api } from '../api.js';
import { openModal, closeModal } from '../router.js';
import { escapeHtml, toast } from '../utils.js';

export function openPurchaseModal() {
  const { products, suppliers } = getState();

  const body = `
    <form id="modal-purchase-form">
      <div class="form-field">
        <label>供应商</label>
        <select name="partner_id" class="form-input" required>
          ${suppliers.length === 1
            ? `<option value="${suppliers[0].id}" selected>${escapeHtml(suppliers[0].name)}</option>`
            : `<option value="">请选择供应商</option>${suppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}`
          }
        </select>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:13px;font-weight:600;color:var(--text-2)">商品明细</span>
        <button type="button" class="btn btn-sm btn-outline" id="modal-purchase-add-row">添加</button>
      </div>
      <div id="modal-purchase-lines">
        ${purchaseLineHtml(products)}
      </div>
      <div class="form-field">
        <label>备注</label>
        <input name="note" class="form-input" type="text" placeholder="批次、仓位、到货说明">
      </div>
    </form>
  `;

  openModal('采购入库', body, async () => {
    const form = document.getElementById('modal-purchase-form');
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
      await api.createPurchase(payload);
      closeModal();
      await window.__app.refreshData('采购入库完成');
    } catch (err) {
      toast(err.message || '提交采购单失败', 'error');
    }
  });

  requestAnimationFrame(() => {
    const container = document.getElementById('modal-purchase-form');
    if (!container) return;

    container.querySelector('#modal-purchase-add-row')?.addEventListener('click', () => {
      document.getElementById('modal-purchase-lines').insertAdjacentHTML('beforeend', purchaseLineHtml(products));
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
      const price = sel.selectedOptions[0]?.dataset.purchasePrice || '0';
      row.querySelector('input[name="unit_price"]').value = Number(price).toFixed(2);
    });
  });
}

function purchaseLineHtml(products) {
  const solo = products.length === 1 ? products[0] : null;
  const defaultPrice = solo ? Number(solo.purchase_price).toFixed(2) : '';
  return `
    <div class="line-item">
      <div class="form-row form-row-3">
        <div class="form-field">
          <label>商品</label>
          <select name="product_id" class="form-input" required>
            ${solo
              ? `<option value="${solo.id}" data-purchase-price="${solo.purchase_price}" data-sale-price="${solo.sale_price}" selected>${escapeHtml(solo.name)}</option>`
              : `<option value="">选择</option>${products.map(p => `<option value="${p.id}" data-purchase-price="${p.purchase_price}" data-sale-price="${p.sale_price}">${escapeHtml(p.name)}</option>`).join('')}`
            }
          </select>
        </div>
        <div class="form-field">
          <label>数量</label>
          <input name="quantity" class="form-input" type="number" min="0.01" step="0.01" placeholder="0" required>
        </div>
        <div class="form-field">
          <label>单价</label>
          <input name="unit_price" class="form-input" type="number" min="0" step="0.01" placeholder="0" value="${defaultPrice}" required>
        </div>
      </div>
      <button type="button" class="line-item-remove" data-remove-row>删除</button>
    </div>
  `;
}

// Keep mount/unmount so existing route registration won't break if still referenced
export function mount(container) {
  openPurchaseModal();
  // Show empty page behind modal
  container.innerHTML = '';
}
export function unmount() {}

