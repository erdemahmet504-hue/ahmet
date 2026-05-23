// ==========================================
// 1. BULUT VERİTABANI BAĞLANTI BİLGİLERİ
// ==========================================
const SUPABASE_URL = "https://zwayidssoujhrjxzgdql.supabase.co/rest/v1"; 
const SUPABASE_KEY = "sb_publishable_wHYCLbDylFN9wnRXuGCmFg_cl1OPZAC"; // Veritabanı anahtarını buraya eklemeyi unutma!

let globalStocks = [];
let shoppingCart = []; 
let currentActiveReportTab = "Satış 1";
let hasSelectedRole = false; 
let salesChartInstance = null; // Grafik objesi hafızası
let globalSalesLogs = [];      // Bulut satış geçmişi hafızası

// ==========================================
// 2. TEMA (DARK/LIGHT) VE TOAST BİLDİRİM SİSTEMİ
// ==========================================
function initTheme() {
    const savedTheme = localStorage.getItem('erdem_bilisim_theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        const btn = document.getElementById('theme-toggle-btn');
        if(btn) btn.innerText = '☀️';
    }
}

window.toggleTheme = function() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('erdem_bilisim_theme', isDark ? 'dark' : 'light');
    const btn = document.getElementById('theme-toggle-btn');
    if(btn) btn.innerText = isDark ? '☀️' : '🌙';
    if(salesChartInstance) renderReportTabs(); // Grafiğin renklerini güncelle
}

window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

window.toggleModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if(modal) modal.style.display = modal.style.display === "flex" ? "none" : "flex";
}

// ==========================================
// 3. SAYFA YÜKLENDİĞİNDE YETKİ KONTROLÜ
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

    const containerHealthy = document.getElementById("container-healthy");
    const containerLow = document.getElementById("container-low");
    const containerDefective = document.getElementById("container-defective");

    if (isAdmin) {
        localStorage.removeItem("erdem_bilisim_locked_role");
        if(adminPanel) adminPanel.style.display = "block";
        if(barcodeSaleSection) barcodeSaleSection.style.display = "block";
        if(grandTotalSection) grandTotalSection.style.display = "flex";
        if(reportsSection) reportsSection.style.display = "block";
        if(roleSelector) roleSelector.style.display = "none";
        if(storefrontPanel) storefrontPanel.style.display = "none"; 
        if(cartBtn) cartBtn.style.display = "none";
        if(adminBadge) adminBadge.style.display = "block";

        if(containerHealthy) containerHealthy.style.display = "block";
        if(containerLow) containerLow.style.display = "block";
        if(containerDefective) containerDefective.style.display = "block";

        updateTableHeadersDirect(true);
        fetchSalesLogsFromCloud();
    } else {
        updateTableHeadersDirect(false);
        const savedRole = localStorage.getItem("erdem_bilisim_locked_role");
        if (savedRole) {
            hasSelectedRole = true;
            const radio = document.querySelector(`input[name="user-role-radio"][value="${savedRole}"]`);
            if(radio) radio.checked = true;
            document.querySelectorAll('input[name="user-role-radio"]').forEach(radio => radio.disabled = true);
            if(roleSelector) roleSelector.style.opacity = "0.6";

            if (savedRole === "satici") {
                if(sellerFormPanel) sellerFormPanel.style.display = "block";
                if(storefrontPanel) storefrontPanel.style.display = "none";
                if(cartBtn) cartBtn.style.display = "none";
                if(containerHealthy) containerHealthy.style.display = "block";
                if(containerLow) containerLow.style.display = "block";
                if(containerDefective) containerDefective.style.display = "block";
            } else {
                if(storefrontPanel) storefrontPanel.style.display = "block";
            }
        }
    }
    fetchStocksFromCloud(isAdmin);
});

