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
  return {
    purchase: '采购入库',
    sale: '销售出库',
    adjustment: '库存调整',
    purchase_void: '采购冲销',
    sale_void: '销售冲销',
    adjustment_void: '调整冲销',
    purchase_restore: '采购恢复',
    sale_restore: '销售恢复',
    adjustment_restore: '调整恢复',
  }[type] || type;
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
 * Bind swipe actions on a list container.
 * Each .swipe-wrap > .swipe-content can be swiped left to reveal .swipe-action.
 */
export function bindSwipeActions(listEl, options = {}) {
  if (!listEl) return () => {};

  const contentSelector = options.contentSelector || '.swipe-content';
  const wrapSelector = options.wrapSelector || '.swipe-wrap';
  const actionSelector = options.actionSelector || '.swipe-action';
  const actionWidth = Number(options.actionWidth || 72);
  const threshold = Number(options.threshold || 60);
  const onAction = options.onAction;

  let startX = 0;
  let currentX = 0;
  let swiping = false;
  let activeEl = null;

  function closeItem(el) {
    if (!el) return;
    el.classList.remove('swiping');
    el.style.transform = '';
    if (activeEl === el) activeEl = null;
  }

  function resetAll(exceptEl = null) {
    listEl.querySelectorAll(contentSelector).forEach(el => {
      if (exceptEl && el === exceptEl) return;
      el.style.transform = '';
      el.classList.remove('swiping');
    });
    if (!exceptEl) activeEl = null;
  }

  listEl.addEventListener('touchstart', (e) => {
    // close any open swipe first
    if (activeEl && !activeEl.contains(e.target)) {
      resetAll();
    }
    const wrap = e.target.closest(wrapSelector);
    if (!wrap) return;
    const content = wrap.querySelector(contentSelector);
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
    if (dx < -actionWidth) dx = -actionWidth;
    activeEl.style.transform = `translateX(${dx}px)`;
  }, { passive: true });

  function finalizeSwipe() {
    if (!swiping || !activeEl) return;
    swiping = false;
    activeEl.classList.remove('swiping');
    const dx = currentX - startX;
    if (dx < -threshold) {
      activeEl.style.transform = `translateX(${-actionWidth}px)`;
    } else {
      closeItem(activeEl);
    }
  }

  listEl.addEventListener('touchend', finalizeSwipe);
  listEl.addEventListener('touchcancel', finalizeSwipe);

  // handle action button click
  listEl.addEventListener('click', (e) => {
    const actionBtn = e.target.closest(actionSelector);
    if (!actionBtn || !listEl.contains(actionBtn)) return;
    e.stopPropagation();
    if (onAction) onAction(actionBtn, e);
    resetAll();
  });

  // clicking on content area closes open swipe
  listEl.addEventListener('click', (e) => {
    if (e.target.closest(actionSelector)) return;
    const hitContent = e.target.closest(contentSelector);
    if (hitContent && hitContent.style.transform) {
      e.stopPropagation();
      e.preventDefault();
      closeItem(hitContent);
      return;
    }
    resetAll();
  });

  return () => resetAll();
}

/**
 * Bind swipe-to-delete on a card-list container.
 * Each .swipe-wrap > .swipe-content can be swiped left to reveal .swipe-action.
 */
export function bindSwipeDelete(listEl, onDelete) {
  return bindSwipeActions(listEl, {
    onAction: (actionBtn) => {
      const id = actionBtn.dataset.deleteId;
      const name = actionBtn.dataset.deleteName || '';
      if (id && onDelete) onDelete(id, name);
    },
  });
}
