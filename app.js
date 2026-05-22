// ==========================================
// ERDEM BİLİŞİM - TAM TEŞEKKÜLLÜ SİSTEM
// ==========================================
const SUPABASE_URL = "https://zwayidssoujhrjxzgdql.supabase.co/rest/v1"; 
const SUPABASE_KEY = "sb_publishable_wHYCLbDylFN9wnRXuGCmFg_cl1OPZAC"; 
const headers = { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" };

let globalStocks = [];
let currentActiveReportTab = "Satış 1";

const MY_VISITOR_ID = localStorage.getItem("erdem_bilisim_visitor_id") || (() => {
    let vid = "MUSTERI_" + Math.random().toString(36).substring(2, 11).toUpperCase();
    localStorage.setItem("erdem_bilisim_visitor_id", vid);
    return vid;
})();

document.addEventListener("DOMContentLoaded", () => {
    const isAdmin = new URLSearchParams(window.location.search).get('mod') === 'ahmet';
    if (isAdmin) localStorage.removeItem("erdem_bilisim_locked_role");
    
    document.getElementById("admin-panel").style.display = isAdmin ? "block" : "none";
    document.getElementById("barcode-sale-panel").style.display = isAdmin ? "block" : "none";
    document.getElementById("reports-panel").style.display = isAdmin ? "block" : "none";
    
    fetchStocksFromCloud(isAdmin);
});

// 🌟 FİLTRELİ VERİ ÇEKME (Stok 0 olanları filtreler)
async function fetchStocksFromCloud(isAdmin) {
    const res = await fetch(`${SUPABASE_URL}/stocks?select=*`, { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } });
    const data = await res.json();
    // OTOMATİK SİLME MANTIĞI: Veri çekilirken stoku 0 olanlar elenir
    globalStocks = data.filter(s => parseInt(s.stock_count || 0) > 0);
    globalStocks.sort((a, b) => a.id - b.id);
    updateTablesByStatus(globalStocks, isAdmin);
}

function parseOfferNotesSecure(rawNotes, isAdmin) {
    let buyer = "Yok", seller = "Yok", originalCreator = "Sistem";
    if (rawNotes && rawNotes !== "Teklif Yok") {
        rawNotes.split("||").forEach(part => {
            if (part.trim().startsWith("ALICI:")) buyer = part.replace("ALICI:", "").trim();
            else if (part.trim().startsWith("SATICI:")) seller = part.replace("SATICI:", "").trim();
            else if (part.trim().startsWith("OWNER:")) originalCreator = part.replace("OWNER:", "").trim();
        });
    }
    if (!isAdmin && originalCreator !== "Sistem" && originalCreator !== MY_VISITOR_ID) { buyer = "Yok"; seller = "Yok"; }
    return { buyer, seller, originalCreator };
}

function updateTablesByStatus(stocks, isAdmin) {
    const healthyBody = document.querySelector("#table-healthy tbody");
    if (!healthyBody) return;
    healthyBody.innerHTML = "";
    stocks.forEach(s => {
        const parsed = parseOfferNotesSecure(s.offer_notes, isAdmin);
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${s.barcode || '---'}</td>
            <td>${s.brand_name}</td>
            <td>${s.capacity_gb} GB</td>
            <td>${s.stock_count}</td>
            <td>${parsed.buyer}</td>
            <td>${s.sale_price} TL</td>
            <td>
                <button onclick="changeStockInCloud(${s.id}, 1)">+</button>
                <button onclick="changeStockInCloud(${s.id}, -1)">-</button>
                <button onclick="deleteStockFromCloud(${s.id})" style="background:red; color:white;">SİL</button>
            </td>
        `;
        healthyBody.appendChild(row);
    });
}

// 📦 Stok Güncelleme
window.changeStockInCloud = async function(id, amount) {
    const item = globalStocks.find(s => s.id === id);
    let newCount = parseInt(item.stock_count) + amount;
    await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, { method: "PATCH", headers, body: JSON.stringify({ stock_count: newCount }) });
    fetchStocksFromCloud(new URLSearchParams(window.location.search).get('mod') === 'ahmet');
};

// ❌ Silme İşlemi
window.deleteStockFromCloud = async function(id) {
    if(!confirm("Emin misin abim?")) return;
    await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, { method: "DELETE", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } });
    fetchStocksFromCloud(true);
};

// 🛒 Barkod Satış
window.barcodeSaleStockDrop = async function(e) {
    e.preventDefault();
    const barcode = document.getElementById("scan-barcode-input").value;
    const item = globalStocks.find(s => s.barcode === barcode);
    if (item) {
        await changeStockInCloud(item.id, -1);
        saveSaleToSessionLogs(barcode, item.brand_name, item.sale_price);
    }
};

function saveSaleToSessionLogs(barcode, brand, price) {
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    allSales.push({ barcode, brand, price, time: new Date().toLocaleTimeString() });
    localStorage.setItem("erdem_bilisim_sales_logs", JSON.stringify(allSales));
    renderSalesReport();
}

function renderSalesReport() {
    const tbody = document.getElementById("reports-tbody");
    if (!tbody) return;
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    tbody.innerHTML = allSales.map(s => `<tr><td>${s.barcode}</td><td>${s.brand}</td><td>${s.price} TL</td></tr>`).join('');
}