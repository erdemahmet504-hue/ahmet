// ==========================================
// 1. BULUT VERİTABANI BAĞLANTI BİLGİLERİ VE AUTH
// ==========================================
const SUPABASE_URL = "https://zwayidssoujhrjxzgdql.supabase.co/rest/v1"; 
const SUPABASE_KEY = "sb_publishable_wHYCLbDylFN9wnRXuGCmFg_cl1OPZAC"; 

// YENİ: Supabase Client (Auth ve Siparişler İçin)
const _supabase = supabase.createClient("https://zwayidssoujhrjxzgdql.supabase.co", SUPABASE_KEY);
let currentUser = null;

let globalStocks = [];
let shoppingCart = []; 
let currentActiveReportTab = "Satış 1";
let hasSelectedRole = false; 

// ==========================================
// 2. SAYFA YÜKLENDİĞİNDE YETKİ KONTROLÜ
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    
    // YENİ: Kullanıcı Oturum Kontrolü
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        document.getElementById("auth-nav-btn").style.display = "none";
        document.getElementById("user-panel-btn").style.display = "block";
    }

    _supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            currentUser = session.user;
            document.getElementById("auth-nav-btn").style.display = "none";
            document.getElementById("user-panel-btn").style.display = "block";
        } else {
            currentUser = null;
            document.getElementById("auth-nav-btn").style.display = "block";
            document.getElementById("user-panel-btn").style.display = "none";
        }
    });

    const urlParams = new URLSearchParams(window.location.search);
    const isAdmin = (urlParams.get('mod') === 'ahmet');

    const adminPanel = document.getElementById("admin-panel");
    const barcodeSaleSection = document.getElementById("barcode-sale-panel");
    const grandTotalSection = document.getElementById("grand-total-section");
    const reportsSection = document.getElementById("reports-panel");
    const biDashboardPanel = document.getElementById("bi-dashboard-panel"); // YENİ
    
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
        adminPanel.style.display = "block";
        barcodeSaleSection.style.display = "block";
        grandTotalSection.style.display = "flex";
        reportsSection.style.display = "block";
        biDashboardPanel.style.display = "block"; // YENİ

        roleSelector.style.display = "none";
        storefrontPanel.style.display = "none"; 
        cartBtn.style.display = "none";
        adminBadge.style.display = "block";

        containerHealthy.style.display = "block";
        containerLow.style.display = "block";
        containerDefective.style.display = "block";

        updateTableHeadersDirect(true);
        renderReportTabs();
    } else {
        updateTableHeadersDirect(false);
        const savedRole = localStorage.getItem("erdem_bilisim_locked_role");
        if (savedRole) {
            hasSelectedRole = true;
            document.querySelector(`input[name="user-role-radio"][value="${savedRole}"]`).checked = true;
            document.querySelectorAll('input[name="user-role-radio"]').forEach(radio => radio.disabled = true);
            roleSelector.style.opacity = "0.6";

            if (savedRole === "satici") {
                sellerFormPanel.style.display = "block";
                storefrontPanel.style.display = "none";
                cartBtn.style.display = "none";
                containerHealthy.style.display = "block";
                containerLow.style.display = "block";
                containerDefective.style.display = "block";
            } else {
                storefrontPanel.style.display = "block";
            }
        }
    }
    fetchStocksFromCloud(isAdmin);
});

// ==========================================
// YENİ: AUTH (KAYIT / GİRİŞ) FONKSİYONLARI
// ==========================================
window.toggleGenericModal = function(id) {
    const m = document.getElementById(id);
    m.style.display = m.style.display === "flex" ? "none" : "flex";
    if (id === 'user-panel-modal' && currentUser) {
        document.getElementById("user-email-display").innerText = currentUser.email;
        fetchUserOrders();
    }
}

