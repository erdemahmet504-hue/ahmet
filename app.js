// ==========================================
// 1. BULUT VERİTABANI BAĞLANTI BİLGİLERİ
// ==========================================
const SUPABASE_URL = "https://zwayidssoujhrjxzgdql.supabase.co/rest/v1";
const SUPABASE_KEY = "sb_publishable_wHYCLbDylFN9wnRXuGCmFg_cl1OPZAC";

let globalStocks = [];
let currentActiveReportTab = "Satış 1";
let hasSelectedRole = false;

// ==========================================
// 2. CİHAZA ÖZEL BENZERSİZ ZİYARETÇİ KİMLİĞİ
// A müşterisi B müşterisinin tekliflerini asla göremez.
// ==========================================
function getOrCreateVisitorId() {
    let vid = localStorage.getItem("erdem_bilisim_visitor_id");
    if (!vid) {
        vid = "MUSTERI_" + Math.random().toString(36).substring(2, 11).toUpperCase();
        localStorage.setItem("erdem_bilisim_visitor_id", vid);
    }
    return vid;
}
const MY_VISITOR_ID = getOrCreateVisitorId();

// ==========================================
// 3. SAYFA YÜKLENDİĞİNDE YETKİ VE HAFIZA KONTROLÜ
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const isAdmin = (urlParams.get("mod") === "ahmet");

    // Admin modunda müşteri kilitlerini kaldır
    if (isAdmin) {
        localStorage.removeItem("erdem_bilisim_locked_role");
        const adminBadge = document.getElementById("admin-status-badge");
        if (adminBadge) adminBadge.style.display = "block";
    }

    const adminSection        = document.getElementById("admin-panel");
    const barcodeSaleSection  = document.getElementById("barcode-sale-panel");
    const grandTotalSection   = document.getElementById("grand-total-section");
    const reportsSection      = document.getElementById("reports-panel");
    const roleSelector        = document.getElementById("customer-role-selector");
    const containerLow        = document.getElementById("container-low");
    const containerDefective  = document.getElementById("container-defective");

    if (adminSection)       adminSection.style.display       = isAdmin ? "block" : "none";
    if (barcodeSaleSection) barcodeSaleSection.style.display = isAdmin ? "block" : "none";
    if (grandTotalSection)  grandTotalSection.style.display  = isAdmin ? "flex"  : "none";
    if (reportsSection)     reportsSection.style.display     = isAdmin ? "block" : "none";
    if (roleSelector)       roleSelector.style.display       = isAdmin ? "none"  : "block";

    updateTableHeadersDirect(isAdmin);

    if (isAdmin) {
        if (containerLow)       containerLow.style.display      = "block";
        if (containerDefective) containerDefective.style.display = "block";
        renderSalesReport();
    } else {
        // F5 KORUMASI: Seçilen rol hafızadan okunup anında kilitleniyor
        const savedRole = localStorage.getItem("erdem_bilisim_locked_role");
        if (savedRole) {
            hasSelectedRole = true;

            const radioToSelect = document.querySelector(`input[name="user-role-radio"][value="${savedRole}"]`);
            if (radioToSelect) radioToSelect.checked = true;

            const radios = document.querySelectorAll('input[name="user-role-radio"]');
            radios.forEach(r => r.disabled = true);

            if (roleSelector) {
                roleSelector.style.opacity      = "0.6";
                roleSelector.style.pointerEvents = "none";
            }

            const sellerFormPanel = document.getElementById("customer-seller-panel");
            if (savedRole === "satici") {
                if (containerLow)       containerLow.style.display       = "block";
                if (containerDefective) containerDefective.style.display  = "block";
                if (sellerFormPanel)    sellerFormPanel.style.display     = "block";
            } else {
                if (containerLow)       containerLow.style.display       = "none";
                if (containerDefective) containerDefective.style.display  = "none";
                if (sellerFormPanel)    sellerFormPanel.style.display     = "none";
            }
        } else {
            if (containerLow)       containerLow.style.display       = "none";
            if (containerDefective) containerDefective.style.display  = "none";
        }
    }

    fetchStocksFromCloud(isAdmin);
});

