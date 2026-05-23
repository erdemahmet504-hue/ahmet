// ==========================================
// 1. BULUT VERİTABANI & REALTIME BAĞLANTISI
// ==========================================
const SUPABASE_URL = "https://zwayidssoujhrjxzgdql.supabase.co"; 
const SUPABASE_KEY = "sb_publishable_wHYCLbDylFN9wnRXuGCmFg_cl1OPZAC"; 

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentUser = null;
let globalStocks = [];
let shoppingCart = []; 
let currentActiveReportTab = "Satış 1";
let hasSelectedRole = false; 

// ==========================================
// 2. SAYFA YÜKLENDİĞİNDE YETKİ VE SOKET KONTROLÜ
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    
    // Auth Olayları Dinleyicisi
    _supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'PASSWORD_RECOVERY') document.getElementById('update-password-modal').style.display = 'flex';
        
        if (session) {
            currentUser = session.user;
            document.getElementById("auth-nav-btn").style.display = "none";
            document.getElementById("user-panel-btn").style.display = "block";
            fetchUserOrdersAndOffers(); // Giriş yapıldığında geçmişi getir
        } else {
            currentUser = null;
            document.getElementById("auth-nav-btn").style.display = "block";
            document.getElementById("user-panel-btn").style.display = "none";
        }
    });

    const { data: { session } } = await _supabase.auth.getSession();
    if (session) currentUser = session.user;

    const urlParams = new URLSearchParams(window.location.search);
    const isAdmin = (urlParams.get('mod') === 'ahmet');
    setupUI(isAdmin);

    await fetchStocksFromCloud(isAdmin);
    setupRealtimeSocket(isAdmin);
});

// Admin Arayüz Sekmeleri Yönetimi
window.switchAdminTab = function(tabName) {
    document.getElementById("admin-tab-stok").style.display = "none";
    document.getElementById("admin-tab-pazarlik").style.display = "none";
    document.getElementById("admin-tab-satin-alinan").style.display = "none";
    document.getElementById("admin-tab-rapor").style.display = "none";
    document.getElementById(`admin-tab-${tabName}`).style.display = "block";
}

function setupUI(isAdmin) {
    if (isAdmin) {
        localStorage.removeItem("erdem_bilisim_locked_role");
        document.getElementById("admin-main-menu").style.display = "block";
        document.getElementById("customer-role-selector").style.display = "none";
        document.getElementById("storefront-panel").style.display = "none"; 
        document.getElementById("admin-status-badge").style.display = "block";
        renderReportTabs();
    } else {
        const savedRole = localStorage.getItem("erdem_bilisim_locked_role");
        if (savedRole) {
            hasSelectedRole = true;
            document.querySelector(`input[name="user-role-radio"][value="${savedRole}"]`).checked = true;
            document.querySelectorAll('input[name="user-role-radio"]').forEach(r => r.disabled = true);
            document.getElementById("customer-role-selector").style.opacity = "0.6";
            if (savedRole === "satici") {
                document.getElementById("customer-seller-panel").style.display = "block";
                document.getElementById("storefront-panel").style.display = "none";
            }
        }
    }
}

// ==========================================
// 3. REALTIME (CANLI YAYIN) MOTORU
// ==========================================
function setupRealtimeSocket(isAdmin) {
    _supabase.channel('public:stocks')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'stocks' }, payload => {
            
            if (payload.eventType === 'INSERT') globalStocks.push(payload.new);
            else if (payload.eventType === 'UPDATE') {
                const index = globalStocks.findIndex(s => s.id === payload.new.id);
                if (index !== -1) globalStocks[index] = payload.new;
            } 
            else if (payload.eventType === 'DELETE') globalStocks = globalStocks.filter(s => s.id !== payload.old.id);

            globalStocks.sort((a, b) => a.id - b.id);
            
            if(isAdmin) {
                renderAdminStok();
                renderAdminPazarlik();
                renderAdminSatinAlinan();
            } else {
                filterStorefront();
                if(document.getElementById('user-panel-modal').style.display === 'flex') fetchUserOrdersAndOffers();
            }
            
            const ind = document.getElementById("live-status-indicator");
            ind.style.color = "var(--green)";
            setTimeout(() => ind.style.color = "var(--text-muted)", 1000);
        }).subscribe();
}

