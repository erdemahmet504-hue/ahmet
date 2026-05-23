// ==========================================
// 1. BULUT VERİTABANI BAĞLANTI BİLGİLERİ
// ==========================================
const SUPABASE_URL = "https://zwayidssoujhrjxzgdql.supabase.co/rest/v1"; 
const SUPABASE_KEY = "sb_publishable_wHYCLbDylFN9wnRXuGCmFg_cl1OPZAC"; // BURAYI DEĞİŞTİRMEYİ UNUTMA!

let globalStocks = [];
let shoppingCart = []; 
let currentActiveReportTab = "Satış 1";
let hasSelectedRole = false; 
let salesChartInstance = null; // Grafik objesi için

// ==========================================
// 2. TEMA (DARK/LIGHT) VE TOAST BİLDİRİM SİSTEMİ
// ==========================================
function initTheme() {
    const savedTheme = localStorage.getItem('erdem_bilisim_theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        document.getElementById('theme-toggle-btn').innerText = '☀️';
    }
}

window.toggleTheme = function() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('erdem_bilisim_theme', isDark ? 'dark' : 'light');
    document.getElementById('theme-toggle-btn').innerText = isDark ? '☀️' : '🌙';
    if(salesChartInstance) renderReportTabs(); // Grafiğin renklerini güncelle
}

window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

window.toggleModal = function(modalId) {
    const modal = document.getElementById(modalId);
    modal.style.display = modal.style.display === "flex" ? "none" : "flex";
}

// ==========================================
// 3. SAYFA YÜKLENDİĞİNDE
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    const urlParams = new URLSearchParams(window.location.search);
    const isAdmin = (urlParams.get('mod') === 'ahmet');

    const adminPanel = document.getElementById("admin-panel");
    const barcodeSaleSection = document.getElementById("barcode-sale-panel");
    const grandTotalSection = document.getElementById("grand-total-section");
    const reportsSection = document.getElementById("reports-panel");
    const roleSelector = document.getElementById("customer-role-selector");
    const storefrontPanel = document.getElementById("storefront-panel");
    const sellerFormPanel = document.getElementById("customer-seller-panel");
    const cartBtn = document.getElementById("header-cart-btn");
    const adminBadge = document.getElementById("admin-status-badge");

    if (isAdmin) {
        localStorage.removeItem("erdem_bilisim_locked_role");
        adminPanel.style.display = "block";
        barcodeSaleSection.style.display = "block";
        grandTotalSection.style.display = "flex";
        reportsSection.style.display = "block";
        roleSelector.style.display = "none";
        storefrontPanel.style.display = "none"; 
        cartBtn.style.display = "none";
        adminBadge.style.display = "block";
        
        ["container-healthy", "container-low", "container-defective"].forEach(id => document.getElementById(id).style.display = "block");

        updateTableHeadersDirect(true);
        renderReportTabs();
    } else {
        updateTableHeadersDirect(false);
        const savedRole = localStorage.getItem("erdem_bilisim_locked_role");
        if (savedRole) {
            hasSelectedRole = true;
            document.querySelector(`input[name="user-role-radio"][value="${savedRole}"]`).checked = true;
            document.querySelectorAll('input[name="user-role-radio"]').forEach(r => r.disabled = true);
            roleSelector.style.opacity = "0.6";

            if (savedRole === "satici") {
                sellerFormPanel.style.display = "block";
                storefrontPanel.style.display = "none";
                cartBtn.style.display = "none";
                ["container-healthy", "container-low", "container-defective"].forEach(id => document.getElementById(id).style.display = "block");
            } else {
                storefrontPanel.style.display = "block";
            }
        }
    }
    fetchStocksFromCloud(isAdmin);
});

// Rol seçimi...
window.handleRoleChange = function() {
    if (hasSelectedRole) return;
    hasSelectedRole = true;
    const role = document.querySelector('input[name="user-role-radio"]:checked').value;
    localStorage.setItem("erdem_bilisim_locked_role", role);
    location.reload(); // Rol değişince temiz bir sayfa yenilemesi en iyisidir
}

