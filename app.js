// ==========================================
// 1. BULUT VERİTABANI BAĞLANTI BİLGİLERİ
// ==========================================
const SUPABASE_URL = "https://zwayidssoujhrjxzgdql.supabase.co/rest/v1"; 
const SUPABASE_KEY = "sb_publishable_wHYCLbDylFN9wnRXuGCmFg_cl1OPZAC"; 

let globalStocks = [];
let currentActiveReportTab = "Satış 1";
let hasSelectedRole = false; 

// ==========================================
// 2. SAYFA YÜKLENDİĞİNDE YETKİ KONTROLÜ
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mod'); 
    const isAdmin = (mode === 'ahmet');

    const adminSection = document.getElementById("admin-panel");
    if (adminSection) adminSection.style.display = isAdmin ? "block" : "none";

    const barcodeSaleSection = document.getElementById("barcode-sale-panel");
    if (barcodeSaleSection) barcodeSaleSection.style.display = isAdmin ? "block" : "none";

    const grandTotalSection = document.getElementById("grand-total-section");
    if (grandTotalSection) grandTotalSection.style.display = isAdmin ? "flex" : "none";

    const reportsSection = document.getElementById("reports-panel");
    if (reportsSection) reportsSection.style.display = isAdmin ? "block" : "none";

    const roleSelector = document.getElementById("customer-role-selector");
    if (roleSelector) roleSelector.style.display = isAdmin ? "none" : "block";

    // Admin panelinde kategoriler her zaman açık
    const containerLow = document.getElementById("container-low");
    const containerDefective = document.getElementById("container-defective");
    
    updateTableHeadersDirect(isAdmin);

    if (isAdmin) {
        if (containerLow) containerLow.style.display = "block";
        if (containerDefective) containerDefective.style.display = "block";
        
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = 'table-cell';
        });
        renderSalesReport();
    } else {
        if (containerLow) containerLow.style.display = "none";
        if (containerDefective) containerDefective.style.display = "none";
    }

    fetchStocksFromCloud(isAdmin);
});

function updateTableHeadersDirect(isAdmin) {
    ["table-healthy", "table-low", "table-defective"].forEach(tableId => {
        const table = document.getElementById(tableId);
        if (!table) return;
        const theadRow = table.querySelector("thead tr");
        if (!theadRow) return;

        // Model kalktı yerine İNÇ geldi
        let headersHTML = `
            <th>Barkod</th>
            <th>Marka</th>
            <th>Boyut</th>
            <th>İnç</th>
            <th>Mevcut Stok</th>
            <th style="color: #10b981;">Alıcı Teklifi (Müşteri)</th>
            <th style="color: #f97316;">Satıcı Teklifi (Müşteri)</th>
        `;

        if (isAdmin) {
            headersHTML += `
                <th class="admin-only" style="display: table-cell;">Alış Fiyatı</th>
                <th class="admin-only" style="display: table-cell;">Satış Fiyatı</th>
                <th class="admin-only" style="display: table-cell;">Toplam Alış</th>
                <th class="admin-only" style="display: table-cell;">Toplam Satış</th>
            `;
        } else {
            // Müşteri ekranındaysa başlıklar dinamik körleme mantığına geçer
            headersHTML = `
                <th>Barkod</th>
                <th>Marka</th>
                <th>Boyut</th>
                <th>İnç</th>
                <th>Mevcut Stok</th>
                <th style="color: #10b981;">Dükkan Satış Fiyatı</th>
                <th style="color: #f97316;">Dükkan Alış Fiyatı</th>
                <th>Teklif Durumunuz</th>
            `;
        }

        headersHTML += `<th>İşlemler</th>`;
        theadRow.innerHTML = headersHTML;
    });
}

