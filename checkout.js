// Sepet ekranı ve ödeme akışı.
// - Fiyatlar sunucudan okunur; sipariş toplamını sunucu hesaplar.
// - Aynı deneme için aynı idempotency anahtarı kullanılır (çift sipariş olmaz).
// - Sanal POS kapalıyken kart seçeneği devre dışıdır (sahte ödeme yoktur).
import { fetchCatalogByIds, placeOrder, fetchProfile } from './api.js';
import { PAYMENT } from './config.js';
import { getItems, setQty, removeItem, clearCart, countItems, onCartChange } from './cart.js';
import { escapeHtml, formatTRY, capacityLabel, cartSummary, validateAddress, clampQty } from './lib.js';
import { toast, $, openModal, closeModal, setBusy, setFormError, emptyState, isModalOpen } from './ui.js';
import { openInvoice, invoiceFromOrder, writeInvoice } from './invoice.js';

let deps = { getUser: () => null, requireLogin: () => {}, onOrderPlaced: () => {} };
let pendingKey = null; // mevcut denemenin idempotency anahtarı
let cachedLines = [];

function newKey() {
  return (crypto.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

async function buildLines() {
  const items = getItems();
  if (!items.length) return [];
  const products = await fetchCatalogByIds(items.map((i) => i.id));
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines = [];
  for (const item of items) {
    const p = byId.get(item.id);
    if (!p || Number(p.sale_price) <= 0) {
      removeItem(item.id); // artık satılmıyor
      toast('Sepetinizdeki bir ürün artık satışta değil ve kaldırıldı.', 'error');
      continue;
    }
    const available = Number(p.stock_count);
    const qty = Math.min(clampQty(item.qty), Math.max(0, available));
    if (qty !== item.qty) setQty(item.id, qty || 1);
    lines.push({
      id: p.id,
      name: `${p.brand_name} ${capacityLabel(p.capacity_gb)}${p.model ? ` (${p.model})` : ''}`,
      unit_price: Number(p.sale_price),
      qty: qty || 0,
      available,
    });
  }
  return lines.filter((l) => l.qty > 0);
}

export async function renderCart() {
  const list = $('cart-items');
  const totalEl = $('cart-total');
  const checkoutBtn = $('cart-checkout');
  if (!list) return;
  list.setAttribute('aria-busy', 'true');
  try {
    cachedLines = await buildLines();
  } catch (err) {
    list.innerHTML = emptyState(err.message || 'Sepet yüklenemedi.');
    list.removeAttribute('aria-busy');
    return;
  }
  list.removeAttribute('aria-busy');

  if (!cachedLines.length) {
    list.innerHTML = emptyState('Sepetiniz boş.');
    totalEl.textContent = '';
    if (checkoutBtn) checkoutBtn.disabled = true;
    return;
  }

  list.innerHTML = cachedLines.map((l) => `
    <li class="cart-line">
      <div class="cart-line-info">
        <strong>${escapeHtml(l.name)}</strong>
        <span class="muted">${escapeHtml(formatTRY(l.unit_price))} · stokta ${l.available}</span>
      </div>
      <div class="qty-control" role="group" aria-label="${escapeHtml(l.name)} adedi">
        <button type="button" data-cart-action="dec" data-id="${l.id}" aria-label="Azalt">−</button>
        <span aria-live="polite">${l.qty}</span>
        <button type="button" data-cart-action="inc" data-id="${l.id}" aria-label="Artır" ${l.qty >= l.available ? 'disabled' : ''}>+</button>
      </div>
      <div class="cart-line-total">${escapeHtml(formatTRY(l.unit_price * l.qty))}</div>
      <button type="button" class="link-danger" data-cart-action="remove" data-id="${l.id}">Kaldır</button>
    </li>`).join('');

  const s = cartSummary(cachedLines);
  totalEl.innerHTML = `
    <div><span>Ara toplam</span><span>${escapeHtml(formatTRY(s.subtotal))}</span></div>
    <div><span>Kargo</span><span>${s.shipping === 0 ? 'Ücretsiz' : escapeHtml(formatTRY(s.shipping))}</span></div>
    <div class="grand"><span>Toplam (KDV dahil)</span><span>${escapeHtml(formatTRY(s.total))}</span></div>
    <p class="muted small">Nihai tutar sipariş anında sunucuda yeniden hesaplanır.</p>`;
  if (checkoutBtn) checkoutBtn.disabled = false;
}

function updateCartBadge() {
  const count = countItems();
  const badge = $('cart-count');
  if (badge) {
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }
}

function openCheckout() {
  const user = deps.getUser();
  if (!user) {
    toast('Sipariş için giriş yapmalısınız.', 'error');
    deps.requireLogin();
    return;
  }
  if (!cachedLines.length) {
    toast('Sepetiniz boş.', 'error');
    return;
  }
  pendingKey = pendingKey || newKey();
  $('checkout-summary').innerHTML = cachedLines
    .map((l) => `<li>${escapeHtml(l.name)} × ${l.qty}</li>`).join('');
  const s = cartSummary(cachedLines);
  $('checkout-total').textContent = formatTRY(s.total);

  const cardRadio = document.querySelector('input[name="payment-method"][value="card"]');
  const cardHint = $('card-hint');
  if (cardRadio) cardRadio.disabled = !PAYMENT.cardEnabled;
  if (cardHint) cardHint.textContent = PAYMENT.cardEnabled
    ? ''
    : 'Online kart ödemesi henüz aktif değil. Kapıda ödeme ile sipariş verebilirsiniz.';
  document.querySelector('input[name="payment-method"][value="cod"]').checked = true;

  setFormError($('checkout-error'), '');
  openModal('checkout-modal');
  prefillCheckout(user);
}

async function prefillCheckout(user) {
  try {
    const profile = await fetchProfile(user.id);
    if (profile?.address_text && !$('checkout-address').value) $('checkout-address').value = profile.address_text;
    if (profile?.full_name) $('checkout-name').value = profile.full_name;
  } catch {
    // Profil yüklenemezse alanlar boş kalır; kullanıcı girebilir.
  }
  if (!$('checkout-name').value) $('checkout-name').value = user.user_metadata?.full_name || '';
  if (!$('checkout-address').value) $('checkout-address').value = user.user_metadata?.address || '';
}

async function submitCheckout(event) {
  event.preventDefault();
  const user = deps.getUser();
  const btn = $('checkout-submit');
  setFormError($('checkout-error'), '');
  if (!user) { deps.requireLogin(); return; }

  const address = $('checkout-address').value.trim();
  const customerName = $('checkout-name').value.trim();
  const method = document.querySelector('input[name="payment-method"]:checked')?.value;

  const addressError = validateAddress(address);
  if (addressError) { setFormError($('checkout-error'), addressError); return; }
  if (method !== 'cod') { setFormError($('checkout-error'), 'Lütfen kapıda ödeme seçin.'); return; }
  if (!cachedLines.length) { setFormError($('checkout-error'), 'Sepetiniz boş.'); return; }

  // Pop-up engellenmesin diye pencere tıklama anında açılır.
  const invoiceWindow = window.open('', '_blank');
  if (invoiceWindow) {
    try { invoiceWindow.opener = null; } catch { /* yoksay */ }
    invoiceWindow.document.write('<p style="font-family:sans-serif;padding:24px">Fatura hazırlanıyor…</p>');
  }

  setBusy(btn, true, 'Sipariş oluşturuluyor…');
  try {
    const order = await placeOrder({
      items: cachedLines.map((l) => ({ id: l.id, qty: l.qty })),
      paymentMethod: method,
      address,
      customerName,
      idempotencyKey: pendingKey,
    });
    pendingKey = null;
    clearCart();
    closeModal('checkout-modal');
    closeModal('cart-modal');
    toast(`Siparişiniz alındı: ${order.order_no}`);
    if (invoiceWindow && !invoiceWindow.closed) {
      writeInvoice(invoiceWindow, invoiceFromOrder(order));
    } else {
      toast('Fatura penceresi açılamadı. Hesabım > Siparişlerim bölümünden faturanızı açabilirsiniz.', 'error');
    }
    deps.onOrderPlaced(order);
  } catch (err) {
    invoiceWindow?.close();
    setFormError($('checkout-error'), err.message || 'Sipariş oluşturulamadı.');
    // Stok değişmiş olabilir: sepeti sunucudan yeniden doğrula.
    renderCart();
  } finally {
    setBusy(btn, false);
  }
}

export function initCart(options) {
  deps = { ...deps, ...options };

  $('cart-items')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cart-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const line = cachedLines.find((l) => l.id === id);
    const action = btn.dataset.cartAction;
    if (action === 'remove') removeItem(id);
    if (action === 'inc' && line) setQty(id, Math.min(line.qty + 1, line.available));
    if (action === 'dec' && line) setQty(id, line.qty - 1 < 1 ? 1 : line.qty - 1);
    // setQty/removeItem onCartChange'i tetikler
  });

  $('cart-checkout')?.addEventListener('click', openCheckout);
  $('checkout-form')?.addEventListener('submit', submitCheckout);

  onCartChange(() => {
    updateCartBadge();
    if (isModalOpen('cart-modal')) renderCart();
  });
  updateCartBadge();
}

export { invoiceFromOrder, openInvoice };