// ==========================================
// 4. VERİ GETİRME
// ==========================================
async function fetchStocksFromCloud(isAdmin) {
    try {
        const response = await fetch(`${SUPABASE_URL}/stocks?select=*`, {
            method: "GET", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
        });
        if (!response.ok) { showToast("Veriler çekilemedi!", "error"); return; }

        globalStocks = await response.json();
        globalStocks.sort((a, b) => a.id - b.id);
        
        if (isAdmin) { updateTablesByStatus(globalStocks, true); } 
        else {
            const role = localStorage.getItem("erdem_bilisim_locked_role") || "alici";
            if(role === 'alici') filterStorefront(); // Render yerine filtre fonksiyonunu çağırıyoruz
            else updateTablesByStatus(globalStocks, false);
        }
    } catch (error) { console.error(error); }
}

// ==========================================
// 5. MÜŞTERİ VİTRİNİ VE ARAMA FİLTRESİ
// ==========================================
window.filterStorefront = function() {
    const searchText = document.getElementById('search-input').value.toLowerCase();
    const filterType = document.getElementById('filter-type').value;

    const filteredStocks = globalStocks.filter(stock => {
        const isHealthy = (stock.status === "%100" || stock.status === "Sağlıklı") && parseInt(stock.stock_count) > 0;
        const matchesSearch = stock.brand_name.toLowerCase().includes(searchText) || stock.model.toLowerCase().includes(searchText);
        const matchesType = filterType === "all" || stock.model.includes(filterType);
        return isHealthy && matchesSearch && matchesType;
    });

    renderStorefront(filteredStocks);
}

function renderStorefront(stocks) {
    const grid = document.getElementById("products-grid-container");
    grid.innerHTML = "";

    if(stocks.length === 0) {
        grid.innerHTML = "<p style='color: var(--text-muted);'>Aradığınız kriterlere uygun ürün bulunamadı.</p>";
        return;
    }

    stocks.forEach(stock => {
        let capFormat = parseInt(stock.capacity_gb) >= 1000 ? (parseInt(stock.capacity_gb) / 1000) + " TB" : stock.capacity_gb + " GB";
        let imageUrl = stock.image_url || (stock.model.includes("M.2") ? "https://images.unsplash.com/photo-1628557044797-f21a177c37ec?auto=format&fit=crop&w=400&q=80" : "https://images.unsplash.com/photo-1597849016254-4fb9f82d2eb5?auto=format&fit=crop&w=400&q=80");

        grid.innerHTML += `
            <div class="product-card">
                <img src="${imageUrl}" class="product-img" alt="${stock.brand_name}">
                <div class="prod-brand">${stock.brand_name}</div>
                <div class="prod-specs">${capFormat} • ${stock.model}" Form • %100 Sağlık</div>
                <div style="font-size: 12px; color: var(--orange);">Stok: ${stock.stock_count} Adet</div>
                <div class="prod-price">${parseFloat(stock.sale_price || 0).toFixed(2)} TL</div>
                <button class="btn-add-cart" onclick="addToCart(${stock.id}, '${stock.brand_name}', '${capFormat}', ${stock.sale_price})">🛒 Sepete Ekle</button>
            </div>
        `;
    });
}

window.addToCart = function(id, brand, capacity, price) {
    const existing = shoppingCart.find(item => item.id === id);
    if(existing) existing.qty += 1;
    else shoppingCart.push({ id, brand, capacity, price, qty: 1 });
    updateCartUI(); 
    showToast(`${brand} ${capacity} sepete eklendi!`, "success");
}