// ⚡ ÜSTTEKİ ROL SEÇİMİ YAPILDIĞINDA TETİKLENEN KİLİT MOTORU
window.handleRoleChange = function() {
    if (hasSelectedRole) return;
    hasSelectedRole = true;

    const radios = document.querySelectorAll('input[name="user-role-radio"]');
    radios.forEach(radio => radio.disabled = true);

    const roleSelector = document.getElementById("customer-role-selector");
    if (roleSelector) {
        roleSelector.style.opacity = "0.6";
        roleSelector.style.pointerEvents = "none";
    }

    const currentRole = getSelectedCustomerRole();
    
    // Satıcı seçildiyse "Sağlığı Düşük" ve "Arızalı" tablolarını ve yeni mal ekleme formunu açıyoruz!
    const containerLow = document.getElementById("container-low");
    const containerDefective = document.getElementById("container-defective");
    const sellerFormPanel = document.getElementById("customer-seller-panel");

    if (currentRole === "satici") {
        if (containerLow) containerLow.style.display = "block";
        if (containerDefective) containerDefective.style.display = "block";
        if (sellerFormPanel) sellerFormPanel.style.display = "block";
    } else {
        if (containerLow) containerLow.style.display = "none";
        if (containerDefective) containerDefective.style.display = "none";
        if (sellerFormPanel) sellerFormPanel.style.display = "none";
    }

    updateTablesByStatus(globalStocks, false);
}

function getSelectedCustomerRole() {
    const radio = document.querySelector('input[name="user-role-radio"]:checked');
    return radio ? radio.value : "alici";
}

// ==========================================
// 3. BULUTTAN VERİLERİ GETİRME (GET)
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
            if (isAdmin) renderSalesReport();
        }
    } catch (error) {
        console.error(error);
    }
}

function parseOfferNotes(rawNotes) {
    let buyer = "Yok";
    let seller = "Yok";

    if (rawNotes && rawNotes !== "Teklif Yok") {
        const parts = rawNotes.split("||");
        parts.forEach(part => {
            if (part.trim().startsWith("ALICI:")) buyer = part.replace("ALICI:", "").trim();
            else if (part.trim().startsWith("SATICI:")) seller = part.replace("SATICI:", "").trim();
        });
    }
    return { buyer, seller };
}

