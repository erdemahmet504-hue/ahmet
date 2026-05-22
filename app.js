// ==========================================
// 1. BULUT VERİTABANI BAĞLANTI BİLGİLERİ
// ==========================================
const SUPABASE_URL = "https://zwayidssoujhrjxzgdql.supabase.co/rest/v1"; 
const SUPABASE_KEY = "sb_publishable_wHYCLbDylFN9wnRXuGCmFg_cl1OPZAC"; 

let globalStocks = [];

// ==========================================
// 2. ANA TETİKLEYİCİLER VE GİRİŞ KONTROLÜ
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mod');
    const isAdmin = (mode === 'ahmet');

    const adminSection = document.getElementById("admin-panel");
    if (adminSection) adminSection.style.display = isAdmin ? "block" : "none";

    const grandTotalSection = document.getElementById("grand-total-section");
    if (grandTotalSection) grandTotalSection.style.display = isAdmin ? "flex" : "none";

    if (isAdmin) {
        setupAdminHeaders();
    }

    fetchStocksFromCloud(isAdmin);
});

function setupAdminHeaders() {
    const headers = ["header-healthy", "header-low", "header-defective"];
    headers.forEach(id => {
        const row = document.getElementById(id);
        if (row) {
            const thBuyPrice = document.createElement("th");
            thBuyPrice.innerText = "Alış Fiyatı";
            const thSellPrice = document.createElement("th");
            thSellPrice.innerText = "Satış Fiyatı";
            const thTotalBuy = document.createElement("th");
            thTotalBuy.innerText = "Toplam Alış";
            const thTotalSell = document.createElement("th");
            thTotalSell.innerText = "Toplam Satış";
            
            row.insertBefore(thBuyPrice, row.children[4]);
            row.insertBefore(thSellPrice, row.children[5]);
            row.insertBefore(thTotalBuy, row.children[6]);
            row.insertBefore(thTotalSell, row.children[7]);
        }
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
        console.error("Bulut ağ hatası:", error);
    }
}

// ==========================================
// 4. VERİLERİ ALIM/SATIM MANTIĞINA GÖRE HESAPLAMA VE DAĞITMA
// ==========================================
function updateTablesByStatus(stocks, isAdmin) {
    const healthyBody = document.querySelector("#table-healthy tbody");
    const lowBody = document.querySelector("#table-low tbody");
    const defectiveBody = document.querySelector("#table-defective tbody");

    if (healthyBody) healthyBody.innerHTML = "";
    if (lowBody) lowBody.innerHTML = "";
    if (defectiveBody) defectiveBody.innerHTML = "";

    // Kategori bazlı toplamlar
    let healthyTotals = { buy: 0, sell: 0 };
    let lowTotals = { buy: 0, sell: 0 };
    let defectiveTotals = { buy: 0, sell: 0 };

    stocks.forEach(stock => {
        const row = document.createElement("tr");
        const count = parseInt(stock.stock_count || 0);
        const buyPrice = parseFloat(stock.price || 0); // price = alış
        const sellPrice = parseFloat(stock.sale_price || 0); // sale_price = satış
        
        const totalBuyRow = count * buyPrice;
        const totalSellRow = count * sellPrice;

        const currentStatus = (stock.status || "Sağlıklı").trim();
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
        ` : `<span style="color: gray; font-size: 12px;">Yetki Yok</span>`;

        // Sadece admin ise Alış-Satış detaylarını göster
        const adminCells = isAdmin ? `
            <td>${buyPrice.toFixed(2)} TL</td>
            <td>${sellPrice.toFixed(2)} TL</td>
            <td style="color: #3498db;">${totalBuyRow.toFixed(2)} TL</td>
            <td style="color: #2ecc71;"><strong>${totalSellRow.toFixed(2)} TL</strong></td>
        ` : "";

        row.innerHTML = `
            <td>${stock.brand_name}</td>
            <td>${stock.model}</td>
            <td>${stock.capacity_gb} GB</td>
            <td><strong id="stock-count-${stock.id}">${count}</strong></td>
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

        // Genel Muhasebe Kartlarını Güncelle
        const grandBuy = healthyTotals.buy + lowTotals.buy + defectiveTotals.buy;
        const grandSell = healthyTotals.sell + lowTotals.sell + defectiveTotals.sell;
        
        document.getElementById("grand-buy-value").innerText = grandBuy.toFixed(2);
        document.getElementById("grand-sell-value").innerText = grandSell.toFixed(2);
    }
}

function addCategoryTotalRow(tbody, totals) {
    if (!tbody) return;
    const row = document.createElement("tr");
    row.className = "total-row";
    row.innerHTML = `
        <td colspan="4" style="text-align: right; color: #aaa;">Kategori Toplamı:</td>
        <td colspan="2" style="color: #3498db;">Alış: ${totals.buy.toFixed(2)} TL</td>
        <td colspan="2" style="color: #2ecc71;">Satış: ${totals.sell.toFixed(2)} TL</td>
    `;
    tbody.appendChild(row);
}

// ==========================================
// 5. BULUTTA STOK ADEDİ GÜNCELLEME (PATCH)
// ==========================================
window.changeStockInCloud = async function(id, amount) {
    const stockElement = document.getElementById(`stock-count-${id}`);
    if (!stockElement) return;

    let currentStock = parseInt(stockElement.innerText);
    let newStock = currentStock + amount;
    if (newStock < 0) newStock = 0;

    stockElement.innerText = newStock;

    const match = globalStocks.find(s => s.id === id);
    if (match) {
        match.stock_count = newStock;
        const urlParams = new URLSearchParams(window.location.search);
        updateTablesByStatus(globalStocks, urlParams.get('mod') === 'ahmet');
    }

    try {
        await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, {
            method: "PATCH",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "return=minimal"
            },
            body: JSON.stringify({ stock_count: newStock })
        });
    } catch (error) {
        console.error("Güncelleme hatası:", error);
    }
}

// ==========================================
// 6. BULUTA YENİ HARD DİSK EKLEME (POST)
// ==========================================
window.addNewStock = async function(event) {
    event.preventDefault();

    const brand = document.getElementById("prod-brand").value;
    const model = document.getElementById("prod-model").value;
    const capacity = parseInt(document.getElementById("prod-capacity").value);
    const stock = parseInt(document.getElementById("prod-stock").value);
    const buyPrice = parseFloat(document.getElementById("prod-price").value || 0);
    const sellPrice = parseFloat(document.getElementById("prod-sale-price").value || 0);
    const status = document.getElementById("prod-status").value;

    try {
        await fetch(`${SUPABASE_URL}/stocks`, {
            method: "POST",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "return=minimal"
            },
            body: JSON.stringify({
                brand_name: brand,
                model: model,
                capacity_gb: capacity,
                stock_count: stock,
                price: buyPrice,
                sale_price: sellPrice,
                status: status
            })
        });

        document.getElementById("add-stock-form").reset();
        alert("Ürün alım/satım fiyatlarıyla başarıyla eklendi!");
        
        const urlParams = new URLSearchParams(window.location.search);
        fetchStocksFromCloud(urlParams.get('mod') === 'ahmet');
    } catch (error) {
        console.error("Ekleme hatası:", error);
    }
}

// ==========================================
// 7. BULUTTAN ÜRÜNÜ TAMAMEN SİLME (DELETE)
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