// ==========================================
// 4. AUTH (ŞİFRE SIFIRLAMA, KAYIT, GİRİŞ)
// ==========================================
window.toggleGenericModal = function(id) {
    const m = document.getElementById(id);
    m.style.display = m.style.display === "flex" ? "none" : "flex";
    if (id === 'user-panel-modal' && currentUser) {
        document.getElementById("user-email-display").innerText = "Kullanıcı: " + currentUser.email;
        fetchUserOrdersAndOffers();
    }
}

window.switchAuthMode = function(mode) {
    document.getElementById("login-form").style.display = "none";
    document.getElementById("register-form").style.display = "none";
    document.getElementById("forgot-form").style.display = "none";
    
    if(mode === 'register') { document.getElementById("register-form").style.display = "block"; document.getElementById("auth-title").innerText = "Kayıt Ol"; } 
    else if(mode === 'forgot') { document.getElementById("forgot-form").style.display = "block"; document.getElementById("auth-title").innerText = "Şifremi Unuttum"; } 
    else { document.getElementById("login-form").style.display = "block"; document.getElementById("auth-title").innerText = "Giriş Yap"; }
}

window.handleRegister = async function() {
    const email = document.getElementById("reg-email").value; const password = document.getElementById("reg-password").value;
    const { data, error } = await _supabase.auth.signUp({ email, password });
    if(error) showToast("Kayıt Hatası: " + error.message, "error");
    else { if(data.session == null) showToast("Hesabınızı doğrulamak için e-postanızı kontrol edin.", "info"); else { showToast("Kayıt başarılı!", "success"); toggleGenericModal('auth-modal'); } }
}

window.handleLogin = async function() {
    const email = document.getElementById("login-email").value; const password = document.getElementById("login-password").value;
    const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
    if(error) showToast("Giriş başarısız.", "error"); else { showToast("Giriş yapıldı!", "success"); toggleGenericModal('auth-modal'); }
}

window.sendPasswordResetLink = async function() {
    const email = document.getElementById("forgot-email").value;
    const { error } = await _supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
    if(error) showToast("Hata: " + error.message, "error"); else { showToast("Sıfırlama linki gönderildi!", "success"); switchAuthMode('login'); }
}

window.updateAccountPassword = async function() {
    const newPassword = document.getElementById("new-auth-password").value;
    const { error } = await _supabase.auth.updateUser({ password: newPassword });
    if(error) showToast("Hata: " + error.message, "error"); else { showToast("Şifreniz güncellendi!", "success"); document.getElementById("update-password-modal").style.display = "none"; }
}

window.handleLogout = async function() { await _supabase.auth.signOut(); showToast("Oturum kapatıldı."); toggleGenericModal('user-panel-modal'); }

window.handleRoleChange = function() {
    if (hasSelectedRole) return; hasSelectedRole = true;
    const role = document.querySelector('input[name="user-role-radio"]:checked').value;
    localStorage.setItem("erdem_bilisim_locked_role", role);
    document.querySelectorAll('input[name="user-role-radio"]').forEach(radio => radio.disabled = true);
    document.getElementById("customer-role-selector").style.opacity = "0.6";
    if(role === 'alici') document.getElementById("storefront-panel").style.display = "block";
    else { document.getElementById("customer-seller-panel").style.display = "block"; document.getElementById("storefront-panel").style.display = "none"; }
}

// ==========================================
// 5. VERİ ÇEKME VE MÜŞTERİ VİTRİNİ
// ==========================================
async function fetchStocksFromCloud(isAdmin) {
    const { data } = await _supabase.from('stocks').select('*');
    if (data) {
        globalStocks = data.sort((a, b) => a.id - b.id);
        if (isAdmin) { renderAdminStok(); renderAdminPazarlik(); renderAdminSatinAlinan(); calculateBusinessIntelligence(); } 
        else filterStorefront();
    }
}

