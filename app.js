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

    // Panel ve Özet Görünürlük Ayarları
    const adminSection = document.getElementById("admin-panel");
    if (adminSection) adminSection.style.display = isAdmin ? "block" : "none";

    const grandTotalSection = document.getElementById("grand-total-section");
    if (grandTotalSection) grandTotalSection.style.display = isAdmin ? "flex" : "none";

    const containerLow = document.getElementById("container-low");
    const containerDefective = document.getElementById("container-defective");
    
    // HTML Başlıklarını Yeni Sütunlara Göre Güncelleme (Dinamik Tablo Başlığı)
    updateTableHeaders(isAdmin);

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

// Tablo başlıklarını Alıcı, Satıcı ve Admin Notu olarak 3 sütuna bölen fonksiyon
function updateTableHeaders(isAdmin) {
    ["table-healthy", "table-low", "table-defective"].forEach(tableId => {
        const table = document.getElementById(tableId);
        if (!table) return;
        const theadRow = table.querySelector("thead tr");
        if (!theadRow) return;

        // Admin hücreleri ve işlemler butonu hariç temel başlık yapısı
        let headersHTML = `
            <th>Barkod</th>
            <th>Marka</th>
            <th>Model</th>
            <th>Boyut</th>
            <th>Mevcut Stok</th>
            <th style="color: #2ecc71;">Alıcı Teklifi</th>
            <th style="color: #e67e22;">Satıcı Teklifi</th>
            <th style="color: #9b59b6;">Usta / Admin Notu</th>
        `;

        if (isAdmin) {
            headersHTML += `
                <th class="admin-only">Alış Fiyatı</th>
                <th class="admin-only">Satış Fiyatı</th>
                <th class="admin-only">Toplam Alış</th>
                <th class="admin-only">Toplam Satış</th>
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

// Teklif metnini parçalara ayıran yardımcı fonksiyon
function parseOfferNotes(rawNotes) {
    let buyer = "Yok";
    let seller = "Yok";
    let admin = "Not Yok";

    if (rawNotes && rawNotes !== "Teklif Yok") {
        const parts = rawNotes.split("||");
        parts.forEach(part => {
            if (part.startsWith("ALICI:")) buyer = part.replace("ALICI:", "").trim();
            else if (part.startsWith("SATICI:")) seller = part.replace("SATICI:", "").trim();
            else if (part.startsWith("ADMIN:")) admin = part.replace("ADMIN:", "").trim();
        });
    }
    return { buyer, seller, admin };
}

// ==========================================
// 4. TABLO MOTORU VE YENİ SÜTUN DÜZENİ
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
        
        // Teklif formatını Alıcı, Satıcı ve Admin olarak 3'e bölüyoruz
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

        // İŞLEMLER BUTONU
        const actionButtons = isAdmin ? `
            <button class="btn-action btn-plus" onclick="changeStockInCloud(${stock.id}, 1)">+</button>
            <button class="btn-action btn-minus" onclick="changeStockInCloud(${stock.id}, -1)">-</button>
            <button class="btn-action btn-delete" onclick="deleteStockFromCloud(${stock.id})">Sil</button>
        ` : `
            <button class="btn-buyer" onclick="customerSendOfferSplit(${stock.id}, 'ALICI')">🛒 Satın Al</button>
            <button class="btn-seller" onclick="customerSendOfferSplit(${stock.id}, 'SATICI')">📦 Bana Sat</button>
        `;

        // Admin ise Usta Notunun yanında mor kalem çıkar, normal kullanıcı sadece yazıyı görür
        const adminNoteDisplay = isAdmin ? `
            <span>${parsedOffers.admin}</span>
            <button class="btn-edit-offer" onclick="updateAdminNoteInCloud(${stock.id})">✍️</button>
        ` : `<span>${parsedOffers.admin}</span>`;

        const adminCells = isAdmin ? `
            <td class="admin-only" style="display: table-cell;">${buyPrice.toFixed(2)} TL</td>
            <td class="admin-only" style="display: table-cell;">${sellPrice.toFixed(2)} TL</td>
            <td class="admin-only" style="display: table-cell; color: #3498db;">${totalBuyRow.toFixed(2)} TL</td>
            <td class="admin-only" style="display: table-cell; color: #2ecc71;"><strong>${totalSellRow.toFixed(2)} TL</strong></td>
        ` : "";

        row.innerHTML = `
            <td style="font-family: monospace; color: #3498db;">${barcode}</td>
            <td>${brand}</td>
            <td>${model}</td>
            <td>${capacity} GB</td>
            <td><strong id="stock-count-${stock.id}">${count}</strong></td>
            <td style="color: #2ecc71;">${parsedOffers.buyer}</td>
            <td style="color: #e67e22;">${parsedOffers.seller}</td>
            <td style="color: #9b59b6; font-weight: bold;">${adminNoteDisplay}</td>
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
        <td colspan="9" style="text-align: right; color: #aaa;">Kategori Toplamı:</td>
        <td style="color: #3498db;">Alış: ${totals.buy.toFixed(2)} TL</td>
        <td style="color: #2ecc71;">Satış: ${totals.sell.toFixed(2)} TL</td>
        <td></td>
    `;
    tbody.appendChild(row);
}

// ==========================================
// 5. MÜŞTERİ AYRI TEKLİF VERME FONKSİYONU
// ==========================================
window.customerSendOfferSplit = async function(id, role) {
    // Önce mevcut kaydı buluyoruz ki diğer teklifler silinmesin
    const stockItem = globalStocks.find(s => s.id === id);
    const parsed = parseOfferNotes(stockItem ? stockItem.offer_notes : "");

    let promptMessage = "";
    if (role === 'ALICI') {
        promptMessage = "Bu diski satın almak için teklifinizi ve numaranızı yazın:\n(Örn: 1400 TL - 05xx)";
    } else {
        promptMessage = "Elinizdeki diski dükkana satmak için istediğiniz fiyatı ve numaranızı yazın:\n(Örn: 900 TL - 05xx)";
    }

    const customerOffer = prompt(promptMessage);
    if (customerOffer === null || customerOffer.trim() === "") return;

    // Rol bilgisine göre ilgili kısmı güncelliyoruz, diğerlerine dokunmuyoruz
    if (role === 'ALICI') parsed.buyer = customerOffer.trim();
    else parsed.seller = customerOffer.trim();

    // Veritabanı için string'i tekrar birleştiriyoruz
    const finalOfferString = `ALICI: ${parsed.buyer} || SATICI: ${parsed.seller} || ADMIN: ${parsed.admin}`;

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
            alert("Teklifiniz başarıyla iletildi!");
            fetchStocksFromCloud(false);
        } else {
            const errData = await response.json();
            alert("Hata: " + JSON.stringify(errData));
        }
    } catch (error) {
        alert("Bağlantı Hatası: " + error.message);
    }
}

// ==========================================
// 6. ADMIN NOTU DÜZENLEME FONKSİYONU (MÜŞTERİ DE GÖRECEK)
// ==========================================
window.updateAdminNoteInCloud = async function(id) {
    const stockItem = globalStocks.find(s => s.id === id);
    const parsed = parseOfferNotes(stockItem ? stockItem.offer_notes : "");

    const newNote = prompt("Usta Notunu / Cevabını Yazın (Müşteriler bu notu canlı görebilir):", parsed.admin === "Not Yok" ? "" : parsed.admin);
    if (newNote === null) return; 

    parsed.admin = newNote.trim() === "" ? "Not Yok" : newNote.trim();

    const finalOfferString = `ALICI: ${parsed.buyer} || SATICI: ${parsed.seller} || ADMIN: ${parsed.admin}`;

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
            fetchStocksFromCloud(true);
        } else {
            const errData = await response.json();
            alert("Veritabanı Hatası: " + JSON.stringify(errData));
        }
    } catch (error) {
        alert("Bağlantı Hatası: " + error.message);
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
    const offerNotes = document.getElementById("prod-offer").value || "ALICI: Yok || SATICI: Yok || ADMIN: Not Yok";
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
            const urlParams = new URLSearchParams(window.location.search);
            fetchStocksFromCloud(urlParams.get('mod') === 'ahmet');
        }
    } catch (error) {
        console.error("Ürün eklenirken hata oluştu:", error);
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
            const urlParams = new URLSearchParams(window.location.search);
            fetchStocksFromCloud(urlParams.get('mod') === 'ahmet');
        }
    } catch (error) {
        console.error("Silme hatası:", error);
    }
}