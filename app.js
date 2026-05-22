// ==========================================
// 1. BULUT VERİTABANI BAĞLANTI BİLGİLERİ
// ==========================================
const SUPABASE_URL = "https://zwayidssoujhrjxzgdql.supabase.co/rest/v1"; 
const SUPABASE_KEY = "sb_publishable_wHYCLbDylFN9wnRXuGCmFg_cl1OPZAC"; 

let globalStocks = [];

// ==========================================
// 2. SAYFA YÜKLENDİĞİNDE YETKİ KONTROLÜ
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mod');
    const isAdmin = (mode === 'ahmet');

    // Panellerin Görünürlük Ayarları
    const adminSection = document.getElementById("admin-panel");
    if (adminSection) adminSection.style.display = isAdmin ? "block" : "none";

    const barcodeSaleSection = document.getElementById("barcode-sale-panel");
    if (barcodeSaleSection) barcodeSaleSection.style.display = isAdmin ? "block" : "none";

    const grandTotalSection = document.getElementById("grand-total-section");
    if (grandTotalSection) grandTotalSection.style.display = isAdmin ? "flex" : "none";

    const containerLow = document.getElementById("container-low");
    const containerDefective = document.getElementById("container-defective");
    
    updateTableHeadersDirect(isAdmin);

    if (isAdmin) {
        if (containerLow) containerLow.style.display = "block";
        if (containerDefective) containerDefective.style.display = "block";
        
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = 'table-cell';
        });
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
// 4. TABLO MOTORU VE İKİ SÜTUNLU GÖSTERİM
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

        const actionButtons = isAdmin ? `
            <button class="btn-action btn-plus" onclick="changeStockInCloud(${stock.id}, 1)">+</button>
            <button class="btn-action btn-minus" onclick="changeStockInCloud(${stock.id}, -1)">-</button>
            <button class="btn-action btn-delete" onclick="deleteStockFromCloud(${stock.id})">Sil</button>
        ` : `
            <button class="btn-buyer" onclick="customerSendOfferSplit(${stock.id}, 'ALICI')">🛒 Satın Al</button>
            <button class="btn-seller" onclick="customerSendOfferSplit(${stock.id}, 'SATICI')">📦 Bana Sat</button>
        `;

        const buyerDisplay = isAdmin ? `
            <span>${parsedOffers.buyer}</span>
            <button class="btn-edit-offer" onclick="adminEditOfferDirect(${stock.id}, 'ALICI')">✍️</button>
        ` : `<span>${parsedOffers.buyer}</span>`;

        const sellerDisplay = isAdmin ? `
            <span>${parsedOffers.seller}</span>
            <button class="btn-edit-offer" onclick="adminEditOfferDirect(${stock.id}, 'SATICI')">✍️</button>
        ` : `<span>${parsedOffers.seller}</span>`;

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
// 5. MÜŞTERİ CANLI TEKLİF VERME FONKSİYONU
// ==========================================
window.customerSendOfferSplit = async function(id, role) {
    const stockItem = globalStocks.find(s => s.id === id);
    const parsed = parseOfferNotes(stockItem ? stockItem.offer_notes : "");

    let promptMessage = "";
    if (role === 'ALICI') {
        promptMessage = "Bu diski satın almak için fiyat teklifinizi ve telefon numaranızı yazın:\n(Örn: 1400 TL - 05xx)";
    } else {
        promptMessage = "Elinizdeki diski dükkana satmak için istediğiniz fiyatı ve telefon numaranızı yazın:\n(Örn: 900 TL - 05xx)";
    }

    const customerOffer = prompt(promptMessage);
    if (customerOffer === null || customerOffer.trim() === "") return;

    if (role === 'ALICI') parsed.buyer = customerOffer.trim();
    else parsed.seller = customerOffer.trim();

    const finalOfferString = `ALICI: ${parsed.buyer} || SATICI: ${parsed.seller}`;

    try {
        const response = await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, {
            method: "PATCH",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            },
            body: JSON.stringify({ offer_notes: finalOfferString })
        });

        if (response.ok) {
            alert("Teklifiniz başarıyla karşı tarafa iletildi!");
            fetchStocksFromCloud(false);
        }
    } catch (error) {
        console.error(error);
    }
}

