export function formatCurrency(n) {
  const v = Number(n);
  if (isNaN(v)) return '¥0.00';
  return '¥' + v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatShortCurrency(n) {
  const v = Math.abs(Number(n));
  if (v >= 10000) return '¥' + (v / 10000).toFixed(1) + '万';
  return formatCurrency(n);
}

export function formatSignedCurrency(n) {
  const v = Number(n);
  const prefix = v > 0 ? '+' : '';
  return prefix + formatCurrency(v);
}

export function formatQuantity(n) {
  const v = Number(n);
  if (isNaN(v)) return '0';
  return v % 1 === 0 ? v.toString() : v.toFixed(2);
}

export function signedQuantity(n) {
  const v = Number(n);
  const prefix = v > 0 ? '+' : '';
  return prefix + formatQuantity(v);
}

export function formatDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  const M = d.getMonth() + 1;
  const D = d.getDate();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${M}/${D} ${h}:${m}`;
}

export function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatMonthLabel(ym) {
  if (!ym) return '';
  const [, m] = ym.split('-');
  return `${parseInt(m)}月`;
}

export function typeLabel(type) {
  return { purchase: '采购入库', sale: '销售出库', adjustment: '库存调整' }[type] || type;
}

export function typeTag(type) {
  const cls = { purchase: 'tag-blue', sale: 'tag-green', adjustment: 'tag-orange' }[type] || '';
  return `<span class="tag ${cls}">${typeLabel(type)}</span>`;
}

export function escapeHtml(s) {
  if (!s) return '';
  const el = document.createElement('div');
  el.textContent = s;
  return el.innerHTML;
}

// Toast notification system
let toastTimer = null;
export function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  clearTimeout(toastTimer);
  container.textContent = msg;
  container.className = `toast-container show toast-${type}`;
  toastTimer = setTimeout(() => {
    container.className = 'toast-container';
  }, 2500);
}

/**
 * Bind swipe-to-delete on a card-list container.
 * Each .swipe-wrap > .swipe-content can be swiped left to reveal .swipe-action.
 */
export function bindSwipeDelete(listEl, onDelete) {
  let startX = 0, currentX = 0, swiping = false, activeEl = null;
  const THRESHOLD = 60;

  function resetAll() {
    listEl.querySelectorAll('.swipe-content').forEach(el => {
      el.style.transform = '';
      el.classList.remove('swiping');
    });
    activeEl = null;
  }

  listEl.addEventListener('touchstart', (e) => {
    // close any open swipe first
    if (activeEl && !activeEl.contains(e.target)) {
      resetAll();
    }
    const wrap = e.target.closest('.swipe-wrap');
    if (!wrap) return;
    const content = wrap.querySelector('.swipe-content');
    if (!content) return;
    startX = e.touches[0].clientX;
    currentX = startX;
    swiping = true;
    activeEl = content;
    content.classList.add('swiping');
  }, { passive: true });

  listEl.addEventListener('touchmove', (e) => {
    if (!swiping || !activeEl) return;
    currentX = e.touches[0].clientX;
    let dx = currentX - startX;
    if (dx > 0) dx = 0; // only left
    if (dx < -72) dx = -72;
    activeEl.style.transform = `translateX(${dx}px)`;
  }, { passive: true });

  listEl.addEventListener('touchend', () => {
    if (!swiping || !activeEl) return;
    swiping = false;
    activeEl.classList.remove('swiping');
    const dx = currentX - startX;
    if (dx < -THRESHOLD) {
      activeEl.style.transform = 'translateX(-72px)';
    } else {
      activeEl.style.transform = '';
      activeEl = null;
    }
  });

  // handle delete button click
  listEl.addEventListener('click', (e) => {
    const delBtn = e.target.closest('.swipe-action');
    if (!delBtn) return;
    e.stopPropagation();
    const id = delBtn.dataset.deleteId;
    const name = delBtn.dataset.deleteName || '';
    if (id && onDelete) onDelete(id, name);
  });

  // clicking on content area closes open swipe
  listEl.addEventListener('click', (e) => {
    if (e.target.closest('.swipe-action')) return;
    resetAll();
  });
}

