async function request(method, path, body) {
  const opts = { method, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  if (res.status === 401) {
    const isAuthPage = window.location.pathname === '/auth' || window.location.pathname === '/';
    if (!isAuthPage) {
      window.location.href = '/auth';
    }
    throw new Error('Unauthorized');
  }
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;
  if (!res.ok) throw new Error(data?.error || '请求失败');
  return data;
}

function get(path) { return request('GET', path); }
function post(path, body) { return request('POST', path, body); }
function put(path, body) { return request('PUT', path, body); }
function del(path, body) { return request('DELETE', path, body); }

export const api = {
  // Auth
  login: (d) => post('/api/auth/login', d),
  register: (d) => post('/api/auth/register', d),
  logout: () => post('/api/auth/logout', {}),
  me: () => get('/api/auth/me'),
  updateProfile: (d) => put('/api/auth/profile', d),
  changePassword: (d) => put('/api/auth/profile', d),
  switchTenant: (d) => post('/api/auth/switch-tenant', d),

  // Tenant hub
  tenantHub: () => get('/api/tenant-hub'),
  createTenant: (d) => post('/api/tenants', d),
  joinRequest: (d) => post('/api/tenant-join-requests', d),
  approveJoin: (id) => post(`/api/tenant-join-requests/${id}/approve`, {}),
  rejectJoin: (id) => post(`/api/tenant-join-requests/${id}/reject`, {}),
  
  // Tenant detail
  getTenantDetail: (id) => get(`/api/tenants/${id}`),
  updateTenantName: (id, d) => put(`/api/tenants/${id}/name`, d),
  updateMemberRole: (tenantId, userId, d) => put(`/api/tenants/${tenantId}/members/${userId}/role`, d),
  removeMember: (tenantId, userId) => del(`/api/tenants/${tenantId}/members/${userId}`, {}),

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
  getStatistics: (start, end) => {
    const params = [];
    if (start) params.push(`start_date=${start}`);
    if (end) params.push(`end_date=${end}`);
    return get('/api/statistics' + (params.length ? '?' + params.join('&') : ''));
  },

  // Create operations
  createProduct: (d) => post('/api/products', d),
  updateProduct: (id, d) => put(`/api/products/${id}`, d),
  createSupplier: (d) => post('/api/suppliers', d),
  updateSupplier: (id, d) => put(`/api/suppliers/${id}`, d),
  createCustomer: (d) => post('/api/customers', d),
  updateCustomer: (id, d) => put(`/api/customers/${id}`, d),
  createPurchase: (d) => post('/api/purchases', d),
  createSale: (d) => post('/api/sales', d),
  createAdjustment: (d) => post('/api/adjustments', d),

  // Delete operations (soft delete)
  deleteProduct: (id) => del(`/api/products/${id}`, {}),
  deleteSupplier: (id) => del(`/api/suppliers/${id}`, {}),
  deleteCustomer: (id) => del(`/api/customers/${id}`, {}),

  // Document void operation
  voidDocument: (id, reason) => post(`/api/documents/${id}/void`, { reason }),
  restoreDocument: (id) => post(`/api/documents/${id}/restore`, {}),
};
