// Fatura / satış belgesi.
// Tarayıcının yazdırma penceresi kullanılır: Türkçe karakterler (ı, ş, ğ, İ…)
// tam olarak desteklenir ve "PDF olarak kaydet" ile PDF üretilir.
// NOT: Bu belge yasal e-Fatura / e-Arşiv DEĞİLDİR. Yasal belge için bir
// e-belge entegratörü (GİB onaylı) bağlanmalıdır.
import { COMPANY } from './config.js';
import { escapeHtml, formatTRY, capacityLabel } from './lib.js';

function row(label, value) {
  return value ? `<div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>` : '';
}

export function buildInvoiceHtml(doc) {
  const lines = doc.lines.map((l) => `
    <tr>
      <td>${escapeHtml(l.name)}</td>
      <td class="num">${Number(l.qty)}</td>
      <td class="num">${escapeHtml(formatTRY(l.unitPrice))}</td>
      <td class="num">${escapeHtml(formatTRY(l.unitPrice * l.qty))}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(doc.title)} ${escapeHtml(doc.number)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, "Helvetica Neue", sans-serif; color: #1f2933; margin: 0; padding: 24px; font-size: 13px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1d4ed8; padding-bottom: 14px; }
  h1 { margin: 0; font-size: 22px; color: #0b1b2e; }
  .meta { text-align: right; line-height: 1.6; }
  .parties { display: flex; gap: 24px; margin: 20px 0; }
  .parties > div { flex: 1; background: #f3f5f8; padding: 12px; border-radius: 6px; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { padding: 9px 8px; border-bottom: 1px solid #d9dee6; text-align: left; }
  th { background: #0b1b2e; color: #fff; font-weight: 600; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-left: auto; width: 320px; margin-top: 16px; }
  .totals div { display: flex; justify-content: space-between; padding: 5px 0; }
  .totals .grand { border-top: 2px solid #0b1b2e; font-size: 16px; font-weight: 700; padding-top: 8px; }
  footer { margin-top: 28px; font-size: 11px; color: #5b6778; line-height: 1.5; }
  .actions { margin-top: 20px; }
  .actions button { padding: 8px 16px; font-size: 14px; cursor: pointer; }
  @media print { .actions { display: none; } body { padding: 0; } }
</style>
</head>
<body>
<header>
  <div>
    <h1>${escapeHtml(COMPANY.name)}</h1>
    <div>${escapeHtml(COMPANY.address)}</div>
    ${row('Vergi Dairesi', COMPANY.taxOffice)}
    ${row('Vergi No', COMPANY.taxNo)}
    ${row('Telefon', COMPANY.phone)}
    ${row('E-posta', COMPANY.email)}
  </div>
  <div class="meta">
    <div><strong>${escapeHtml(doc.title)}</strong></div>
    <div>No: ${escapeHtml(doc.number)}</div>
    <div>Tarih: ${escapeHtml(doc.date)}</div>
    ${doc.paymentLabel ? `<div>Ödeme: ${escapeHtml(doc.paymentLabel)}</div>` : ''}
  </div>
</header>

<section class="parties">
  <div>
    <strong>Müşteri</strong><br>
    ${escapeHtml(doc.customerName || '-')}
  </div>
  <div>
    <strong>Teslimat Adresi</strong><br>
    ${escapeHtml(doc.address || '-')}
  </div>
</section>

<table>
  <thead>
    <tr><th>Ürün</th><th class="num">Adet</th><th class="num">Birim Fiyat</th><th class="num">Tutar</th></tr>
  </thead>
  <tbody>${lines}</tbody>
</table>

<div class="totals">
  <div><span>Ara toplam</span><span>${escapeHtml(formatTRY(doc.subtotal))}</span></div>
  <div><span>Kargo</span><span>${escapeHtml(doc.shipping === 0 ? 'Ücretsiz' : formatTRY(doc.shipping))}</span></div>
  <div><span>KDV dahil (%20)</span><span>${escapeHtml(formatTRY(doc.kdv))}</span></div>
  <div class="grand"><span>Genel Toplam</span><span>${escapeHtml(formatTRY(doc.total))}</span></div>
</div>

<footer>
  Bu belge bilgi amaçlı bir satış/sipariş belgesidir; yasal e-Fatura veya e-Arşiv fatura yerine geçmez.
  Fiyatlar KDV dahildir.
</footer>

<div class="actions"><button onclick="window.print()">Yazdır / PDF olarak kaydet</button></div>
</body>
</html>`;
}

// Önceden açılmış bir pencereye (window.open, kullanıcı tıklamasında) belgeyi yazar.
// Pop-up engellendiyse false döner; çağıran taraf "Faturalarım" bağlantısını gösterir.
export function writeInvoice(win, doc) {
  if (!win || win.closed) return false;
  win.document.open();
  win.document.write(buildInvoiceHtml(doc));
  win.document.close();
  win.focus();
  return true;
}

export function openInvoice(doc) {
  // noopener kullanılmaz: window.open, noopener ile null döndürür ve belge yazılamaz.
  // Yazmadan önce opener bağlantısı kesilir.
  const win = window.open('', '_blank');
  if (!win) return false;
  try { win.opener = null; } catch { /* yoksay */ }
  return writeInvoice(win, doc);
}

// Sipariş kaydından fatura verisi.
export function invoiceFromOrder(order) {
  // Eski kayıtlarda alan adları farklı olabilir (price / capacity); yedek okuma yapılır.
  const lines = (order.items || []).map((i) => ({
    name: `${i.brand ?? ''} ${i.capacity_gb ? capacityLabel(i.capacity_gb) : (i.capacity ?? '')}${i.model ? ` (${i.model})` : ''}`.trim(),
    qty: Number(i.qty),
    unitPrice: Number(i.unit_price ?? i.price ?? 0),
  }));
  const shipping = Number(order.shipping_fee ?? 0);
  const total = Number(order.total_price);
  const kdv = Number(order.kdv_total ?? Math.round((total - total / 1.2) * 100) / 100);
  return {
    title: 'Satış Belgesi',
    number: order.order_no || `#${order.id}`,
    date: new Date(order.created_at || Date.now()).toLocaleDateString('tr-TR'),
    customerName: order.customer_name,
    address: order.shipping_address,
    paymentLabel: order.payment_method === 'cod' ? 'Kapıda ödeme' : 'Kredi kartı',
    lines,
    subtotal: Number(order.subtotal ?? total - shipping),
    shipping,
    total,
    kdv,
  };
}