// ==========================================
// 4. TABLO MOTORU VE KÖRLENMİŞ TİCARİ KİLİT SİSTEMİ
// ==========================================
function updateTablesByStatus(stocks, isAdmin) {
    const healthyBody = document.querySelector("#table-healthy tbody");
    const lowBody = document.querySelector("#table-low tbody");
    const defectiveBody = document.querySelector("#table-defective tbody");

    if (healthyBody) healthyBody.innerHTML = "";
    if (lowBody) lowBody.innerHTML = "";
    if (defectiveBody) defectiveBody.innerHTML = "";

    let healthyTotals = { buy: 0, sell: 0 };
    let lowTotals = { buy: 0, sell: 0 };
    let defectiveTotals = { buy: 0, sell: 0 };

    const currentRole = getSelectedCustomerRole();

    stocks.forEach(stock => {
        const currentStatus = (stock.status || "Sağlıklı").trim();
        const brand = stock.brand_name || "---";
        const capacity = stock.capacity_gb ? `${stock.capacity_gb} GB` : "---";
        const inch = stock.model || "---"; // Veritabanındaki 'model' sütununu 'inch' verisi için saklıyoruz hafızada.
        const barcode = stock.barcode || "---";
        
        const parsedOffers = parseOfferNotes(stock.offer_notes);
        const count = parseInt(stock.stock_count || 0);
        const buyPrice = parseFloat(stock.price || 0);
        const sellPrice = parseFloat(stock.sale_price || 0);
        
        // Eğer giriş yapan admin değilse ve henüz satıcı rolünü seçmediyse, düşük/arızalı ürünleri başlangıçta gösterme
        if (!isAdmin && currentRole !== "satici" && currentStatus !== "Sağlıklı") return;

        const row = document.createElement("tr");
        const totalBuyRow = count * buyPrice;
        const totalSellRow = count * sellPrice;

        if (currentStatus === "Sağlıklı") {
            healthyTotals.buy += totalBuyRow; healthyTotals.sell += totalSellRow;
        } else if (currentStatus === "Sağlığı Düşük") {
            lowTotals.buy += totalBuyRow; lowTotals.sell += totalSellRow;
        } else if (currentStatus === "Arızalı") {
            defectiveTotals.buy += totalBuyRow; defectiveTotals.sell += totalSellRow;
        }

        // ADMİN VE MÜŞTERİ HÜCRE GÖRÜNÜMÜ AYRIMI (KÖRLÜK SİSTEMİ)
        let buyerCellHTML = "";
        let sellerCellHTML = "";
        let customerStatusCellHTML = ""; // Sadece müşterilerin kendi teklif takibi için
        let actionButtons = "";

        if (isAdmin) {
            // Yönetici her iki tarafın ham tekliflerini ve muhasebeyi eksiksiz yönetir
            const buyerNotice = parsedOffers.buyer !== "Yok" ? `<span style="background:#eab308; color:#000; padding:2px 4px; border-radius:3px; font-size:10px; margin-right:4px; animation: blink 1s infinite;">YENİ</span>` : "";
            const sellerNotice = parsedOffers.seller !== "Yok" ? `<span style="background:#eab308; color:#000; padding:2px 4px; border-radius:3px; font-size:10px; margin-right:4px; animation: blink 1s infinite;">YENİ</span>` : "";

            buyerCellHTML = `
                <td style="color: #10b981;">
                    <div id="display-ALICI-${stock.id}">
                        ${buyerNotice}<span>${parsedOffers.buyer}</span>
                        <button class="btn-edit-offer" onclick="showInlineInput(${stock.id}, 'ALICI')">✍️ Onayla</button>
                    </div>
                    <div id="edit-ALICI-${stock.id}" style="display:none; gap:5px;">
                        <input type="text" id="input-ALICI-${stock.id}" value="${parsedOffers.buyer === "Yok" ? "" : parsedOffers.buyer}" style="width:100px; background:#222; color:#fff; border:1px solid #444;">
                        <button onclick="submitInlineOffer(${stock.id}, 'ALICI')" style="background:#10b981; color:white; border:none; padding:3px 6px; border-radius:3px;">✔️</button>
                    </div>
                </td>`;

            sellerCellHTML = `
                <td style="color: #f97316;">
                    <div id="display-SATICI-${stock.id}">
                        ${sellerNotice}<span>${parsedOffers.seller}</span>
                        <button class="btn-edit-offer" onclick="showInlineInput(${stock.id}, 'SATICI')">✍️ Onayla</button>
                    </div>
                    <div id="edit-SATICI-${stock.id}" style="display:none; gap:5px;">
                        <input type="text" id="input-SATICI-${stock.id}" value="${parsedOffers.seller === "Yok" ? "" : parsedOffers.seller}" style="width:100px; background:#222; color:#fff; border:1px solid #444;">
                        <button onclick="submitInlineOffer(${stock.id}, 'SATICI')" style="background:#10b981; color:white; border:none; padding:3px 6px; border-radius:3px;">✔️</button>
                    </div>
                </td>`;

            actionButtons = `
                <td>
                    <button class="btn-action btn-plus" onclick="changeStockInCloud(${stock.id}, 1)">+</button>
                    <button class="btn-action btn-minus" onclick="changeStockInCloud(${stock.id}, -1)">-</button>
                    <button class="btn-action btn-delete" onclick="deleteStockFromCloud(${stock.id})">Sil</button>
                </td>`;
        } else {
            // 🔒 MÜŞTERİ EKRANI (BİRBİRİNİN FİYATINI KESİNLİKLE GÖREMEZ)
            if (currentRole === "alici") {
                // Alıcı sadece dükkanın SATIŞ FİYATINI görür. Satıcının dükkana ne fiyat verdiğini ASLA göremez!
                buyerCellHTML = `<td style="color: #10b981; font-size:15px;"><strong>${sellPrice.toFixed(2)} TL</strong></td>`;
                sellerCellHTML = `<td style="color: #64748b; font-size:12px; opacity:0.4;">🔒 Gizli Bölüm</td>`;
                customerStatusCellHTML = `<td style="color:#10b981; font-size:12px;">Mevcut Teklifiniz: <br><strong>${parsedOffers.buyer}</strong></td>`;
                
                actionButtons = `
                    <td>
                        <div id="display-ALICI-${stock.id}">
                            <button class="btn-buyer" style="padding:6px 12px;" onclick="showInlineInput(${stock.id}, 'ALICI')">🛒 Satın Al / Teklif Ver</button>
                        </div>
                        <div id="edit-ALICI-${stock.id}" style="display:none; gap:5px; align-items:center;">
                            <input type="text" id="input-ALICI-${stock.id}" placeholder="Adet ve Fiyat Yazın" style="width:120px; background:#222; color:#fff; border:1px solid #10b981; padding:4px;">
                            <button onclick="submitInlineOffer(${stock.id}, 'ALICI')" style="background:#10b981; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer;">✔️</button>
                        </div>
                    </td>`;
            } else {
                // Satıcı sadece dükkanın ALIŞ FİYATINI görür. Alıcının dükkandan ne fiyata mal aldığını ASLA göremez!
                buyerCellHTML = `<td style="color: #64748b; font-size:12px; opacity:0.4;">🔒 Gizli Bölüm</td>`;
                sellerCellHTML = `<td style="color: #f97316; font-size:15px;"><strong>${buyPrice.toFixed(2)} TL</strong></td>`;
                customerStatusCellHTML = `<td style="color:#f97316; font-size:12px;">Dükkana Arzınız: <br><strong>${parsedOffers.seller}</strong></td>`;

                actionButtons = `
                    <td>
                        <div id="display-SATICI-${stock.id}">
                            <button class="btn-seller" style="padding:6px 12px;" onclick="showInlineInput(${stock.id}, 'SATICI')">📦 Dükkana Sat / Fiyat Ver</button>
                        </div>
                        <div id="edit-SATICI-${stock.id}" style="display:none; gap:5px; align-items:center;">
                            <input type="text" id="input-SATICI-${stock.id}" placeholder="Adet ve Fiyat Yazın" style="width:120px; background:#222; color:#fff; border:1px solid #f97316; padding:4px;">
                            <button onclick="submitInlineOffer(${stock.id}, 'SATICI')" style="background:#f97316; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer;">✔️</button>
                        </div>
                    </td>`;
            }
        }

        const adminCells = isAdmin ? `
            <td class="admin-only" style="display: table-cell;">${buyPrice.toFixed(2)} TL</td>
            <td class="admin-only" style="display: table-cell;">${sellPrice.toFixed(2)} TL</td>
            <td class="admin-only" style="display: table-cell; color: #3498db;">${totalBuyRow.toFixed(2)} TL</td>
            <td class="admin-only" style="display: table-cell; color: #10b981;"><strong>${totalSellRow.toFixed(2)} TL</strong></td>
        ` : "";

        row.innerHTML = `
            <td style="font-family: monospace; color: #3498db;">${barcode}</td>
            <td>${brand}</td>
            <td>${capacity}</td>
            <td><strong>${inch}"</strong></td>
            <td><strong>${count}</strong></td>
            ${buyerCellHTML}
            ${sellerCellHTML}
            ${!isAdmin ? customerStatusCellHTML : ""}
            ${adminCells}
            ${actionButtons}
        `;

        if (currentStatus === "Sağlıklı" && healthyBody) healthyBody.appendChild(row);
        else if (currentStatus === "Sağlığı Düşük" && lowBody) lowBody.appendChild(row);
        else if (currentStatus === "Arızalı" && defectiveBody) defectiveBody.appendChild(row);
    });

    if (isAdmin) {
        addCategoryTotalRow(healthyBody, healthyTotals);
        addCategoryTotalRow(lowBody, lowTotals);
        addCategoryTotalRow(defectiveBody, defectiveTotals);

        const grandBuy = healthyTotals.buy + lowTotals.buy + defectiveTotals.buy;
        const grandSell = healthyTotals.sell + lowTotals.sell + defectiveTotals.sell;
        
        const gBuyEl = document.getElementById("grand-buy-value");
        const gSellEl = document.getElementById("grand-sell-value");
        if (gBuyEl) gBuyEl.innerText = grandBuy.toFixed(2);
        if (gSellEl) gSellEl.innerText = grandSell.toFixed(2);
    }
}

