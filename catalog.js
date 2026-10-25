// Ürün vitrini: arama, filtre, sıralama, sayfalama ve sepete ekleme.
import { fetchCatalog, fetchCatalogFacets } from './api.js';
import { escapeHtml, formatTRY, capacityLabel, statusLabel, debounce } from './lib.js';
import { PAGE_SIZE } from './config.js';
import { addItem } from './cart.js';
import { toast, $, emptyState, skeletonRows } from './ui.js';

const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260">' +
    '<rect width="400" height="260" fill="#e6ebf2"/>' +
    '<rect x="150" y="90" width="100" height="80" rx="8" fill="#9aa8ba"/>' +
    '<text x="200" y="200" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#5b6778">Görsel yok</text></svg>',
  );

const state = {
  page: 0,
  count: 0,
  search: '',
  brand: '',
  capacity: '',
  model: '',
  sort: 'newest',
  requestId: 0,
};

function safeImageUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : PLACEHOLDER_IMG;
  } catch {
    return PLACEHOLDER_IMG;
  }
}

function cardTemplate(p) {
  const name = `${p.brand_name ?? ''} ${capacityLabel(p.capacity_gb)}`.trim();
  return `
    <article class="product-card">
      <img class="product-img" src="${escapeHtml(safeImageUrl(p.image_url))}" alt="${escapeHtml(name)} disk" loading="lazy" width="400" height="220">
      <div class="product-body">
        <p class="product-brand">${escapeHtml(p.brand_name)}</p>
        <h3 class="product-title">${escapeHtml(name)}</h3>
        <p class="product-meta">${escapeHtml(p.model || '-')} · ${escapeHtml(statusLabel(p.status))}</p>
        <p class="product-stock">Stokta: ${Number(p.stock_count)} adet</p>
        <p class="product-price">${escapeHtml(formatTRY(p.sale_price))} <span class="vat">KDV dahil</span></p>
        <button type="button" class="btn btn-primary w-100" data-add-to-cart="${Number(p.id)}" data-label="${escapeHtml(name)}">Sepete Ekle</button>
      </div>
    </article>`;
}

function renderPager() {
  const pages = Math.max(1, Math.ceil(state.count / PAGE_SIZE));
  const pager = $('catalog-pager');
  if (!pager) return;
  pager.hidden = pages <= 1;
  $('pager-info').textContent = `Sayfa ${state.page + 1} / ${pages} · ${state.count} ürün`;
  $('pager-prev').disabled = state.page === 0;
  $('pager-next').disabled = state.page + 1 >= pages;
}

export async function refreshCatalog() {
  const grid = $('products-grid');
  if (!grid) return;
  const requestId = ++state.requestId;
  grid.setAttribute('aria-busy', 'true');
  if (!grid.children.length) grid.innerHTML = skeletonRows(6);
  try {
    const { rows, count } = await fetchCatalog(state);
    if (requestId !== state.requestId) return; // daha yeni bir istek var
    state.count = count;
    grid.innerHTML = rows.length
      ? rows.map(cardTemplate).join('')
      : emptyState('Aradığınız kriterlere uygun ürün bulunamadı.');
    renderPager();
  } catch (err) {
    if (requestId !== state.requestId) return;
    grid.innerHTML = emptyState(err.message || 'Ürünler yüklenemedi. Lütfen tekrar deneyin.');
  } finally {
    if (requestId === state.requestId) grid.removeAttribute('aria-busy');
  }
}

async function loadFacets() {
  try {
    const { brands, capacities, models } = await fetchCatalogFacets();
    fillSelect('filter-brand', brands, 'Tüm markalar', (v) => v);
    fillSelect('filter-capacity', capacities, 'Tüm kapasiteler', (v) => String(v), capacityLabel);
    fillSelect('filter-model', models, 'Tüm inç / model', (v) => v);
  } catch {
    // Filtreler yüklenemezse vitrin yine de çalışır.
  }
}

function fillSelect(id, values, allLabel, valueOf, labelOf = (v) => v) {
  const select = $(id);
  if (!select) return;
  const current = select.value;
  select.innerHTML =
    `<option value="">${escapeHtml(allLabel)}</option>` +
    values.map((v) => `<option value="${escapeHtml(valueOf(v))}">${escapeHtml(labelOf(v))}</option>`).join('');
  select.value = current;
}

export function initCatalog() {
  const search = $('search-input');
  search?.addEventListener('input', debounce(() => {
    state.search = search.value.trim();
    state.page = 0;
    refreshCatalog();
  }, 300));

  const bindSelect = (id, key) => $(id)?.addEventListener('change', (e) => {
    state[key] = e.target.value;
    state.page = 0;
    refreshCatalog();
  });
  bindSelect('filter-brand', 'brand');
  bindSelect('filter-capacity', 'capacity');
  bindSelect('filter-model', 'model');
  bindSelect('sort-select', 'sort');

  $('filter-reset')?.addEventListener('click', () => {
    Object.assign(state, { search: '', brand: '', capacity: '', model: '', sort: 'newest', page: 0 });
    if (search) search.value = '';
    ['filter-brand', 'filter-capacity', 'filter-model'].forEach((id) => { if ($(id)) $(id).value = ''; });
    if ($('sort-select')) $('sort-select').value = 'newest';
    refreshCatalog();
  });

  $('pager-prev')?.addEventListener('click', () => { state.page = Math.max(0, state.page - 1); refreshCatalog(); window.scrollTo({ top: $('catalog')?.offsetTop ?? 0, behavior: 'smooth' }); });
  $('pager-next')?.addEventListener('click', () => { state.page += 1; refreshCatalog(); window.scrollTo({ top: $('catalog')?.offsetTop ?? 0, behavior: 'smooth' }); });

  $('products-grid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add-to-cart]');
    if (!btn) return;
    addItem(Number(btn.dataset.addToCart), 1);
    toast(`${btn.dataset.label} sepete eklendi.`);
  });

  loadFacets();
}