// ==========================================
// 4. TABLO BAŞLIKLARINI ROLE GÖRE GÜNCELLE
// ==========================================
function updateTableHeadersDirect(isAdmin) {
    ["table-healthy", "table-low", "table-defective"].forEach(tableId => {
        const table = document.getElementById(tableId);
        if (!table) return;

        const theadRow = table.querySelector("thead tr");
        if (!theadRow) return;

        if (isAdmin) {
            theadRow.innerHTML = `
                <th>Barkod / Tür</th>
                <th>Marka</th>
                <th>Boyut</th>
                <th>İnç</th>
                <th>Mevcut Stok</th>
                <th style="color:#10b981;">Müşteri Alıcı Teklifi</th>
                <th style="color:#f97316; background:rgba(249,115,22,0.1);">Gelen Satıcı Arzı (Adet & İstenen)</th>
                <th style="color:#38bdf8;">Dükkan Alış Fiyatı (Senin)</th>
                <th>Dükkan Satış Fiyatı</th>
                <th>Toplam Maliyet</th>
                <th>İşlemler</th>
            `;
        } else {
            theadRow.innerHTML = `
                <th>Barkod</th>
                <th>Marka</th>
                <th>Boyut</th>
                <th>İnç</th>
                <th>Mevcut Stok</th>
                <th style="color:#10b981;">Dükkan Satış Fiyatı</th>
                <th style="color:#f97316;">Dükkan Alış Fiyatı</th>
                <th>Sizin Teklifiniz</th>
                <th>İşlemler</th>
            `;
        }
    });
}

// ==========================================
// 5. ROL SEÇİMİ (MÜŞTERİ)
// ==========================================
window.handleRoleChange = function () {
    if (hasSelectedRole) return;
    hasSelectedRole = true;

    const currentRole = getSelectedCustomerRole();
    localStorage.setItem("erdem_bilisim_locked_role", currentRole);

    const radios = document.querySelectorAll('input[name="user-role-radio"]');
    radios.forEach(r => r.disabled = true);

    const roleSelector = document.getElementById("customer-role-selector");
    if (roleSelector) {
        roleSelector.style.opacity      = "0.6";
        roleSelector.style.pointerEvents = "none";
    }

    const containerLow    = document.getElementById("container-low");
    const containerDefective = document.getElementById("container-defective");
    const sellerFormPanel = document.getElementById("customer-seller-panel");

    if (currentRole === "satici") {
        if (containerLow)       containerLow.style.display       = "block";
        if (containerDefective) containerDefective.style.display  = "block";
        if (sellerFormPanel)    sellerFormPanel.style.display     = "block";
    } else {
        if (containerLow)       containerLow.style.display       = "none";
        if (containerDefective) containerDefective.style.display  = "none";
        if (sellerFormPanel)    sellerFormPanel.style.display     = "none";
    }

    updateTablesByStatus(globalStocks, false);
};

function getSelectedCustomerRole() {
    const radio = document.querySelector('input[name="user-role-radio"]:checked');
    return radio ? radio.value : "alici";
}