function updateCartUI() {
    const list = document.getElementById("cart-items-list");
    document.getElementById("header-cart-count").innerText = shoppingCart.reduce((sum, item) => sum + item.qty, 0);
    
    list.innerHTML = ""; let grandTotal = 0;
    if(shoppingCart.length === 0) list.innerHTML = "<p>Sepetiniz şu an boş.</p>";
    else {
        shoppingCart.forEach((item, index) => {
            const rowTotal = item.qty * item.price; grandTotal += rowTotal;
            list.innerHTML += `
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding:10px 0;">
                    <div><strong>${item.brand} ${item.capacity}</strong><br><span style="font-size:12px; color:var(--text-muted);">${item.qty} Adet x ${item.price.toFixed(2)} TL</span></div>
                    <div style="text-align:right;"><strong style="color:var(--blue);">${rowTotal.toFixed(2)} TL</strong><br><button onclick="removeFromCart(${index})" style="background:none; border:none; color:var(--red); font-size:12px; cursor:pointer;">Kaldır</button></div>
                </div>`;
        });
    }
    document.getElementById("cart-total-price").innerText = `Toplam: ${grandTotal.toFixed(2)} TL`;
}
window.removeFromCart = function(index) { shoppingCart.splice(index, 1); updateCartUI(); }
window.checkout = function() {
    if(shoppingCart.length === 0) { showToast("Sepetiniz boş!", "error"); return; }
    showToast("Ödeme sistemi henüz entegre edilmedi.", "info");
}

// ==========================================
// 6. TABLO VE YÖNETİM (Eski Mantıkla Aynı)
// ==========================================
// (updateTableHeadersDirect, updateTablesByStatus, parseOfferNotes, addCategoryTotalRow eski kodunla birebir aynıdır, burayı şişirmemek için atladım. Eski kodundaki 6. ve 7. Bölüm fonksiyonlarını buraya yapıştır.)
// ... (Eski koddaki 6. ve 7. bölümü aynen koru) ...

window.submitNewOfferFromSeller = async function(event) {
    event.preventDefault();
    const offerNotes = `ALICI: Yok || SATICI: ${document.getElementById("offer-count").value} Adet - İstenen Fiyat/Tel: ${document.getElementById("offer-price").value}`;
    try {
        await fetch(`${SUPABASE_URL}/stocks`, {
            method: "POST", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ barcode: "Müşteri Arzı", brand_name: document.getElementById("offer-brand").value, capacity_gb: parseInt(document.getElementById("offer-capacity").value), model: document.getElementById("offer-inch").value, stock_count: 0, price: 0, sale_price: 0, offer_notes: offerNotes, status: document.getElementById("offer-status").value })
        });
        document.getElementById("customer-offer-form").reset(); 
        showToast("Teklif yöneticiye iletildi!", "success"); 
        fetchStocksFromCloud(false);
    } catch (e) { showToast("Hata oluştu", "error"); }
}

// ==========================================
// 8. BARKOD VE GELİŞMİŞ RAPORLAMA (GRAFİK & CSV)
// ==========================================
// Barkod okutma fonksiyonun aynı...
window.barcodeSaleStockDrop = async function(event) {
    event.preventDefault();
    const barcodeInput = document.getElementById("scan-barcode-input");
    const scannedBarcode = barcodeInput.value.trim();
    const targetSession = document.getElementById("active-sale-session").value.trim() || "Varsayılan Satış";
    if (!scannedBarcode) return;

    const matchedStock = globalStocks.find(s => s.barcode && s.barcode.trim() === scannedBarcode);
    if (!matchedStock || parseInt(matchedStock.stock_count || 0) <= 0) { showToast("Stokta yok veya barkod hatalı", "error"); barcodeInput.value = ""; return; }

    let newStockCount = parseInt(matchedStock.stock_count) - 1;
    const response = await fetch(`${SUPABASE_URL}/stocks?id=eq.${matchedStock.id}`, { method: "PATCH", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ stock_count: newStockCount }) });

    if (response.ok) {
        saveSaleToSessionLogs(scannedBarcode, matchedStock.brand_name, targetSession, parseFloat(matchedStock.sale_price || 0));
        barcodeInput.value = ""; fetchStocksFromCloud(true); renderReportTabs(); 
        showToast("Satış onaylandı!", "success");
    }
}

