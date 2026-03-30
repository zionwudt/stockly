import { getState } from '../store.js';
import { api } from '../api.js';
import { openModal, closeModal, openConfirm } from '../router.js';
import { escapeHtml, toast } from '../utils.js';

export function mount(container) {
  const { customers } = getState();

  container.innerHTML = `
    <div class="page-section">
      <div class="card-list" id="customer-list"></div>
      <button type="button" class="btn-fab" id="customer-create-btn">+</button>
    </div>
  `;

  renderList(container, customers);

  container.querySelector('#customer-create-btn').addEventListener('click', () => {
    openCustomerModal();
  });

  container.querySelector('#customer-list').addEventListener('click', (e) => {
    const item = e.target.closest('.list-item');
    if (!item) return;
    const customer = customers.find(c => String(c.id) === item.dataset.id);
    if (customer) openCustomerModal(customer);
  });
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
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--text-4)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </div>
  `).join('');
}

function openCustomerModal(customer = null) {
  const isEdit = !!customer;
  const title = isEdit ? '编辑客户' : '新增客户';
  const c = customer || {};

  const body = `
    <form id="modal-customer-form">
      <div class="form-field">
        <label>客户名称</label>
        <input name="name" class="form-input" type="text" placeholder="客户名称" value="${escapeHtml(c.name || '')}" required>
      </div>
      <div class="form-field">
        <label>联系人</label>
        <input name="contact" class="form-input" type="text" placeholder="联系人" value="${escapeHtml(c.contact || '')}">
      </div>
      <div class="form-field">
        <label>电话</label>
        <input name="phone" class="form-input" type="text" placeholder="联系电话" value="${escapeHtml(c.phone || '')}">
      </div>
      <div class="form-field">
        <label>备注</label>
        <input name="note" class="form-input" type="text" placeholder="渠道、结算方式" value="${escapeHtml(c.note || '')}">
      </div>
      ${isEdit ? '<button type="button" class="btn btn-danger btn-block btn-sm" id="modal-delete-customer" style="margin-top:8px">删除客户</button>' : ''}
    </form>
  `;

  openModal(title, body, async () => {
    const form = document.getElementById('modal-customer-form');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const data = Object.fromEntries(new FormData(form));
    try {
      if (isEdit) {
        await api.updateCustomer(customer.id, data);
      } else {
        await api.createCustomer(data);
      }
      closeModal();
      await window.__app.refreshData(isEdit ? '客户已更新' : '客户已创建');
    } catch (err) {
      toast(err.message || '操作失败', 'error');
    }
  });

  if (isEdit) {
    requestAnimationFrame(() => {
      document.getElementById('modal-delete-customer')?.addEventListener('click', () => {
        closeModal();
        openConfirm('删除客户', `确定要删除客户"${customer.name}"吗？`, async () => {
          try {
            await api.deleteCustomer(customer.id);
            await window.__app.refreshData('客户已删除');
          } catch (err) {
            toast(err.message || '删除失败', 'error');
          }
        });
      });
    });
  }
}

export function unmount() {}

