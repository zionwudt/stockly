import { getState } from '../store.js';
import { api } from '../api.js';
import { escapeHtml, toast } from '../utils.js';

export function mount(container) {
  const { products } = getState();

  container.innerHTML = `
    <div class="page-section">
      <form id="adjustment-form" class="form-card">
        <div class="form-field">
          <label>商品</label>
          <select name="product_id" required>
            <option value="">请选择商品</option>
            ${products.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (库存: ${p.on_hand || 0})</option>`).join('')}
          </select>
        </div>

        <div class="form-row">
          <div class="form-field">
            <label>调整数量</label>
            <input name="quantity_delta" type="number" step="0.01" placeholder="正数盘盈，负数盘亏" required>
          </div>
          <div class="form-field">
            <label>原因</label>
            <input name="reason" type="text" placeholder="盘点 / 损耗 / 报废" required>
          </div>
        </div>

        <div class="form-field">
          <label>备注</label>
          <textarea name="note" rows="2" placeholder="补充说明"></textarea>
        </div>

        <button type="submit" class="btn btn-primary btn-block">提交库存调整</button>
      </form>
    </div>
  `;

  container.querySelector('#adjustment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = {
      product_id: Number(form.elements.product_id.value),
      quantity_delta: Number(form.elements.quantity_delta.value),
      reason: form.elements.reason.value.trim(),
      note: form.elements.note.value.trim(),
    };

    try {
      await api.createAdjustment(payload);
      window.__app.navigate('/documents');
      await window.__app.refreshData('库存调整完成');
    } catch (err) {
      toast(err.message || '库存调整失败', 'error');
    }
  });
}

export function unmount() {}