window.filterStorefront = function() {
    const text = document.getElementById("search-input") ? document.getElementById("search-input").value.toLowerCase() : "";
    const container = document.getElementById("products-grid-container");
    if (!container) return; container.innerHTML = "";

    globalStocks.filter(s => s.trade_status === 'Satışta' && s.stock_count > 0 && s.brand_name.toLowerCase().includes(text)).forEach(stock => {
        let imageUrl = stock.image_url || (stock.model.includes("M.2") ? "https://images.unsplash.com/photo-1628557044797-f21a177c37ec?w=400" : "https://images.unsplash.com/photo-1597849016254-4fb9f82d2eb5?w=400");
        container.innerHTML += `
            <div class="product-card">
                <img src="${imageUrl}" class="product-img">
                <div class="prod-brand">${stock.brand_name}</div>
                <div class="prod-specs">${stock.capacity_gb} GB • ${stock.model}" Form</div>
                <div style="font-size: 12px; color: var(--orange);">Stok: ${stock.stock_count} Adet</div>
                <div class="prod-price">${parseFloat(stock.sale_price).toFixed(2)} TL</div>
                <button class="btn-add-cart" onclick="addToCart(${stock.id}, '${stock.brand_name}', ${stock.capacity_gb}, ${stock.sale_price})">🛒 Sepete Ekle</button>
            </div>`;
    });
}

// ==========================================
// 6. YENİ: PAZARLIK (C2B) MÜŞTERİ PANELİ EKRANLARI
// ==========================================
window.submitNewOfferFromSeller = async function(event) {
    event.preventDefault();
    if(!currentUser) { showToast("Dükkana teklif vermek için giriş yapmalısınız.", "error"); return; }
    
    const payload = {
        barcode: "Müşteri Arzı", brand_name: document.getElementById("offer-brand").value,
        capacity_gb: parseInt(document.getElementById("offer-capacity").value), model: document.getElementById("offer-inch").value,
        stock_count: parseInt(document.getElementById("offer-count").value), price: 0, sale_price: 0, 
        status: document.getElementById("offer-status").value,
        seller_id: currentUser.id, seller_price: parseFloat(document.getElementById("offer-price").value), admin_price: 0,
        seller_approved: true, admin_approved: false, trade_status: 'Pazarlıkta'
    };
    await _supabase.from('stocks').insert(payload);
    document.getElementById("customer-offer-form").reset(); showToast("Teklifiniz dükkana iletildi!", "success");
}

async function fetchUserOrdersAndOffers() {
    if(!currentUser) return;
    
    // Geçmiş Siparişler
    const { data: orders } = await _supabase.from('orders').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
    const orderList = document.getElementById("user-orders-list");
    if(orders && orders.length > 0) orderList.innerHTML = orders.map(o => `<div style="border-bottom:1px solid var(--border-color); padding:8px 0;"><span style="color:var(--blue); font-weight:bold;">Sipariş #${o.id}</span> - ${parseFloat(o.total_price).toFixed(2)} TL <br> Durum: ${o.status}</div>`).join('');
    else orderList.innerHTML = "Siparişiniz bulunmuyor.";

    // Pazarlıklar (Dükkana Sattıklarım)
    const myOffers = globalStocks.filter(s => s.seller_id === currentUser.id && (s.trade_status === 'Pazarlıkta' || s.trade_status === 'Satın Alındı'));
    const offerList = document.getElementById("user-negotiation-list");
    
    if(myOffers.length > 0) {
        offerList.innerHTML = myOffers.map(o => {
            let statusHtml = "";
            if(o.trade_status === 'Satın Alındı') {
                statusHtml = `<span style="color:var(--green); font-weight:bold;">✅ Anlaşma Sağlandı! Dükkana Satıldı.</span>`;
            } else if(o.admin_approved && !o.seller_approved) {
                statusHtml = `<div style="margin-top:5px; padding:5px; background:rgba(24,119,242,0.1); border-radius:4px;">
                    <strong>Dükkanın Karşı Teklifi: <span style="color:var(--blue);">${o.admin_price} TL</span></strong><br>
                    <div style="display:flex; gap:5px; margin-top:5px;">
                        <button style="flex:1; background:var(--green); padding:5px;" onclick="customerAcceptAdminPrice(${o.id}, ${o.admin_price})">Kabul Et</button>
                        <input type="number" id="new-cust-price-${o.id}" placeholder="Yeni Fiyat" style="width:80px; padding:5px;">
                        <button style="background:var(--orange); padding:5px;" onclick="customerCounterOffer(${o.id})">Gönder</button>
                    </div>
                </div>`;
            } else {
                statusHtml = `<span style="color:var(--orange);">⏳ Dükkanın incelemesi / onayı bekleniyor...</span>`;
            }
            return `<div style="border-bottom:1px solid var(--border-color); padding:10px 0;">
                <strong>${o.brand_name} ${o.capacity_gb}GB ${o.model}"</strong> (${o.stock_count} Adet)<br>
                Sizin İstediğiniz Fiyat: <strong>${o.seller_price} TL</strong><br>
                ${statusHtml}
            </div>`;
        }).join('');
    } else offerList.innerHTML = "Aktif pazarlığınız bulunmuyor.";
}

