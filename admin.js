// Yönetici paneli: stok, teklifler, barkodla satış, raporlar, siparişler, kullanıcı/rol.
// Tüm yetki kontrolleri sunucuda (RLS + security definer). Bu panel yalnızca
// rolü 'admin' olan kullanıcıya gösterilir; ancak asıl koruma veritabanındadır.
import {
  staffListStocks, adminInsertStock, adminUpdateStock, adminDeleteStock,
  recordPosSale, fetchSales, adminListOrders, adminSetOrderStatus, cancelOrder,
  adminListUsers, adminSetRole, fetchAuditLogs,
} from './api.js';
import {
  escapeHtml, formatTRY, capacityLabel, statusLabel, STATUS_OPTIONS,
  validateCatalogStock, ORDER_STATUS_LABELS, CANCELLABLE_STATUSES,
} from './lib.js';
import { toast, $, emptyState, setBusy, setFormError, skeletonRows } from './ui.js';
import { openInvoice } from './invoice.js';

const state = { stocks: [], orders: [], users: [], currentUserId: null };

const money = (n) => formatTRY(Number(n) || 0);

function statusOptions(selected) {
  return STATUS_OPTIONS.map((o) => `<option value="${escapeHtml(o.value)}" ${o.value === selected ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
}

// ------------------------------------------------------------ Sekmeler -----
function showTab(name) {
  document.querySelectorAll('[data-admin-tab]').forEach((b) => {
    const active = b.dataset.adminTab === name;
    b.setAttribute('aria-selected', String(active));
    b.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('[data-admin-panel]').forEach((p) => { p.hidden = p.dataset.adminPanel !== name; });
  if (name === 'stock') renderStock();
  if (name === 'offers') renderOffers();
  if (name === 'reports') renderReports();
  if (name === 'orders') loadOrders();
  if (name === 'users') loadUsers();
}

// ----------------------------------------------------------- Stok / Teklif
async function loadStocks() {
  try {
    state.stocks = await staffListStocks();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderStock() {
  const body = $('admin-stock-body');
  if (!body) return;
  const rows = state.stocks.filter((s) => !s.seller_id);
  body.innerHTML = rows.length ? rows.map((s) => `
    <tr data-stock-row="${Number(s.id)}">
      <td>${escapeHtml(s.barcode || '-')}</td>
      <td><strong>${escapeHtml(s.brand_name)}</strong><br><span class="muted small">${escapeHtml(s.model || '')}</span></td>
      <td>${escapeHtml(capacityLabel(s.capacity_gb))}</td>
      <td><input type="number" min="0" step="1" class="input-compact" data-field="stock_count" value="${Number(s.stock_count)}" aria-label="Stok adedi"></td>
      <td><select class="input-compact" data-field="status" aria-label="Disk durumu">${statusOptions(s.status)}</select></td>
      <td><input type="number" min="0" step="0.01" class="input-compact" data-field="price" value="${Number(s.price)}" aria-label="Alış fiyatı"></td>
      <td><input type="number" min="0" step="0.01" class="input-compact" data-field="sale_price" value="${Number(s.sale_price)}" aria-label="Satış fiyatı"></td>
      <td><label class="switch"><input type="checkbox" data-field="published" ${s.published ? 'checked' : ''}><span>${s.published ? 'Yayında' : 'Gizli'}</span></label></td>
      <td class="actions-cell">
        <button type="button" class="btn btn-small" data-save-stock="${Number(s.id)}">Kaydet</button>
        <button type="button" class="btn btn-small btn-danger" data-delete-stock="${Number(s.id)}">Sil</button>
      </td>
    </tr>`).join('')
    : `<tr><td colspan="9">${emptyState('Henüz ürün yok. Yukarıdaki formla ekleyebilirsiniz.')}</td></tr>`;
  const low = rows.filter((s) => Number(s.stock_count) <= Number(s.min_stock ?? 2));
  $('critical-stock').innerHTML = low.length
    ? `<strong>Kritik stok:</strong> ${low.map((s) => `${escapeHtml(s.brand_name)} ${escapeHtml(s.model || '')} (${Number(s.stock_count)})`).join(' · ')}`
    : '<span class="muted">Kritik stok yok.</span>';
}

function readRowInputs(row) {
  const get = (f) => row.querySelector(`[data-field="${f}"]`);
  return {
    stock_count: Number(get('stock_count').value),
    status: get('status').value,
    price: Number(get('price').value),
    sale_price: Number(get('sale_price').value),
    published: get('published').checked,
  };
}

async function saveStockRow(id, btn) {
  const row = document.querySelector(`[data-stock-row="${id}"]`);
  if (!row) return;
  const fields = readRowInputs(row);
  const original = state.stocks.find((s) => Number(s.id) === id);
  const err = validateCatalogStock({ ...original, ...fields, capacity_gb: Number(original.capacity_gb) });
  if (err) { toast(err, 'error'); return; }
  if (fields.published && fields.sale_price <= 0) { toast('Yayına almak için satış fiyatı 0’dan büyük olmalıdır.', 'error'); return; }
  setBusy(btn, true, '…');
  try {
    await adminUpdateStock(id, fields);
    toast('Ürün güncellendi.');
    await loadStocks();
    renderStock();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    setBusy(btn, false);
  }
}

async function deleteStock(id, btn) {
  if (!window.confirm('Bu ürünü silmek istediğinize emin misiniz? Bu işlem geri alınamaz.')) return;
  setBusy(btn, true, '…');
  try {
    await adminDeleteStock(id);
    toast('Ürün silindi.');
    await loadStocks();
    renderStock();
  } catch (e) {
    toast(e.message, 'error');
    setBusy(btn, false);
  }
}

async function handleAddStock(e) {
  e.preventDefault();
  const btn = $('add-stock-submit');
  const row = {
    barcode: $('new-barcode').value.trim() || null,
    brand_name: $('new-brand').value.trim(),
    model: $('new-model').value.trim(),
    capacity_gb: Number($('new-capacity').value),
    stock_count: Number($('new-stock').value),
    status: $('new-status').value,
    price: Number($('new-price').value),
    sale_price: Number($('new-sale-price').value),
    image_url: $('new-image').value.trim() || null,
    min_stock: Number($('new-min-stock').value || 2),
    published: $('new-published').checked,
  };
  const err = validateCatalogStock(row);
  setFormError($('add-stock-error'), err || '');
  if (err) return;
  if (row.image_url && !/^https?:\/\//.test(row.image_url)) { setFormError($('add-stock-error'), 'Görsel adresi http(s) ile başlamalıdır.'); return; }
  if (row.barcode && row.barcode.length > 64) { setFormError($('add-stock-error'), 'Barkod en fazla 64 karakter olabilir.'); return; }

  setBusy(btn, true, 'Ekleniyor…');
  try {
    await adminInsertStock(row);
    $('add-stock-form').reset();
    $('new-min-stock').value = '2';
    toast('Ürün eklendi.');
    await loadStocks();
    renderStock();
  } catch (error) {
    setFormError($('add-stock-error'), error.message);
  } finally {
    setBusy(btn, false);
  }
}

function renderOffers() {
  const body = $('admin-offers-body');
  if (!body) return;
  const offers = state.stocks.filter((s) => s.seller_id && !s.published);
  body.innerHTML = offers.length ? offers.map((o) => `
    <tr data-offer-row="${Number(o.id)}">
      <td><strong>${escapeHtml(o.brand_name)}</strong> ${escapeHtml(o.model || '')}</td>
      <td>${escapeHtml(capacityLabel(o.capacity_gb))}</td>
      <td>${Number(o.stock_count)}</td>
      <td>${escapeHtml(statusLabel(o.status))}</td>
      <td>${escapeHtml(money(o.seller_price))}</td>
      <td><input type="number" min="0" step="0.01" class="input-compact" data-offer-field="price" value="${Number(o.seller_price ?? 0)}" aria-label="Alış fiyatı"></td>
      <td><input type="number" min="0" step="0.01" class="input-compact" data-offer-field="sale_price" value="" placeholder="Satış" aria-label="Satış fiyatı"></td>
      <td class="actions-cell">
        <button type="button" class="btn btn-small" data-approve-offer="${Number(o.id)}">Onayla ve yayınla</button>
        <button type="button" class="btn btn-small btn-danger" data-reject-offer="${Number(o.id)}">Reddet</button>
      </td>
    </tr>`).join('')
    : `<tr><td colspan="8">${emptyState('Bekleyen tedarikçi teklifi yok.')}</td></tr>`;
}

async function approveOffer(id, btn) {
  const row = document.querySelector(`[data-offer-row="${id}"]`);
  const price = Number(row.querySelector('[data-offer-field="price"]').value);
  const salePrice = Number(row.querySelector('[data-offer-field="sale_price"]').value);
  if (!Number.isFinite(price) || price < 0) { toast('Alış fiyatı geçersiz.', 'error'); return; }
  if (!Number.isFinite(salePrice) || salePrice <= 0) { toast('Satış fiyatı 0’dan büyük olmalıdır.', 'error'); return; }
  setBusy(btn, true, '…');
  try {
    // Sunucu: published false->true olduğunda tedarikçiye bildirim üretilir.
    await adminUpdateStock(id, { published: true, price, sale_price: salePrice });
    toast('Teklif onaylandı ve yayına alındı.');
    await loadStocks();
    renderOffers();
    renderStock();
  } catch (e) {
    toast(e.message, 'error');
    setBusy(btn, false);
  }
}

async function rejectOffer(id, btn) {
  if (!window.confirm('Bu teklifi reddedip kaldırmak istediğinize emin misiniz?')) return;
  setBusy(btn, true, '…');
  try {
    await adminDeleteStock(id);
    toast('Teklif reddedildi.');
    await loadStocks();
    renderOffers();
  } catch (e) {
    toast(e.message, 'error');
    setBusy(btn, false);
  }
}

// ----------------------------------------------------------- Barkod satış --
async function handlePosSale(e) {
  e.preventDefault();
  const input = $('pos-barcode');
  const barcode = input.value.trim();
  const session = $('pos-session').value.trim() || 'Varsayılan Satış';
  const btn = $('pos-submit');
  if (!barcode) return;
  setBusy(btn, true, 'Kaydediliyor…');
  try {
    const sale = await recordPosSale(barcode, session);
    input.value = '';
    input.focus();
    toast(`Satış kaydedildi: ${sale.title}`);
    await loadStocks();
    renderStock();
    if (window.confirm('Müşteriye satış belgesi (fatura) verilsin mi?')) {
      const price = Number(sale.price);
      const kdv = Math.round((price - price / 1.2) * 100) / 100;
      const ok = openInvoice({
        title: 'Satış Belgesi',
        number: `POS-${sale.id}`,
        date: new Date().toLocaleDateString('tr-TR'),
        customerName: 'Müşteri',
        address: 'Mağazadan elden teslim',
        paymentLabel: 'Mağaza satışı',
        lines: [{ name: sale.title, qty: 1, unitPrice: price }],
        subtotal: price,
        shipping: 0,
        total: price,
        kdv,
      });
      if (!ok) toast('Pop-up engellendi; belge açılamadı.', 'error');
    }
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setBusy(btn, false);
    input.focus();
  }
}

// ----------------------------------------------------------- Raporlar -----
function rangeStart(range) {
  const now = new Date();
  if (range === 'today') { now.setHours(0, 0, 0, 0); return now.toISOString(); }
  if (range === '7d') return new Date(Date.now() - 7 * 864e5).toISOString();
  if (range === '30d') return new Date(Date.now() - 30 * 864e5).toISOString();
  return null;
}

async function renderReports() {
  const range = $('report-range').value;
  const kpi = $('kpi-cards');
  kpi.innerHTML = skeletonRows(4);
  let sales = [];
  try {
    sales = await fetchSales(rangeStart(range));
  } catch (err) {
    kpi.innerHTML = emptyState(err.message);
    return;
  }

  let revenue = 0; let profit = 0; let units = 0; const brands = {}; const sessions = {};
  for (const s of sales) {
    const count = Number(s.sale_count) || 1;
    const price = Number(s.price) || 0;
    const buy = Number(s.buy_price) || 0;
    revenue += price * count;
    profit += (price - buy) * count;
    units += count;
    const brand = (s.title || '').split(' ')[0] || 'Diğer';
    brands[brand] = (brands[brand] || 0) + count;
    const key = s.session_name || 'Varsayılan Satış';
    sessions[key] = sessions[key] || { units: 0, revenue: 0 };
    sessions[key].units += count;
    sessions[key].revenue += price * count;
  }
  const top = Object.entries(brands).sort((a, b) => b[1] - a[1])[0];

  kpi.innerHTML = [
    ['Ciro', money(revenue)],
    ['Brüt kâr', money(profit)],
    ['Satılan adet', String(units)],
    ['En çok satan marka', top ? `${top[0]} (${top[1]})` : '—'],
  ].map(([label, value]) => `<div class="kpi"><span class="muted small">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');

  const sessionRows = Object.entries(sessions);
  $('session-body').innerHTML = sessionRows.length
    ? sessionRows.map(([name, v]) => `<tr><td>${escapeHtml(name)}</td><td>${v.units}</td><td>${escapeHtml(money(v.revenue))}</td></tr>`).join('')
    : `<tr><td colspan="3">${emptyState('Bu aralıkta satış yok.')}</td></tr>`;

  if (!state.stocks.length) await loadStocks();
  const critical = state.stocks.filter((s) => !s.seller_id && Number(s.stock_count) <= Number(s.min_stock ?? 2));
  $('critical-list').innerHTML = critical.length
    ? critical.map((s) => `<li>${escapeHtml(s.brand_name)} ${escapeHtml(s.model || '')} — <strong>${Number(s.stock_count)}</strong> adet</li>`).join('')
    : '<li class="muted">Kritik stok yok.</li>';

  try {
    const logs = await fetchAuditLogs();
    $('audit-list').innerHTML = logs.length
      ? logs.map((l) => `<li><span class="muted small">${escapeHtml(new Date(l.created_at).toLocaleString('tr-TR'))}</span> ${escapeHtml(l.action)} ${l.target ? `<code>${escapeHtml(l.target)}</code>` : ''}</li>`).join('')
      : '<li class="muted">Kayıt yok.</li>';
  } catch (err) {
    $('audit-list').innerHTML = `<li>${escapeHtml(err.message)}</li>`;
  }
}

// ----------------------------------------------------------- Siparişler ---
async function loadOrders() {
  const body = $('admin-orders-body');
  body.innerHTML = `<tr><td colspan="7">${skeletonRows(2)}</td></tr>`;
  try {
    state.orders = await adminListOrders();
    body.innerHTML = state.orders.length ? state.orders.map((o) => {
      const actions = [];
      if (o.status === 'confirmed') actions.push(`<button type="button" class="btn btn-small" data-order-status="shipped" data-order="${Number(o.id)}">Kargoya ver</button>`);
      if (o.status === 'shipped') actions.push(`<button type="button" class="btn btn-small" data-order-status="delivered" data-order="${Number(o.id)}">Teslim edildi</button>`);
      if (CANCELLABLE_STATUSES.includes(o.status)) actions.push(`<button type="button" class="btn btn-small btn-danger" data-order-cancel="${Number(o.id)}">İptal</button>`);
      return `<tr>
        <td>${escapeHtml(o.order_no || o.id)}</td>
        <td>${escapeHtml(o.customer_name || '-')}<br><span class="muted small">${escapeHtml(o.shipping_address || '')}</span></td>
        <td>${escapeHtml(money(o.total_price))}</td>
        <td><span class="badge-status status-${escapeHtml(o.status)}">${escapeHtml(ORDER_STATUS_LABELS[o.status] || o.status)}</span></td>
        <td>${escapeHtml(o.payment_method === 'cod' ? 'Kapıda' : 'Kart')}</td>
        <td>${escapeHtml(new Date(o.created_at).toLocaleString('tr-TR'))}</td>
        <td class="actions-cell">${actions.join(' ') || '<span class="muted">—</span>'}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="7">${emptyState('Henüz sipariş yok.')}</td></tr>`;
  } catch (err) {
    body.innerHTML = `<tr><td colspan="7">${emptyState(err.message)}</td></tr>`;
  }
}

async function handleOrderAction(e) {
  const statusBtn = e.target.closest('[data-order-status]');
  const cancelBtn = e.target.closest('[data-order-cancel]');
  try {
    if (statusBtn) {
      await adminSetOrderStatus(Number(statusBtn.dataset.order), statusBtn.dataset.orderStatus);
      toast('Sipariş durumu güncellendi.');
      loadOrders();
    } else if (cancelBtn) {
      if (!window.confirm('Siparişi iptal edip ürünleri stoğa geri eklemek istiyor musunuz?')) return;
      await cancelOrder(Number(cancelBtn.dataset.orderCancel));
      toast('Sipariş iptal edildi, stok geri eklendi.');
      loadOrders();
      loadStocks();
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

// --------------------------------------------------- Kullanıcılar / Roller
async function loadUsers() {
  const body = $('admin-users-body');
  body.innerHTML = `<tr><td colspan="5">${skeletonRows(2)}</td></tr>`;
  try {
    state.users = await adminListUsers();
    body.innerHTML = state.users.length ? state.users.map((u) => {
      const self = u.id === state.currentUserId;
      return `<tr>
        <td>${escapeHtml(u.full_name || '-')}${self ? ' <span class="muted small">(siz)</span>' : ''}</td>
        <td>${escapeHtml(u.phone || '-')}</td>
        <td>${escapeHtml(u.address_text || '-')}</td>
        <td>
          <select class="input-compact" data-role-select="${escapeHtml(u.id)}" ${self ? 'disabled' : ''} aria-label="Rol">
            ${['customer', 'supplier', 'admin'].map((r) => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${({ customer: 'Müşteri', supplier: 'Tedarikçi', admin: 'Yönetici' })[r]}</option>`).join('')}
          </select>
        </td>
        <td class="muted small">${self ? 'Kendi rolünüzü değiştiremezsiniz' : ''}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="5">${emptyState('Kullanıcı yok.')}</td></tr>`;
  } catch (err) {
    body.innerHTML = `<tr><td colspan="5">${emptyState(err.message)}</td></tr>`;
  }
}

async function handleRoleChange(e) {
  const sel = e.target.closest('[data-role-select]');
  if (!sel) return;
  const role = sel.value;
  if (role === 'admin' && !window.confirm('Bu kullanıcıya yönetici yetkisi verilecek. Emin misiniz?')) {
    loadUsers();
    return;
  }
  try {
    await adminSetRole(sel.dataset.roleSelect, role);
    toast('Rol güncellendi.');
  } catch (err) {
    toast(err.message, 'error');
    loadUsers();
  }
}

// ----------------------------------------------------------- Başlatma -----
export async function loadAdmin(userId) {
  state.currentUserId = userId;
  await loadStocks();
  renderStock();
  renderOffers();
}

export function initAdmin() {
  document.querySelectorAll('[data-admin-tab]').forEach((b) => {
    b.addEventListener('click', () => showTab(b.dataset.adminTab));
  });
  $('add-stock-form')?.addEventListener('submit', handleAddStock);
  $('admin-stock-body')?.addEventListener('click', (e) => {
    const save = e.target.closest('[data-save-stock]');
    const del = e.target.closest('[data-delete-stock]');
    if (save) saveStockRow(Number(save.dataset.saveStock), save);
    if (del) deleteStock(Number(del.dataset.deleteStock), del);
  });
  $('admin-offers-body')?.addEventListener('click', (e) => {
    const ap = e.target.closest('[data-approve-offer]');
    const rj = e.target.closest('[data-reject-offer]');
    if (ap) approveOffer(Number(ap.dataset.approveOffer), ap);
    if (rj) rejectOffer(Number(rj.dataset.rejectOffer), rj);
  });
  $('pos-form')?.addEventListener('submit', handlePosSale);
  $('report-range')?.addEventListener('change', renderReports);
  $('admin-orders-body')?.addEventListener('click', handleOrderAction);
  $('admin-users-body')?.addEventListener('change', handleRoleChange);
  $('refresh-stock')?.addEventListener('click', async () => { await loadStocks(); renderStock(); renderOffers(); });
  if ($('new-status')) $('new-status').innerHTML = statusOptions('%100');
  showTab('stock');
}