window.switchAuthMode = function(mode) {
    if(mode === 'register') {
        document.getElementById("login-form").style.display = "none";
        document.getElementById("register-form").style.display = "block";
        document.getElementById("auth-title").innerText = "Kayıt Ol";
    } else {
        document.getElementById("login-form").style.display = "block";
        document.getElementById("register-form").style.display = "none";
        document.getElementById("auth-title").innerText = "Giriş Yap";
    }
}

window.handleRegister = async function() {
    const email = document.getElementById("reg-email").value;
    const password = document.getElementById("reg-password").value;
    const { data, error } = await _supabase.auth.signUp({ email, password });
    if(error) { alert("Kayıt Hatası: " + error.message); }
    else { alert("Kayıt başarılı! Lütfen giriş yapın."); switchAuthMode('login'); }
}

window.handleLogin = async function() {
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
    if(error) { alert("Giriş Hatası: " + error.message); }
    else { alert("Başarıyla giriş yapıldı!"); toggleGenericModal('auth-modal'); }
}

window.handleLogout = async function() {
    await _supabase.auth.signOut();
    alert("Oturum kapatıldı.");
    toggleGenericModal('user-panel-modal');
}

// ==========================================
// 3. ROL SEÇİMİ VE GÖRÜNÜM AYARLARI
// ==========================================
window.handleRoleChange = function() {
    if (hasSelectedRole) return;
    hasSelectedRole = true;

    const role = document.querySelector('input[name="user-role-radio"]:checked').value;
    localStorage.setItem("erdem_bilisim_locked_role", role);

    document.querySelectorAll('input[name="user-role-radio"]').forEach(radio => radio.disabled = true);
    document.getElementById("customer-role-selector").style.opacity = "0.6";

    const storefrontPanel = document.getElementById("storefront-panel");
    const sellerFormPanel = document.getElementById("customer-seller-panel");
    const cartBtn = document.getElementById("header-cart-btn");
    
    const containerHealthy = document.getElementById("container-healthy");
    const containerLow = document.getElementById("container-low");
    const containerDefective = document.getElementById("container-defective");

    if(role === 'alici') {
        storefrontPanel.style.display = "block";
    } else {
        sellerFormPanel.style.display = "block";
        storefrontPanel.style.display = "none";
        cartBtn.style.display = "none";
        containerHealthy.style.display = "block";
        containerLow.style.display = "block";
        containerDefective.style.display = "block";
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

        if (!response.ok) return;

        globalStocks = await response.json();
        globalStocks.sort((a, b) => a.id - b.id);
        
        if (isAdmin) {
            updateTablesByStatus(globalStocks, true);
            calculateBusinessIntelligence(); // YENİ: BI Verilerini Güncelle
        } else {
            const role = localStorage.getItem("erdem_bilisim_locked_role") || document.querySelector('input[name="user-role-radio"]:checked').value;
            if(role === 'alici') renderStorefront(globalStocks);
            else updateTablesByStatus(globalStocks, false);
        }
    } catch (error) {
        console.error(error);
    }
}

// ==========================================
// 5. MÜŞTERİ: VİTRİN VE AKILLI RESİM SİSTEMİ
// ==========================================
function renderStorefront(stocks) {
    const grid = document.getElementById("products-grid-container");
    grid.innerHTML = "";

    stocks.forEach(stock => {
        const currentStatus = (stock.status || "%100").trim();
        const count = parseInt(stock.stock_count || 0);
        
        if ((currentStatus !== "%100" && currentStatus !== "Sağlıklı") || count <= 0) return;

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

        const card = document.createElement("div");
        card.className = "product-card";
        
        card.innerHTML = `
            <img src="${imageUrl}" class="product-img" alt="${brand} Disk">
            <div class="prod-brand">${brand}</div>
            <div class="prod-specs">${formattedCapacity} • ${inch}" Form • Durum: %100</div>
            <div style="font-size: 12px; color: var(--orange);">Stokta: ${count} Adet</div>
            <div class="prod-price">${price} TL</div>
            <button class="btn-add-cart" onclick="addToCart(${stock.id}, '${brand}', '${formattedCapacity}', ${price})">🛒 Sepete Ekle</button>
        `;
        grid.appendChild(card);
    });

    if(grid.innerHTML === "") grid.innerHTML = "<p style='color: var(--text-muted);'>Şu an vitrinde satılık ürün bulunmuyor.</p>";
}