function addCategoryTotalRow(tbody, totals) {
    if (!tbody) return;
    const row = document.createElement("tr");
    row.className = "total-row";
    row.innerHTML = `
        <td colspan="7" style="text-align: right; color: #aaa;">Kategori Toplamı:</td>
        <td style="color: #3498db;">Alış: ${totals.buy.toFixed(2)} TL</td>
        <td style="color: #10b981;">Satış: ${totals.sell.toFixed(2)} TL</td>
        <td></td>
    `;
    tbody.appendChild(row);
}

// ==========================================
// 5. SEÇİM ALANI SESSİZ AÇILIŞ MOTORU
// ==========================================
window.showInlineInput = function(id, role) {
    const dispEl = document.getElementById(`display-${role}-${id}`);
    const editEl = document.getElementById(`edit-${role}-${id}`);
    if (dispEl) dispEl.style.display = "none";
    if (editEl) editEl.style.display = "flex";
}

// ==========================================
// 6. GÜVENLİ TEKLİF VE ADMİN SÜREÇ ONAY MOTORU
// ==========================================
window.submitInlineOffer = async function(id, role) {
    const urlParams = new URLSearchParams(window.location.search);
    const isAdmin = (urlParams.get('mod') === 'ahmet');
    
    const stockItem = globalStocks.find(s => s.id === id);
    if (!stockItem) return;

    const parsed = parseOfferNotes(stockItem.offer_notes);
    const inputVal = document.getElementById(`input-${role}-${id}`).value.trim();

    if (role === 'ALICI') {
        parsed.buyer = inputVal === "" ? "Yok" : inputVal;
    } else if (role === 'SATICI') {
        parsed.seller = inputVal === "" ? "Yok" : inputVal;
    }

    const finalOfferString = `ALICI: ${parsed.buyer} || SATICI: ${parsed.seller}`;
    let updatePayload = { offer_notes: finalOfferString };

    if (isAdmin && inputVal !== "") {
        const priceMatch = inputVal.match(/\d+(\.\d+)?/);
        if (priceMatch) {
            const extractedPrice = parseFloat(priceMatch[0]);
            if (role === 'ALICI') {
                updatePayload.sale_price = extractedPrice;
            } else if (role === 'SATICI') {
                updatePayload.price = extractedPrice;
            }
        }
    }

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

        if (response.ok) {
            fetchStocksFromCloud(isAdmin);
        }
    } catch (error) {
        console.error(error);
    }
}

