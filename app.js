// ==========================================
// 1. BULUT VERİTABANI BAĞLANTI BİLGİLERİ
// ==========================================
const SUPABASE_URL = "https://zwayidssoujhrjxzgdql.supabase.co/rest/v1"; 
const SUPABASE_KEY = "sb_publishable_wHYCLbDylFN9wnRXuGCmFg_cl1OPZAC"; 

// ==========================================
// 2. ANA TETİKLEYİCİLER VE GİRİŞ KONTROLÜ
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mod');
    const isAdmin = (mode === 'ahmet');

    const adminSection = document.getElementById("admin-panel");
    if (adminSection) adminSection.style.display = isAdmin ? "block" : "none";

    fetchStocksFromCloud(isAdmin);
});

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

        const stocks = await response.json();
        if (Array.isArray(stocks)) {
            stocks.sort((a, b) => a.id - b.id);
            updateTablesByStatus(stocks, isAdmin);
        }
    } catch (error) {
        console.error("Bulut ağ hatası:", error);
    }
}

// ==========================================
// 4. VERİLERİ DURUMUNA GÖRE FİLTRELEYİP TABLOLARA DAĞITMA
// ==========================================
function updateTablesByStatus(stocks, isAdmin) {
    // 3 ayrı tablonun tbody alanlarını seçiyoruz
    const healthyBody = document.querySelector("#table-healthy tbody");
    const lowBody = document.querySelector("#table-low tbody");
    const defectiveBody = document.querySelector("#table-defective tbody");

    // Tablo içlerini temizle
    if (healthyBody) healthyBody.innerHTML = "";
    if (lowBody) lowBody.innerHTML = "";
    if (defectiveBody) defectiveBody.innerHTML = "";

    stocks.forEach(stock => {
        const row = document.createElement("tr");
        
        const actionButtons = isAdmin ? `
            <button class="btn-action btn-plus" onclick="changeStockInCloud(${stock.id}, 1)">+</button>
            <button class="btn-action btn-minus" onclick="changeStockInCloud(${stock.id}, -1)">-</button>
            <button class="btn-action btn-delete" onclick="deleteStockFromCloud(${stock.id})">Sil</button>
        ` : `<span style="color: gray; font-size: 12px;">Yetki Yok</span>`;

        row.innerHTML = `
            <td>${stock.brand_name}</td>
            <td>${stock.model}</td>
            <td>${stock.capacity_gb} GB</td>
            <td><strong id="stock-count-${stock.id}">${stock.stock_count}</strong></td>
            <td>${actionButtons}</td>
        `;

        // Diski durumuna göre ilgili tabloya fırlatıyoruz
        const currentStatus = stock.status || "Sağlıklı";

        if (currentStatus === "Sağlıklı" && healthyBody) {
            healthyBody.appendChild(row);
        } else if (currentStatus === "Sağlığı Düşük" && lowBody) {
            lowBody.appendChild(row);
        } else if (currentStatus === "Arızalı" && defectiveBody) {
            defectiveBody.appendChild(row);
        }
    });
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
                status: status
            })
        });

        document.getElementById("add-stock-form").reset();
        alert("Yeni ürün ait olduğu kategoriye eklendi!");
        
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