window.addToCart = function(id, brand, capacity, price) {
    const existing = shoppingCart.find(item => item.id === id);
    if(existing) existing.qty += 1;
    else shoppingCart.push({ id, brand, capacity, price, qty: 1 });
    updateCartUI(); alert(`${brand} ${capacity} sepete eklendi!`);
}

function updateCartUI() {
    const totalItems = shoppingCart.reduce((sum, item) => sum + item.qty, 0);
    document.getElementById("header-cart-count").innerText = totalItems;
    const list = document.getElementById("cart-items-list");
    const totalEl = document.getElementById("cart-total-price");
    
    list.innerHTML = ""; let grandTotal = 0;
    if(shoppingCart.length === 0) list.innerHTML = "<p>Sepetiniz şu an boş.</p>";
    else {
        shoppingCart.forEach((item, index) => {
            const rowTotal = item.qty * item.price; grandTotal += rowTotal;
            list.innerHTML += `
                <div class="cart-item">
                    <div><strong>${item.brand} ${item.capacity}</strong><br><span style="font-size:12px; color:var(--text-muted);">${item.qty} Adet x ${item.price.toFixed(2)} TL</span></div>
                    <div style="text-align:right;"><strong style="color:var(--blue);">${rowTotal.toFixed(2)} TL</strong><br><button onclick="removeFromCart(${index})" style="background:none; border:none; color:var(--red); font-size:12px; margin-top:5px; cursor:pointer;">Kaldır</button></div>
                </div>`;
        });
    }
    totalEl.innerText = `Toplam: ${grandTotal.toFixed(2)} TL`;
}

window.removeFromCart = function(index) { shoppingCart.splice(index, 1); updateCartUI(); }
window.toggleCartModal = function() {
    const modal = document.getElementById("cart-modal");
    modal.style.display = modal.style.display === "flex" ? "none" : "flex";
}

// YENİ: Gerçek Sipariş Tamamlama
window.checkout = async function() {
    if(shoppingCart.length === 0) { alert("Sepetiniz boş!"); return; }
    if(!currentUser) { alert("Siparişi tamamlamak için lütfen önce Hesabınıza giriş yapın."); return; }
    
    const total = shoppingCart.reduce((sum, i) => sum + (i.qty * i.price), 0);
    
    const { error } = await _supabase.from('orders').insert({
        user_id: currentUser.id,
        items: shoppingCart,
        total_price: total
    });

    if(!error) {
        alert("Siparişiniz başarıyla alındı! Geçmiş siparişlerinizden takip edebilirsiniz.");
        shoppingCart = [];
        updateCartUI();
        toggleCartModal();
    } else {
        alert("Hata oluştu: " + error.message);
    }
}

