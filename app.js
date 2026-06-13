// ==========================================
// 1. BULUT VERİTABANI BAĞLANTI BİLGİLERİ
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
    
    _supabase.auth.onAuthStateChange(async (event, session) => {
        if (session) {
            currentUser = session.user;
            document.getElementById("auth-nav-btn").style.display = "none";
            document.getElementById("user-panel-btn").style.display = "block";
            document.getElementById("notif-btn").style.display = "block";
            fetchNotifications();
            setupNotificationSocket();
        } else {
            currentUser = null;
            document.getElementById("auth-nav-btn").style.display = "block";
            document.getElementById("user-panel-btn").style.display = "none";
            document.getElementById("notif-btn").style.display = "none";
        }
    });

    const { data: { session } } = await _supabase.auth.getSession();
    if (session) currentUser = session.user;

    const isAdmin = (new URLSearchParams(window.location.search).get('mod') === 'ahmet');
    setupPanelsBasedOnRole(isAdmin);
    
    await fetchStocksFromCloud(isAdmin);
    setupRealtimeSocket(isAdmin);
});

function setupPanelsBasedOnRole(isAdmin) {
    if (isAdmin) {
        localStorage.removeItem("erdem_bilisim_locked_role");
        document.getElementById("admin-panel").style.display = "block";
        document.getElementById("barcode-sale-panel").style.display = "block";
        document.getElementById("grand-total-section").style.display = "flex";
        document.getElementById("reports-panel").style.display = "block";
        document.getElementById("bi-dashboard-panel").style.display = "block"; 
        document.getElementById("customer-role-selector").style.display = "none";
        document.getElementById("storefront-panel").style.display = "none"; 
        document.getElementById("header-cart-btn").style.display = "none";
        document.getElementById("admin-status-badge").style.display = "block";

        document.getElementById("container-healthy").style.display = "block";
        document.getElementById("container-low").style.display = "block";
        document.getElementById("container-defective").style.display = "block";

        updateTableHeadersDirect(true); renderReportTabs();
    } else {
        updateTableHeadersDirect(false);
        const savedRole = localStorage.getItem("erdem_bilisim_locked_role");
        if (savedRole) {
            hasSelectedRole = true;
            document.querySelector(`input[name="user-role-radio"][value="${savedRole}"]`).checked = true;
            document.querySelectorAll('input[name="user-role-radio"]').forEach(r => r.disabled = true);
            document.getElementById("customer-role-selector").style.opacity = "0.6";

            if (savedRole === "satici") {
                document.getElementById("customer-seller-panel").style.display = "block";
                document.getElementById("storefront-panel").style.display = "none";
                document.getElementById("header-cart-btn").style.display = "none";
                document.getElementById("container-healthy").style.display = "block";
                document.getElementById("container-low").style.display = "block";
                document.getElementById("container-defective").style.display = "block";
            } else {
                document.getElementById("storefront-panel").style.display = "block";
            }
        }
    }
}

// ==========================================
// CANLI SOKET MOTORLARI (STOK + BİLDİRİM)
// ==========================================
function setupRealtimeSocket(isAdmin) {
    _supabase.channel('public:stocks')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'stocks' }, payload => {
            if (payload.eventType === 'INSERT') globalStocks.push(payload.new);
            else if (payload.eventType === 'UPDATE') { const idx = globalStocks.findIndex(s => s.id === payload.new.id); if(idx > -1) globalStocks[idx] = payload.new; } 
            else if (payload.eventType === 'DELETE') globalStocks = globalStocks.filter(s => s.id !== payload.old.id);
            
            globalStocks.sort((a,b) => a.id - b.id);

            if (isAdmin) { updateTablesByStatus(globalStocks, true); calculateBusinessIntelligence(); } 
            else {
                const role = localStorage.getItem("erdem_bilisim_locked_role") || "alici";
                if(role === 'alici') renderStorefront(globalStocks); else updateTablesByStatus(globalStocks, false);
            }
        }).subscribe();
}

