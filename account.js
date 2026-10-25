// Müşteri hesabı: siparişler, faturalar, iptal, profil ve bildirimler.
import { sb, fetchMyOrders, cancelOrder, fetchProfile, updateProfile, fetchNotifications, markNotificationRead } from './api.js';
import { escapeHtml, formatTRY, ORDER_STATUS_LABELS, CANCELLABLE_STATUSES, validateAddress, validatePhone } from './lib.js';
import { toast, $, emptyState, setBusy, setFormError } from './ui.js';
import { openInvoice, invoiceFromOrder } from './invoice.js';

function orderCard(o) {
  const items = (o.items || []).map((i) => `${escapeHtml(i.brand)} × ${Number(i.qty)}`).join(', ');
  const canCancel = CANCELLABLE_STATUSES.includes(o.status);
  return `
    <article class="order-card">
      <header>
        <strong>${escapeHtml(o.order_no || `#${o.id}`)}</strong>
        <span class="badge-status status-${escapeHtml(o.status)}">${escapeHtml(ORDER_STATUS_LABELS[o.status] || o.status)}</span>
      </header>
      <p class="muted small">${escapeHtml(new Date(o.created_at).toLocaleString('tr-TR'))} · ${escapeHtml(o.payment_method === 'cod' ? 'Kapıda ödeme' : 'Kart')}</p>
      <p>${items}</p>
      <p class="order-total">${escapeHtml(formatTRY(o.total_price))}</p>
      <div class="order-actions">
        <button type="button" class="btn btn-ghost" data-invoice="${Number(o.id)}">Faturayı aç</button>
        ${canCancel ? `<button type="button" class="btn btn-danger" data-cancel="${Number(o.id)}">Siparişi iptal et</button>` : ''}
      </div>
    </article>`;
}

let ordersCache = [];

export async function renderOrders() {
  const list = $('orders-list');
  if (!list) return;
  list.innerHTML = '<p class="muted">Yükleniyor…</p>';
  try {
    ordersCache = await fetchMyOrders();
    list.innerHTML = ordersCache.length ? ordersCache.map(orderCard).join('') : emptyState('Henüz siparişiniz bulunmuyor.');
  } catch (err) {
    list.innerHTML = emptyState(err.message);
  }
}

async function handleOrdersClick(e) {
  const invoiceBtn = e.target.closest('[data-invoice]');
  if (invoiceBtn) {
    const order = ordersCache.find((o) => o.id === Number(invoiceBtn.dataset.invoice));
    if (!order) return;
    // Tıklama anında açılır (pop-up engellenmez).
    if (!openInvoice(invoiceFromOrder(order))) toast('Pop-up engellendi. Tarayıcı ayarlarından izin verin.', 'error');
    return;
  }
  const cancelBtn = e.target.closest('[data-cancel]');
  if (cancelBtn) {
    if (!window.confirm('Bu siparişi iptal etmek istediğinize emin misiniz? Ürünler stoğa geri eklenecektir.')) return;
    setBusy(cancelBtn, true, 'İptal ediliyor…');
    try {
      await cancelOrder(Number(cancelBtn.dataset.cancel));
      toast('Siparişiniz iptal edildi.');
      await renderOrders();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(cancelBtn, false);
    }
  }
}

// ---- Profil ----
export async function openProfile(user) {
  setFormError($('profile-error'), '');
  try {
    const p = await fetchProfile(user.id);
    $('profile-name').value = p?.full_name || user.user_metadata?.full_name || '';
    $('profile-phone').value = p?.phone || '';
    $('profile-address').value = p?.address_text || user.user_metadata?.address || '';
  } catch (err) {
    setFormError($('profile-error'), err.message);
  }
}

async function saveProfile(e, user) {
  e.preventDefault();
  const btn = $('profile-submit');
  const phone = $('profile-phone').value.trim();
  const address = $('profile-address').value.trim();
  const err = validatePhone(phone) || validateAddress(address);
  if (err) { setFormError($('profile-error'), err); return; }
  setBusy(btn, true, 'Kaydediliyor…');
  try {
    await updateProfile(user.id, { phone: phone || null, address_text: address });
    toast('Profiliniz güncellendi.');
    setFormError($('profile-error'), '');
  } catch (e2) {
    setFormError($('profile-error'), e2.message);
  } finally {
    setBusy(btn, false);
  }
}

// ---- Bildirimler ----
let notifCache = [];

function updateBadge() {
  const unread = notifCache.filter((n) => !n.is_read).length;
  const badge = $('notif-count');
  if (!badge) return;
  badge.textContent = String(unread);
  badge.hidden = unread === 0;
}

export async function refreshNotifications() {
  const list = $('notif-list');
  if (!list) return;
  try {
    notifCache = await fetchNotifications();
  } catch (err) {
    list.innerHTML = emptyState(err.message);
    return;
  }
  updateBadge();
  list.innerHTML = notifCache.length
    ? notifCache.map((n) => `
        <li class="notif ${n.is_read ? '' : 'unread'}">
          <div>${escapeHtml(n.message)}</div>
          <div class="muted small">${escapeHtml(new Date(n.created_at).toLocaleString('tr-TR'))}</div>
          ${n.is_read ? '' : `<button type="button" class="link" data-read="${Number(n.id)}">Okundu işaretle</button>`}
        </li>`).join('')
    : emptyState('Bildiriminiz yok.');
}

let realtimeChannel = null;

// Yalnızca bu kullanıcıya ait bildirimler gelir (RLS). Filtre kullanılmaz.
export function subscribeNotifications() {
  if (realtimeChannel) return;
  realtimeChannel = sb.channel('notifications-feed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
      toast(`🔔 ${payload.new?.message ?? 'Yeni bildirim'}`);
      refreshNotifications();
    })
    .subscribe();
}

export function unsubscribeNotifications() {
  if (realtimeChannel) {
    sb.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  notifCache = [];
  updateBadge();
}

async function handleNotifClick(e) {
  const btn = e.target.closest('[data-read]');
  if (!btn) return;
  try {
    await markNotificationRead(Number(btn.dataset.read));
    await refreshNotifications();
  } catch (err) {
    toast(err.message, 'error');
  }
}

export function initAccount(getUser) {
  $('orders-list')?.addEventListener('click', handleOrdersClick);
  $('notif-list')?.addEventListener('click', handleNotifClick);
  $('profile-form')?.addEventListener('submit', (e) => {
    const user = getUser();
    if (user) saveProfile(e, user);
  });
}