async function fetchUserOrders() {
    const { data, error } = await _supabase.from('orders').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
    const list = document.getElementById("user-orders-list");
    if(data && data.length > 0) {
        list.innerHTML = data.map(o => `
            <div style="border-bottom:1px solid #ccc; padding:8px 0;">
                <span style="color:var(--blue); font-weight:bold;">Sipariş #${o.id}</span> - ${parseFloat(o.total_price).toFixed(2)} TL<br>
                <span style="font-size:11px; color:var(--orange);">Durum: ${o.status}</span>
            </div>
        `).join('');
    } else {
        list.innerHTML = "Henüz siparişiniz bulunmuyor.";
    }
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

    if (healthyBody) healthyBody.innerHTML = ""; if (lowBody) lowBody.innerHTML = ""; if (defectiveBody) defectiveBody.innerHTML = "";

    let healthyTotals = { buy: 0, sell: 0 }; let lowTotals = { buy: 0, sell: 0 }; let defectiveTotals = { buy: 0, sell: 0 };
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
                <td style="color:var(--green);"><div id="display-ALICI-${stock.id}">${parsedOffers.buyer} <button class="btn-edit-offer" onclick="showInlineInput(${stock.id}, 'ALICI')">✍️</button></div><div id="edit-ALICI-${stock.id}" style="display:none; gap:5px;"><input type="text" id="input-ALICI-${stock.id}" value="${parsedOffers.buyer}"><button onclick="submitInlineOffer(${stock.id}, 'ALICI')">✔️</button></div></td>
                <td style="color:var(--orange);">${parsedOffers.seller}</td>
                <td style="color:var(--blue);"><div id="display-ALIS-${stock.id}"><strong>${buyPrice.toFixed(2)} TL</strong> <button class="btn-edit-offer" onclick="showInlineInput(${stock.id}, 'ALIS')">✍️</button></div><div id="edit-ALIS-${stock.id}" style="display:none; gap:5px;"><input type="number" id="input-ALIS-${stock.id}" value="${buyPrice}"><button onclick="submitDirectPrice(${stock.id}, 'ALIS')">✔️</button></div></td>
                <td style="color:var(--green);"><div id="display-SATIS-${stock.id}"><strong>${sellPrice.toFixed(2)} TL</strong> <button class="btn-edit-offer" onclick="showInlineInput(${stock.id}, 'SATIS')">✍️</button></div><div id="edit-SATIS-${stock.id}" style="display:none; gap:5px;"><input type="number" id="input-SATIS-${stock.id}" value="${sellPrice}"><button onclick="submitDirectPrice(${stock.id}, 'SATIS')">✔️</button></div></td>
                <td>${totalBuyRow.toFixed(2)} TL</td>
                <td><button class="btn-action btn-plus" onclick="changeStockInCloud(${stock.id}, 1)">+</button><button class="btn-action btn-minus" onclick="changeStockInCloud(${stock.id}, -1)">-</button><button class="btn-action btn-delete" onclick="deleteStockFromCloud(${stock.id})">Sil</button></td>
            `;
        } else {
            row.innerHTML = `
                <td>${stock.barcode}</td> <td><strong>${stock.brand_name}</strong></td> <td>${capFormat}</td> <td><strong>${stock.model}"</strong></td> <td><strong>${count}</strong></td>
                <td style="color:var(--text-muted);">🔒 Gizli</td> <td style="color:var(--orange);"><strong>${buyPrice.toFixed(2)} TL</strong></td> <td style="color:var(--orange); font-size:12px;">Arzınız: <strong>${parsedOffers.seller}</strong></td>
                <td>${stock.barcode === "Müşteri Arzı" ? `<button class="btn-action btn-delete" onclick="deleteStockFromCloud(${stock.id})">İptal Et</button>` : `<div id="display-SATICI-${stock.id}"><button class="btn-action" style="background:var(--orange); color:white;" onclick="showInlineInput(${stock.id}, 'SATICI')">Fiyat Ver</button></div><div id="edit-SATICI-${stock.id}" style="display:none; gap:5px;"><input type="text" id="input-SATICI-${stock.id}" placeholder="Adet/Fiyat"><button onclick="submitInlineOffer(${stock.id}, 'SATICI')">✔️</button></div>`}</td>
            `;
        }
        if (currentStatus === "%100" || currentStatus === "Sağlıklı") { if(healthyBody) healthyBody.appendChild(row); }
        else if (currentStatus === "Sağlığı Düşük") { if(lowBody) lowBody.appendChild(row); }
        else { if(defectiveBody) defectiveBody.appendChild(row); }
    });

    if (isAdmin) {
        addCategoryTotalRow(healthyBody, healthyTotals); addCategoryTotalRow(lowBody, lowTotals); addCategoryTotalRow(defectiveBody, defectiveTotals);
        document.getElementById("grand-buy-value").innerText = (healthyTotals.buy + lowTotals.buy + defectiveTotals.buy).toFixed(2);
        document.getElementById("grand-sell-value").innerText = (healthyTotals.sell + lowTotals.sell + defectiveTotals.sell).toFixed(2);
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
window.showInlineInput = function(id, role) { document.getElementById(`display-${role}-${id}`).style.display = "none"; document.getElementById(`edit-${role}-${id}`).style.display = "flex"; }

window.submitInlineOffer = async function(id, role) {
    const isAdmin = (new URLSearchParams(window.location.search).get('mod') === 'ahmet');
    const stockItem = globalStocks.find(s => s.id === id); if (!stockItem) return;
    const parsed = parseOfferNotes(stockItem.offer_notes);
    const inputVal = document.getElementById(`input-${role}-${id}`).value.trim() || "Yok";
    if (role === 'ALICI') parsed.buyer = inputVal; else if (role === 'SATICI') parsed.seller = inputVal;
    await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, { method: "PATCH", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ offer_notes: `ALICI: ${parsed.buyer} || SATICI: ${parsed.seller}` }) });
    fetchStocksFromCloud(isAdmin);
}

window.submitDirectPrice = async function(id, type) {
    const inputVal = parseFloat(document.getElementById(`input-${type}-${id}`).value || 0);
    let payload = type === 'ALIS' ? { price: inputVal } : { sale_price: inputVal };
    await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, { method: "PATCH", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    fetchStocksFromCloud(true);
}

window.submitNewOfferFromSeller = async function(event) {
    event.preventDefault();
    const offerNotes = `ALICI: Yok || SATICI: ${document.getElementById("offer-count").value} Adet - İstenen Fiyat/Tel: ${document.getElementById("offer-price").value}`;
    await fetch(`${SUPABASE_URL}/stocks`, {
        method: "POST", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ barcode: "Müşteri Arzı", brand_name: document.getElementById("offer-brand").value, capacity_gb: parseInt(document.getElementById("offer-capacity").value), model: document.getElementById("offer-inch").value, stock_count: 0, price: 0, sale_price: 0, offer_notes: offerNotes, status: document.getElementById("offer-status").value })
    });
    document.getElementById("customer-offer-form").reset(); alert("Teklif dükkan yönetimine iletildi abim."); fetchStocksFromCloud(false);
}

window.changeStockInCloud = async function(id, amount) {
    let current = parseInt(document.getElementById(`stock-count-${id}`).innerText);
    let newStock = current + amount; if (newStock < 0) newStock = 0;
    document.getElementById(`stock-count-${id}`).innerText = newStock;
    await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, { method: "PATCH", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ stock_count: newStock }) });
}

window.addNewStock = async function(event) {
    event.preventDefault();
    const imgEl = document.getElementById("prod-image-url");
    const customImageUrl = imgEl ? imgEl.value.trim() : "";

    await fetch(`${SUPABASE_URL}/stocks`, {
        method: "POST", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            barcode: document.getElementById("prod-barcode").value, brand_name: document.getElementById("prod-brand").value,
            capacity_gb: parseInt(document.getElementById("prod-capacity").value), model: document.getElementById("prod-inch").value, 
            stock_count: parseInt(document.getElementById("prod-stock").value), price: parseFloat(document.getElementById("prod-price").value || 0),
            sale_price: parseFloat(document.getElementById("prod-sale-price").value || 0), offer_notes: "ALICI: Yok || SATICI: Yok", 
            status: document.getElementById("prod-status").value, image_url: customImageUrl
        })
    });
    document.getElementById("add-stock-form").reset(); fetchStocksFromCloud(true);
}

window.deleteStockFromCloud = async function(id) {
    const isAdmin = (new URLSearchParams(window.location.search).get('mod') === 'ahmet');
    await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, { method: "DELETE", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } });
    fetchStocksFromCloud(isAdmin);
}

// ==========================================
// 8. BARKOD OKUTMA VE DİNAMİK RAPORLAMA SİSTEMİ
// ==========================================
window.barcodeSaleStockDrop = async function(event) {
    event.preventDefault();
    const barcodeInput = document.getElementById("scan-barcode-input");
    const scannedBarcode = barcodeInput.value.trim();
    const targetSession = document.getElementById("active-sale-session").value.trim() || "Varsayılan Satış";
    if (!scannedBarcode) return;

    const matchedStock = globalStocks.find(s => s.barcode && s.barcode.trim() === scannedBarcode);
    if (!matchedStock || parseInt(matchedStock.stock_count || 0) <= 0) { barcodeInput.value = ""; barcodeInput.focus(); return; }

    let newStockCount = parseInt(matchedStock.stock_count) - 1;
    const response = await fetch(`${SUPABASE_URL}/stocks?id=eq.${matchedStock.id}`, { method: "PATCH", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ stock_count: newStockCount }) });

    if (response.ok) {
        let capFormat = parseInt(matchedStock.capacity_gb) >= 1000 ? (parseInt(matchedStock.capacity_gb)/1000 + "TB") : (matchedStock.capacity_gb + "GB");
        // YENİ: BI hesaplamaları için Maliyet fiyatını ve Ürün tipini de kaydediyoruz
        saveSaleToSessionLogs(scannedBarcode, matchedStock.brand_name, `${capFormat} ${matchedStock.model}"`, targetSession, parseFloat(matchedStock.sale_price || 0), parseFloat(matchedStock.price || 0), matchedStock.model);
        barcodeInput.value = ""; barcodeInput.focus();
        fetchStocksFromCloud(true); renderReportTabs(); 
    }
}