function setupNotificationSocket() {
    if(!currentUser) return;
    _supabase.channel('public:notifications')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_email=eq.${currentUser.email}` }, payload => {
            showToast("🔔 Yeni Bildirim: " + payload.new.message, "success");
            fetchNotifications();
        }).subscribe();
}

async function fetchNotifications() {
    if(!currentUser) return;
    const { data } = await _supabase.from('notifications').select('*').eq('user_email', currentUser.email).order('created_at', { ascending: false });
    const list = document.getElementById("notifications-list");
    const badge = document.getElementById("notif-badge");
    
    if(data && data.length > 0) {
        let unread = data.filter(d => !d.is_read).length;
        if(unread > 0) { badge.style.display = "block"; badge.innerText = unread; } else { badge.style.display = "none"; }
        
        list.innerHTML = data.map(n => `
            <div style="background:${n.is_read ? 'var(--bg-main)' : 'rgba(59, 130, 246, 0.1)'}; padding:10px; border-radius:8px; border-left:3px solid ${n.is_read ? 'transparent' : 'var(--blue)'}; font-size:13px;">
                ${n.message}
                ${!n.is_read ? `<br><button onclick="markNotificationRead(${n.id})" style="background:none; border:none; color:var(--blue); font-size:11px; margin-top:5px; padding:0; cursor:pointer;">Okundu İşaretle</button>` : ''}
            </div>
        `).join('');
    } else {
        list.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">Bildiriminiz bulunmuyor.</p>';
        badge.style.display = "none";
    }
}

window.markNotificationRead = async function(id) {
    await _supabase.from('notifications').update({ is_read: true }).eq('id', id);
    fetchNotifications();
}

async function sendSystemNotification(email, message) {
    await _supabase.from('notifications').insert({ user_email: email, message: message, is_read: false });
}

// ==========================================
// PAROLALI AUTH VE TEKİL İSİM SİSTEMİ
// ==========================================
window.toggleGenericModal = function(id) {
    const m = document.getElementById(id);
    m.style.display = m.style.display === "flex" ? "none" : "flex";
    if (id === 'user-panel-modal' && currentUser) {
        document.getElementById("user-name-display").innerText = currentUser.user_metadata.full_name || "İsimsiz Kullanıcı";
        document.getElementById("user-email-display").innerText = currentUser.email;
        document.getElementById("user-address-display").innerText = "Kayıtlı Adres: " + (currentUser.user_metadata.address || "Adres girilmemiş.");
        fetchUserOrders();
    }
}

window.switchAuthMode = function(mode) {
    document.getElementById("login-form").style.display = "none";
    document.getElementById("register-form").style.display = "none";
    
    if(mode === 'register') { 
        document.getElementById("register-form").style.display = "block"; 
        document.getElementById("auth-title").innerText = "Kayıt Ol"; 
    } else { 
        document.getElementById("login-form").style.display = "block"; 
        document.getElementById("auth-title").innerText = "Giriş Yap"; 
    }
}

window.handleLogin = async function() {
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    
    if(!email || !password) { showToast("Lütfen tüm alanları doldurun.", "error"); return; }
    
    const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
    
    if(error) { showToast("Giriş başarısız. Şifre veya e-posta hatalı.", "error"); } 
    else { showToast("Giriş yapıldı!", "success"); toggleGenericModal('auth-modal'); }
}

window.handleRegister = async function() {
    const fullNameRaw = document.getElementById("reg-fullname").value.trim();
    const fullName = fullNameRaw.toUpperCase(); // Büyük harfe çevirerek benzersizliği sağlama
    const email = document.getElementById("reg-email").value.trim(); 
    const password = document.getElementById("reg-password").value;
    const address = document.getElementById("reg-address").value.trim();

    if(!fullName || !email || !password || !address) { showToast("Lütfen tüm alanları doldurun.", "error"); return; }
    if(password.length < 6) { showToast("Şifreniz en az 6 karakter olmalıdır.", "error"); return; }

    // 1. ADIM: İsim ve Soyisim benzersiz mi kontrol et
    const { data: existingProfile } = await _supabase.from('profiles').select('full_name').eq('full_name', fullName).maybeSingle();
    
    if (existingProfile) {
        showToast("Bu İsim ve Soyisim ile zaten bir hesap oluşturulmuş!", "error");
        return;
    }

    // 2. ADIM: Auth sistemine kayıt
    const { data, error } = await _supabase.auth.signUp({ 
        email, 
        password,
        options: { data: { full_name: fullNameRaw, address: address } } 
    });
    
    if(error) { 
        showToast("Kayıt Hatası: " + error.message, "error"); 
    } else { 
        // 3. ADIM: İsim bloke tablosuna kaydet
        await _supabase.from('profiles').insert({ full_name: fullName, email: email });
        
        showToast("Hesabınız oluşturuldu! Şimdi giriş yapabilirsiniz.", "success");
        switchAuthMode('login'); 
    }
}

window.handleLogout = async function() { await _supabase.auth.signOut(); showToast("Oturum kapatıldı.", "info"); toggleGenericModal('user-panel-modal'); }

window.showToast = function(msg, type="success") { 
    const c = document.getElementById("toast-container"); const t = document.createElement("div"); 
    let icon = type === 'success' ? '✅ ' : '❌ ';
    t.className = `toast ${type}`; t.innerText = icon + msg; c.appendChild(t); setTimeout(() => t.remove(), 4000); 
}
window.toggleTheme = function() { document.body.classList.toggle('dark-theme'); }

window.handleRoleChange = function() {
    if (hasSelectedRole) return;
    hasSelectedRole = true;
    const role = document.querySelector('input[name="user-role-radio"]:checked').value;
    localStorage.setItem("erdem_bilisim_locked_role", role);
    document.querySelectorAll('input[name="user-role-radio"]').forEach(radio => radio.disabled = true);
    document.getElementById("customer-role-selector").style.opacity = "0.6";
    setupPanelsBasedOnRole(false);
    updateTablesByStatus(globalStocks, false);
}

async function fetchStocksFromCloud(isAdmin) {
    const { data, error } = await _supabase.from('stocks').select('*');
    if (error) return;
    globalStocks = data; globalStocks.sort((a, b) => a.id - b.id);
    
    if (isAdmin) { updateTablesByStatus(globalStocks, true); calculateBusinessIntelligence(); } 
    else {
        const role = localStorage.getItem("erdem_bilisim_locked_role") || "alici";
        if(role === 'alici') renderStorefront(globalStocks); else updateTablesByStatus(globalStocks, false);
    }
}

// ==========================================
// PDF FATURA ÇIKTISI & SİPARİŞ ONAYI
// ==========================================
window.generateInvoicePDF = function(items, total, address, customerName) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(22);
    doc.setTextColor(24, 119, 242);
    doc.text("ERDEM BILISIM", 20, 20);
    
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text("Guvenli E-Ticaret ve Stok Sistemi", 20, 28);
    doc.text("Tarih: " + new Date().toLocaleDateString('tr-TR'), 150, 20);
    
    doc.setDrawColor(200, 200, 200);
    doc.line(20, 35, 190, 35);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text("Sayin " + (customerName || "Musterimiz") + ",", 20, 45);
    doc.text("Teslimat Adresi:", 20, 53);
    doc.setFontSize(10);
    const splitAddress = doc.splitTextToSize(address || "Magazadan Teslim", 170);
    doc.text(splitAddress, 20, 60);

    doc.setFontSize(12);
    doc.text("Urun Aciklamasi", 20, 85); doc.text("Adet", 130, 85); doc.text("Fiyat", 160, 85);
    doc.line(20, 88, 190, 88);

    let y = 95;
    items.forEach(item => {
        doc.text(`${item.brand} ${item.capacity}`, 20, y);
        doc.text(`${item.qty}`, 130, y);
        doc.text(`${item.price.toFixed(2)} TL`, 160, y);
        y += 10;
    });

    doc.line(20, y, 190, y);
    doc.setFontSize(16);
    doc.setTextColor(49, 162, 76);
    doc.text(`Genel Toplam: ${total.toFixed(2)} TL`, 120, y + 10);

    doc.save(`Fatura_ErdemBilisim_${new Date().getTime()}.pdf`);
}

window.checkout = async function() {
    if(shoppingCart.length === 0) { showToast("Sepetiniz boş!", "error"); return; }
    if(!currentUser) { showToast("Siparişi tamamlamak için giriş yapmalısınız.", "error"); toggleGenericModal('cart-modal'); toggleGenericModal('auth-modal'); return; }
    
    const total = shoppingCart.reduce((sum, i) => sum + (i.qty * i.price), 0);
    const address = currentUser.user_metadata.address || "Profilde adres yok";
    const fullName = currentUser.user_metadata.full_name || currentUser.email;

    const { error } = await _supabase.from('orders').insert({ user_id: currentUser.id, items: shoppingCart, total_price: total });
    
    if(!error) {
        generateInvoicePDF(shoppingCart, total, address, fullName);

        for (let item of shoppingCart) {
            const stockItem = globalStocks.find(s => s.id === item.id);
            if (stockItem) await _supabase.from('stocks').update({ stock_count: Math.max(0, stockItem.stock_count - item.qty) }).eq('id', item.id);
        }
        
        await sendSystemNotification("admin@erdem.com", `📦 Yeni Sipariş! ${fullName} ${total.toFixed(2)} TL tutarında alışveriş yaptı.`);

        showToast("Sipariş onaylandı! Faturanız cihazınıza indiriliyor.", "success");
        shoppingCart = []; updateCartUI(); toggleGenericModal('cart-modal');
    } else { showToast("Hata oluştu: " + error.message, "error"); }
}

function renderStorefront(stocks) {
    const grid = document.getElementById("products-grid-container");
    if(!grid) return; grid.innerHTML = "";

    stocks.forEach(stock => {
        const currentStatus = (stock.status || "%100").trim();
        const count = parseInt(stock.stock_count || 0);
        if ((currentStatus !== "%100" && currentStatus !== "Sağlıklı") || count <= 0) return;

        let formattedCapacity = parseInt(stock.capacity_gb) >= 1000 ? (parseInt(stock.capacity_gb)/1000 + " TB") : (stock.capacity_gb + " GB");
        let imageUrl = stock.image_url || "https://images.unsplash.com/photo-1597849016254-4fb9f82d2eb5?auto=format&fit=crop&w=400&q=80";

        const card = document.createElement("div"); card.className = "product-card";
        card.innerHTML = `
            <img src="${imageUrl}" class="product-img" alt="${stock.brand_name} Disk">
            <div class="prod-brand">${stock.brand_name}</div>
            <div class="prod-specs">${formattedCapacity} • ${stock.model}" Form</div>
            <div style="font-size: 12px; color: var(--orange);">Stokta: ${count} Adet</div>
            <div class="prod-price">${parseFloat(stock.sale_price).toFixed(2)} TL</div>
            <button class="btn-add-cart" onclick="addToCart(${stock.id}, '${stock.brand_name}', '${formattedCapacity}', ${stock.sale_price})">🛒 Sepete Ekle</button>
        `;
        grid.appendChild(card);
    });
    if(grid.innerHTML === "") grid.innerHTML = "<p style='color: var(--text-muted);'>Şu an vitrinde satılık ürün bulunmuyor.</p>";
}

window.addToCart = function(id, brand, capacity, price) {
    const existing = shoppingCart.find(item => item.id === id);
    if(existing) existing.qty += 1; else shoppingCart.push({ id, brand, capacity, price, qty: 1 });
    updateCartUI(); showToast(`${brand} ${capacity} sepete eklendi!`, "success");
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
            list.innerHTML += `<div class="cart-item"><div><strong>${item.brand} ${item.capacity}</strong><br><span style="font-size:12px; color:var(--text-muted);">${item.qty} Adet x ${item.price.toFixed(2)} TL</span></div><div style="text-align:right;"><strong style="color:var(--blue);">${rowTotal.toFixed(2)} TL</strong><br><button onclick="removeFromCart(${index})" style="background:none; border:none; color:var(--red); font-size:12px; margin-top:5px; cursor:pointer;">Kaldır</button></div></div>`;
        });
    }
    totalEl.innerText = `Toplam: ${grandTotal.toFixed(2)} TL`;
}
window.removeFromCart = function(index) { shoppingCart.splice(index, 1); updateCartUI(); }
window.toggleCartModal = function() { toggleGenericModal('cart-modal'); }

async function fetchUserOrders() {
    const { data } = await _supabase.from('orders').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
    const list = document.getElementById("user-orders-list");
    if(data && data.length > 0) {
        list.innerHTML = data.map(o => `<div style="border-bottom:1px solid var(--border-color); padding:8px 0;"><span style="color:var(--blue); font-weight:bold;">Sipariş #${o.id}</span> - ${parseFloat(o.total_price).toFixed(2)} TL<br><span style="font-size:11px; color:var(--orange);">Durum: Onaylandı, Adrese Kargolanacak</span></div>`).join('');
    } else list.innerHTML = "Siparişiniz bulunmuyor.";
}