// ==========================================
// 6. ADMIN DOĞRUDAN DÜZENLEME VE AKILLI ONAY SİSTEMİ
// ==========================================
window.adminEditOfferDirect = async function(id, role) {
    const stockItem = globalStocks.find(s => s.id === id);
    if (!stockItem) return;

    const parsed = parseOfferNotes(stockItem.offer_notes);
    let currentVal = (role === 'ALICI') ? parsed.buyer : parsed.seller;
    
    const newOffer = prompt(`${role} sütunundaki teklifi düzenleyin veya dükkan fiyatını girin:`, currentVal === "Yok" ? "" : currentVal);
    if (newOffer === null) return; 

    // Yeni değeri atıyoruz
    if (role === 'ALICI') {
        parsed.buyer = newOffer.trim() === "" ? "Yok" : newOffer.trim();
    } else {
        parsed.seller = newOffer.trim() === "" ? "Yok" : newOffer.trim();
    }

    const finalOfferString = `ALICI: ${parsed.buyer} || SATICI: ${parsed.seller}`;
    
    // Veritabanına gönderilecek güncel paket
    let updatePayload = { offer_notes: finalOfferString };

    // ⚡ AKILLI ONAY OTOMASYONU: Eğer bir fiyat girildiyse ve iptal edilmediyse
    if (newOffer.trim() !== "") {
        // Metin içerisindeki rakamı (Fiyatı) ayıklama (Örn: "1400 TL - 0532" içinden 1400'ü çeker)
        const priceMatch = newOffer.match(/\d+(\.\d+)?/);
        if (priceMatch) {
            const extractedPrice = parseFloat(priceMatch[0]);
            
            // Eğer Alıcı Teklifi girildiyse -> Bu bizim dükkan için "Satış Fiyatımız" (sale_price) olur.
            if (role === 'ALICI') {
                const confirmSale = confirm(`💰 Alıcı teklifindeki ${extractedPrice} TL fiyatını doğrudan dükkanın "Satış Fiyatı" olarak onaylıyor musunuz?`);
                if (confirmSale) {
                    updatePayload.sale_price = extractedPrice;
                }
            } 
            // Eğer Satıcı Teklifi girildiyse (Biri bize disk satıyorsa) -> Bu bizim dükkan için "Alış Maliyetimiz" (price) olur.
            else if (role === 'SATICI') {
                const confirmBuy = confirm(`📥 Satıcı teklifindeki ${extractedPrice} TL fiyatını doğrudan dükkanın "Alış Fiyatı (Maliyet)" olarak onaylıyor musunuz?`);
                if (confirmBuy) {
                    updatePayload.price = extractedPrice;
                }
            }
        }
    }

    try {
        const response = await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, {
            method: "PATCH",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            },
            body: JSON.stringify(updatePayload)
        });

        if (response.ok) {
            fetchStocksFromCloud(true);
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
            alert("Ürün başarıyla veritabanına eklendi!");
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
    if (!confirm("Bu diski veritabanından tamamen silmek istediğine emin misin?")) return;

    try {
        const response = await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, {
            method: "DELETE",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`
            }
        });

        if (response.ok) {
            alert("Ürün başarıyla silindi!");
            fetchStocksFromCloud(true);
        }
    } catch (error) {
        console.error(error);
    }
}

// ==========================================
// 10. ⚡ BARKOD OKUTARAK ANLIK SATIŞ VE STOK DÜŞME FONKSİYONU
// ==========================================
window.barcodeSaleStockDrop = async function(event) {
    event.preventDefault();
    
    const barcodeInput = document.getElementById("scan-barcode-input");
    const scannedBarcode = barcodeInput.value.trim();
    
    if (!scannedBarcode) return;

    const matchedStock = globalStocks.find(s => s.barcode && s.barcode.trim() === scannedBarcode);

    if (!matchedStock) {
        alert(`❌ Hata: ${scannedBarcode} barkodlu ürün sistemde bulunamadı! Önce sisteme kaydetmelisiniz.`);
        barcodeInput.value = "";
        barcodeInput.focus();
        return;
    }

    let currentStockCount = parseInt(matchedStock.stock_count || 0);

    if (currentStockCount <= 0) {
        alert(`⚠️ Bu ürünün stoğu zaten 0 adet! Satış yapılamaz.`);
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
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            },
            body: JSON.stringify({ stock_count: newStockCount })
        });

        if (response.ok) {
            barcodeInput.value = "";
            barcodeInput.focus();
            fetchStocksFromCloud(true);
        } else {
            alert("Stok güncellenirken bir bulut hatası oluştu.");
        }
    } catch (error) {
        alert("Bağlantı hatası: " + error.message);
    }
}