function saveSaleToSessionLogs(barcode, brand, desc, sessionName, salePrice, buyPrice, productType) {
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    let existingIndex = allSales.findIndex(s => s.barcode === barcode && s.session === sessionName);
    if (existingIndex > -1) {
        allSales[existingIndex].count += 1;
    } else {
        allSales.push({ 
            barcode, title: `${brand} ${desc}`, session: sessionName, count: 1, 
            price: salePrice, buy_price: buyPrice, product_type: productType,
            date: new Date().toLocaleDateString('tr-TR')
        });
    }
    localStorage.setItem("erdem_bilisim_sales_logs", JSON.stringify(allSales));
}

function renderReportTabs() {
    const tabsContainer = document.getElementById("dynamic-report-tabs");
    if (!tabsContainer) return;
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    let sessions = [...new Set(allSales.map(s => s.session))];
    if (sessions.length === 0) sessions = ["Satış 1"];
    if (!sessions.includes(currentActiveReportTab)) currentActiveReportTab = sessions[0];

    tabsContainer.innerHTML = "";
    sessions.forEach(sessionName => {
        const btn = document.createElement("button");
        btn.className = `tab-btn ${sessionName === currentActiveReportTab ? "active" : ""}`;
        btn.innerText = sessionName;
        btn.onclick = () => { currentActiveReportTab = sessionName; renderReportTabs(); };
        tabsContainer.appendChild(btn);
    });
    renderSalesReport();
    calculateBusinessIntelligence(); // YENİ: Her satışta BI Panelini Güncelle
}

