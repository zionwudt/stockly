import { openModal, closeModal } from '../router.js';
import { formatCurrency, formatDateTime, formatQuantity, typeLabel, escapeHtml } from '../utils.js';

export function openDocumentDetailModal(document, title = '单据详情') {
  if (!document) return;

  openModal(
    title,
    renderDocumentDetail(document),
    () => closeModal(),
    { hideCancel: true, okText: '关闭' },
  );
}

function renderDocumentDetail(doc) {
  const status = doc.status === 'void' ? 'void' : 'active';
  const statusLabel = status === 'void' ? '已作废' : '正常';
  const items = Array.isArray(doc.items) ? doc.items : [];
  const itemCount = doc.item_count == null ? items.length || '-' : Number(doc.item_count || 0);

  return `
    <div class="detail-sheet">
      <div class="detail-head">
        <div class="detail-doc-no ${status === 'void' ? 'is-void' : ''}">${escapeHtml(doc.doc_no || '-')}</div>
        <span class="detail-status ${status === 'void' ? 'is-void' : 'is-active'}">${statusLabel}</span>
      </div>
      <div class="detail-grid">
        ${detailRow('单据类型', typeLabel(doc.doc_type || ''))}
        ${detailRow('往来方', escapeHtml(doc.partner_name || '库存调整'))}
        ${detailRow('金额', `<span class="font-num">${formatCurrency(doc.total_amount || 0)}</span>`)}
        ${detailRow('明细数量', `<span class="font-num">${itemCount}</span>`)}
        ${detailRow('创建时间', formatDateTime(doc.created_at))}
      </div>
      <div class="detail-items">
        ${renderDetailItems(items)}
      </div>
      ${doc.note ? `<div class="detail-note">${escapeHtml(doc.note)}</div>` : ''}
    </div>
  `;
}

function renderDetailItems(items) {
  if (!items.length) return '<div class="detail-items-empty">暂无明细</div>';
  return items.map(item => `
    <div class="detail-item-row">
      <div class="detail-item-name">${escapeHtml(item.product_name || '未命名商品')}</div>
      <div class="detail-item-meta">
        <span class="font-num">数量 ${formatQuantity(item.quantity || 0)}</span>
        <span class="font-num">单价 ${formatCurrency(item.unit_price || 0)}</span>
      </div>
    </div>
  `).join('');
}

function detailRow(label, value) {
  return `
    <div class="detail-row">
      <span class="detail-label">${label}</span>
      <span class="detail-value">${value}</span>
    </div>
  `;
}
