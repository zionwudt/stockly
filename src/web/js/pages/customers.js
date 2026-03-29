import { getState } from '../store.js';
import { api } from '../api.js';
import { escapeHtml, toast } from '../utils.js';

export function mount(container) {
  const { customers } = getState();
  const route = getRouteState();

  if (route.path === '/customers/create') {
    container.innerHTML = renderCreateView();
    bindCreateEvents(container);
    return;
  }

  if (route.path === '/customers/detail') {
    const customer = customers.find((item) => String(item.id) === route.params.get('id'));
    container.innerHTML = renderDetailView(customer);
    bindDetailEvents(container, customer);
    return;
  }

  container.innerHTML = renderListView(customers);
  renderList(container, customers);
  bindListEvents(container);
}

function renderListView(customers) {
  return `
    <div class="page-section">
      <div class="card-list" id="customer-list"></div>
      <button type="button" class="btn-fab" id="customer-create-btn">+</button>
    </div>
  `;
}

function renderCreateView() {
  return `
    <div class="page-section">
      <div class="section-header">
        <h3>新增客户</h3>
        <span class="section-hint">保存后返回列表</span>
      </div>
      ${renderCustomerForm({
        submitText: '保存客户',
        secondaryText: '返回列表',
        secondaryAction: 'back',
      })}
    </div>
  `;
}

function renderDetailView(customer) {
  if (!customer) {
    return `
      <div class="empty-state">
        <p>客户不存在或已被删除</p>
        <button type="button" class="btn btn-primary" id="customer-missing-back">返回客户列表</button>
      </div>
    `;
  }

  return `
    <div class="page-section">
      <div class="section-header">
        <h3>客户详情</h3>
        <span class="section-hint">支持修改和删除</span>
      </div>
      ${renderCustomerForm({
        customer,
        submitText: '保存修改',
        secondaryText: '删除客户',
        secondaryAction: 'delete',
      })}
    </div>
  `;
}

function renderCustomerForm({
  customer = {},
  submitText,
  secondaryText,
  secondaryAction,
}) {
  return `
    <form id="customer-form" class="form-card">
      <div class="form-field">
        <label>客户名称</label>
        <input name="name" type="text" placeholder="客户名称" value="${fieldValue(customer.name)}" required>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label>联系人</label>
          <input name="contact" type="text" placeholder="联系人" value="${fieldValue(customer.contact)}">
        </div>
        <div class="form-field">
          <label>电话</label>
          <input name="phone" type="text" placeholder="联系电话" value="${fieldValue(customer.phone)}">
        </div>
      </div>
      <div class="form-field">
        <label>备注</label>
        <input name="note" type="text" placeholder="渠道、结算方式" value="${fieldValue(customer.note)}">
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

function renderList(container, customers) {
  const el = container.querySelector('#customer-list');
  if (!customers.length) {
    el.innerHTML = '<div class="empty-hint">暂无客户，点击右下角新增</div>';
    return;
  }

  el.innerHTML = customers.map((customer) => `
    <div class="list-item" data-id="${customer.id}">
      <div class="list-item-main">
        <div class="list-item-title">${escapeHtml(customer.name)}</div>
        <div class="list-item-desc">
          ${customer.contact ? escapeHtml(customer.contact) : ''}${customer.phone ? ' · ' + escapeHtml(customer.phone) : ''}
        </div>
        ${customer.note ? `<div class="list-item-note">${escapeHtml(customer.note)}</div>` : ''}
      </div>
      <div class="list-item-right">
        <svg class="menu-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </div>
  `).join('');
}

function bindListEvents(container) {
  container.querySelector('#customer-create-btn').addEventListener('click', () => {
    window.__app.navigate('/customers/create');
  });

  container.querySelector('#customer-list').addEventListener('click', (e) => {
    const item = e.target.closest('.list-item');
    if (!item) return;
    window.__app.navigate(`/customers/detail?id=${item.dataset.id}`);
  });
}

function bindCreateEvents(container) {
  const form = container.querySelector('#customer-form');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));

    try {
      await api.createCustomer(data);
      window.__app.navigate('/customers');
      await window.__app.refreshData('客户已创建');
    } catch (err) {
      toast(err.message || '新增客户失败', 'error');
    }
  });

  container.querySelector('[data-action="back"]').addEventListener('click', () => {
    window.__app.navigate('/customers');
  });
}

function bindDetailEvents(container, customer) {
  if (!customer) {
    container.querySelector('#customer-missing-back').addEventListener('click', () => {
      window.__app.navigate('/customers');
    });
    return;
  }

  const form = container.querySelector('#customer-form');
  const deleteBtn = container.querySelector('[data-action="delete"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));

    try {
      await api.updateCustomer(customer.id, data);
      await window.__app.refreshData('客户已更新');
    } catch (err) {
      toast(err.message || '更新客户失败', 'error');
    }
  });

  deleteBtn.addEventListener('click', async () => {
    if (!confirm(`确定要删除客户"${customer.name}"吗？`)) return;

    try {
      await api.deleteCustomer(customer.id);
      window.__app.navigate('/customers');
      await window.__app.refreshData('客户已删除');
    } catch (err) {
      toast(err.message || '删除客户失败', 'error');
    }
  });
}

function getRouteState() {
  const hash = window.location.hash.slice(1) || '/customers';
  const [path, query = ''] = hash.split('?');
  return {
    path,
    params: new URLSearchParams(query),
  };
}

function fieldValue(value) {
  return escapeHtml(String(value ?? ''));
}

export function unmount() {}