// ==========================================
// 6. BULUTTAN STOK ÇEK
// ==========================================
async function fetchStocksFromCloud(isAdmin) {
    try {
        const response = await fetch(`${SUPABASE_URL}/stocks?select=*`, {
            method: "GET",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`
            }
        });
        if (!response.ok) return;

        globalStocks = await response.json();
        if (Array.isArray(globalStocks)) {
            globalStocks.sort((a, b) => a.id - b.id);
            updateTablesByStatus(globalStocks, isAdmin);
        }
    } catch (err) {
        console.error("Stok çekme hatası:", err);
    }
}

// ==========================================
// 7. TİCARİ GİZLİLİK SÜZGECİ
// Başka müşterilerin tekliflerini sansürler.
// ==========================================
function parseOfferNotesSecure(rawNotes, isAdmin) {
    let buyer          = "Yok";
    let seller         = "Yok";
    let originalCreator = "Sistem";

    if (rawNotes && rawNotes !== "Teklif Yok") {
        rawNotes.split("||").forEach(part => {
            const p = part.trim();
            if      (p.startsWith("ALICI:"))  buyer           = p.replace("ALICI:", "").trim();
            else if (p.startsWith("SATICI:")) seller          = p.replace("SATICI:", "").trim();
            else if (p.startsWith("OWNER:"))  originalCreator = p.replace("OWNER:", "").trim();
        });
    }

    // Admin değilse ve kayıt başkasına aitse sansürle
    if (!isAdmin && originalCreator !== "Sistem" && originalCreator !== MY_VISITOR_ID) {
        buyer  = "Yok";
        seller = "Yok";
    }

    return { buyer, seller, originalCreator };
}

// ==========================================
// 8. TABLO MOTORU
// ==========================================
function updateTablesByStatus(stocks, isAdmin) {
    const healthyBody    = document.querySelector("#table-healthy tbody");
    const lowBody        = document.querySelector("#table-low tbody");
    const defectiveBody  = document.querySelector("#table-defective tbody");

    if (healthyBody)   healthyBody.innerHTML   = "";
    if (lowBody)       lowBody.innerHTML       = "";
    if (defectiveBody) defectiveBody.innerHTML = "";

    const totals = {
        healthy:   { buy: 0, sell: 0 },
        low:       { buy: 0, sell: 0 },
        defective: { buy: 0, sell: 0 }
    };

    const currentRole = getSelectedCustomerRole();

    stocks.forEach(stock => {
        const status    = (stock.status || "Sağlıklı").trim();
        const brand     = stock.brand_name || "---";
        const capacity  = stock.capacity_gb ? `${stock.capacity_gb} GB` : "---";
        const inch      = stock.model || "---";
        const barcode   = stock.barcode || "---";
        const count     = parseInt(stock.stock_count || 0);
        const buyPrice  = parseFloat(stock.price || 0);
        const sellPrice = parseFloat(stock.sale_price || 0);
        const parsed    = parseOfferNotesSecure(stock.offer_notes, isAdmin);

        // Başka müşterinin dış arz satırını gizle
        if (!isAdmin && barcode === "Müşteri Arzı" && parsed.originalCreator !== MY_VISITOR_ID) return;

        // Müşteri alıcıysa sadece sağlıklı stokları göster
        if (!isAdmin && currentRole !== "satici" && status !== "Sağlıklı") return;

        const totalBuyRow  = count * buyPrice;
        const totalSellRow = count * sellPrice;

        if      (status === "Sağlıklı")      { totals.healthy.buy   += totalBuyRow; totals.healthy.sell   += totalSellRow; }
        else if (status === "Sağlığı Düşük") { totals.low.buy       += totalBuyRow; totals.low.sell       += totalSellRow; }
        else if (status === "Arızalı")       { totals.defective.buy += totalBuyRow; totals.defective.sell += totalSellRow; }

        const row = document.createElement("tr");

        if (isAdmin && barcode === "Müşteri Arzı") {
            row.style.background  = "rgba(249,115,22,0.08)";
            row.style.borderLeft  = "4px solid var(--orange)";
        }

        if (isAdmin) {
            row.innerHTML = buildAdminRow(stock, parsed, barcode, brand, capacity, inch, count, buyPrice, sellPrice, totalBuyRow);
        } else {
            row.innerHTML = buildCustomerRow(stock, parsed, barcode, brand, capacity, inch, count, buyPrice, sellPrice, currentRole);
        }

        if      (status === "Sağlıklı"      && healthyBody)   healthyBody.appendChild(row);
        else if (status === "Sağlığı Düşük" && lowBody)       lowBody.appendChild(row);
        else if (status === "Arızalı"       && defectiveBody) defectiveBody.appendChild(row);
    });

    if (isAdmin) {
        addCategoryTotalRow(healthyBody,   totals.healthy);
        addCategoryTotalRow(lowBody,       totals.low);
        addCategoryTotalRow(defectiveBody, totals.defective);

        const grandBuy  = totals.healthy.buy  + totals.low.buy  + totals.defective.buy;
        const grandSell = totals.healthy.sell + totals.low.sell + totals.defective.sell;

        const gBuyEl  = document.getElementById("grand-buy-value");
        const gSellEl = document.getElementById("grand-sell-value");
        if (gBuyEl)  gBuyEl.innerText  = grandBuy.toFixed(2);
        if (gSellEl) gSellEl.innerText = grandSell.toFixed(2);
    }
}

// ==========================================
// 9. ADMIN SATIR HTML'İ
// ==========================================
function buildAdminRow(stock, parsed, barcode, brand, capacity, inch, count, buyPrice, sellPrice, totalBuyRow) {
    const buyerNotice  = parsed.buyer  !== "Yok" ? `<span style="background:#eab308;color:#000;padding:2px 4px;border-radius:3px;font-size:10px;margin-right:4px;animation:blink 1s infinite;">YENİ</span>` : "";
    const sellerNotice = parsed.seller !== "Yok" ? `<span style="background:#f97316;color:#fff;padding:2px 4px;border-radius:3px;font-size:10px;margin-right:4px;animation:blink 1s infinite;">TEKLİF</span>` : "";
    const barcodeDisplay = barcode === "Müşteri Arzı"
        ? `<span style="color:#f97316;font-weight:bold;">DIŞ ARZ</span>`
        : `<span style="font-family:monospace;color:#3498db;">${barcode}</span>`;

    return `
        <td>${barcodeDisplay}</td>
        <td><strong>${brand}</strong></td>
        <td>${capacity}</td>
        <td><strong>${inch}"</strong></td>
        <td><span id="stock-count-${stock.id}" style="font-weight:bold;">${count}</span></td>

        <td style="color:#10b981;">
            <div id="display-ALICI-${stock.id}">
                ${buyerNotice}<span>${parsed.buyer}</span>
                <button class="btn-edit-offer" onclick="showInlineInput(${stock.id},'ALICI')">✍️ Onayla</button>
            </div>
            <div id="edit-ALICI-${stock.id}" style="display:none;gap:5px;">
                <input type="text" id="input-ALICI-${stock.id}" value="${parsed.buyer === "Yok" ? "" : parsed.buyer}"
                    style="width:100px;background:#222;color:#fff;border:1px solid #444;">
                <button onclick="submitInlineOffer(${stock.id},'ALICI')"
                    style="background:#10b981;color:white;border:none;padding:3px 6px;border-radius:3px;">✔️</button>
            </div>
        </td>

        <td style="color:#f97316;font-weight:500;background:rgba(249,115,22,0.03);">
            ${sellerNotice}<span>${parsed.seller}</span>
        </td>

        <td style="color:#38bdf8;">
            <div id="display-ALIS-${stock.id}">
                <strong>${buyPrice.toFixed(2)} TL</strong>
                <button class="btn-edit-offer" style="background:#0284c7;" onclick="showInlineInput(${stock.id},'ALIS')">💰 Fiyat Ver</button>
            </div>
            <div id="edit-ALIS-${stock.id}" style="display:none;gap:5px;">
                <input type="number" step="0.01" id="input-ALIS-${stock.id}" value="${buyPrice}"
                    style="width:90px;background:#222;color:#fff;border:1px solid #38bdf8;padding:2px;">
                <button onclick="submitDirectPrice(${stock.id},'ALIS')"
                    style="background:#38bdf8;color:black;border:none;padding:3px 6px;border-radius:3px;font-weight:bold;">✔️</button>
            </div>
        </td>

        <td style="color:#10b981;">
            <div id="display-SATIS-${stock.id}">
                <strong>${sellPrice.toFixed(2)} TL</strong>
                <button class="btn-edit-offer" style="background:#059669;" onclick="showInlineInput(${stock.id},'SATIS')">✍️ Değiş</button>
            </div>
            <div id="edit-SATIS-${stock.id}" style="display:none;gap:5px;">
                <input type="number" step="0.01" id="input-SATIS-${stock.id}" value="${sellPrice}"
                    style="width:90px;background:#222;color:#fff;border:1px solid #10b981;padding:2px;">
                <button onclick="submitDirectPrice(${stock.id},'SATIS')"
                    style="background:#10b981;color:white;border:none;padding:3px 6px;border-radius:3px;">✔️</button>
            </div>
        </td>

        <td style="color:#94a3b8;">${totalBuyRow.toFixed(2)} TL</td>
        <td>
            <button class="btn-action btn-plus"   onclick="changeStockInCloud(${stock.id}, 1)">+</button>
            <button class="btn-action btn-minus"  onclick="changeStockInCloud(${stock.id},-1)">-</button>
            <button class="btn-action btn-delete" onclick="deleteStockFromCloud(${stock.id})">Sil</button>
        </td>
    `;
}

// ==========================================
// 10. MÜŞTERİ SATIR HTML'İ
// ==========================================
function buildCustomerRow(stock, parsed, barcode, brand, capacity, inch, count, buyPrice, sellPrice, currentRole) {
    let buyerCellHTML        = "";
    let sellerCellHTML       = "";
    let customerStatusCell   = "";
    let actionButtons        = "";

    if (currentRole === "alici") {
        buyerCellHTML      = `<td style="color:#10b981;font-size:15px;"><strong>${sellPrice.toFixed(2)} TL</strong></td>`;
        sellerCellHTML     = `<td style="color:#64748b;font-size:12px;opacity:0.4;">🔒 Gizli</td>`;
        customerStatusCell = `<td style="color:#10b981;font-size:12px;">Sizin Teklifiniz:<br><strong>${parsed.buyer}</strong></td>`;
        actionButtons      = `
            <td>
                <div id="display-ALICI-${stock.id}">
                    <button class="btn-buyer" style="padding:6px 12px;" onclick="showInlineInput(${stock.id},'ALICI')">🛒 Satın Al / Teklif Ver</button>
                </div>
                <div id="edit-ALICI-${stock.id}" style="display:none;gap:5px;align-items:center;">
                    <input type="text" id="input-ALICI-${stock.id}" placeholder="Adet ve Fiyat Yazın"
                        style="width:120px;background:#222;color:#fff;border:1px solid #10b981;padding:4px;">
                    <button onclick="submitInlineOffer(${stock.id},'ALICI')"
                        style="background:#10b981;color:white;border:none;padding:4px 8px;border-radius:3px;cursor:pointer;">✔️</button>
                </div>
            </td>`;
    } else {
        buyerCellHTML      = `<td style="color:#64748b;font-size:12px;opacity:0.4;">🔒 Gizli</td>`;
        sellerCellHTML     = `<td style="color:#f97316;font-size:15px;"><strong>${buyPrice.toFixed(2)} TL</strong></td>`;
        customerStatusCell = `<td style="color:#f97316;font-size:12px;">Sizin Dükkana Arzınız:<br><strong>${parsed.seller}</strong></td>`;

        if (barcode === "Müşteri Arzı") {
            actionButtons = `
                <td>
                    <div id="display-SATICI-${stock.id}">
                        <button class="btn-delete" style="padding:6px 12px;font-size:12px;" onclick="deleteStockFromCloud(${stock.id})">❌ Teklifi İptal Et</button>
                    </div>
                </td>`;
        } else {
            actionButtons = `
                <td>
                    <div id="display-SATICI-${stock.id}">
                        <button class="btn-seller" style="padding:6px 12px;" onclick="showInlineInput(${stock.id},'SATICI')">📦 Dükkana Sat / Fiyat Ver</button>
                    </div>
                    <div id="edit-SATICI-${stock.id}" style="display:none;gap:5px;align-items:center;">
                        <input type="text" id="input-SATICI-${stock.id}" placeholder="Adet ve Fiyat Yazın"
                            style="width:120px;background:#222;color:#fff;border:1px solid #f97316;padding:4px;">
                        <button onclick="submitInlineOffer(${stock.id},'SATICI')"
                            style="background:#f97316;color:white;border:none;padding:4px 8px;border-radius:3px;cursor:pointer;">✔️</button>
                    </div>
                </td>`;
        }
    }

    return `
        <td style="font-family:monospace;color:#3498db;">${barcode}</td>
        <td><strong>${brand}</strong></td>
        <td>${capacity}</td>
        <td><strong>${inch}"</strong></td>
        <td><strong>${count}</strong></td>
        ${buyerCellHTML}
        ${sellerCellHTML}
        ${customerStatusCell}
        ${actionButtons}
    `;
}

// ==========================================
// 11. KATEGORİ TOPLAM SATIRI
// ==========================================
function addCategoryTotalRow(tbody, totals) {
    if (!tbody) return;
    const row = document.createElement("tr");
    row.className = "total-row";
    row.innerHTML = `
        <td colspan="5" style="text-align:right;color:#aaa;">Kategori Toplamı:</td>
        <td style="color:#3498db;" colspan="2">Alış Maliyeti: ${totals.buy.toFixed(2)} TL</td>
        <td style="color:#10b981;" colspan="4">Beklenen Ciro: ${totals.sell.toFixed(2)} TL</td>
    `;
    tbody.appendChild(row);
}

// ==========================================
// 12. INLINE DÜZENLEME
// ==========================================
window.showInlineInput = function (id, role) {
    const dispEl = document.getElementById(`display-${role}-${id}`);
    const editEl = document.getElementById(`edit-${role}-${id}`);
    if (dispEl) dispEl.style.display = "none";
    if (editEl) editEl.style.display = "flex";
};

window.submitInlineOffer = async function (id, role) {
    const urlParams = new URLSearchParams(window.location.search);
    const isAdmin   = (urlParams.get("mod") === "ahmet");

    const stockItem = globalStocks.find(s => s.id === id);
    if (!stockItem) return;

    const parsed   = parseOfferNotesSecure(stockItem.offer_notes, true);
    const inputVal = document.getElementById(`input-${role}-${id}`).value.trim();

    if      (role === "ALICI")  parsed.buyer  = inputVal === "" ? "Yok" : inputVal;
    else if (role === "SATICI") parsed.seller = inputVal === "" ? "Yok" : inputVal;

    const owner            = isAdmin ? parsed.originalCreator : MY_VISITOR_ID;
    const finalOfferString = `ALICI: ${parsed.buyer} || SATICI: ${parsed.seller} || OWNER: ${owner}`;

    try {
        const response = await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, {
            method: "PATCH",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ offer_notes: finalOfferString })
        });
        if (response.ok) fetchStocksFromCloud(isAdmin);
    } catch (err) {
        console.error("Teklif gönderme hatası:", err);
    }
};

window.submitDirectPrice = async function (id, type) {
    const inputVal   = parseFloat(document.getElementById(`input-${type}-${id}`).value || 0);
    const updatePayload = {};

    if      (type === "ALIS")  updatePayload.price      = inputVal;
    else if (type === "SATIS") updatePayload.sale_price = inputVal;

    try {
        const response = await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, {
            method: "PATCH",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(updatePayload)
        });
        if (response.ok) fetchStocksFromCloud(true);
    } catch (err) {
        console.error("Fiyat güncelleme hatası:", err);
    }
};

// ==========================================
// 13. SATICI MÜŞTERİ ARZ FORMU
// ==========================================
window.submitNewOfferFromSeller = async function (event) {
    event.preventDefault();

    const brand        = document.getElementById("offer-brand").value;
    const capacity     = parseInt(document.getElementById("offer-capacity").value);
    const inch         = document.getElementById("offer-inch").value;
    const status       = document.getElementById("offer-status").value;
    const count        = document.getElementById("offer-count").value;
    const priceAndTel  = document.getElementById("offer-price").value;

    const offerNotes = `ALICI: Yok || SATICI: ${count} Adet - İstenen: ${priceAndTel} || OWNER: ${MY_VISITOR_ID}`;

    try {
        const response = await fetch(`${SUPABASE_URL}/stocks`, {
            method: "POST",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                barcode:     "Müşteri Arzı",
                brand_name:  brand,
                capacity_gb: capacity,
                model:       inch,
                stock_count: 0,
                price:       0,
                sale_price:  0,
                offer_notes: offerNotes,
                status:      status
            })
        });
        if (response.ok) {
            document.getElementById("customer-offer-form").reset();
            alert("Teklifiniz dükkan yönetimine başarıyla iletildi.");
            fetchStocksFromCloud(false);
        }
    } catch (err) {
        console.error("Arz gönderme hatası:", err);
    }
};

// ==========================================
// 14. STOK ARTTIR / AZALT
// ==========================================
window.changeStockInCloud = async function (id, amount) {
    const stockEl = document.getElementById(`stock-count-${id}`);
    if (!stockEl) return;

    let newStock = Math.max(0, parseInt(stockEl.innerText) + amount);
    stockEl.innerText = newStock;

    try {
        await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, {
            method: "PATCH",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ stock_count: newStock })
        });
    } catch (err) {
        console.error("Stok güncelleme hatası:", err);
    }
};

// ==========================================
// 15. YENİ STOK EKLE (ADMİN)
// ==========================================
window.addNewStock = async function (event) {
    event.preventDefault();

    const barcode   = document.getElementById("prod-barcode").value;
    const brand     = document.getElementById("prod-brand").value;
    const capacity  = parseInt(document.getElementById("prod-capacity").value);
    const inch      = document.getElementById("prod-inch").value;
    const stock     = parseInt(document.getElementById("prod-stock").value);
    const buyPrice  = parseFloat(document.getElementById("prod-price").value || 0);
    const sellPrice = parseFloat(document.getElementById("prod-sale-price").value || 0);
    const status    = document.getElementById("prod-status").value;

    try {
        const response = await fetch(`${SUPABASE_URL}/stocks`, {
            method: "POST",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                barcode:     barcode,
                brand_name:  brand,
                capacity_gb: capacity,
                model:       inch,
                stock_count: stock,
                price:       buyPrice,
                sale_price:  sellPrice,
                offer_notes: "ALICI: Yok || SATICI: Yok || OWNER: Sistem",
                status:      status
            })
        });
        if (response.ok) {
            document.getElementById("add-stock-form").reset();
            fetchStocksFromCloud(true);
        }
    } catch (err) {
        console.error("Stok ekleme hatası:", err);
    }
};

// ==========================================
// 16. STOK SİL
// ==========================================
window.deleteStockFromCloud = async function (id) {
    const urlParams = new URLSearchParams(window.location.search);
    const isAdmin   = (urlParams.get("mod") === "ahmet");

    try {
        const response = await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, {
            method: "DELETE",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`
            }
        });
        if (response.ok) fetchStocksFromCloud(isAdmin);
    } catch (err) {
        console.error("Stok silme hatası:", err);
    }
};

