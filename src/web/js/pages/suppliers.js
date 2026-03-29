import { getState } from '../store.js';
import { api } from '../api.js';
import { escapeHtml, toast } from '../utils.js';

export function mount(container) {
  const { suppliers } = getState();
  const route = getRouteState();
  
  // 详情页面
  if (route.path === '/suppliers/detail') {
    const supplierId = route.params.get('id');
    const supplier = suppliers.find(s => String(s.id) === supplierId);
    renderDetailView(container, supplier);
    return;
  }
  
  // 创建页面
  if (route.path === '/suppliers/create') {
    renderCreateView(container);
    return;
  }
  
  // 列表页面
  renderListView(container, suppliers);
}

function getRouteState() {
  const hash = window.location.hash.slice(1) || '/suppliers';
  const [path, query = ''] = hash.split('?');
  return {
    path,
    params: new URLSearchParams(query),
  };
}

function renderListView(container, suppliers) {
  container.innerHTML = `
    <div class="page-section">
      <div class="card-list" id="supplier-list"></div>
    </div>
    <button class="btn-fab" id="add-supplier-btn">+</button>
  `;

  const el = container.querySelector('#supplier-list');
  if (!suppliers.length) {
    el.innerHTML = '<div class="empty-hint">暂无供应商</div>';
    return;
  }

  el.innerHTML = suppliers.map(s => `
    <div class="list-item" data-id="${s.id}">
      <div class="list-item-main">
        <div class="list-item-title">${escapeHtml(s.name)}</div>
        <div class="list-item-desc">
          ${s.contact ? escapeHtml(s.contact) : ''}${s.phone ? ' · ' + escapeHtml(s.phone) : ''}
        </div>
        ${s.note ? `<div class="list-item-note">${escapeHtml(s.note)}</div>` : ''}
      </div>
      <div class="list-item-right">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </div>
    </div>
  `).join('');

  // 绑定事件
  container.querySelector('#add-supplier-btn').addEventListener('click', () => {
    window.__app.navigate('/suppliers/create');
  });

  container.querySelector('#supplier-list').addEventListener('click', (e) => {
    const listItem = e.target.closest('.list-item');
    if (listItem) {
      const supplierId = listItem.dataset.id;
      window.__app.navigate(`/suppliers/detail?id=${supplierId}`);
    }
  });
}

function renderCreateView(container) {
  container.innerHTML = `
    <div class="page-section">
      <div class="section-header">
        <h3>新增供应商</h3>
      </div>
      <form id="supplier-form" class="form-card">
        <div class="form-field">
          <label>供应商名称</label>
          <input name="name" type="text" placeholder="供应商名称" required>
        </div>
        <div class="form-field">
          <label>联系人</label>
          <input name="contact" type="text" placeholder="联系人">
        </div>
        <div class="form-field">
          <label>电话</label>
          <input name="phone" type="text" placeholder="联系电话">
        </div>
        <div class="form-field">
          <label>备注</label>
          <input name="note" type="text" placeholder="账期、供货特点">
        </div>
        <div class="form-row">
          <button type="button" class="btn btn-secondary btn-block" id="cancel-btn">取消</button>
          <button type="submit" class="btn btn-primary btn-block">保存供应商</button>
        </div>
      </form>
    </div>
  `;

  // 绑定事件
  container.querySelector('#supplier-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    try {
      await api.createSupplier(data);
      await window.__app.refreshData('供应商已创建');
      window.__app.navigate('/suppliers');
    } catch (err) {
      toast(err.message || '新增供应商失败', 'error');
    }
  });

  container.querySelector('#cancel-btn').addEventListener('click', () => {
    window.__app.navigate('/suppliers');
  });
}

function renderDetailView(container, supplier) {
  if (!supplier) {
    container.innerHTML = `
      <div class="empty-state">
        <p>供应商不存在或已被删除</p>
        <button type="button" class="btn btn-primary" id="back-btn">返回列表</button>
      </div>
    `;
    container.querySelector('#back-btn').addEventListener('click', () => {
      window.__app.navigate('/suppliers');
    });
    return;
  }

  container.innerHTML = `
    <div class="page-section">
      <div class="section-header">
        <h3>供应商详情</h3>
      </div>
      <form id="supplier-form" class="form-card">
        <div class="form-field">
          <label>供应商名称</label>
          <input name="name" type="text" value="${escapeHtml(supplier.name)}" required>
        </div>
        <div class="form-field">
          <label>联系人</label>
          <input name="contact" type="text" value="${escapeHtml(supplier.contact || '')}">
        </div>
        <div class="form-field">
          <label>电话</label>
          <input name="phone" type="text" value="${escapeHtml(supplier.phone || '')}">
        </div>
        <div class="form-field">
          <label>备注</label>
          <input name="note" type="text" value="${escapeHtml(supplier.note || '')}">
        </div>
        <div class="form-row">
          <button type="button" class="btn btn-danger btn-block" id="delete-btn">删除供应商</button>
          <button type="submit" class="btn btn-primary btn-block">保存修改</button>
        </div>
      </form>
    </div>
  `;

  // 绑定事件
  container.querySelector('#supplier-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    try {
      await api.updateSupplier(supplier.id, data);
      await window.__app.refreshData('供应商已更新');
      window.__app.navigate('/suppliers');
    } catch (err) {
      toast(err.message || '更新供应商失败', 'error');
    }
  });

  container.querySelector('#delete-btn').addEventListener('click', async () => {
    if (!confirm('确定要删除此供应商吗？')) return;

    try {
      await api.deleteSupplier(supplier.id);
      await window.__app.refreshData('供应商已删除');
      window.__app.navigate('/suppliers');
    } catch (err) {
      toast(err.message || '删除供应商失败', 'error');
    }
  });
}

export function unmount() {}