// ==========================================
// YÖNETİCİ & SATICI: TEKLİF VE BİLDİRİM MANTIĞI
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
        if (isAdmin) theadRow.innerHTML = `<th>Barkod</th> <th>Marka</th> <th>Kapasite</th> <th>Stok</th> <th style="color:var(--green);">Teklif Durumu</th> <th style="color:var(--blue);">Alış Fiyatı</th> <th>Satış Fiyatı</th> <th>İşlemler</th>`;
        else theadRow.innerHTML = `<th>Barkod</th> <th>Marka</th> <th>Kapasite</th> <th style="color:var(--orange);">Satıcı (Siz)</th> <th style="color:var(--green);">Alıcı (Yönetici)</th> <th>İşlemler</th>`;
    });
}

function updateTablesByStatus(stocks, isAdmin) {
    const healthyBody = document.querySelector("#table-healthy tbody"); const lowBody = document.querySelector("#table-low tbody"); const defectiveBody = document.querySelector("#table-defective tbody");
    if (healthyBody) healthyBody.innerHTML = ""; if (lowBody) lowBody.innerHTML = ""; if (defectiveBody) defectiveBody.innerHTML = "";

    stocks.forEach(stock => {
        const currentStatus = (stock.status || "%100").trim();
        const count = parseInt(stock.stock_count || 0);
        const parsedOffers = parseOfferNotes(stock.offer_notes);
        let capFormat = parseInt(stock.capacity_gb) >= 1000 ? (parseInt(stock.capacity_gb)/1000 + " TB") : (stock.capacity_gb + " GB");
        const role = localStorage.getItem("erdem_bilisim_locked_role");
        
        if (!isAdmin && role !== "satici" && currentStatus !== "%100" && currentStatus !== "Sağlıklı") return;

        const row = document.createElement("tr");
        if (isAdmin) {
            row.innerHTML = `
                <td>${stock.barcode === "Müşteri Arzı" ? `<span style="color:var(--orange); font-weight:bold;">DIŞ ARZ</span>` : stock.barcode}</td> 
                <td><strong>${stock.brand_name}</strong></td> <td>${capFormat}</td>
                <td><span id="stock-count-${stock.id}">${count}</span></td>
                <td><span style="font-size:12px;">S: ${parsedOffers.seller}</span><br><span style="font-size:12px; color:var(--green);">Y: ${parsedOffers.buyer}</span></td>
                <td style="color:var(--blue);"><input type="number" id="input-ALIS-${stock.id}" value="${stock.price}" style="width:70px; padding:4px;"><button class="btn-edit-offer" onclick="submitDirectPrice(${stock.id}, 'ALIS')">Kaydet</button></td>
                <td><input type="number" id="input-SATIS-${stock.id}" value="${stock.sale_price}" style="width:70px; padding:4px;"><button class="btn-edit-offer" onclick="submitDirectPrice(${stock.id}, 'SATIS')">Kaydet</button></td>
                <td>
                    ${stock.barcode === "Müşteri Arzı" ? `<button class="btn-approve" onclick="approveOfferAdmin(${stock.id}, '${parsedOffers.seller}')">✅ Teklifi Onayla (Bildirim At)</button>` : ''}
                    <button class="btn-action btn-delete" onclick="deleteStockFromCloud(${stock.id})">Sil</button>
                </td>
            `;
        } else {
            row.innerHTML = `
                <td>${stock.barcode}</td> <td><strong>${stock.brand_name}</strong></td> <td>${capFormat}</td>
                <td style="color:var(--orange); font-size:12px;">${parsedOffers.seller}</td>
                <td style="color:var(--green); font-weight:bold;">${parsedOffers.buyer !== "Yok" ? parsedOffers.buyer : "Bekleniyor..."}</td>
                <td>
                    ${parsedOffers.buyer !== "Yok" && !parsedOffers.buyer.includes("ONAYLANDI") ? `<button class="btn-approve" onclick="acceptAdminOffer(${stock.id})">✅ Yönetici Teklifini Kabul Et</button>` : ''}
                    ${stock.barcode === "Müşteri Arzı" ? `<button class="btn-action btn-delete" onclick="deleteStockFromCloud(${stock.id})">İptal Et</button>` : ''}
                </td>
            `;
        }
        if (currentStatus === "%100" || currentStatus === "Sağlıklı") { if(healthyBody) healthyBody.appendChild(row); }
        else if (currentStatus === "Sağlığı Düşük") { if(lowBody) lowBody.appendChild(row); }
        else { if(defectiveBody) defectiveBody.appendChild(row); }
    });
}

