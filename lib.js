// Saf yardımcı fonksiyonlar (DOM ve ağ bağımsız; test edilebilir).

export const SELLABLE_STATUSES = Object.freeze(['%100', 'Sağlıklı']);

export const STATUS_OPTIONS = Object.freeze([
  { value: '%100', label: 'Sağlıklı (%100)' },
  { value: 'Sağlığı Düşük', label: 'Sağlığı Düşük' },
  { value: 'Arızalı', label: 'Arızalı' },
  { value: 'Test Edilmedi', label: 'Test Edilmedi' },
]);

export const ORDER_STATUS_LABELS = Object.freeze({
  pending_payment: 'Ödeme bekleniyor',
  confirmed: 'Onaylandı',
  shipped: 'Kargoya verildi',
  delivered: 'Teslim edildi',
  cancelled: 'İptal edildi',
});

export const CANCELLABLE_STATUSES = Object.freeze(['pending_payment', 'confirmed']);

// Sunucudaki kurallarla aynı olmalı (place_order). Yalnızca gösterim içindir;
// nihai tutarı sunucu hesaplar.
export const SHIPPING_FEE = 99;
export const FREE_SHIPPING_THRESHOLD = 2000;
export const MAX_QTY_PER_LINE = 20;

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatTRY(amount) {
  const n = Number(amount);
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(
    Number.isFinite(n) ? n : 0,
  );
}

export function capacityLabel(gb) {
  const n = Number(gb);
  if (!Number.isFinite(n) || n <= 0) return '-';
  if (n >= 1000) {
    return `${(n / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TB`;
  }
  return `${n} GB`;
}

export function isSellable(stock) {
  return Boolean(stock) && stock.published !== false && SELLABLE_STATUSES.includes((stock.status || '').trim());
}

export function statusLabel(status) {
  const found = STATUS_OPTIONS.find((o) => o.value === status);
  return found ? found.label : status || '-';
}

// Arama metnini PostgREST .or() filtresinde güvenli hale getirir.
export function sanitizeSearchTerm(term) {
  return String(term ?? '')
    .replace(/[,()"'\\%_*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

export function clampQty(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_QTY_PER_LINE, Math.max(1, n));
}

// Gösterim amaçlı sepet toplamı (sunucu nihai tutarı yeniden hesaplar).
export function cartSummary(lines) {
  const subtotal = lines.reduce((sum, l) => sum + Number(l.unit_price) * Number(l.qty), 0);
  const rounded = Math.round(subtotal * 100) / 100;
  const shipping = rounded === 0 || rounded >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  const total = Math.round((rounded + shipping) * 100) / 100;
  const kdv = Math.round((total - total / 1.2) * 100) / 100;
  return { subtotal: rounded, shipping, total, kdv };
}

// ---- Doğrulayıcılar (istemci tarafı; sunucu her zaman tekrar kontrol eder) ----
export function validateName(name) {
  const v = String(name ?? '').trim();
  if (v.length < 3 || v.length > 80) return 'Ad Soyad 3-80 karakter olmalıdır.';
  return null;
}

export function validateEmail(email) {
  const v = String(email ?? '').trim();
  if (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Geçerli bir e-posta adresi girin.';
  return null;
}

export function validatePassword(password) {
  const v = String(password ?? '');
  if (v.length < 8 || v.length > 72) return 'Şifre 8-72 karakter olmalıdır.';
  if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) return 'Şifre en az bir harf ve bir rakam içermelidir.';
  return null;
}

export function validateAddress(address) {
  const v = String(address ?? '').trim();
  if (v.length < 10 || v.length > 500) return 'Adres 10-500 karakter olmalıdır.';
  return null;
}

export function validatePhone(phone) {
  const v = String(phone ?? '').replace(/[\s()-]/g, '');
  if (v === '') return null; // isteğe bağlı
  if (!/^(\+90|0)?5\d{9}$/.test(v)) return 'Telefon numarası 05xx xxx xx xx biçiminde olmalıdır.';
  return null;
}

export function validateCatalogStock(input) {
  if (!String(input.brand_name ?? '').trim()) return 'Marka zorunludur.';
  if (!String(input.model ?? '').trim()) return 'Model zorunludur.';
  if (!Number.isInteger(input.capacity_gb) || input.capacity_gb <= 0) return 'Kapasite pozitif bir tam sayı olmalıdır.';
  if (!Number.isInteger(input.stock_count) || input.stock_count < 0) return 'Stok adedi 0 veya daha büyük olmalıdır.';
  if (!Number.isFinite(input.price) || input.price < 0) return 'Alış fiyatı geçersiz.';
  if (!Number.isFinite(input.sale_price) || input.sale_price < 0) return 'Satış fiyatı geçersiz.';
  if (!STATUS_OPTIONS.some((o) => o.value === input.status)) return 'Disk durumu geçersiz.';
  return null;
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