window.handleRoleChange = function() {
    if (hasSelectedRole) return;
    hasSelectedRole = true;

    const radioChecked = document.querySelector('input[name="user-role-radio"]:checked');
    if(!radioChecked) return;
    const role = radioChecked.value;
    localStorage.setItem("erdem_bilisim_locked_role", role);

    document.querySelectorAll('input[name="user-role-radio"]').forEach(radio => radio.disabled = true);
    const selector = document.getElementById("customer-role-selector");
    if(selector) selector.style.opacity = "0.6";

    const storefrontPanel = document.getElementById("storefront-panel");
    const sellerFormPanel = document.getElementById("customer-seller-panel");
    const cartBtn = document.getElementById("header-cart-btn");
    
    const containerHealthy = document.getElementById("container-healthy");
    const containerLow = document.getElementById("container-low");
    const containerDefective = document.getElementById("container-defective");

    if(role === 'alici') {
        if(storefrontPanel) storefrontPanel.style.display = "block";
    } else {
        if(sellerFormPanel) sellerFormPanel.style.display = "block";
        if(storefrontPanel) storefrontPanel.style.display = "none";
        if(cartBtn) cartBtn.style.display = "none";
        if(containerHealthy) containerHealthy.style.display = "block";
        if(containerLow) containerLow.style.display = "block";
        if(containerDefective) containerDefective.style.display = "block";
    }

    const isAdmin = (new URLSearchParams(window.location.search).get('mod') === 'ahmet');
    updateTablesByStatus(globalStocks, isAdmin);
}

// ==========================================
// 4. VERİLERİ GETİR (GET)
// ==========================================
async function fetchStocksFromCloud(isAdmin) {
    try {
        const response = await fetch(`${SUPABASE_URL}/stocks?select=*`, {
            method: "GET",
            headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
        });

        if (!response.ok) { showToast("Stok verileri buluttan çekilemedi!", "error"); return; }

        globalStocks = await response.json();
        globalStocks.sort((a, b) => a.id - b.id);
        
        if (isAdmin) {
            updateTablesByStatus(globalStocks, true);
        } else {
            const savedRole = localStorage.getItem("erdem_bilisim_locked_role");
            const radioChecked = document.querySelector('input[name="user-role-radio"]:checked');
            const role = savedRole || (radioChecked ? radioChecked.value : 'alici');
            if(role === 'alici') filterStorefront();
            else updateTablesByStatus(globalStocks, false);
        }
    } catch (error) {
        console.error(error);
    }
}

// ==========================================
// 5. MÜŞTERİ: VİTRİN VE AKILLI ARAMA/FİLTRE SİSTEMİ
// ==========================================
window.filterStorefront = function() {
    const searchInput = document.getElementById('search-input');
    const filterTypeEl = document.getElementById('filter-type');
    const searchText = searchInput ? searchInput.value.toLowerCase() : "";
    const filterType = filterTypeEl ? filterTypeEl.value : "all";

    const filteredStocks = globalStocks.filter(stock => {
        const currentStatus = (stock.status || "%100").trim();
        const count = parseInt(stock.stock_count || 0);
        const isHealthy = (currentStatus === "%100" || currentStatus === "Sağlıklı") && count > 0;
        
        const brand = (stock.brand_name || "").toLowerCase();
        const model = (stock.model || "").toLowerCase();
        const matchesSearch = brand.includes(searchText) || model.includes(searchText);
        
        const matchesType = filterType === "all" || stock.model.includes(filterType);
        return isHealthy && matchesSearch && matchesType;
    });

    renderStorefront(filteredStocks);
}