// ==========================================
// 7. SATICININ SIFIRDAN DÜKKANA DİSK ARZ ETMESİ (MÜŞTERİ TEKLİFİ)
// ==========================================
window.submitNewOfferFromSeller = async function(event) {
    event.preventDefault();

    const brand = document.getElementById("offer-brand").value;
    const capacity = parseInt(document.getElementById("offer-capacity").value);
    const inch = document.getElementById("offer-inch").value;
    const status = document.getElementById("offer-status").value;
    const count = document.getElementById("offer-count").value;
    const priceAndTel = document.getElementById("offer-price").value;

    // Satıcının oluşturduğu teklif dizesi
    const offerNotes = `ALICI: Yok || SATICI: ${count} Adet - İstenen Fiyat/Tel: ${priceAndTel}`;

    try {
        const response = await fetch(`${SUPABASE_URL}/stocks`, {
            method: "POST",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                barcode: "Müşteri Arzı",
                brand_name: brand,
                capacity_gb: capacity,
                model: inch, // inch verisini model sütununa eşledik
                stock_count: 0, // Sen onaylayana kadar stoğa girmez
                price: 0,
                sale_price: 0,
                offer_notes: offerNotes,
                status: status
            })
        });

        if (response.ok) {
            document.getElementById("customer-offer-form").reset();
            alert("Teklifiniz dükkan yönetimine başarıyla iletildi abim.");
            fetchStocksFromCloud(false);
        }
    } catch (error) {
        console.error(error);
    }
}

// ==========================================
// 8. ADMİNİN BULUTTA STOK ADEDİ DEĞİŞTİRME (+ / -)
// ==========================================
window.changeStockInCloud = async function(id, amount) {
    const stockElement = document.getElementById(`stock-count-${id}`);
    if (!stockElement) return;

    let currentStock = parseInt(stockElement.innerText);
    let newStock = currentStock + amount;
    if (newStock < 0) newStock = 0;

    stockElement.innerText = newStock;

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
    } catch (error) {
        console.error(error);
    }
}

// ==========================================
// 9. ADMİNİN SIFIRDAN YENİ HARD DİSK EKLEME (POST)
// ==========================================
window.addNewStock = async function(event) {
    event.preventDefault();

    const barcode = document.getElementById("prod-barcode").value;
    const brand = document.getElementById("prod-brand").value;
    const capacity = parseInt(document.getElementById("prod-capacity").value);
    const inch = document.getElementById("prod-inch").value;
    const stock = parseInt(document.getElementById("prod-stock").value);
    const buyPrice = parseFloat(document.getElementById("prod-price").value || 0);
    const sellPrice = parseFloat(document.getElementById("prod-sale-price").value || 0);
    const status = document.getElementById("prod-status").value;

    try {
        const response = await fetch(`${SUPABASE_URL}/stocks`, {
            method: "POST",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                barcode: barcode,
                brand_name: brand,
                capacity_gb: capacity,
                model: inch, // inch verisi model sütununda saklanıyor
                stock_count: stock,
                price: buyPrice,
                sale_price: sellPrice,
                offer_notes: "ALICI: Yok || SATICI: Yok",
                status: status
            })
        });

        if (response.ok) {
            document.getElementById("add-stock-form").reset();
            fetchStocksFromCloud(true);
        }
    } catch (error) {
        console.error(error);
    }
}