// BİLDİRİM GÖNDERMELİ ONAY SİSTEMLERİ
window.approveOfferAdmin = async function(id, sellerNote) {
    const offerPrice = document.getElementById(`input-ALIS-${id}`).value;
    const adminNote = `ONAYLANDI - Alış Fiyatı: ${offerPrice} TL`;
    
    await _supabase.from('stocks').update({ offer_notes: `ALICI: ${adminNote} || SATICI: ${sellerNote}`, price: offerPrice }).eq('id', id);
    showToast("Teklif onaylandı, satıcıya bildirim gönderildi.", "success");
}

window.acceptAdminOffer = async function(id) {
    const stockItem = globalStocks.find(s => s.id === id);
    const parsed = parseOfferNotes(stockItem.offer_notes);
    await _supabase.from('stocks').update({ offer_notes: `ALICI: SATICI TARAFINDAN KABUL EDİLDİ || SATICI: ${parsed.seller}` }).eq('id', id);
    
    if(currentUser) {
        await sendSystemNotification("admin@erdem.com", `🤝 Teklif Kabul Edildi! ${currentUser.user_metadata.full_name} kullanıcısı ${stockItem.brand_name} diski için sunduğunuz fiyatı onayladı.`);
    }
    showToast("Teklif kabul edildi! Yöneticiye bilgi iletildi.", "success");
}