function renderSalesReport() {
    const tbody = document.getElementById("reports-tbody");
    if (!tbody) return;
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    let filteredSales = allSales.filter(s => s.session === currentActiveReportTab);
    
    if (filteredSales.length === 0) { tbody.innerHTML = `<tr><td colspan="6" style="color:var(--text-muted); text-align:center;">Bu oturumda satış yok.</td></tr>`; return; }
    
    tbody.innerHTML = ""; let totalSessionRevenue = 0;
    filteredSales.forEach(sale => {
        const rowTotal = sale.count * sale.price; totalSessionRevenue += rowTotal;
        tbody.innerHTML += `<tr><td style="font-family: monospace;">${sale.barcode}</td> <td>${sale.title}</td> <td><span style="background:var(--blue); color:white; padding:4px 8px; border-radius:4px; font-size:12px;">${sale.session}</span></td> <td><strong>${sale.count} Adet</strong></td> <td>${sale.price.toFixed(2)} TL</td> <td style="color:var(--green); font-weight:bold;">${rowTotal.toFixed(2)} TL</td></tr>`;
    });
    tbody.innerHTML += `<tr style="background:#f0f2f5; font-weight:bold;"><td colspan="5" style="text-align:right;">Oturum Toplamı:</td><td style="color:var(--green); font-size:16px;">${totalSessionRevenue.toFixed(2)} TL</td></tr>`;
}