function renderStorefront(stocks) {
    const grid = document.getElementById("products-grid-container");
    if(!grid) return;
    grid.innerHTML = "";

    if(stocks.length === 0) {
        grid.innerHTML = "<p style='color: var(--text-muted);'>Aradığınız kriterlere uygun satılık ürün bulunamadı.</p>";
        return;
    }

    stocks.forEach(stock => {
        let formattedCapacity = "---";
        if (stock.capacity_gb) {
            const cap = parseInt(stock.capacity_gb);
            formattedCapacity = cap >= 1000 ? (cap / 1000) + " TB" : cap + " GB";
        }

        const brand = stock.brand_name || "Bilinmiyor";
        const inch = stock.model || "";
        const price = parseFloat(stock.sale_price || 0).toFixed(2);

        let imageUrl = stock.image_url;
        if (!imageUrl || imageUrl.trim() === "") {
            if (inch.includes("M.2")) {
                imageUrl = "https://images.unsplash.com/photo-1628557044797-f21a177c37ec?auto=format&fit=crop&w=400&q=80"; 
            } else if (inch.includes("2.5") || brand.toLowerCase().includes("samsung")) {
                imageUrl = "https://images.unsplash.com/photo-1597849016254-4fb9f82d2eb5?auto=format&fit=crop&w=400&q=80"; 
            } else {
                imageUrl = "https://images.unsplash.com/photo-1531492746076-161ca9bcad58?auto=format&fit=crop&w=400&q=80"; 
            }
        }

        grid.innerHTML += `
            <div class="product-card">
                <img src="${imageUrl}" class="product-img" alt="${brand} Disk">
                <div class="prod-brand">${brand}</div>
                <div class="prod-specs">${formattedCapacity} • ${inch}" Form • Durum: %100</div>
                <div style="font-size: 12px; color: var(--orange);">Stokta: ${stock.stock_count} Adet</div>
                <div class="prod-price">${price} TL</div>
                <button class="btn-add-cart" onclick="addToCart(${stock.id}, '${brand}', '${formattedCapacity}', ${price})">🛒 Sepete Ekle</button>
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
    const totalItems = shoppingCart.reduce((sum, item) => sum + item.qty, 0);
    const countEl = document.getElementById("header-cart-count");
    if(countEl) countEl.innerText = totalItems;
    
    const list = document.getElementById("cart-items-list");
    const totalEl = document.getElementById("cart-total-price");
    if(!list) return;
    
    list.innerHTML = ""; let grandTotal = 0;
    if(shoppingCart.length === 0) list.innerHTML = "<p>Sepetiniz şu an boş.</p>";
    else {
        shoppingCart.forEach((item, index) => {
            const rowTotal = item.qty * item.price; grandTotal += rowTotal;
            list.innerHTML += `
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding:10px 0;">
                    <div><strong>${item.brand} ${item.capacity}</strong><br><span style="font-size:12px; color:var(--text-muted);">${item.qty} Adet x ${item.price.toFixed(2)} TL</span></div>
                    <div style="text-align:right;"><strong style="color:var(--blue);">${rowTotal.toFixed(2)} TL</strong><br><button onclick="removeFromCart(${index})" style="background:none; border:none; color:var(--red); font-size:12px; margin-top:5px; cursor:pointer;">Kaldır</button></div>
                </div>`;
        });
    }
    if(totalEl) totalEl.innerText = `Toplam: ${grandTotal.toFixed(2)} TL`;
}

window.removeFromCart = function(index) { shoppingCart.splice(index, 1); updateCartUI(); }
window.checkout = function() {
    if(shoppingCart.length === 0) { showToast("Sepetiniz boş!", "error"); return; }
    showToast("Sanal POS entegrasyonu (PayTR vb.) alındığında burası aktifleşecek.", "info");
}

// ==========================================
// 6. YÖNETİCİ & SATICI TABLOLARI
// ==========================================
function parseOfferNotes(rawNotes) {
    let buyer = "Yok", seller = "Yok";
    if (rawNotes && rawNotes !== "Teklif Yok") {
        rawNotes.split("||").forEach(part => {
            if (part.trim().startsWith("ALICI:")) buyer = part.replace("ALICI:", "").trim();
            else if (part.trim().startsWith("SATICI:")) seller = part.replace("SATICI:", "").trim();
        });
    }
    return { buyer, seller };
}

function updateTableHeadersDirect(isAdmin) {
    ["table-healthy", "table-low", "table-defective"].forEach(tableId => {
        const table = document.getElementById(tableId);
        if (!table) return;
        const theadRow = table.querySelector("thead tr");
        if (!theadRow) return;

        if (isAdmin) {
            theadRow.innerHTML = `<th>Barkod</th> <th>Marka</th> <th>Kapasite</th> <th>İnç</th> <th>Stok</th> <th style="color:var(--green);">Alıcı Teklifi</th> <th style="color:var(--orange);">Satıcı Arzı</th> <th style="color:var(--blue);">Alış Fiyatı</th> <th>Satış Fiyatı</th> <th>Toplam Maliyet</th> <th>İşlemler</th>`;
        } else {
            theadRow.innerHTML = `<th>Barkod</th> <th>Marka</th> <th>Kapasite</th> <th>İnç</th> <th>Stok</th> <th style="color:var(--green);">Satış Fiyatı</th> <th style="color:var(--orange);">Alış Fiyatı</th> <th>Teklif Durumunuz</th> <th>İşlemler</th>`;
        }
    });
}

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
    const role = localStorage.getItem("erdem_bilisim_locked_role");

    stocks.forEach(stock => {
        const currentStatus = (stock.status || "%100").trim();
        const count = parseInt(stock.stock_count || 0);
        const buyPrice = parseFloat(stock.price || 0);
        const sellPrice = parseFloat(stock.sale_price || 0);
        const parsedOffers = parseOfferNotes(stock.offer_notes);
        let capFormat = parseInt(stock.capacity_gb) >= 1000 ? (parseInt(stock.capacity_gb)/1000 + " TB") : (stock.capacity_gb + " GB");
        
        if (!isAdmin && role !== "satici" && currentStatus !== "%100" && currentStatus !== "Sağlıklı") return;

        const row = document.createElement("tr");
        if (isAdmin && stock.barcode === "Müşteri Arzı") row.style.background = "rgba(249, 115, 22, 0.05)";

        const totalBuyRow = count * buyPrice; const totalSellRow = count * sellPrice;

        if (currentStatus === "%100" || currentStatus === "Sağlıklı") { healthyTotals.buy += totalBuyRow; healthyTotals.sell += totalSellRow; }
        else if (currentStatus === "Sağlığı Düşük") { lowTotals.buy += totalBuyRow; lowTotals.sell += totalSellRow; }
        else { defectiveTotals.buy += totalBuyRow; defectiveTotals.sell += totalSellRow; }

        if (isAdmin) {
            row.innerHTML = `
                <td>${stock.barcode === "Müşteri Arzı" ? `<span style="color:var(--orange); font-weight:bold;">DIŞ ARZ</span>` : stock.barcode}</td> 
                <td><strong>${stock.brand_name}</strong></td> <td>${capFormat}</td> <td><strong>${stock.model}"</strong></td>
                <td><span id="stock-count-${stock.id}" style="font-weight:bold;">${count}</span></td>
                <td style="color:var(--green);"><div id="display-ALICI-${stock.id}">${parsedOffers.buyer} <button class="btn-edit-offer" onclick="showInlineInput(${stock.id}, 'ALICI')">✍️</button></div><div id="edit-ALICI-${stock.id}" style="display:none; gap:5px;"><input type="text" id="input-ALICI-${stock.id}" value="${parsedOffers.buyer}" style="padding:4px; max-width:80px;"><button onclick="submitInlineOffer(${stock.id}, 'ALICI')">✔️</button></div></td>
                <td style="color:var(--orange);">${parsedOffers.seller}</td>
                <td style="color:var(--blue);"><div id="display-ALIS-${stock.id}"><strong>${buyPrice.toFixed(2)} TL</strong> <button class="btn-edit-offer" onclick="showInlineInput(${stock.id}, 'ALIS')">✍️</button></div><div id="edit-ALIS-${stock.id}" style="display:none; gap:5px;"><input type="number" id="input-ALIS-${stock.id}" value="${buyPrice}" style="padding:4px; max-width:80px;"><button onclick="submitDirectPrice(${stock.id}, 'ALIS')">✔️</button></div></td>
                <td style="color:var(--green);"><div id="display-SATIS-${stock.id}"><strong>${sellPrice.toFixed(2)} TL</strong> <button class="btn-edit-offer" onclick="showInlineInput(${stock.id}, 'SATIS')">✍️</button></div><div id="edit-SATIS-${stock.id}" style="display:none; gap:5px;"><input type="number" id="input-SATIS-${stock.id}" value="${sellPrice}" style="padding:4px; max-width:80px;"><button onclick="submitDirectPrice(${stock.id}, 'SATIS')">✔️</button></div></td>
                <td>${totalBuyRow.toFixed(2)} TL</td>
                <td><button class="btn-action btn-plus" onclick="changeStockInCloud(${stock.id}, 1)">+</button><button class="btn-action btn-minus" onclick="changeStockInCloud(${stock.id}, -1)">-</button><button class="btn-action btn-delete" onclick="deleteStockFromCloud(${stock.id})">Sil</button></td>
            `;
        } else {
            row.innerHTML = `
                <td>${stock.barcode}</td> <td><strong>${stock.brand_name}</strong></td> <td>${capFormat}</td> <td><strong>${stock.model}"</strong></td> <td><strong>${count}</strong></td>
                <td style="color:var(--text-muted);">🔒 Gizli</td> <td style="color:var(--orange);"><strong>${buyPrice.toFixed(2)} TL</strong></td> <td style="color:var(--orange); font-size:12px;">Arzınız: <strong>${parsedOffers.seller}</strong></td>
                <td>${stock.barcode === "Müşteri Arzı" ? `<button class="btn-action btn-delete" onclick="deleteStockFromCloud(${stock.id})">İptal Et</button>` : `<div id="display-SATICI-${stock.id}"><button class="btn-action" style="background:var(--orange); color:white; border-radius:4px; border:none; padding:5px 10px;" onclick="showInlineInput(${stock.id}, 'SATICI')">Fiyat Ver</button></div><div id="edit-SATICI-${stock.id}" style="display:none; gap:5px;"><input type="text" id="input-SATICI-${stock.id}" placeholder="Adet/Fiyat" style="padding:4px; max-width:100px;"><button onclick="submitInlineOffer(${stock.id}, 'SATICI')">✔️</button></div>`}</td>
            `;
        }
        if (currentStatus === "%100" || currentStatus === "Sağlıklı") { if(healthyBody) healthyBody.appendChild(row); }
        else if (currentStatus === "Sağlığı Düşük") { if(lowBody) lowBody.appendChild(row); }
        else { if(defectiveBody) defectiveBody.appendChild(row); }
    });

    if (isAdmin) {
        addCategoryTotalRow(healthyBody, healthyTotals); 
        addCategoryTotalRow(lowBody, lowTotals); 
        addCategoryTotalRow(defectiveBody, defectiveTotals);
        
        const grandBuy = document.getElementById("grand-buy-value");
        const grandSell = document.getElementById("grand-sell-value");
        if(grandBuy) grandBuy.innerText = (healthyTotals.buy + lowTotals.buy + defectiveTotals.buy).toFixed(2);
        if(grandSell) grandSell.innerText = (healthyTotals.sell + lowTotals.sell + defectiveTotals.sell).toFixed(2);
    }
}

function addCategoryTotalRow(tbody, totals) {
    if (!tbody) return;
    const row = document.createElement("tr"); row.className = "total-row";
    row.innerHTML = `<td colspan="5" style="text-align: right;">Kategori Toplamı:</td><td colspan="2" style="color:var(--blue);">Maliyet: ${totals.buy.toFixed(2)} TL</td><td colspan="4" style="color:var(--green);">Beklenen: ${totals.sell.toFixed(2)} TL</td>`;
    tbody.appendChild(row);
}

// ==========================================
// 7. YÖNETİCİ & SATICI İŞLEM FONKSİYONLARI
// ==========================================
window.showInlineInput = function(id, role) { 
    const displayEl = document.getElementById(`display-${role}-${id}`);
    const editEl = document.getElementById(`edit-${role}-${id}`);
    if(displayEl) displayEl.style.display = "none"; 
    if(editEl) editEl.style.display = "flex"; 
}

window.submitInlineOffer = async function(id, role) {
    const isAdmin = (new URLSearchParams(window.location.search).get('mod') === 'ahmet');
    const stockItem = globalStocks.find(s => s.id === id); if (!stockItem) return;
    const parsed = parseOfferNotes(stockItem.offer_notes);
    const inputVal = document.getElementById(`input-${role}-${id}`).value.trim() || "Yok";
    if (role === 'ALICI') parsed.buyer = inputVal; else if (role === 'SATICI') parsed.seller = inputVal;
    
    try {
        const response = await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, { 
            method: "PATCH", 
            headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" }, 
            body: JSON.stringify({ offer_notes: `ALICI: ${parsed.buyer} || SATICI: ${parsed.seller}` }) 
        });
        if(response.ok) {
            showToast("Teklif başarıyla güncellendi.", "success");
            fetchStocksFromCloud(isAdmin);
        }
    } catch(e) { showToast("Teklif güncellenemedi!", "error"); }
}

window.submitDirectPrice = async function(id, type) {
    const inputVal = parseFloat(document.getElementById(`input-${type}-${id}`).value || 0);
    let payload = type === 'ALIS' ? { price: inputVal } : { sale_price: inputVal };
    try {
        const response = await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, { 
            method: "PATCH", 
            headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" }, 
            body: JSON.stringify(payload) 
        });
        if(response.ok) {
            showToast("Fiyat başarıyla güncellendi.", "success");
            fetchStocksFromCloud(true);
        }
    } catch(e) { showToast("Fiyat güncellenemedi!", "error"); }
}

window.submitNewOfferFromSeller = async function(event) {
    event.preventDefault();
    const offerNotes = `ALICI: Yok || SATICI: ${document.getElementById("offer-count").value} Adet - İstenen Fiyat/Tel: ${document.getElementById("offer-price").value}`;
    try {
        const response = await fetch(`${SUPABASE_URL}/stocks`, {
            method: "POST", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ barcode: "Müşteri Arzı", brand_name: document.getElementById("offer-brand").value, capacity_gb: parseInt(document.getElementById("offer-capacity").value), model: document.getElementById("offer-inch").value, stock_count: 0, price: 0, sale_price: 0, offer_notes: offerNotes, status: document.getElementById("offer-status").value })
        });
        if(response.ok) {
            document.getElementById("customer-offer-form").reset(); 
            showToast("Teklif dükkan yönetimine iletildi abim.", "success"); 
            fetchStocksFromCloud(false);
        }
    } catch(e) { showToast("Teklif iletilemedi!", "error"); }
}

window.changeStockInCloud = async function(id, amount) {
    let current = parseInt(document.getElementById(`stock-count-${id}`).innerText);
    let newStock = current + amount; if (newStock < 0) newStock = 0;
    document.getElementById(`stock-count-${id}`).innerText = newStock;
    try {
        await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, { 
            method: "PATCH", 
            headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" }, 
            body: JSON.stringify({ stock_count: newStock }) 
                });
    } catch(e) { showToast("Stok güncellenirken hata oluştu!", "error"); }
}

window.addNewStock = async function(event) {
    event.preventDefault();
    const imgEl = document.getElementById("prod-image-url");
    const customImageUrl = imgEl ? imgEl.value.trim() : "";

    try {
        const response = await fetch(`${SUPABASE_URL}/stocks`, {
            method: "POST", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                barcode: document.getElementById("prod-barcode").value, brand_name: document.getElementById("prod-brand").value,
                capacity_gb: parseInt(document.getElementById("prod-capacity").value), model: document.getElementById("prod-inch").value, 
                stock_count: parseInt(document.getElementById("prod-stock").value), price: parseFloat(document.getElementById("prod-price").value || 0),
                sale_price: parseFloat(document.getElementById("prod-sale-price").value || 0), offer_notes: "ALICI: Yok || SATICI: Yok", 
                status: document.getElementById("prod-status").value, image_url: customImageUrl
            })
        });
        if(response.ok) {
            document.getElementById("add-stock-form").reset(); 
            showToast("Yeni ürün başarıyla eklendi.", "success");
            fetchStocksFromCloud(true);
        }
    } catch(e) { showToast("Ürün eklenirken hata oluştu!", "error"); }
}

window.deleteStockFromCloud = async function(id) {
    if(!confirm("Bu ürünü silmek istediğinize emin misiniz?")) return;
    const isAdmin = (new URLSearchParams(window.location.search).get('mod') === 'ahmet');
    try {
        const response = await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, { method: "DELETE", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } });
        if(response.ok) {
            showToast("Ürün veritabanından silindi.", "success");
            fetchStocksFromCloud(isAdmin);
        }
    } catch(e) { showToast("Ürün silinemedi!", "error"); }
}

// ==========================================
// 8. BARKOD VE GELİŞMİŞ RAPORLAMA (SUPABASE ENTEGRELİ)
// ==========================================
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
        await saveSaleToCloud(scannedBarcode, matchedStock.brand_name, targetSession, parseFloat(matchedStock.sale_price || 0));
        barcodeInput.value = ""; 
        fetchStocksFromCloud(true); 
        showToast("Satış onaylandı ve buluta kaydedildi!", "success");
    }
}

async function saveSaleToCloud(barcode, brand, sessionName, salePrice) {
    const saleDate = new Date().toLocaleDateString('tr-TR');
    await fetch(`${SUPABASE_URL}/sales_logs`, {
        method: "POST", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ barcode: barcode, title: brand, session_name: sessionName, sale_count: 1, price: salePrice, sale_date: saleDate })
    });
    await fetchSalesLogsFromCloud(); 
}

window.fetchSalesLogsFromCloud = async function() {
    const response = await fetch(`${SUPABASE_URL}/sales_logs?select=*`, {
        method: "GET", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
    });
    if (response.ok) {
        globalSalesLogs = await response.json();
        renderReportTabs();
    }
}

function renderReportTabs() {
    const tabsContainer = document.getElementById("dynamic-report-tabs");
    if (!tabsContainer) return;
    
    drawChart(globalSalesLogs); 

    let sessions = [...new Set(globalSalesLogs.map(s => s.session_name))];
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
    renderSalesReport(globalSalesLogs);
}

function renderSalesReport(allSales) {
    const tbody = document.getElementById("reports-tbody");
    let filtered = allSales.filter(s => s.session_name === currentActiveReportTab);
    tbody.innerHTML = ""; let totalRev = 0;
    
    let grouped = {};
    filtered.forEach(s => {
        if(!grouped[s.barcode]) grouped[s.barcode] = {...s};
        else grouped[s.barcode].sale_count += 1;
    });

    Object.values(grouped).forEach(sale => {
        let rowTotal = sale.sale_count * sale.price; totalRev += rowTotal;
        tbody.innerHTML += `<tr><td>${sale.barcode}</td> <td>${sale.title}</td> <td>${sale.session_name}</td> <td>${sale.sale_count}</td> <td>${sale.price} TL</td> <td style="color:var(--green);">${rowTotal} TL</td></tr>`;
    });
    tbody.innerHTML += `<tr class="total-row"><td colspan="5" style="text-align:right;">Toplam:</td><td style="color:var(--green);">${totalRev} TL</td></tr>`;
}

function drawChart(salesData) {
    const ctx = document.getElementById('salesChart');
    if(!ctx) return;
    
    let sessionTotals = {};
    salesData.forEach(sale => {
        if(!sessionTotals[sale.session_name]) sessionTotals[sale.session_name] = 0;
        sessionTotals[sale.session_name] += (sale.sale_count * sale.price);
    });

    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#e4e6eb' : '#1c1e21';

    if(salesChartInstance) salesChartInstance.destroy();

    salesChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(sessionTotals),
            datasets: [{ label: 'Oturum Cirosu (TL)', data: Object.values(sessionTotals), backgroundColor: '#1877f2', borderRadius: 6 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: textColor } } }, scales: { x: { ticks: { color: textColor } }, y: { ticks: { color: textColor } } } }
    });
}

window.exportReportsToCSV = function() {
    if(globalSalesLogs.length === 0) { showToast("Dışa aktarılacak veri yok.", "error"); return; }
    
    let csvContent = "data:text/csv;charset=utf-8,Barkod,Urun,Oturum,Adet,BirimFiyat,Tarih\n";
    globalSalesLogs.forEach(row => {
        csvContent += `${row.barcode},${row.title},${row.session_name},${row.sale_count},${row.price},${row.sale_date}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "satis_raporu.csv");
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    showToast("Excel dosyası indirildi!", "success");
}

window.clearSalesLogs = async function() {
    if(confirm("Tüm satış geçmişi Supabase veritabanından kalıcı olarak silinecek. Emin misin?")) {
        try {
            await fetch(`${SUPABASE_URL}/sales_logs?id=gt.0`, { method: "DELETE", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } });
            globalSalesLogs = [];
            currentActiveReportTab = "Satış 1"; document.getElementById("active-sale-session").value = "Satış 1";
            renderReportTabs();
            showToast("Tüm satış verileri veritabanından temizlendi.", "success");
        } catch(e) { showToast("Veriler silinirken hata oluştu!", "error"); }
    }
}