window.submitNewOfferFromSeller = async function(event) {
    event.preventDefault();
    if(!currentUser) { showToast("Teklif verebilmek için giriş yapmalısınız.", "error"); toggleGenericModal('auth-modal'); return; }
    
    const fullName = currentUser.user_metadata.full_name || currentUser.email;
    const offerNotes = `ALICI: Yok || SATICI: ${document.getElementById("offer-count").value} Adet - İstenen Fiyat: ${document.getElementById("offer-price").value} TL - İletişim: ${fullName}`;
    
    await _supabase.from('stocks').insert({
        barcode: "Müşteri Arzı", brand_name: document.getElementById("offer-brand").value, capacity_gb: parseInt(document.getElementById("offer-capacity").value), model: document.getElementById("offer-inch").value, stock_count: parseInt(document.getElementById("offer-count").value), price: 0, sale_price: 0, offer_notes: offerNotes, status: document.getElementById("offer-status").value
    });
    
    await sendSystemNotification("admin@erdem.com", `📦 Yeni Arz Teklifi! ${fullName} tarafından yeni bir disk satışı teklifi geldi.`);
    document.getElementById("customer-offer-form").reset(); showToast("Teklifiniz dükkan yönetimine iletildi.", "success");
}

window.submitDirectPrice = async function(id, type) {
    const inputVal = parseFloat(document.getElementById(`input-${type}-${id}`).value || 0);
    let payload = type === 'ALIS' ? { price: inputVal } : { sale_price: inputVal };
    await _supabase.from('stocks').update(payload).eq('id', id);
    showToast("Fiyat güncellendi", "success");
}

