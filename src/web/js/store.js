import { api } from './api.js';

const state = {
  auth: null,
  tenantHub: null,
  summary: null,
  products: [],
  suppliers: [],
  customers: [],
  stock: [],
  movements: [],
  documents: [],
  statistics: null,
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(updates) {
  Object.assign(state, updates);
  listeners.forEach(fn => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function loadAuth() {
  const data = await api.me();
  setState({ auth: data });
  return data;
}

export async function loadTenantHub() {
  const data = await api.tenantHub();
  setState({ tenantHub: data });
  return data;
}

export async function loadSummary() {
  const data = await api.summary();
  setState({ summary: data });
  return data;
}

export async function loadProducts() {
  const data = await api.products();
  setState({ products: data });
  return data;
}

export async function loadSuppliers() {
  const data = await api.suppliers();
  setState({ suppliers: data });
  return data;
}

export async function loadCustomers() {
  const data = await api.customers();
  setState({ customers: data });
  return data;
}

export async function loadStock() {
  const data = await api.stock();
  setState({ stock: data });
  return data;
}

export async function loadMovements(limit = 30) {
  const data = await api.movements(limit);
  setState({ movements: data });
  return data;
}

export async function loadDocuments(type, limit) {
  const data = await api.documents(type, limit);
  setState({ documents: data });
  return data;
}

export async function loadStatistics(start, end) {
  const data = await api.statistics(start, end);
  setState({ statistics: data });
  return data;
}

export async function loadWorkspace() {
  await Promise.all([
    loadSummary(),
    loadProducts(),
    loadSuppliers(),
    loadCustomers(),
    loadStock(),
    loadMovements(),
    loadDocuments(),
  ]);
}
