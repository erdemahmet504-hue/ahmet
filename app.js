// ==========================================
// 1. BULUT VERİTABANI BAĞLANTI BİLGİLERİ
// ==========================================
const SUPABASE_URL = "https://zwayidssoujhrjxzgdql.supabase.co/rest/v1"; 
// DİKKAT: Alttaki tırnakların içine Supabase'den aldığın uzun Publishable Key'i yapıştır!
const SUPABASE_KEY = "sb_publishable_wHYCLbDylFN9wnRXuGCmFg_cl1OPZAC"; 

// ==========================================
// 2. ANA TETİKLEYİCİLER VE GİRİŞ KONTROLÜ
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mod');
    const isAdmin = (mode === 'ahmet');

    // Admin paneli form görünümünü ayarla
    const adminSection = document.getElementById("admin-panel");
    if (adminSection) adminSection.style.display = isAdmin ? "block" : "none";

    // Canlı bulut veritabanından stokları çekmeye başla
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

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Supabase Bağlantı Hatası (${response.status}):`, errorText);
            return;
        }

        const stocks = await response.json();
        
        if (Array.isArray(stocks)) {
            // ID sırasına göre diz ki liste kaymasın
            stocks.sort((a, b) => a.id - b.id);
            updateTable(stocks, isAdmin);
        } else {
            console.error("Gelen veri liste formatında değil:", stocks);
        }

    } catch (error) {
        console.error("Bulut veritabanına bağlanırken ağ hatası oluştu:", error);
    }
}

// ==========================================
// 4. HTML TABLOSUNU DOLDURMA (SİL BUTONLU)
// ==========================================
function updateTable(stocks, isAdmin) {
    const tableBody = document.querySelector("table tbody");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    stocks.forEach(stock => {
        const row = document.createElement("tr");
        
        // Admin ise Artı, Eksi ve Kırmızı "Sil" butonunu yan yana basıyoruz
        const actionButtons = isAdmin ? `
            <button class="btn-action btn-plus" onclick="changeStockInCloud(${stock.id}, 1)">+</button>
            <button class="btn-action btn-minus" onclick="changeStockInCloud(${stock.id}, -1)">-</button>
            <button class="btn-action" onclick="deleteStockFromCloud(${stock.id})" style="background-color: #dc3545; color: white; margin-left: 5px; font-weight: bold; padding: 5px 10px; border: none; border-radius: 4px; cursor: pointer;">Sil</button>
        ` : `<span style="color: gray; font-size: 12px;">Yetki Yok</span>`;

        row.innerHTML = `
            <td>${stock.brand_name}</td>
            <td>${stock.model}</td>
            <td>${stock.capacity_gb} GB</td>
            <td><strong id="stock-count-${stock.id}">${stock.stock_count}</strong></td>
            <td>${actionButtons}</td>
        `;
        tableBody.appendChild(row);
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

    // Kullanıcı deneyimi için ekranda anlık değiştir
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
        console.error("Bulut üzerinde stok güncellenirken hata oluştu:", error);
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
                stock_count: stock
            })
        });

        document.getElementById("add-stock-form").reset();
        alert("Yeni ürün bulut veritabanına eklendi!");
        
        // Tabloyu güncel haliyle yenile
        const urlParams = new URLSearchParams(window.location.search);
        const mode = urlParams.get('mod');
        fetchStocksFromCloud(mode === 'ahmet');
    } catch (error) {
        console.error("Buluta yeni ürün eklenirken hata oluştu:", error);
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
            // Tabloyu yeniden yükle
            const urlParams = new URLSearchParams(window.location.search);
            const mode = urlParams.get('mod');
            fetchStocksFromCloud(mode === 'ahmet');
        } else {
            console.error("Silme hatası:", await response.text());
        }
    } catch (error) {
        console.error("Buluttan silme sırasında ağ hatası oluştu:", error);
    }
}