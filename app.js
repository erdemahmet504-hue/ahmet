// ==========================================
// 1. BULUT VERİTABANI BAĞLANTI BİLGİLERİ
// ==========================================
const SUPABASE_URL = "https://zwayidssoujhrjxzgdql.supabase.co/rest/v1"; 
const SUPABASE_KEY = "sb_publishable_wHYCLbDylFN9wnRXuGCmFg_cl1OPZAC"; 

let globalStocks = [];
let currentActiveReportTab = "Satış 1";

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

        let headersHTML = `
            <th>Barkod</th>
            <th>Marka</th>
            <th>Model</th>
            <th>Boyut</th>
            <th>Mevcut Stok</th>
            <th style="color: #10b981;">Alıcı Teklifi</th>
            <th style="color: #f97316;">Satıcı Teklifi</th>
        `;

        if (isAdmin) {
            headersHTML += `
                <th class="admin-only" style="display: table-cell;">Alış Fiyatı</th>
                <th class="admin-only" style="display: table-cell;">Satış Fiyatı</th>
                <th class="admin-only" style="display: table-cell;">Toplam Alış</th>
                <th class="admin-only" style="display: table-cell;">Toplam Satış</th>
            `;
        }

        headersHTML += `<th>İşlemler</th>`;
        theadRow.innerHTML = headersHTML;
    });
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
        console.error("Veri çekme esnasında ağ hatası:", error);
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
// 4. TABLO MOTORU VE BAĞIMSIZ BUTON KİLİTLEME
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

    stocks.forEach(stock => {
        const currentStatus = (stock.status || "Sağlıklı").trim();
        const brand = stock.brand_name || "---";
        const model = stock.model || "---";
        const capacity = stock.capacity_gb || "---";
        const barcode = stock.barcode || "---";
        
        const parsedOffers = parseOfferNotes(stock.offer_notes);

        const count = parseInt(stock.stock_count || 0);
        const buyPrice = parseFloat(stock.price || 0);
        const sellPrice = parseFloat(stock.sale_price || 0);
        
        if (!isAdmin && currentStatus !== "Sağlıklı") return;

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

        // Butonlar başlangıçta normal basılıyor
        const actionButtons = isAdmin ? `
            <button class="btn-action btn-plus" onclick="changeStockInCloud(${stock.id}, 1)">+</button>
            <button class="btn-action btn-minus" onclick="changeStockInCloud(${stock.id}, -1)">-</button>
            <button class="btn-action btn-delete" onclick="deleteStockFromCloud(${stock.id})">Sil</button>
        ` : `
            <div style="display: flex; gap: 4px;">
                <button class="btn-buyer" id="btn-buyer-${stock.id}" style="padding: 6px; font-size:11px; width:auto;" onclick="showInlineInput(${stock.id}, 'ALICI')">🛒 Satın Al</button>
                <button class="btn-seller" id="btn-seller-${stock.id}" style="padding: 6px; font-size:11px; width:auto;" onclick="showInlineInput(${stock.id}, 'SATICI')">📦 Bana Sat</button>
            </div>
        `;

        const buyerNotice = (isAdmin && parsedOffers.buyer !== "Yok") ? `<span style="background:#eab308; color:#000; padding:2px 4px; border-radius:3px; font-size:10px; margin-right:4px; animation: blink 1s infinite;">YENİ TEKLİF</span>` : "";
        const sellerNotice = (isAdmin && parsedOffers.seller !== "Yok") ? `<span style="background:#eab308; color:#000; padding:2px 4px; border-radius:3px; font-size:10px; margin-right:4px; animation: blink 1s infinite;">YENİ TEKLİF</span>` : "";

        // Alıcı Hücresi
        const buyerDisplay = `
            <div id="display-ALICI-${stock.id}">
                ${buyerNotice}<span>${parsedOffers.buyer}</span>
                ${isAdmin ? `<button class="btn-edit-offer" onclick="showInlineInput(${stock.id}, 'ALICI')">✍️ Onayla</button>` : ''}
            </div>
            <div id="edit-ALICI-${stock.id}" style="display:none; gap:5px; align-items: center;">
                <input type="text" id="input-ALICI-${stock.id}" placeholder="Fiyat ve Tel" value="${isAdmin && parsedOffers.buyer !== "Yok" ? parsedOffers.buyer : ''}" style="width:100px; background:#222; color:#fff; border:1px solid #444; padding:3px; border-radius:3px;">
                <button onclick="submitInlineOffer(${stock.id}, 'ALICI')" style="background:#10b981; border:none; color:white; cursor:pointer; padding:3px 6px; border-radius:3px;">✔️</button>
                ${!isAdmin ? `<button onclick="cancelInlineInput(${stock.id}, 'ALICI')" style="background:#ef4444; border:none; color:white; cursor:pointer; padding:3px 6px; border-radius:3px;">❌</button>` : ''}
            </div>
        `;

        // Satıcı Hücresi
        const sellerDisplay = `
            <div id="display-SATICI-${stock.id}">
                ${sellerNotice}<span>${parsedOffers.seller}</span>
                ${isAdmin ? `<button class="btn-edit-offer" onclick="showInlineInput(${stock.id}, 'SATICI')">✍️ Onayla</button>` : ''}
            </div>
            <div id="edit-SATICI-${stock.id}" style="display:none; gap:5px; align-items: center;">
                <input type="text" id="input-SATICI-${stock.id}" placeholder="Fiyat ve Tel" value="${isAdmin && parsedOffers.seller !== "Yok" ? parsedOffers.seller : ''}" style="width:100px; background:#222; color:#fff; border:1px solid #444; padding:3px; border-radius:3px;">
                <button onclick="submitInlineOffer(${stock.id}, 'SATICI')" style="background:#10b981; border:none; color:white; cursor:pointer; padding:3px 6px; border-radius:3px;">✔️</button>
                ${!isAdmin ? `<button onclick="cancelInlineInput(${stock.id}, 'SATICI')" style="background:#ef4444; border:none; color:white; cursor:pointer; padding:3px 6px; border-radius:3px;">❌</button>` : ''}
            </div>
        `;

        const adminCells = isAdmin ? `
            <td class="admin-only" style="display: table-cell;">${buyPrice.toFixed(2)} TL</td>
            <td class="admin-only" style="display: table-cell;">${sellPrice.toFixed(2)} TL</td>
            <td class="admin-only" style="display: table-cell; color: #3498db;">${totalBuyRow.toFixed(2)} TL</td>
            <td class="admin-only" style="display: table-cell; color: #10b981;"><strong>${totalSellRow.toFixed(2)} TL</strong></td>
        ` : "";

        row.innerHTML = `
            <td style="font-family: monospace; color: #3498db;">${barcode}</td>
            <td>${brand}</td>
            <td>${model}</td>
            <td>${capacity} GB</td>
            <td><strong id="stock-count-${stock.id}">${count}</strong></td>
            <td style="color: #10b981; font-weight: bold;">${buyerDisplay}</td>
            <td style="color: #f97316; font-weight: bold;">${sellerDisplay}</td>
            ${adminCells}
            <td>${actionButtons}</td>
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
// 5. ⚡ ANLIK KİLİTLEME VE GİRİŞ ALANI AÇMA
// ==========================================
window.showInlineInput = function(id, role) {
    const urlParams = new URLSearchParams(window.location.search);
    const isAdmin = (urlParams.get('mod') === 'ahmet');

    // Giriş kutularını aç
    const dispEl = document.getElementById(`display-${role}-${id}`);
    const editEl = document.getElementById(`edit-${role}-${id}`);
    if (dispEl) dispEl.style.display = "none";
    if (editEl) editEl.style.display = "flex";

    // Eğer işlem yapan müşteri ise diğer butonu anında kilitliyoruz
    if (!isAdmin) {
        if (role === 'ALICI') {
            const otherBtn = document.getElementById(`btn-seller-${id}`);
            if (otherBtn) {
                otherBtn.disabled = true;
                otherBtn.style.opacity = "0.2";
                otherBtn.style.cursor = "not-allowed";
            }
        } else if (role === 'SATICI') {
            const otherBtn = document.getElementById(`btn-buyer-${id}`);
            if (otherBtn) {
                otherBtn.disabled = true;
                otherBtn.style.opacity = "0.2";
                otherBtn.style.cursor = "not-allowed";
            }
        }
    }
}

// İptal Et butonuna basıldığında kilitleri açan fonksiyon
window.cancelInlineInput = function(id, role) {
    const dispEl = document.getElementById(`display-${role}-${id}`);
    const editEl = document.getElementById(`edit-${role}-${id}`);
    if (dispEl) dispEl.style.display = "block";
    if (editEl) editEl.style.display = "none";

    // Buton kilitlerini kaldır ve eski haline döndür
    const buyerBtn = document.getElementById(`btn-buyer-${id}`);
    const sellerBtn = document.getElementById(`btn-seller-${id}`);
    
    if (buyerBtn) {
        buyerBtn.disabled = false;
        buyerBtn.style.opacity = "1";
        buyerBtn.style.cursor = "pointer";
    }
    if (sellerBtn) {
        sellerBtn.disabled = false;
        sellerBtn.style.opacity = "1";
        sellerBtn.style.cursor = "pointer";
    }
}

// ==========================================
// 6. SESSİZ TEKLİF VE ADMİN SÜREÇ ONAY MOTORU
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
    } else {
        parsed.seller = inputVal === "" ? "Yok" : inputVal;
    }

    const finalOfferString = `ALICI: ${parsed.buyer} || SATICI: ${parsed.seller}`;
    let updatePayload = { offer_notes: finalOfferString };

    // Admin onay tikine bastığında fiyat muhasebeye otomatik akar
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
// 7. BULUTTA STOK ADEDİ DEĞİŞTİRME (+ / -)
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
        console.error("Stok güncellenemedi:", error);
    }
}

// ==========================================
// 8. BULUTA SIFIRDAN YENİ HARD DİSK EKLEME (POST)
// ==========================================
window.addNewStock = async function(event) {
    event.preventDefault();

    const barcode = document.getElementById("prod-barcode").value;
    const brand = document.getElementById("prod-brand").value;
    const model = document.getElementById("prod-model").value;
    const capacity = parseInt(document.getElementById("prod-capacity").value);
    const stock = parseInt(document.getElementById("prod-stock").value);
    const buyPrice = parseFloat(document.getElementById("prod-price").value || 0);
    const sellPrice = parseFloat(document.getElementById("prod-sale-price").value || 0);
    const offerNotes = document.getElementById("prod-offer").value || "ALICI: Yok || SATICI: Yok";
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
                model: model,
                capacity_gb: capacity,
                stock_count: stock,
                price: buyPrice,
                sale_price: sellPrice,
                offer_notes: offerNotes,
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
// 9. BULUTTAN ÜRÜNÜ TAMAMEN SİLME (DELETE)
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
// 10. BARKOD OKUTARAK ANLIK SEÇİLİ BÖLÜME SATIŞ MANTIĞI
// ==========================================
window.barcodeSaleStockDrop = async function(event) {
    event.preventDefault();
    
    const barcodeInput = document.getElementById("scan-barcode-input");
    const sessionSelect = document.getElementById("active-sale-session");
    
    const scannedBarcode = barcodeInput.value.trim();
    const targetSession = sessionSelect.value;
    
    if (!scannedBarcode) return;

    const matchedStock = globalStocks.find(s => s.barcode && s.barcode.trim() === scannedBarcode);

    if (!matchedStock) {
        barcodeInput.value = "";
        barcodeInput.focus();
        return;
    }

    let currentStockCount = parseInt(matchedStock.stock_count || 0);
    if (currentStockCount <= 0) {
        barcodeInput.value = "";
        barcodeInput.focus();
        return;
    }

    let newStockCount = currentStockCount - 1;

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
            saveSaleToSessionLogs(scannedBarcode, matchedStock.brand_name, matchedStock.model, targetSession, parseFloat(matchedStock.sale_price || 0));
            barcodeInput.value = "";
            barcodeInput.focus();
            fetchStocksFromCloud(true);
        }
    } catch (error) {
        console.error(error);
    }
}

// ==========================================
// 11. BÖLÜMLENDİRİLMİŞ SATIŞ RAPORLAMA MOTORU
// ==========================================
function saveSaleToSessionLogs(barcode, brand, model, sessionName, salePrice) {
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    let existingIndex = allSales.findIndex(s => s.barcode === barcode && s.session === sessionName);
    
    if (existingIndex > -1) {
        allSales[existingIndex].count += 1;
    } else {
        allSales.push({
            barcode: barcode,
            title: `${brand} ${model}`,
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
        tbody.innerHTML = `<tr><td colspan="6" style="color: #64748b; text-align: center;">${currentActiveReportTab} grubuna ait henüz yapılmış satış yok.</td></tr>`;
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
        <td colspan="5" style="text-align: right; color: #94a3b8;">${currentActiveReportTab} Toplam Cirosu:</td>
        <td style="color: #34d399; font-size: 16px;">${totalSessionRevenue.toFixed(2)} TL</td>
    `;
    tbody.appendChild(totalTr);
}

// CSS Animasyonu
const style = document.createElement('style');
style.innerHTML = `
@keyframes blink {
    0% { opacity: 1; }
    50% { opacity: 0.3; }
    100% { opacity: 1; }
}
`;
document.head.appendChild(style);