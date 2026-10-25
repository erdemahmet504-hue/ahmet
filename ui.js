// Ortak arayüz yardımcıları: bildirim (toast), modal, buton durumu, tema.
import { escapeHtml } from './lib.js';

const $ = (id) => document.getElementById(id);

export function toast(message, type = 'success') {
  const container = $('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message; // innerHTML yok: mesajlar güvenli metin olarak basılır
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

let lastFocused = null;

export function openModal(id) {
  const modal = $(id);
  if (!modal) return;
  lastFocused = document.activeElement;
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  const focusable = modal.querySelector('input, select, textarea, button:not([disabled]), [tabindex]');
  (focusable || modal.querySelector('.modal-content'))?.focus();
}

export function closeModal(id) {
  const modal = $(id);
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
}

export function isModalOpen(id) {
  const modal = $(id);
  return Boolean(modal) && !modal.hidden;
}

// Modal dışına tıklama ve ESC ile kapatma; data-close-modal özniteliği olan düğmeler.
export function bindModalDismiss() {
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.modal-overlay:not([hidden])').forEach((m) => closeModal(m.id));
  });
}

export function setBusy(button, busy, busyText = 'İşleniyor…') {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.dataset.label || button.textContent;
    button.textContent = busyText;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

export function setFormError(el, message) {
  if (!el) return;
  el.textContent = message || '';
  el.hidden = !message;
}

export function emptyState(message) {
  return `<p class="empty-state">${escapeHtml(message)}</p>`;
}

export function skeletonRows(count = 3) {
  return Array.from({ length: count }, () => '<div class="skeleton" aria-hidden="true"></div>').join('');
}

// ---- Tema: kullanıcının tercihi bu tarayıcıda saklanır (kişisel tercih) ----
const THEME_KEY = 'eb_theme';

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = $('theme-toggle');
  if (btn) {
    const dark = theme === 'dark';
    btn.setAttribute('aria-pressed', String(dark));
    btn.textContent = dark ? 'Açık tema' : 'Koyu tema';
  }
}

export function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* gizli mod vb. */ }
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
}

export function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch { /* yoksay */ }
}

// Mobil gezinme menüsü (aria-expanded ile erişilebilir)
export function bindMobileNav() {
  const toggle = $('nav-toggle');
  const nav = $('site-nav');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    nav.dataset.open = String(!open);
  });
  nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
    toggle.setAttribute('aria-expanded', 'false');
    nav.dataset.open = 'false';
  }));
}

export { $ };