// ==========================================
// 17. BARKODLU SATIŞ (ADMİN)
// ==========================================
window.barcodeSaleStockDrop = async function (event) {
    event.preventDefault();

    const barcodeInput   = document.getElementById("scan-barcode-input");
    const sessionSelect  = document.getElementById("active-sale-session");
    const scannedBarcode = barcodeInput.value.trim();
    const targetSession  = sessionSelect.value;

    if (!scannedBarcode) return;

    const matchedStock = globalStocks.find(s => s.barcode && s.barcode.trim() === scannedBarcode);
    if (!matchedStock || parseInt(matchedStock.stock_count || 0) <= 0) {
        barcodeInput.value = "";
        barcodeInput.focus();
        return;
    }

    const newStockCount = parseInt(matchedStock.stock_count) - 1;

    try {
        if (newStockCount <= 0) {
            await fetch(`${SUPABASE_URL}/stocks?id=eq.${matchedStock.id}`, {
                method: "DELETE",
                headers: {
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${SUPABASE_KEY}`
                }
            });
        } else {
            await fetch(`${SUPABASE_URL}/stocks?id=eq.${matchedStock.id}`, {
                method: "PATCH",
                headers: {
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${SUPABASE_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ stock_count: newStockCount })
            });
        }

        saveSaleToSessionLogs(
            scannedBarcode,
            matchedStock.brand_name,
            `${matchedStock.capacity_gb}GB ${matchedStock.model}"`,
            targetSession,
            parseFloat(matchedStock.sale_price || 0)
        );

        barcodeInput.value = "";
        barcodeInput.focus();
        fetchStocksFromCloud(true);
    } catch (err) {
        console.error("Barkod satış hatası:", err);
    }
};

// ==========================================
// 18. SATIŞ OTURUM GÜNLÜĞÜ
// ==========================================
function saveSaleToSessionLogs(barcode, brand, desc, sessionName, salePrice) {
    let allSales    = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    const existing  = allSales.findIndex(s => s.barcode === barcode && s.session === sessionName);

    if (existing > -1) {
        allSales[existing].count += 1;
    } else {
        allSales.push({
            barcode,
            title:   `${brand} ${desc}`,
            session: sessionName,
            count:   1,
            price:   salePrice
        });
    }

    localStorage.setItem("erdem_bilisim_sales_logs", JSON.stringify(allSales));
    renderSalesReport();
}

// ==========================================
// 19. SATIŞ RAPORU SEKMESİ DEĞİŞTİR
// ==========================================
window.switchReportTab = function (sessionName) {
    currentActiveReportTab = sessionName;
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.innerText.trim() === sessionName);
    });
    renderSalesReport();
};