window.customerAcceptAdminPrice = async function(id, price) {
    await _supabase.from('stocks').update({ seller_price: price, seller_approved: true, trade_status: 'Satın Alındı' }).eq('id', id);
    showToast("Anlaşma sağlandı! Ürün dükkana satıldı.", "success");
}

window.customerCounterOffer = async function(id) {
    const newPrice = parseFloat(document.getElementById(`new-cust-price-${id}`).value);
    await _supabase.from('stocks').update({ seller_price: newPrice, seller_approved: true, admin_approved: false }).eq('id', id);
    showToast("Yeni teklifiniz dükkana iletildi.", "info");
}

// ==========================================
// 7. YÖNETİCİ PAZARLIK VE ONAY İŞLEMLERİ
// ==========================================
function renderAdminPazarlik() {
    const tbody = document.getElementById("admin-pazarlik-tbody");
    if(!tbody) return;
    const offers = globalStocks.filter(s => s.trade_status === 'Pazarlıkta');
    
    tbody.innerHTML = offers.map(o => `<tr>
        <td style="font-size:11px; color:var(--text-muted);">${o.seller_id.substring(0,8)}...</td>
        <td><strong>${o.brand_name}</strong> ${o.capacity_gb}GB ${o.model}"</td>
        <td>${o.stock_count}</td>
        <td style="color:var(--orange); font-weight:bold;">${o.seller_price} TL</td>
        <td><input type="number" id="admin-price-input-${o.id}" value="${o.admin_price > 0 ? o.admin_price : o.seller_price}" style="width:80px; padding:5px;"> TL</td>
        <td>${(o.seller_approved && !o.admin_approved) ? '🟡 İnceleme Bekliyor' : '⏳ Müşteri Cevabı Bekleniyor'}</td>
        <td><button onclick="adminOfferPrice(${o.id})" style="padding:6px; font-size:12px; background:var(--blue);">Teklif Ver / Onayla</button></td>
    </tr>`).join('');
    if(offers.length === 0) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">Bekleyen teklif yok.</td></tr>`;
}

window.adminOfferPrice = async function(id) {
    const price = parseFloat(document.getElementById(`admin-price-input-${id}`).value);
    const stock = globalStocks.find(s => s.id === id);
    if(price === stock.seller_price) {
        // Fiyatlar aynıysa direkt anlaşma sağlansın
        await _supabase.from('stocks').update({ admin_price: price, admin_approved: true, trade_status: 'Satın Alındı' }).eq('id', id);
        showToast("Teklif onaylandı, ürün satın alındı!", "success");
    } else {
        // Dükkan farklı fiyat girdiyse müşterinin onayı gerekir
        await _supabase.from('stocks').update({ admin_price: price, admin_approved: true, seller_approved: false }).eq('id', id);
        showToast("Karşı teklif müşteriye sunuldu.", "info");
    }
}