function saveSaleToSessionLogs(barcode, brand, sessionName, salePrice) {
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    allSales.push({ barcode, title: brand, session: sessionName, count: 1, price: salePrice, date: new Date().toLocaleDateString() });
    localStorage.setItem("erdem_bilisim_sales_logs", JSON.stringify(allSales));
}

function renderReportTabs() {
    const tabsContainer = document.getElementById("dynamic-report-tabs");
    if (!tabsContainer) return;
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    
    // Grafiği Çizdir
    drawChart(allSales);

    let sessions = [...new Set(allSales.map(s => s.session))];
    if (sessions.length === 0) sessions = ["Satış 1"];
    if (!sessions.includes(currentActiveReportTab)) currentActiveReportTab = sessions[0];

    tabsContainer.innerHTML = "";
    sessions.forEach(sessionName => {
        const btn = document.createElement("button");
        btn.style = sessionName === currentActiveReportTab ? "background:var(--blue); color:white;" : "background:var(--border-color); color:var(--text-main);";
        btn.style.padding = "8px 15px"; btn.style.borderRadius = "6px"; btn.style.border = "none"; btn.style.cursor = "pointer";
        btn.innerText = sessionName;
        btn.onclick = () => { currentActiveReportTab = sessionName; renderReportTabs(); };
        tabsContainer.appendChild(btn);
    });
    renderSalesReport(allSales);
}

function renderSalesReport(allSales) {
    const tbody = document.getElementById("reports-tbody");
    let filtered = allSales.filter(s => s.session === currentActiveReportTab);
    tbody.innerHTML = ""; let totalRev = 0;
    
    // Satışları grupla
    let grouped = {};
    filtered.forEach(s => {
        if(!grouped[s.barcode]) grouped[s.barcode] = {...s};
        else grouped[s.barcode].count += 1;
    });

    Object.values(grouped).forEach(sale => {
        let rowTotal = sale.count * sale.price; totalRev += rowTotal;
        tbody.innerHTML += `<tr><td>${sale.barcode}</td> <td>${sale.title}</td> <td>${sale.session}</td> <td>${sale.count}</td> <td>${sale.price} TL</td> <td style="color:var(--green);">${rowTotal} TL</td></tr>`;
    });
    tbody.innerHTML += `<tr class="total-row"><td colspan="5" style="text-align:right;">Toplam:</td><td style="color:var(--green);">${totalRev} TL</td></tr>`;
}

// GRAFİK ÇİZDİRME (Chart.js)
function drawChart(salesData) {
    const ctx = document.getElementById('salesChart');
    if(!ctx) return;
    
    let sessionTotals = {};
    salesData.forEach(sale => {
        if(!sessionTotals[sale.session]) sessionTotals[sale.session] = 0;
        sessionTotals[sale.session] += (sale.count * sale.price);
    });

    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#e4e6eb' : '#1c1e21';

    if(salesChartInstance) salesChartInstance.destroy(); // Eski grafiği sil

    salesChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(sessionTotals),
            datasets: [{ label: 'Oturum Cirosu (TL)', data: Object.values(sessionTotals), backgroundColor: '#1877f2', borderRadius: 6 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: textColor } } }, scales: { x: { ticks: { color: textColor } }, y: { ticks: { color: textColor } } } }
    });
}

// CSV'YE DIŞA AKTARMA
window.exportReportsToCSV = function() {
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    if(allSales.length === 0) { showToast("Dışa aktarılacak veri yok.", "error"); return; }
    
    let csvContent = "data:text/csv;charset=utf-8,Barkod,Urun,Oturum,Adet,BirimFiyat,Tarih\n";
    allSales.forEach(row => {
        csvContent += `${row.barcode},${row.title},${row.session},${row.count},${row.price},${row.date}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "satis_raporu.csv");
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    showToast("Excel dosyası indirildi!", "success");
}