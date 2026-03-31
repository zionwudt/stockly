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
        <select name="reason" class="form-input" required>
          <option value="">请选择原因</option>
          <option value="盘点">盘点</option>
          <option value="损耗">损耗</option>
          <option value="报废">报废</option>
          <option value="退货入库">退货入库</option>
          <option value="其他">其他</option>
        </select>
      </div>
      <div class="form-field">
        <label>备注</label>
        <input name="note" class="form-input" type="text" placeholder="补充说明">
      </div>
      <div class="form-field">
        <label>交易时间</label>
        <input name="transaction_time" class="form-input" type="datetime-local">
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
      transaction_time: form.elements.transaction_time.value ? form.elements.transaction_time.value.replace('T', ' ') : '',
    };
    try {
      await api.createAdjustment(payload);
      closeModal();
      await window.__app.refreshData('库存调整完成');
    } catch (err) {
      toast(err.message || '库存调整失败', 'error');
    }
  });

  requestAnimationFrame(() => {
    const form = document.getElementById('modal-adjustment-form');
    if (!form) return;
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    form.elements.transaction_time.value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
}

export function mount(container) {
  openAdjustmentModal();
  container.innerHTML = '';
}
export function unmount() {}

