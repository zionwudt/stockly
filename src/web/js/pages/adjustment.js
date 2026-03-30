import { getState } from '../store.js';
import { api } from '../api.js';
import { openModal, closeModal } from '../router.js';
import { escapeHtml, toast } from '../utils.js';

export function openAdjustmentModal(preselectedProductId) {
  const { products } = getState();

  const body = `
    <form id="modal-adjustment-form">
      <div class="form-field">
        <label>商品</label>
        <select name="product_id" class="form-input" required>
          <option value="">请选择商品</option>
          ${products.map(p => `<option value="${p.id}" ${p.id === preselectedProductId ? 'selected' : ''}>${escapeHtml(p.name)} (库存: ${p.on_hand || 0})</option>`).join('')}
        </select>
      </div>
      <div class="form-field">
        <label>调整数量</label>
        <input name="quantity_delta" class="form-input" type="number" step="0.01" placeholder="正数盘盈，负数盘亏" required>
      </div>
      <div class="form-field">
        <label>原因</label>
        <input name="reason" class="form-input" type="text" placeholder="盘点 / 损耗 / 报废" required>
      </div>
      <div class="form-field">
        <label>备注</label>
        <input name="note" class="form-input" type="text" placeholder="补充说明">
      </div>
    </form>
  `;

  openModal('库存调整', body, async () => {
    const form = document.getElementById('modal-adjustment-form');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const payload = {
      product_id: Number(form.elements.product_id.value),
      quantity_delta: Number(form.elements.quantity_delta.value),
      reason: form.elements.reason.value.trim(),
      note: form.elements.note.value.trim(),
    };
    try {
      await api.createAdjustment(payload);
      closeModal();
      await window.__app.refreshData('库存调整完成');
    } catch (err) {
      toast(err.message || '库存调整失败', 'error');
    }
  });
}

export function mount(container) {
  openAdjustmentModal();
  container.innerHTML = '';
}
export function unmount() {}