// ==========================================
// 10. BULUTTAN ÜRÜNÜ TAMAMEN SİLME (DELETE)
// ==========================================
window.deleteStockFromCloud = async function(id) {
    try {
        const response = await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, {
            method: "DELETE",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`
            }
        });

        if (response.ok) {
            fetchStocksFromCloud(true);
        }
    } catch (error) {
        console.error(error);
    }
}

// ==========================================
// 11. BARKOD OKUTARAK SATIŞ YAPMA MANTIĞI
// ==========================================
window.barcodeSaleStockDrop = async function(event) {
    event.preventDefault();
    const barcodeInput = document.getElementById("scan-barcode-input");
    const sessionSelect = document.getElementById("active-sale-session");
    const scannedBarcode = barcodeInput.value.trim();
    const targetSession = sessionSelect.value;
    
    if (!scannedBarcode) return;

    const matchedStock = globalStocks.find(s => s.barcode && s.barcode.trim() === scannedBarcode);
    if (!matchedStock || parseInt(matchedStock.stock_count || 0) <= 0) {
        barcodeInput.value = "";
        barcodeInput.focus();
        return;
    }

    let newStockCount = parseInt(matchedStock.stock_count) - 1;

    try {
        const response = await fetch(`${SUPABASE_URL}/stocks?id=eq.${matchedStock.id}`, {
            method: "PATCH",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ stock_count: newStockCount })
        });

        if (response.ok) {
            saveSaleToSessionLogs(scannedBarcode, matchedStock.brand_name, `${matchedStock.capacity_gb}GB ${matchedStock.model}"`, targetSession, parseFloat(matchedStock.sale_price || 0));
            barcodeInput.value = "";
            barcodeInput.focus();
            fetchStocksFromCloud(true);
        }
    } catch (error) {
        console.error(error);
    }
}

function saveSaleToSessionLogs(barcode, brand, desc, sessionName, salePrice) {
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    let existingIndex = allSales.findIndex(s => s.barcode === barcode && s.session === sessionName);
    
    if (existingIndex > -1) {
        allSales[existingIndex].count += 1;
    } else {
        allSales.push({
            barcode: barcode,
            title: `${brand} ${desc}`,
            session: sessionName,
            count: 1,
            price: salePrice
        });
    }
    localStorage.setItem("erdem_bilisim_sales_logs", JSON.stringify(allSales));
}

window.switchReportTab = function(sessionName) {
    currentActiveReportTab = sessionName;
    document.querySelectorAll(".tab-btn").forEach(btn => {
        if (btn.innerText.trim() === sessionName) btn.classList.add("active");
        else btn.classList.remove("active");
    });
    renderSalesReport();
}

function renderSalesReport() {
    const tbody = document.getElementById("reports-tbody");
    if (!tbody) return;
    
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    let filteredSales = allSales.filter(s => s.session === currentActiveReportTab);
    
    if (filteredSales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="color: #64748b; text-align: center;">Satış yok.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = "";
    let totalSessionRevenue = 0;
    
    filteredSales.forEach(sale => {
        const rowTotal = sale.count * sale.price;
        totalSessionRevenue += rowTotal;
        
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="font-family: monospace; color: #38bdf8;">${sale.barcode}</td>
            <td>${sale.title}</td>
            <td><span style="background-color: #1e3a8a; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${sale.session}</span></td>
            <td><strong>${sale.count} Adet</strong></td>
            <td>${sale.price.toFixed(2)} TL</td>
            <td style="color: #34d399; font-weight: bold;">${rowTotal.toFixed(2)} TL</td>
        `;
        tbody.appendChild(tr);
    });
    
    const totalTr = document.createElement("tr");
    totalTr.style.backgroundColor = "#1e293b";
    totalTr.style.fontWeight = "bold";
    totalTr.innerHTML = `
        <td colspan="5" style="text-align: right; color: #94a3b8;">Toplam Ciro:</td>
        <td style="color: #34d399; font-size: 16px;">${totalSessionRevenue.toFixed(2)} TL</td>
    `;
    tbody.appendChild(totalTr);
}

const style = document.createElement('style');
style.innerHTML = `
@keyframes blink {
    0% { opacity: 1; }
    50% { opacity: 0.3; }
    100% { opacity: 1; }
}
`;
document.head.appendChild(style);