function renderAdminSatinAlinan() {
    const tbody = document.getElementById("admin-satin-alinan-tbody");
    if(!tbody) return;
    const purchased = globalStocks.filter(s => s.trade_status === 'Satın Alındı');
    
    tbody.innerHTML = purchased.map(p => `<tr>
        <td><strong>${p.brand_name}</strong> ${p.capacity_gb}GB ${p.model}"</td>
        <td>${p.stock_count}</td>
        <td style="color:var(--red); font-weight:bold;">${p.admin_price} TL</td>
        <td><input type="text" id="new-barcode-${p.id}" placeholder="SB-${p.id}" style="width:100px; padding:5px;"></td>
        <td><input type="number" id="new-sale-price-${p.id}" placeholder="Fiyat Girin" style="width:80px; padding:5px;"></td>
        <td><button onclick="adminPutOnSale(${p.id}, ${p.admin_price})" style="padding:6px; font-size:12px; background:var(--green);">Vitrine Koy</button></td>
    </tr>`).join('');
    if(purchased.length === 0) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Henüz satın alınan ürün yok.</td></tr>`;
}

window.adminPutOnSale = async function(id, buyPrice) {
    const barcode = document.getElementById(`new-barcode-${id}`).value || `SB-${id}`;
    const salePrice = parseFloat(document.getElementById(`new-sale-price-${id}`).value);
    if(!salePrice) { showToast("Vitrine koymak için Müşteri Satış Fiyatı girmelisiniz!", "error"); return; }
    
    await _supabase.from('stocks').update({ barcode: barcode, price: buyPrice, sale_price: salePrice, trade_status: 'Satışta' }).eq('id', id);
    showToast("Ürün başarıyla vitrine (Stoklara) aktarıldı!", "success");
}

function renderAdminStok() {
    const tbody = document.getElementById("table-healthy-body");
    if (!tbody) return;
    tbody.innerHTML = globalStocks.filter(s => s.trade_status === 'Satışta').map(s => `<tr>
        <td>${s.barcode}</td><td><strong>${s.brand_name}</strong></td><td>${s.capacity_gb} GB</td><td>${s.model}"</td>
        <td><span style="font-weight:bold; color:${s.stock_count > 0 ? 'var(--text-main)' : 'var(--red)'}">${s.stock_count}</span></td>
        <td>${s.price} TL</td><td style="color:var(--green)">${s.sale_price} TL</td>
        <td><button onclick="deleteStock(${s.id})" style="background:var(--red); padding:5px 10px; font-size:11px;">Sil</button></td>
    </tr>`).join('');
}

// ==========================================
// 8. DİĞER YÖNETİCİ STANDART İŞLEMLERİ
// ==========================================
window.addNewStock = async function(e) {
    e.preventDefault();
    await _supabase.from('stocks').insert({
        barcode: document.getElementById("prod-barcode").value, brand_name: document.getElementById("prod-brand").value,
        capacity_gb: parseInt(document.getElementById("prod-capacity").value), model: document.getElementById("prod-inch").value,
        stock_count: parseInt(document.getElementById("prod-stock").value), price: parseFloat(document.getElementById("prod-price").value),
        sale_price: parseFloat(document.getElementById("prod-sale-price").value), status: "%100", trade_status: 'Satışta'
    });
    document.getElementById("add-stock-form").reset();
}

window.barcodeSaleStockDrop = async function(e) {
    e.preventDefault();
    const input = document.getElementById("scan-barcode-input");
    const stock = globalStocks.find(s => s.barcode === input.value.trim() && s.trade_status === 'Satışta');
    if (stock && stock.stock_count > 0) {
        await _supabase.from('stocks').update({ stock_count: stock.stock_count - 1 }).eq('id', stock.id);
        let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
        allSales.push({ barcode: stock.barcode, title: stock.brand_name, session: document.getElementById("active-sale-session").value, count: 1, price: stock.sale_price, buy_price: stock.price, date: new Date().toLocaleDateString('tr-TR') });
        localStorage.setItem("erdem_bilisim_sales_logs", JSON.stringify(allSales));
        input.value = ""; renderReportTabs();
    }
}
window.deleteStock = async function(id) { if(confirm("Emin misiniz?")) await _supabase.from('stocks').delete().eq('id', id); }

// ==========================================
// 9. SEPET VE SİPARİŞ TAMAMLAMA
// ==========================================
window.addToCart = function(id, brand, capacity, price) {
    const existing = shoppingCart.find(i => i.id === id);
    if(existing) existing.qty += 1; else shoppingCart.push({ id, brand, capacity, price, qty: 1 });
    updateCartUI(); showToast(`${brand} sepete eklendi!`);
}
function updateCartUI() {
    document.getElementById("header-cart-count").innerText = shoppingCart.reduce((s, i) => s + i.qty, 0);
    const list = document.getElementById("cart-items-list"); let total = 0;
    list.innerHTML = shoppingCart.map((i, idx) => {
        let rTotal = i.qty * i.price; total += rTotal;
        return `<div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding:10px 0;"><div><strong>${i.brand} ${i.capacity}GB</strong><br><span style="font-size:12px;">${i.qty} x ${i.price} TL</span></div><div style="text-align:right;"><strong style="color:var(--blue);">${rTotal} TL</strong><br><button onclick="removeFromCart(${idx})" style="background:none; border:none; color:var(--red); font-size:12px;">Kaldır</button></div></div>`;
    }).join('');
    document.getElementById("cart-total-price").innerText = `Toplam: ${total.toFixed(2)} TL`;
}
window.removeFromCart = function(idx) { shoppingCart.splice(idx, 1); updateCartUI(); }
window.toggleCartModal = function() { toggleGenericModal('cart-modal'); }

