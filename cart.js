// Sepet: yalnızca ürün id'si ve adedi saklanır. Fiyat ve stok her zaman
// sunucudan okunur ve sipariş anında sunucu tarafında yeniden hesaplanır.
import { clampQty } from './lib.js';

const CART_KEY = 'eb_cart_v2';
const listeners = new Set();
let items = load();

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((i) => Number.isInteger(i?.id) && i.id > 0)
      .map((i) => ({ id: i.id, qty: clampQty(i.qty) }));
  } catch {
    return [];
  }
}

function save() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch { /* kota/gizli mod: sepet bellekte kalır */ }
  listeners.forEach((fn) => fn(items));
}

export function onCartChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getItems() {
  return items.map((i) => ({ ...i }));
}

export function countItems() {
  return items.reduce((sum, i) => sum + i.qty, 0);
}

export function addItem(id, qty = 1) {
  const existing = items.find((i) => i.id === id);
  if (existing) existing.qty = clampQty(existing.qty + qty);
  else items.push({ id, qty: clampQty(qty) });
  save();
}

export function setQty(id, qty) {
  const line = items.find((i) => i.id === id);
  if (!line) return;
  line.qty = clampQty(qty);
  save();
}

export function removeItem(id) {
  items = items.filter((i) => i.id !== id);
  save();
}

export function clearCart() {
  items = [];
  save();
}