window.addNewStock = async function(event) {
    event.preventDefault();
    await _supabase.from('stocks').insert({
        barcode: document.getElementById("prod-barcode").value, brand_name: document.getElementById("prod-brand").value,
        capacity_gb: parseInt(document.getElementById("prod-capacity").value), model: document.getElementById("prod-inch").value, 
        stock_count: parseInt(document.getElementById("prod-stock").value), price: parseFloat(document.getElementById("prod-price").value || 0),
        sale_price: parseFloat(document.getElementById("prod-sale-price").value || 0), offer_notes: "ALICI: Yok || SATICI: Yok", 
        status: document.getElementById("prod-status").value, image_url: document.getElementById("prod-image-url").value.trim()
    });
    document.getElementById("add-stock-form").reset();
}

window.deleteStockFromCloud = async function(id) { if(confirm("Silmek istediğinize emin misiniz?")) await _supabase.from('stocks').delete().eq('id', id); }

// ==========================================
// BARKOD OKUTMA VE HIZLI PDF ÇIKTISI
// ==========================================
window.barcodeSaleStockDrop = async function(event) {
    event.preventDefault();
    const barcodeInput = document.getElementById("scan-barcode-input");
    const scannedBarcode = barcodeInput.value.trim();
    const targetSession = document.getElementById("active-sale-session").value.trim() || "Varsayılan Satış";
    if (!scannedBarcode) return;

    const matchedStock = globalStocks.find(s => s.barcode && s.barcode.trim() === scannedBarcode);
    if (!matchedStock || parseInt(matchedStock.stock_count || 0) <= 0) { showToast("Stok bulunamadı veya yetersiz!", "error"); barcodeInput.value = ""; return; }

    const { error } = await _supabase.from('stocks').update({ stock_count: matchedStock.stock_count - 1 }).eq('id', matchedStock.id);

    if (!error) {
        let capFormat = parseInt(matchedStock.capacity_gb) >= 1000 ? (parseInt(matchedStock.capacity_gb)/1000 + "TB") : (matchedStock.capacity_gb + "GB");
        saveSaleToSessionLogs(scannedBarcode, matchedStock.brand_name, `${capFormat} ${matchedStock.model}"`, targetSession, parseFloat(matchedStock.sale_price || 0));
        barcodeInput.value = ""; barcodeInput.focus();
        showToast("Ürün satıldı! Stoktan düşüldü.", "success");
        renderReportTabs(); 

        if(confirm("Müşteriye PDF Fatura verilsin mi?")) {
            generateInvoicePDF([{brand: matchedStock.brand_name, capacity: capFormat, qty: 1, price: matchedStock.sale_price}], matchedStock.sale_price, "Mağazadan Elden Teslim", "Müşteri");
        }
    }
}

