import { getState } from '../store.js';
import { api } from '../api.js';
import { openModal, closeModal, openConfirm } from '../router.js';
import { escapeHtml, toast, bindSwipeDelete } from '../utils.js';

export function mount(container) {
  const { suppliers } = getState();

  container.innerHTML = `
    <div class="page-section">
      <div class="card-list" id="supplier-list"></div>
      <button type="button" class="btn-fab" id="add-supplier-btn">+</button>
    </div>
  `;

  renderList(container, suppliers);
  bindEvents(container, suppliers);
}

function renderList(container, suppliers) {
  const el = container.querySelector('#supplier-list');
  if (!suppliers.length) {
    el.innerHTML = '<div class="empty-hint">暂无供应商，点击右下角新增</div>';
    return;
  }

  el.innerHTML = suppliers.map(s => `
    <div class="swipe-wrap">
      <div class="swipe-content">
        <div class="list-item" data-id="${s.id}">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(s.name)}</div>
            <div class="list-item-desc">
              ${s.contact ? escapeHtml(s.contact) : ''}${s.phone ? ' · ' + escapeHtml(s.phone) : ''}
            </div>
            ${s.note ? `<div class="list-item-note">${escapeHtml(s.note)}</div>` : ''}
          </div>
          <div class="list-item-right">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--text-4)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>
      </div>
      <div class="swipe-action" data-delete-id="${s.id}" data-delete-name="${escapeHtml(s.name)}">删除</div>
    </div>
  `).join('');
}

function bindEvents(container, suppliers) {
  container.querySelector('#add-supplier-btn').addEventListener('click', () => {
    openSupplierModal();
  });

  container.querySelector('#supplier-list').addEventListener('click', (e) => {
    if (e.target.closest('.swipe-action')) return;
    const item = e.target.closest('.list-item');
    if (!item) return;
    const supplier = suppliers.find(s => String(s.id) === item.dataset.id);
    if (supplier) openSupplierModal(supplier);
  });

  bindSwipeDelete(container.querySelector('#supplier-list'), (id, name) => {
    openConfirm('删除供应商', `确定要删除供应商"${name}"吗？`, async () => {
      try {
        await api.deleteSupplier(Number(id));
        await window.__app.refreshData('供应商已删除');
      } catch (err) {
        toast(err.message || '删除失败', 'error');
      }
    });
  });
}

function openSupplierModal(supplier = null) {
  const isEdit = !!supplier;
  const title = isEdit ? '编辑供应商' : '新增供应商';
  const s = supplier || {};

  const body = `
    <form id="modal-supplier-form">
      <div class="form-field">
        <label>供应商名称</label>
        <input name="name" class="form-input" type="text" placeholder="供应商名称" value="${escapeHtml(s.name || '')}" required>
      </div>
      <div class="form-field">
        <label>联系人</label>
        <input name="contact" class="form-input" type="text" placeholder="联系人" value="${escapeHtml(s.contact || '')}">
      </div>
      <div class="form-field">
        <label>电话</label>
        <input name="phone" class="form-input" type="text" placeholder="联系电话" value="${escapeHtml(s.phone || '')}">
      </div>
      <div class="form-field">
        <label>备注</label>
        <input name="note" class="form-input" type="text" placeholder="账期、供货特点" value="${escapeHtml(s.note || '')}">
      </div>
    </form>
  `;

  openModal(title, body, async () => {
    const form = document.getElementById('modal-supplier-form');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const data = Object.fromEntries(new FormData(form));
    try {
      if (isEdit) {
        await api.updateSupplier(supplier.id, data);
      } else {
        await api.createSupplier(data);
      }
      closeModal();
      await window.__app.refreshData(isEdit ? '供应商已更新' : '供应商已创建');
    } catch (err) {
      toast(err.message || '操作失败', 'error');
    }
  });
}

export function unmount() {}

