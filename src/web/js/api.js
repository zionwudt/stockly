async function request(method, path, body) {
  const opts = { method, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  if (res.status === 401) {
    window.location.href = '/auth';
    throw new Error('Unauthorized');
  }
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;
  if (!res.ok) throw new Error(data?.error || '请求失败');
  return data;
}

function get(path) { return request('GET', path); }
function post(path, body) { return request('POST', path, body); }

export const api = {
  // Auth
  login: (d) => post('/api/auth/login', d),
  register: (d) => post('/api/auth/register', d),
  logout: () => post('/api/auth/logout', {}),
  me: () => get('/api/auth/me'),
  switchTenant: (d) => post('/api/auth/switch-tenant', d),

  // Tenant hub
  tenantHub: () => get('/api/tenant-hub'),
  createTenant: (d) => post('/api/tenants', d),
  joinRequest: (d) => post('/api/tenant-join-requests', d),
  approveJoin: (id) => post(`/api/tenant-join-requests/${id}/approve`, {}),
  rejectJoin: (id) => post(`/api/tenant-join-requests/${id}/reject`, {}),

  // Workspace data
  summary: () => get('/api/summary'),
  products: () => get('/api/products'),
  suppliers: () => get('/api/suppliers'),
  customers: () => get('/api/customers'),
  stock: () => get('/api/stock'),
  movements: (limit = 30) => get(`/api/movements?limit=${limit}`),
  documents: (type, limit = 50) => {
    const params = [];
    if (type) params.push(`type=${type}`);
    if (limit) params.push(`limit=${limit}`);
    return get('/api/documents' + (params.length ? '?' + params.join('&') : ''));
  },
  statistics: (start, end) => {
    const params = [];
    if (start) params.push(`start_date=${start}`);
    if (end) params.push(`end_date=${end}`);
    return get('/api/statistics' + (params.length ? '?' + params.join('&') : ''));
  },

  // Create operations
  createProduct: (d) => post('/api/products', d),
  createSupplier: (d) => post('/api/suppliers', d),
  createCustomer: (d) => post('/api/customers', d),
  createPurchase: (d) => post('/api/purchases', d),
  createSale: (d) => post('/api/sales', d),
  createAdjustment: (d) => post('/api/adjustments', d),
};