// ==========================================
// 20. SATIŞ RAPORU - RAPOR EKRANI
// ==========================================
function renderSalesReport() {
    const tbody = document.getElementById("reports-tbody");
    if (!tbody) return;

    const allSales      = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    const filteredSales = allSales.filter(s => s.session === currentActiveReportTab);

    if (filteredSales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="color:#64748b;text-align:center;">Bu oturumda satış yok.</td></tr>`;
        return;
    }

    tbody.innerHTML = "";
    let totalRevenue = 0;

    filteredSales.forEach(sale => {
        const rowTotal = sale.count * sale.price;
        totalRevenue  += rowTotal;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="font-family:monospace;color:#38bdf8;">${sale.barcode}</td>
            <td>${sale.title}</td>
            <td><span style="background-color:#1e3a8a;padding:4px 8px;border-radius:4px;font-size:12px;">${sale.session}</span></td>
            <td><strong>${sale.count} Adet</strong></td>
            <td>${sale.price.toFixed(2)} TL</td>
            <td style="color:#34d399;font-weight:bold;">${rowTotal.toFixed(2)} TL</td>
            <td>
                <button
                    onclick="deleteSaleEntry('${sale.barcode}', '${sale.session}')"
                    style="background:#dc2626;color:white;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;">
                    ✕ Sil
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const totalTr = document.createElement("tr");
    totalTr.style.backgroundColor = "#1e293b";
    totalTr.style.fontWeight      = "bold";
    totalTr.innerHTML = `
        <td colspan="6" style="text-align:right;color:#94a3b8;">Toplam Ciro:</td>
        <td style="color:#34d399;font-size:16px;">${totalRevenue.toFixed(2)} TL</td>
    `;
    tbody.appendChild(totalTr);
}

// ==========================================
// 21. SATIŞ KAYDINI SİL
// ==========================================
window.deleteSaleEntry = function (barcode, sessionName) {
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    allSales = allSales.filter(s => !(s.barcode === barcode && s.session === sessionName));
    localStorage.setItem("erdem_bilisim_sales_logs", JSON.stringify(allSales));
    renderSalesReport();
};

// ==========================================
// 22. CSS ANİMASYON: YANIP SÖNME
// ==========================================
const blinkStyle = document.createElement("style");
blinkStyle.innerHTML = `
    @keyframes blink {
        0%   { opacity: 1; }
        50%  { opacity: 0.3; }
        100% { opacity: 1; }
    }
`;
document.head.appendChild(blinkStyle);