function saveSaleToSessionLogs(barcode, brand, desc, sessionName, salePrice) {
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    let existingIndex = allSales.findIndex(s => s.barcode === barcode && s.session === sessionName);
    if (existingIndex > -1) allSales[existingIndex].count += 1;
    else allSales.push({ barcode, title: `${brand} ${desc}`, session: sessionName, count: 1, price: salePrice, date: new Date().toLocaleDateString('tr-TR') });
    localStorage.setItem("erdem_bilisim_sales_logs", JSON.stringify(allSales));
}

function renderReportTabs() {
    const tabsContainer = document.getElementById("dynamic-report-tabs"); if (!tabsContainer) return;
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    let sessions = [...new Set(allSales.map(s => s.session))];
    if (sessions.length === 0) sessions = ["Satış 1"];
    if (!sessions.includes(currentActiveReportTab)) currentActiveReportTab = sessions[0];

    tabsContainer.innerHTML = "";
    sessions.forEach(sessionName => {
        const btn = document.createElement("button"); btn.className = `tab-btn ${sessionName === currentActiveReportTab ? "active" : ""}`;
        btn.innerText = sessionName; btn.onclick = () => { currentActiveReportTab = sessionName; renderReportTabs(); };
        tabsContainer.appendChild(btn);
    });
    renderSalesReport(); calculateBusinessIntelligence(); 
}