window.checkout = async function() {
    if(shoppingCart.length === 0) return;
    if(!currentUser) { showToast("Önce giriş yapın.", "error"); toggleGenericModal('cart-modal'); toggleGenericModal('auth-modal'); return; }
    
    const total = shoppingCart.reduce((s, i) => s + (i.qty * i.price), 0);
    const { error } = await _supabase.from('orders').insert({ user_id: currentUser.id, items: shoppingCart, total_price: total });
    if(!error) {
        for (let item of shoppingCart) {
            const stock = globalStocks.find(s => s.id === item.id);
            if(stock) await _supabase.from('stocks').update({ stock_count: Math.max(0, stock.stock_count - item.qty) }).eq('id', item.id);
        }
        showToast("Sipariş başarıyla alındı!", "success"); shoppingCart = []; updateCartUI(); toggleGenericModal('cart-modal');
    }
}

// Raporlar (BI)
function renderReportTabs() {
    const tabsContainer = document.getElementById("dynamic-report-tabs"); if (!tabsContainer) return;
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    let sessions = [...new Set(allSales.map(s => s.session))]; if (sessions.length === 0) sessions = ["Satış 1"];
    if (!sessions.includes(currentActiveReportTab)) currentActiveReportTab = sessions[0];
    tabsContainer.innerHTML = sessions.map(s => `<button style="padding:5px 10px; border-radius:4px; border:none; background:${s === currentActiveReportTab ? 'var(--blue)' : '#ccc'}; color:${s === currentActiveReportTab ? 'white' : 'black'};" onclick="currentActiveReportTab='${s}'; renderReportTabs()">${s}</button>`).join('');
    
    const tbody = document.getElementById("reports-tbody");
    let filteredSales = allSales.filter(s => s.session === currentActiveReportTab);
    tbody.innerHTML = filteredSales.map(sale => `<tr><td>${sale.barcode}</td> <td>${sale.title}</td> <td>${sale.session}</td> <td>${sale.count}</td> <td>${sale.price} TL</td> <td style="color:var(--green); font-weight:bold;">${sale.count * sale.price} TL</td></tr>`).join('');
    calculateBusinessIntelligence();
}
window.clearSalesLogs = function() { if(confirm("Tüm rapor geçmişi silinecek!")) { localStorage.removeItem("erdem_bilisim_sales_logs"); renderReportTabs(); } }

window.calculateBusinessIntelligence = function() {
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    let dProfit = 0, wTurnover = 0, bSales = {};
    const today = new Date().toLocaleDateString('tr-TR');
    
    allSales.forEach(s => {
        if(s.date === today) dProfit += ((s.price || 0) - (s.buy_price || 0)) * (s.count || 1);
        wTurnover += (s.price || 0) * (s.count || 1);
        let b = s.title.split(' ')[0] || "Diğer"; bSales[b] = (bSales[b] || 0) + (s.count || 1);
    });
    document.getElementById("bi-daily-profit").innerText = dProfit.toFixed(2) + " TL";
    document.getElementById("bi-weekly-turnover").innerText = wTurnover.toFixed(2) + " TL";
    let topB = "---", max = 0; for(let b in bSales) if(bSales[b] > max) { max = bSales[b]; topB = b; }
    document.getElementById("bi-top-brand").innerText = topB;
}

window.toggleTheme = function() { document.body.classList.toggle('dark-theme'); }
window.showToast = function(msg, type="success") { const c = document.getElementById("toast-container"); const t = document.createElement("div"); t.className = `toast ${type}`; t.innerText = msg; c.appendChild(t); setTimeout(() => t.remove(), 3000); }