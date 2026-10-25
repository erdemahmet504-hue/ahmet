// Tedarikçi paneli: teklif gönderme ve kendi tekliflerini izleme.
// Yetki sunucuda kontrol edilir (submit_supplier_offer / staff_list_stocks).
import { submitSupplierOffer, staffListStocks } from './api.js';
import { escapeHtml, formatTRY, capacityLabel, statusLabel, STATUS_OPTIONS } from './lib.js';
import { toast, $, emptyState, setBusy, setFormError } from './ui.js';

function validateOffer(o) {
  if (!o.brand.trim() || o.brand.trim().length > 60) return 'Marka zorunludur (en fazla 60 karakter).';
  if (!o.model.trim() || o.model.trim().length > 60) return 'Model zorunludur (en fazla 60 karakter).';
  if (!Number.isInteger(o.capacityGb) || o.capacityGb <= 0) return 'Kapasite pozitif bir tam sayı olmalıdır (GB).';
  if (!Number.isInteger(o.qty) || o.qty <= 0) return 'Adet pozitif bir tam sayı olmalıdır.';
  if (!Number.isFinite(o.requestedPrice) || o.requestedPrice < 0) return 'İstenen fiyat geçersiz.';
  return null;
}

function readOffer() {
  return {
    brand: $('offer-brand').value,
    model: $('offer-model').value,
    capacityGb: Number($('offer-capacity').value),
    qty: Number($('offer-qty').value),
    status: $('offer-status').value,
    requestedPrice: Number($('offer-price').value),
    note: $('offer-note').value.trim(),
  };
}

async function handleSubmit(e) {
  e.preventDefault();
  const btn = $('offer-submit');
  const offer = readOffer();
  const err = validateOffer(offer);
  setFormError($('offer-error'), err || '');
  if (err) return;

  setBusy(btn, true, 'Gönderiliyor…');
  try {
    await submitSupplierOffer(offer);
    $('supplier-offer-form').reset();
    toast('Teklifiniz yönetime iletildi. Onaylanınca yayına alınacaktır.');
    await renderMyOffers();
  } catch (error) {
    setFormError($('offer-error'), error.message);
  } finally {
    setBusy(btn, false);
  }
}

export async function renderMyOffers(userId) {
  const list = $('my-offers');
  if (!list) return;
  try {
    const rows = (await staffListStocks()).filter((s) => s.seller_id && (!userId || s.seller_id === userId));
    list.innerHTML = rows.length
      ? `<div class="table-wrap"><table>
          <thead><tr><th>Ürün</th><th>Kapasite</th><th>Adet</th><th>Durum</th><th>İstenen fiyat</th><th>Yayın</th></tr></thead>
          <tbody>${rows.map((r) => `
            <tr>
              <td>${escapeHtml(r.brand_name)} ${escapeHtml(r.model || '')}</td>
              <td>${escapeHtml(capacityLabel(r.capacity_gb))}</td>
              <td>${Number(r.stock_count)}</td>
              <td>${escapeHtml(statusLabel(r.status))}</td>
              <td>${escapeHtml(formatTRY(r.seller_price))}</td>
              <td>${r.published ? '<span class="badge-status status-confirmed">Yayında</span>' : '<span class="badge-status status-pending_payment">İnceleniyor</span>'}</td>
            </tr>`).join('')}
          </tbody></table></div>`
      : emptyState('Henüz teklifiniz bulunmuyor.');
  } catch (err) {
    list.innerHTML = emptyState(err.message);
  }
}

export function initSupplier() {
  const form = $('supplier-offer-form');
  if (!form) return;
  const statusSelect = $('offer-status');
  if (statusSelect) {
    statusSelect.innerHTML = STATUS_OPTIONS.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('');
  }
  form.addEventListener('submit', handleSubmit);
}