function renderSalesReport() {
    const tbody = document.getElementById("reports-tbody"); if (!tbody) return;
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    let filteredSales = allSales.filter(s => s.session === currentActiveReportTab);
    
    if (filteredSales.length === 0) { tbody.innerHTML = `<tr><td colspan="6" style="color:var(--text-muted); text-align:center;">Bu oturumda satış yok.</td></tr>`; return; }
    
    tbody.innerHTML = ""; let totalSessionRevenue = 0;
    filteredSales.forEach(sale => {
        const rowTotal = sale.count * sale.price; totalSessionRevenue += rowTotal;
        tbody.innerHTML += `<tr><td style="font-family: monospace;">${sale.barcode}</td> <td>${sale.title}</td> <td><span style="background:var(--blue); color:white; padding:4px 8px; border-radius:4px; font-size:12px;">${sale.session}</span></td> <td><strong>${sale.count} Adet</strong></td> <td>${sale.price.toFixed(2)} TL</td> <td style="color:var(--green); font-weight:bold;">${rowTotal.toFixed(2)} TL</td></tr>`;
    });
    tbody.innerHTML += `<tr style="background:var(--bg-main); font-weight:bold;"><td colspan="5" style="text-align:right;">Oturum Toplamı:</td><td style="color:var(--green); font-size:16px;">${totalSessionRevenue.toFixed(2)} TL</td></tr>`;
}

window.clearSalesLogs = function() {
    if(confirm("Tüm oturumların rapor geçmişi silinecek, emin misin?")) {
        localStorage.removeItem("erdem_bilisim_sales_logs"); currentActiveReportTab = "Satış 1"; document.getElementById("active-sale-session").value = "Satış 1"; renderReportTabs();
    }
}

window.calculateBusinessIntelligence = function() {
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    const todayStr = new Date().toLocaleDateString('tr-TR');
    let dailyProfit = 0; let weeklyTurnover = 0; let brandSales = {};
    
    allSales.forEach(sale => {
        const stockRef = globalStocks.find(s => s.barcode === sale.barcode);
        const buyPrice = stockRef ? parseFloat(stockRef.price || 0) : 0;
        const count = sale.count || 1; const salePrice = parseFloat(sale.price || 0);
        if (sale.date === todayStr) dailyProfit += ((salePrice - buyPrice) * count);
        weeklyTurnover += (salePrice * count);
        let brand = sale.title.split(' ')[0] || "Diğer"; brandSales[brand] = (brandSales[brand] || 0) + count;
    });

    if(document.getElementById("bi-daily-profit")) document.getElementById("bi-daily-profit").innerText = dailyProfit.toFixed(2) + " TL";
    if(document.getElementById("bi-weekly-turnover")) document.getElementById("bi-weekly-turnover").innerText = weeklyTurnover.toFixed(2) + " TL";
    
    let topBrand = "---", maxBrandVal = 0;
    for (let b in brandSales) { if (brandSales[b] > maxBrandVal) { maxBrandVal = brandSales[b]; topBrand = b; } }
    if(document.getElementById("bi-top-brand")) document.getElementById("bi-top-brand").innerText = topBrand;
}