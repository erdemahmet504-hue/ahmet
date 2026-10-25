import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml, formatTRY, capacityLabel, isSellable, sanitizeSearchTerm, clampQty,
  cartSummary, validateName, validateEmail, validatePassword, validateAddress,
  validatePhone, validateCatalogStock, SHIPPING_FEE, FREE_SHIPPING_THRESHOLD,
} from '../public/js/lib.js';
import { buildInvoiceHtml } from '../public/js/invoice.js';

test('escapeHtml tüm tehlikeli karakterleri kaçışlar (XSS)', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escapeHtml(`a&b'c`), 'a&amp;b&#39;c');
  assert.equal(escapeHtml(null), '');
});

test('formatTRY Türk lirası biçimi üretir', () => {
  const s = formatTRY(1234.5);
  assert.ok(s.includes('1.234,50'), s);
  assert.equal(formatTRY('abc').includes('0,00'), true);
});

test('capacityLabel GB/TB dönüşümü yapar', () => {
  assert.equal(capacityLabel(500), '500 GB');
  assert.equal(capacityLabel(1000), '1 TB');
  assert.equal(capacityLabel(1500), '1,5 TB');
  assert.equal(capacityLabel(0), '-');
});

test('yalnızca %100/Sağlıklı satılabilir; arızalı ve test edilmemiş değil', () => {
  assert.equal(isSellable({ status: '%100', published: true }), true);
  assert.equal(isSellable({ status: 'Sağlıklı', published: true }), true);
  assert.equal(isSellable({ status: 'Arızalı', published: true }), false);
  assert.equal(isSellable({ status: 'Sağlığı Düşük', published: true }), false);
  assert.equal(isSellable({ status: 'Test Edilmedi', published: true }), false);
  assert.equal(isSellable({ status: '%100', published: false }), false);
});

test('arama metni PostgREST filtre enjeksiyonuna karşı temizlenir', () => {
  const t = sanitizeSearchTerm(`x,brand.eq.evil(%)"'\\_*`);
  assert.equal(/[,()"'\\%_*]/.test(t), false, t);
  assert.ok(sanitizeSearchTerm('a'.repeat(200)).length <= 60);
});

test('adet 1-20 aralığına sıkıştırılır', () => {
  assert.equal(clampQty(0), 1);
  assert.equal(clampQty(-5), 1);
  assert.equal(clampQty(7.9), 7);
  assert.equal(clampQty(999), 20);
  assert.equal(clampQty('abc'), 1);
});

test('sepet toplamı: kargo ve KDV dökümü', () => {
  const low = cartSummary([{ unit_price: 500, qty: 2 }]);
  assert.equal(low.subtotal, 1000);
  assert.equal(low.shipping, SHIPPING_FEE);
  assert.equal(low.total, 1000 + SHIPPING_FEE);
  assert.equal(low.kdv, Math.round(((1099) - 1099 / 1.2) * 100) / 100);

  const high = cartSummary([{ unit_price: FREE_SHIPPING_THRESHOLD, qty: 1 }]);
  assert.equal(high.shipping, 0);
  assert.equal(high.total, FREE_SHIPPING_THRESHOLD);
});

test('doğrulayıcılar geçersiz girdiyi reddeder', () => {
  assert.ok(validateName('Al'));
  assert.equal(validateName('Ali Veli'), null);
  assert.ok(validateEmail('bozuk-eposta'));
  assert.equal(validateEmail('a@b.co'), null);
  assert.ok(validatePassword('12345678')); // harf yok
  assert.ok(validatePassword('abcdefgh')); // rakam yok
  assert.equal(validatePassword('abcdefg1'), null);
  assert.ok(validateAddress('kısa'));
  assert.equal(validatePhone(''), null);
  assert.equal(validatePhone('0532 123 45 67'), null);
  assert.ok(validatePhone('12345'));
});

test('stok formu doğrulaması: negatif stok ve geçersiz durum reddedilir', () => {
  const ok = { brand_name: 'WD', model: '2.5', capacity_gb: 1000, stock_count: 3, price: 800, sale_price: 1000, status: '%100' };
  assert.equal(validateCatalogStock(ok), null);
  assert.ok(validateCatalogStock({ ...ok, stock_count: -1 }));
  assert.ok(validateCatalogStock({ ...ok, status: 'Hurda' }));
  assert.ok(validateCatalogStock({ ...ok, capacity_gb: 0 }));
});

test('fatura HTML\'i kullanıcı girdisini kaçışlar ve tutarları yazar', () => {
  const html = buildInvoiceHtml({
    title: 'Satış Belgesi', number: 'EB1', date: '01.01.2026',
    customerName: '<script>alert(1)</script>', address: 'Adres & "test" sokak 1',
    paymentLabel: 'Kapıda ödeme',
    lines: [{ name: 'WD Blue 1 TB', qty: 2, unitPrice: 500 }],
    subtotal: 1000, shipping: 0, total: 1000, kdv: 166.67,
  });
  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('Adres &amp; &quot;test&quot; sokak 1'));
  assert.ok(html.includes('Genel Toplam'));
  assert.ok(html.includes('charset="utf-8"'));
  assert.ok(html.includes('yasal e-Fatura'));
});
