const JSON_HEADERS = {
  "Content-Type": "application/json",
};

async function request(path, options = {}) {
  const response = await fetch(path, options);
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    const message = data?.error || `请求失败: ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

export const api = {
  getMe() {
    return request("/api/auth/me");
  },
  login(payload) {
    return request("/api/auth/login", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    });
  },
  logout() {
    return request("/api/auth/logout", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({}),
    });
  },
  getSummary() {
    return request("/api/summary");
  },
  getProducts() {
    return request("/api/products");
  },
  createProduct(payload) {
    return request("/api/products", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    });
  },
  getSuppliers() {
    return request("/api/suppliers");
  },
  createSupplier(payload) {
    return request("/api/suppliers", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    });
  },
  getCustomers() {
    return request("/api/customers");
  },
  createCustomer(payload) {
    return request("/api/customers", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    });
  },
  getStock() {
    return request("/api/stock");
  },
  getMovements() {
    return request("/api/movements?limit=30");
  },
  getDocuments() {
    return request("/api/documents?limit=60");
  },
  createPurchase(payload) {
    return request("/api/purchases", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    });
  },
  createSale(payload) {
    return request("/api/sales", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    });
  },
  createAdjustment(payload) {
    return request("/api/adjustments", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    });
  },
};