window.clearSalesLogs = function() {
    if(confirm("Tüm oturumların rapor geçmişi silinecek, emin misin? (Stoklar etkilenmez)")) {
        localStorage.removeItem("erdem_bilisim_sales_logs");
        currentActiveReportTab = "Satış 1"; document.getElementById("active-sale-session").value = "Satış 1";
        renderReportTabs();
    }
}

// ==========================================
// YENİ: 9. İŞLETME ZEKASI (BI) MOTORU
// ==========================================
window.calculateBusinessIntelligence = function() {
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    const todayStr = new Date().toLocaleDateString('tr-TR');
    
    let dailyProfit = 0;
    let weeklyTurnover = 0;
    let brandSales = {};
    let typeProfit = {};

    allSales.forEach(sale => {
        const count = sale.count || 1;
        const salePrice = parseFloat(sale.price || 0);
        const buyPrice = parseFloat(sale.buy_price || 0);
        const profit = (salePrice - buyPrice) * count;
        const saleDate = sale.date || todayStr;

        if(saleDate === todayStr) { dailyProfit += profit; }
        weeklyTurnover += (salePrice * count);

        // Marka Bazlı Satış Hesaplama
        let brandName = sale.title.split(' ')[0] || "Diğer";
        brandSales[brandName] = (brandSales[brandName] || 0) + count;

        // Ürün Tipi Karlılığı
        let pType = sale.product_type || "Bilinmiyor";
        typeProfit[pType] = (typeProfit[pType] || 0) + profit;
    });

    // 1. Kâr ve Ciro Güncellemesi
    document.getElementById("bi-daily-profit").innerText = dailyProfit.toFixed(2) + " TL";
    document.getElementById("bi-weekly-turnover").innerText = weeklyTurnover.toFixed(2) + " TL";

    // 2. En Çok Satan Marka
    let topBrand = "---"; let maxBrandVal = 0;
    for(let b in brandSales) if(brandSales[b] > maxBrandVal) { maxBrandVal = brandSales[b]; topBrand = b; }
    document.getElementById("bi-top-brand").innerText = topBrand;

    // 3. En Kârlı Ürün Tipi
    let topType = "---"; let maxTypeVal = -99999;
    for(let t in typeProfit) if(typeProfit[t] > maxTypeVal) { maxTypeVal = typeProfit[t]; topType = t; }
    document.getElementById("bi-top-type").innerText = topType;

    // 4. Stok Analizi (Sağlık ve Bekleme Süresi)
    if (globalStocks.length > 0) {
        let totalHealth = 0; let totalWaiting = 0; let activeCount = 0;
        globalStocks.forEach(s => {
            if (s.stock_count > 0) {
                activeCount++;
                const status = s.status || "%100";
                if (status.includes("%100") || status === "Sağlıklı") totalHealth += 100;
                else if (status.includes("Düşük")) totalHealth += 50;
                
                if (s.created_at) {
                    const days = Math.floor((new Date() - new Date(s.created_at)) / (1000 * 60 * 60 * 24));
                    totalWaiting += (days >= 0 ? days : 0);
                }
            }
        });
        if (activeCount > 0) {
            document.getElementById("bi-avg-health").innerText = "%" + Math.round(totalHealth / activeCount);
            document.getElementById("bi-avg-waiting").innerText = Math.round(totalWaiting / activeCount) + " Gün";
        }
    }
}