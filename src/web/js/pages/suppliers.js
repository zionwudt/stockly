import { getState } from '../store.js';
import { api } from '../api.js';
import { escapeHtml, toast } from '../utils.js';

export function mount(container) {
  const { suppliers } = getState();

  container.innerHTML = `
    <div class="page-section">
      <div class="section-header"><h3>新增供应商</h3></div>
      <form id="supplier-form" class="form-card">
        <div class="form-field">
          <label>供应商名称</label>
          <input name="name" type="text" placeholder="供应商名称" required>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>联系人</label>
            <input name="contact" type="text" placeholder="联系人">
          </div>
          <div class="form-field">
            <label>电话</label>
            <input name="phone" type="text" placeholder="联系电话">
          </div>
        </div>
        <div class="form-field">
          <label>备注</label>
          <input name="note" type="text" placeholder="账期、供货特点">
        </div>
        <button type="submit" class="btn btn-primary btn-block">保存供应商</button>
      </form>
    </div>

    <div class="page-section">
      <div class="section-header">
        <h3>供应商列表</h3>
        <span class="section-hint">${suppliers.length} 项</span>
      </div>
      <div class="card-list" id="supplier-list"></div>
    </div>
  `;

  renderList(container, suppliers);
  bindEvents(container);
}

function renderList(container, suppliers) {
  const el = container.querySelector('#supplier-list');
  if (!suppliers.length) {
    el.innerHTML = '<div class="empty-hint">暂无供应商</div>';
    return;
  }

  el.innerHTML = suppliers.map(s => `
    <div class="list-item">
      <div class="list-item-main">
        <div class="list-item-title">${escapeHtml(s.name)}</div>
        <div class="list-item-desc">
          ${s.contact ? escapeHtml(s.contact) : ''}${s.phone ? ' · ' + escapeHtml(s.phone) : ''}
        </div>
        ${s.note ? `<div class="list-item-note">${escapeHtml(s.note)}</div>` : ''}
      </div>
    </div>
  `).join('');
}

function bindEvents(container) {
  container.querySelector('#supplier-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    try {
      await api.createSupplier(data);
      form.reset();
      await window.__app.refreshData('供应商已创建');
    } catch (err) {
      toast(err.message || '新增供应商失败', 'error');
    }
  });
}

export function unmount() {}
