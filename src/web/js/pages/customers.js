import { getState } from '../store.js';
import { api } from '../api.js';
import { escapeHtml, toast } from '../utils.js';

export function mount(container) {
  const { customers } = getState();

  container.innerHTML = `
    <div class="page-section">
      <div class="section-header"><h3>新增客户</h3></div>
      <form id="customer-form" class="form-card">
        <div class="form-field">
          <label>客户名称</label>
          <input name="name" type="text" placeholder="客户名称" required>
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
          <input name="note" type="text" placeholder="渠道、结算方式">
        </div>
        <button type="submit" class="btn btn-primary btn-block">保存客户</button>
      </form>
    </div>

    <div class="page-section">
      <div class="section-header">
        <h3>客户列表</h3>
        <span class="section-hint">${customers.length} 项</span>
      </div>
      <div class="card-list" id="customer-list"></div>
    </div>
  `;

  renderList(container, customers);
  bindEvents(container);
}

function renderList(container, customers) {
  const el = container.querySelector('#customer-list');
  if (!customers.length) {
    el.innerHTML = '<div class="empty-hint">暂无客户</div>';
    return;
  }

  el.innerHTML = customers.map(c => `
    <div class="list-item">
      <div class="list-item-main">
        <div class="list-item-title">${escapeHtml(c.name)}</div>
        <div class="list-item-desc">
          ${c.contact ? escapeHtml(c.contact) : ''}${c.phone ? ' · ' + escapeHtml(c.phone) : ''}
        </div>
        ${c.note ? `<div class="list-item-note">${escapeHtml(c.note)}</div>` : ''}
      </div>
    </div>
  `).join('');
}

function bindEvents(container) {
  container.querySelector('#customer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    try {
      await api.createCustomer(data);
      form.reset();
      await window.__app.refreshData('客户已创建');
    } catch (err) {
      toast(err.message || '新增客户失败', 'error');
    }
  });
}

export function unmount() {}
