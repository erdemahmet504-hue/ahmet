// ==========================================
// 1. BULUT VERİTABANI BAĞLANTI BİLGİLERİ
// ==========================================
const SUPABASE_URL = "https://zwayidssoujhrjxzgdql.supabase.co/rest/v1"; 
const SUPABASE_KEY = "sb_publishable_wHYCLbDylFN9wnRXuGCmFg_cl1OPZAC"; 

let globalStocks = []; // Fiyat anlık güncellenirken kullanacağız

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
    if (grandTotalSection) grandTotalSection.style.display = isAdmin ? "block" : "none";

    // Eğer admin ise tablolara Fiyat ve Toplam Fiyat sütun başlıklarını dinamik ekle
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
            // "Mevcut Stok" kolonunun (index 3) arkasına yeni kolonları ekle
            const thPrice = document.createElement("th");
            thPrice.innerText = "Birim Fiyatı";
            const thTotal = document.createElement("th");
            thTotal.innerText = "Toplam Tutar";
            
            row.insertBefore(thPrice, row.children[4]);
            row.insertBefore(thTotal, row.children[5]);
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
// 4. VERİLERİ DAĞITMA VE HESAPLAMA MOTORU
// ==========================================
function updateTablesByStatus(stocks, isAdmin) {
    const healthyBody = document.querySelector("#table-healthy tbody");
    const lowBody = document.querySelector("#table-low tbody");
    const defectiveBody = document.querySelector("#table-defective tbody");

    if (healthyBody) healthyBody.innerHTML = "";
    if (lowBody) lowBody.innerHTML = "";
    if (defectiveBody) defectiveBody.innerHTML = "";

    // Kategori bazlı fiyat toplamları ve genel toplam değişkenleri
    let sumHealthy = 0;
    let sumLow = 0;
    let sumDefective = 0;

    stocks.forEach(stock => {
        const row = document.createElement("tr");
        const count = parseInt(stock.stock_count || 0);
        const price = parseFloat(stock.price || 0);
        const rowTotal = count * price;

        // Fiyat toplamlarını ait olduğu kategoriye ekle
        const currentStatus = (stock.status || "Sağlıklı").trim();
        if (currentStatus === "Sağlıklı") sumHealthy += rowTotal;
        else if (currentStatus === "Sağlığı Düşük") sumLow += rowTotal;
        else if (currentStatus === "Arızalı") sumDefective += rowTotal;

        const actionButtons = isAdmin ? `
            <button class="btn-action btn-plus" onclick="changeStockInCloud(${stock.id}, 1)">+</button>
            <button class="btn-action btn-minus" onclick="changeStockInCloud(${stock.id}, -1)">-</button>
            <button class="btn-action btn-delete" onclick="deleteStockFromCloud(${stock.id})">Sil</button>
        ` : `<span style="color: gray; font-size: 12px;">Yetki Yok</span>`;

        // Sadece admin ise fiyat sütun hücrelerini ekle
        const priceCells = isAdmin ? `
            <td>${price.toFixed(2)} TL</td>
            <td><strong>${rowTotal.toFixed(2)} TL</strong></td>
        ` : "";

        row.innerHTML = `
            <td>${stock.brand_name}</td>
            <td>${stock.model}</td>
            <td>${stock.capacity_gb} GB</td>
            <td><strong id="stock-count-${stock.id}">${count}</strong></td>
            ${priceCells}
            <td>${actionButtons}</td>
        `;

        if (currentStatus === "Sağlıklı" && healthyBody) healthyBody.appendChild(row);
        else if (currentStatus === "Sağlığı Düşük" && lowBody) lowBody.appendChild(row);
        else if (currentStatus === "Arızalı" && defectiveBody) defectiveBody.appendChild(row);
    });

    // Admin panelindeysek her tablonun en altına Kategori Toplam satırı ekle
    if (isAdmin) {
        addCategoryTotalRow(healthyBody, sumHealthy);
        addCategoryTotalRow(lowBody, sumLow);
        addCategoryTotalRow(defectiveBody, sumDefective);

        // En alttaki dev genel toplam alanını güncelle
        const grandTotal = sumHealthy + sumLow + sumDefective;
        document.getElementById("grand-total-value").innerText = grandTotal.toFixed(2);
    }
}

function addCategoryTotalRow(tbody, totalAmount) {
    if (!tbody) return;
    const row = document.createElement("tr");
    row.className = "total-row";
    row.innerHTML = `
        <td colspan="4" style="text-align: right; color: #aaa;">Bu Kategorinin Toplam Değeri:</td>
        <td colspan="2" style="color: #58d68d; font-size: 16px;">${totalAmount.toFixed(2)} TL</td>
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

    // Yerel array'deki veriyi de anlık güncelleyelim ki toplamlar canlı değişsin
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
    const price = parseFloat(document.getElementById("prod-price").value || 0);
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
                price: price,
                status: status
            })
        });

        document.getElementById("add-stock-form").reset();
        alert("Yeni ürün fiyatıyla birlikte eklendi!");
        
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