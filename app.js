// ==========================================
// 1. BULUT VERİTABANI BAĞLANTI BİLGİLERİ
// ==========================================
const SUPABASE_URL = "https://zwayidssoujhrjxzgdql.supabase.co/rest/v1"; 
const SUPABASE_KEY = "BURAYA_KENDİ_UZUN_SUPABASE_KEYİNİ_YAPIŞTIR"; 

let globalStocks = [];
let currentActiveReportTab = "Satış 1";
let hasSelectedRole = false; 

function getOrCreateVisitorId() {
    let vid = localStorage.getItem("erdem_bilisim_visitor_id");
    if (!vid) {
        vid = "MUSTERI_" + Math.random().toString(36).substring(2, 11).toUpperCase();
        localStorage.setItem("erdem_bilisim_visitor_id", vid);
    }
    return vid;
}
const MY_VISITOR_ID = getOrCreateVisitorId();

// Sayfa yüklendiğinde çalışacak ana yapı
document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const isAdmin = (urlParams.get('mod') === 'ahmet');

    // Panelleri gizle/göster
    if (isAdmin) {
        localStorage.removeItem("erdem_bilisim_locked_role");
        const adminBadge = document.getElementById("admin-status-badge");
        if (adminBadge) adminBadge.style.display = "block";
    }

    document.getElementById("admin-panel").style.display = isAdmin ? "block" : "none";
    document.getElementById("barcode-sale-panel").style.display = isAdmin ? "block" : "none";
    document.getElementById("reports-panel").style.display = isAdmin ? "block" : "none";
    
    updateTableHeadersDirect(isAdmin);
    fetchStocksFromCloud(isAdmin);
});

// 🌟 FİLTRELİ VERİ ÇEKME (Stok 0 olanları direkt eler)
async function fetchStocksFromCloud(isAdmin) {
    try {
        const response = await fetch(`${SUPABASE_URL}/stocks?select=*`, {
            method: "GET",
            headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
        });
        if (!response.ok) return;
        
        let data = await response.json();
        
        // 🚀 İSTEDİĞİN ÖZELLİK: Stok 0 olanları filtrele, sadece > 0 olanları al
        globalStocks = data.filter(s => parseInt(s.stock_count || 0) > 0);
        
        globalStocks.sort((a, b) => a.id - b.id);
        updateTablesByStatus(globalStocks, isAdmin);
    } catch (error) { console.error(error); }
}

// 📦 Stok Güncelleme
window.changeStockInCloud = async function(id, amount) {
    const item = globalStocks.find(s => s.id === id);
    if (!item) return;
    let newCount = parseInt(item.stock_count) + amount;
    
    await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, {
        method: "PATCH",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ stock_count: newCount })
    });
    fetchStocksFromCloud(new URLSearchParams(window.location.search).get('mod') === 'ahmet');
};

// ❌ Silme İşlemi
window.deleteStockFromCloud = async function(id) {
    if(!confirm("Emin misin abim?")) return;
    await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, {
        method: "DELETE",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
    });
    fetchStocksFromCloud(true);
};

// ... (Burada senin diğer fonksiyonların: parseOfferNotesSecure, updateTablesByStatus, 
// barcodeSaleStockDrop, saveSaleToSessionLogs, renderSalesReport vb. aynen kalmalı)

// NOT: Tüm kodun 400+ satır olduğu için buraya hepsini sığdıramam, 
// ancak yukarıdaki `fetchStocksFromCloud` fonksiyonunu kopyalayıp 
// eski `fetchStocksFromCloud` ile değiştirmen bile sorunu çözecektir.