// Uygulama başlatıcı: oturum, rol bazlı görünürlük, modal ve sekme bağlantıları.
// Rol kararı sunucudan (user_roles) gelir. İstemcideki görünürlük yalnızca
// arayüz içindir; veri erişimi RLS ve security definer fonksiyonlarla korunur.
import { getSession, onAuthChange, fetchMyRole, signOut } from './api.js';
import { initTheme, toggleTheme, bindModalDismiss, bindMobileNav, openModal, closeModal, toast, $ } from './ui.js';
import { initCatalog, refreshCatalog } from './catalog.js';
import { initCart, renderCart } from './checkout.js';
import { initAccount, renderOrders, openProfile, refreshNotifications, subscribeNotifications, unsubscribeNotifications } from './account.js';
import { initSupplier, renderMyOffers } from './supplier.js';
import { initAdmin, loadAdmin } from './admin.js';
import { initAuthForms, openAuth } from './auth.js';

let user = null;
let role = 'guest';
let sessionSeq = 0; // yarışan oturum güncellemelerini ayırt etmek için
const getUser = () => user;

// data-show="guest" | "user" | "customer" | "supplier" | "admin" | "all" (virgülle birden çok)
function applyVisibility() {
  document.querySelectorAll('[data-show]').forEach((el) => {
    const tokens = el.dataset.show.split(',').map((t) => t.trim());
    const visible = tokens.includes('all')
      || (!user && tokens.includes('guest'))
      || (Boolean(user) && tokens.includes('user'))
      || (Boolean(user) && tokens.includes(role));
    el.hidden = !visible;
  });
  const badge = $('role-badge');
  if (badge) {
    const labels = { admin: 'Yönetici', supplier: 'Tedarikçi', customer: 'Müşteri' };
    badge.textContent = user ? (labels[role] || 'Müşteri') : '';
    badge.hidden = !user;
  }
  const greeting = $('user-greeting');
  if (greeting) greeting.textContent = user ? (user.user_metadata?.full_name || user.email) : '';
}

async function refreshSession(session) {
  const seq = ++sessionSeq;
  const nextUser = session?.user ?? null;
  let nextRole = 'guest';
  if (nextUser) {
    try {
      nextRole = await fetchMyRole(nextUser.id);
    } catch {
      nextRole = 'customer';
    }
  }
  if (seq !== sessionSeq) return; // daha yeni bir oturum değişikliği geldi

  user = nextUser;
  role = nextRole;
  applyVisibility();

  if (user) {
    subscribeNotifications();
    refreshNotifications();
  } else {
    unsubscribeNotifications();
  }
  if (role === 'admin') await loadAdmin(user.id);
  if (role === 'supplier') renderMyOffers(user.id);
  refreshCatalog();
  renderCart();
}

function bindAccountModal() {
  const tabs = document.querySelectorAll('[data-account-tab]');
  const show = (name) => {
    tabs.forEach((t) => {
      const active = t.dataset.accountTab === name;
      t.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-account-panel]').forEach((p) => { p.hidden = p.dataset.accountPanel !== name; });
    if (name === 'orders') renderOrders();
    if (name === 'profile' && user) openProfile(user);
    if (name === 'notifications') refreshNotifications();
  };
  tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.accountTab)));
  $('open-account')?.addEventListener('click', () => {
    if (!user) { openAuth('login'); openModal('auth-modal'); return; }
    openModal('account-modal');
    show('orders');
  });
}

function bindNav() {
  $('theme-toggle')?.addEventListener('click', toggleTheme);
  $('open-auth')?.addEventListener('click', () => { openAuth('login'); openModal('auth-modal'); });
  $('open-register')?.addEventListener('click', () => { openAuth('register'); openModal('auth-modal'); });
  $('open-cart')?.addEventListener('click', () => { openModal('cart-modal'); renderCart(); });
  $('notif-btn')?.addEventListener('click', () => { openModal('notif-modal'); refreshNotifications(); });
  $('logout-btn')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try {
      await signOut();
      toast('Çıkış yapıldı.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      e.currentTarget.disabled = false;
    }
  });
  $('hero-shop')?.addEventListener('click', () => {
    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
  });
}

function bindAutoRefresh() {
  // Stok değişimleri katalogda gecikmeli görünür (stocks realtime bilerek kapalı:
  // alış fiyatı sızıntısını önlemek için). 60 sn'de bir ve sekme öne gelince yenilenir.
  setInterval(() => { if (!document.hidden) refreshCatalog(); }, 60_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshCatalog(); });
}

async function boot() {
  initTheme();
  bindModalDismiss();
  bindMobileNav();
  initAuthForms();
  initCatalog();
  initCart({
    getUser,
    requireLogin: () => { closeModal('cart-modal'); openAuth('login'); openModal('auth-modal'); },
    onOrderPlaced: () => { refreshCatalog(); if (role === 'customer' || role === 'supplier') renderOrders(); },
  });
  initAccount(getUser);
  initSupplier();
  initAdmin();
  bindAccountModal();
  bindNav();
  bindAutoRefresh();

  onAuthChange((_event, session) => {
    // Supabase callback'i içinde doğrudan çağrı yapmamak için ertelenir.
    setTimeout(() => refreshSession(session), 0);
  });

  try {
    const session = await getSession();
    await refreshSession(session);
  } catch (err) {
    toast(err.message, 'error');
    applyVisibility();
    refreshCatalog();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
