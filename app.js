// ==========================================
// 1. BULUT VERİTABANI BAĞLANTI BİLGİLERİ
// ==========================================
const SUPABASE_URL = "https://zwayidssoujhrjxzgdql.supabase.co/rest/v1"; 
const SUPABASE_KEY = "sb_publishable_wHYCLbDylFN9wnRXuGCmFg_cl1OPZAC"; 

let globalStocks = [];
let shoppingCart = []; 
let currentActiveReportTab = "Satış 1";
let hasSelectedRole = false; 

// ==========================================
// 2. SAYFA YÜKLENDİĞİNDE YETKİ KONTROLÜ
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
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
        adminPanel.style.display = "block";
        barcodeSaleSection.style.display = "block";
        grandTotalSection.style.display = "flex";
        reportsSection.style.display = "block";
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
                
                // Satıcı kendi arzlarını görebilsin diye tabloları aç
                containerHealthy.style.display = "block";
                containerLow.style.display = "block";
                containerDefective.style.display = "block";
            } else {
                // Alıcı (Vitrin)
                storefrontPanel.style.display = "block";
            }
        }
    }

    fetchStocksFromCloud(isAdmin);
});

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
        } else {
            const role = localStorage.getItem("erdem_bilisim_locked_role") || document.querySelector('input[name="user-role-radio"]:checked').value;
            if(role === 'alici') {
                renderStorefront(globalStocks);
            } else {
                updateTablesByStatus(globalStocks, false);
            }
        }
    } catch (error) {
        console.error(error);
    }
}

// ==========================================
// 5. MÜŞTERİ: VİTRİN VE SEPET MANTIĞI
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

        const card = document.createElement("div");
        card.className = "product-card";
        
        let icon = inch.includes("M.2") ? "🎛️" : "💾";

        card.innerHTML = `
            <div class="product-img-placeholder">${icon}</div>
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
    if(existing) {
        existing.qty += 1;
    } else {
        shoppingCart.push({ id, brand, capacity, price, qty: 1 });
    }
    updateCartUI();
    alert(`${brand} ${capacity} sepete eklendi!`);
}

function updateCartUI() {
    const totalItems = shoppingCart.reduce((sum, item) => sum + item.qty, 0);
    document.getElementById("header-cart-count").innerText = totalItems;

    const list = document.getElementById("cart-items-list");
    const totalEl = document.getElementById("cart-total-price");
    
    list.innerHTML = "";
    let grandTotal = 0;

    if(shoppingCart.length === 0) {
        list.innerHTML = "<p>Sepetiniz şu an boş.</p>";
    } else {
        shoppingCart.forEach((item, index) => {
            const rowTotal = item.qty * item.price;
            grandTotal += rowTotal;
            list.innerHTML += `
                <div class="cart-item">
                    <div>
                        <strong>${item.brand} ${item.capacity}</strong><br>
                        <span style="font-size:12px; color:var(--text-muted);">${item.qty} Adet x ${item.price.toFixed(2)} TL</span>
                    </div>
                    <div style="text-align:right;">
                        <strong style="color:var(--blue);">${rowTotal.toFixed(2)} TL</strong><br>
                        <button onclick="removeFromCart(${index})" style="background:none; border:none; color:var(--red); padding:0; font-size:12px; margin-top:5px; cursor:pointer;">Kaldır</button>
                    </div>
                </div>
            `;
        });
    }
    totalEl.innerText = `Toplam: ${grandTotal.toFixed(2)} TL`;
}

window.removeFromCart = function(index) { shoppingCart.splice(index, 1); updateCartUI(); }
window.toggleCartModal = function() {
    const modal = document.getElementById("cart-modal");
    modal.style.display = modal.style.display === "flex" ? "none" : "flex";
}
window.checkout = function() {
    if(shoppingCart.length === 0) { alert("Sepetiniz boş!"); return; }
    alert("Sanal POS entegrasyonu (PayTR vb.) alındığında burası aktifleşecek.");
}

// ==========================================
// 6. YÖNETİCİ & SATICI TABLOLARI (ESKİ SİSTEM)
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
            theadRow.innerHTML = `
                <th>Barkod / Tür</th> <th>Marka</th> <th>Kapasite</th> <th>İnç</th>
                <th>Stok</th> <th style="color:var(--green);">Müşteri Alıcı Teklifi</th>
                <th style="color:var(--orange);">Gelen Satıcı Arzı</th>
                <th style="color:var(--blue);">Alış Fiyatı</th> <th>Satış Fiyatı</th>
                <th>Toplam Maliyet</th> <th>İşlemler</th>
            `;
        } else {
            theadRow.innerHTML = `
                <th>Barkod</th> <th>Marka</th> <th>Kapasite</th> <th>İnç</th>
                <th>Stok</th> <th style="color:var(--green);">Satış Fiyatı</th>
                <th style="color:var(--orange);">Alış Fiyatı</th> <th>Teklif Durumunuz</th> <th>İşlemler</th>
            `;
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
        if (isAdmin && stock.barcode === "Müşteri Arzı") {
            row.style.background = "rgba(249, 115, 22, 0.05)";
        }

        const totalBuyRow = count * buyPrice;
        const totalSellRow = count * sellPrice;

        if (currentStatus === "%100" || currentStatus === "Sağlıklı") { healthyTotals.buy += totalBuyRow; healthyTotals.sell += totalSellRow; }
        else if (currentStatus === "Sağlığı Düşük") { lowTotals.buy += totalBuyRow; lowTotals.sell += totalSellRow; }
        else { defectiveTotals.buy += totalBuyRow; defectiveTotals.sell += totalSellRow; }

        if (isAdmin) {
            const bNotice = parsedOffers.buyer !== "Yok" ? `<span style="background:var(--orange); color:#fff; padding:2px; border-radius:3px; font-size:10px;">YENİ</span> ` : "";
            const sNotice = parsedOffers.seller !== "Yok" ? `<span style="background:var(--orange); color:#fff; padding:2px; border-radius:3px; font-size:10px;">TEKLİF</span> ` : "";
            let bDisp = stock.barcode === "Müşteri Arzı" ? `<span style="color:var(--orange); font-weight:bold;">DIŞ ARZ</span>` : `<span>${stock.barcode}</span>`;

            row.innerHTML = `
                <td>${bDisp}</td> <td><strong>${stock.brand_name}</strong></td>
                <td>${capFormat}</td> <td><strong>${stock.model}"</strong></td>
                <td><span id="stock-count-${stock.id}" style="font-weight:bold;">${count}</span></td>
                
                <td style="color:var(--green);">
                    <div id="display-ALICI-${stock.id}">${bNotice}${parsedOffers.buyer} <button class="btn-edit-offer" onclick="showInlineInput(${stock.id}, 'ALICI')">✍️</button></div>
                    <div id="edit-ALICI-${stock.id}" style="display:none; gap:5px;"><input type="text" id="input-ALICI-${stock.id}" value="${parsedOffers.buyer}"><button onclick="submitInlineOffer(${stock.id}, 'ALICI')">✔️</button></div>
                </td>
                <td style="color:var(--orange);">${sNotice}${parsedOffers.seller}</td>
                <td style="color:var(--blue);">
                    <div id="display-ALIS-${stock.id}"><strong>${buyPrice.toFixed(2)} TL</strong> <button class="btn-edit-offer" onclick="showInlineInput(${stock.id}, 'ALIS')">✍️</button></div>
                    <div id="edit-ALIS-${stock.id}" style="display:none; gap:5px;"><input type="number" id="input-ALIS-${stock.id}" value="${buyPrice}"><button onclick="submitDirectPrice(${stock.id}, 'ALIS')">✔️</button></div>
                </td>
                <td style="color:var(--green);">
                    <div id="display-SATIS-${stock.id}"><strong>${sellPrice.toFixed(2)} TL</strong> <button class="btn-edit-offer" onclick="showInlineInput(${stock.id}, 'SATIS')">✍️</button></div>
                    <div id="edit-SATIS-${stock.id}" style="display:none; gap:5px;"><input type="number" id="input-SATIS-${stock.id}" value="${sellPrice}"><button onclick="submitDirectPrice(${stock.id}, 'SATIS')">✔️</button></div>
                </td>
                <td>${totalBuyRow.toFixed(2)} TL</td>
                <td>
                    <button class="btn-action btn-plus" onclick="changeStockInCloud(${stock.id}, 1)">+</button>
                    <button class="btn-action btn-minus" onclick="changeStockInCloud(${stock.id}, -1)">-</button>
                    <button class="btn-action btn-delete" onclick="deleteStockFromCloud(${stock.id})">Sil</button>
                </td>
            `;
        } else {
            // SATICI GÖRÜNÜMÜ
            row.innerHTML = `
                <td>${stock.barcode}</td> <td><strong>${stock.brand_name}</strong></td>
                <td>${capFormat}</td> <td><strong>${stock.model}"</strong></td>
                <td><strong>${count}</strong></td>
                <td style="color:var(--text-muted);">🔒 Gizli</td>
                <td style="color:var(--orange);"><strong>${buyPrice.toFixed(2)} TL</strong></td>
                <td style="color:var(--orange); font-size:12px;">Arzınız: <strong>${parsedOffers.seller}</strong></td>
                <td>
                    ${stock.barcode === "Müşteri Arzı" ? 
                    `<button class="btn-action btn-delete" onclick="deleteStockFromCloud(${stock.id})">İptal Et</button>` :
                    `<div id="display-SATICI-${stock.id}"><button class="btn-action" style="background:var(--orange); color:white;" onclick="showInlineInput(${stock.id}, 'SATICI')">Fiyat Ver</button></div>
                     <div id="edit-SATICI-${stock.id}" style="display:none; gap:5px;"><input type="text" id="input-SATICI-${stock.id}" placeholder="Adet/Fiyat"><button onclick="submitInlineOffer(${stock.id}, 'SATICI')">✔️</button></div>`
                    }
                </td>
            `;
        }

        if (currentStatus === "%100" || currentStatus === "Sağlıklı") { if(healthyBody) healthyBody.appendChild(row); }
        else if (currentStatus === "Sağlığı Düşük") { if(lowBody) lowBody.appendChild(row); }
        else { if(defectiveBody) defectiveBody.appendChild(row); }
    });

    if (isAdmin) {
        addCategoryTotalRow(healthyBody, healthyTotals); addCategoryTotalRow(lowBody, lowTotals); addCategoryTotalRow(defectiveBody, defectiveTotals);
        const gBuy = healthyTotals.buy + lowTotals.buy + defectiveTotals.buy;
        const gSell = healthyTotals.sell + lowTotals.sell + defectiveTotals.sell;
        document.getElementById("grand-buy-value").innerText = gBuy.toFixed(2);
        document.getElementById("grand-sell-value").innerText = gSell.toFixed(2);
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
    document.getElementById(`display-${role}-${id}`).style.display = "none";
    document.getElementById(`edit-${role}-${id}`).style.display = "flex";
}

window.submitInlineOffer = async function(id, role) {
    const isAdmin = (new URLSearchParams(window.location.search).get('mod') === 'ahmet');
    const stockItem = globalStocks.find(s => s.id === id);
    if (!stockItem) return;
    const parsed = parseOfferNotes(stockItem.offer_notes);
    const inputVal = document.getElementById(`input-${role}-${id}`).value.trim() || "Yok";
    if (role === 'ALICI') parsed.buyer = inputVal; else if (role === 'SATICI') parsed.seller = inputVal;
    
    await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, {
        method: "PATCH", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ offer_notes: `ALICI: ${parsed.buyer} || SATICI: ${parsed.seller}` })
    });
    fetchStocksFromCloud(isAdmin);
}

window.submitDirectPrice = async function(id, type) {
    const inputVal = parseFloat(document.getElementById(`input-${type}-${id}`).value || 0);
    let payload = type === 'ALIS' ? { price: inputVal } : { sale_price: inputVal };
    await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, {
        method: "PATCH", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    fetchStocksFromCloud(true);
}

window.submitNewOfferFromSeller = async function(event) {
    event.preventDefault();
    const offerNotes = `ALICI: Yok || SATICI: ${document.getElementById("offer-count").value} Adet - İstenen Fiyat/Tel: ${document.getElementById("offer-price").value}`;
    await fetch(`${SUPABASE_URL}/stocks`, {
        method: "POST", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            barcode: "Müşteri Arzı", brand_name: document.getElementById("offer-brand").value, capacity_gb: parseInt(document.getElementById("offer-capacity").value),
            model: document.getElementById("offer-inch").value, stock_count: 0, price: 0, sale_price: 0, offer_notes: offerNotes, status: document.getElementById("offer-status").value
        })
    });
    document.getElementById("customer-offer-form").reset(); alert("Teklif dükkan yönetimine iletildi abim."); fetchStocksFromCloud(false);
}

window.changeStockInCloud = async function(id, amount) {
    let current = parseInt(document.getElementById(`stock-count-${id}`).innerText);
    let newStock = current + amount; if (newStock < 0) newStock = 0;
    document.getElementById(`stock-count-${id}`).innerText = newStock;
    await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, {
        method: "PATCH", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ stock_count: newStock })
    });
}

window.addNewStock = async function(event) {
    event.preventDefault();
    await fetch(`${SUPABASE_URL}/stocks`, {
        method: "POST", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            barcode: document.getElementById("prod-barcode").value, brand_name: document.getElementById("prod-brand").value,
            capacity_gb: parseInt(document.getElementById("prod-capacity").value), model: document.getElementById("prod-inch").value, 
            stock_count: parseInt(document.getElementById("prod-stock").value), price: parseFloat(document.getElementById("prod-price").value || 0),
            sale_price: parseFloat(document.getElementById("prod-sale-price").value || 0), offer_notes: "ALICI: Yok || SATICI: Yok", status: document.getElementById("prod-status").value
        })
    });
    document.getElementById("add-stock-form").reset(); fetchStocksFromCloud(true);
}

window.deleteStockFromCloud = async function(id) {
    const isAdmin = (new URLSearchParams(window.location.search).get('mod') === 'ahmet');
    await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, {
        method: "DELETE", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
    });
    fetchStocksFromCloud(isAdmin);
}

// ==========================================
// 8. BARKOD OKUTMA VE RAPORLAMA SİSTEMİ
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
    const response = await fetch(`${SUPABASE_URL}/stocks?id=eq.${matchedStock.id}`, {
        method: "PATCH", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ stock_count: newStockCount })
    });

    if (response.ok) {
        let capFormat = parseInt(matchedStock.capacity_gb) >= 1000 ? (parseInt(matchedStock.capacity_gb)/1000 + "TB") : (matchedStock.capacity_gb + "GB");
        saveSaleToSessionLogs(scannedBarcode, matchedStock.brand_name, `${capFormat} ${matchedStock.model}"`, targetSession, parseFloat(matchedStock.sale_price || 0));
        barcodeInput.value = ""; barcodeInput.focus();
        fetchStocksFromCloud(true); renderReportTabs(); 
    }
}

function saveSaleToSessionLogs(barcode, brand, desc, sessionName, salePrice) {
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    let existingIndex = allSales.findIndex(s => s.barcode === barcode && s.session === sessionName);
    if (existingIndex > -1) allSales[existingIndex].count += 1;
    else allSales.push({ barcode, title: `${brand} ${desc}`, session: sessionName, count: 1, price: salePrice });
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
}

function renderSalesReport() {
    const tbody = document.getElementById("reports-tbody");
    if (!tbody) return;
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    let filteredSales = allSales.filter(s => s.session === currentActiveReportTab);
    
    if (filteredSales.length === 0) { tbody.innerHTML = `<tr><td colspan="6" style="color:var(--text-muted); text-align:center;">Satış yok.</td></tr>`; return; }
    
    tbody.innerHTML = ""; let totalSessionRevenue = 0;
    filteredSales.forEach(sale => {
        const rowTotal = sale.count * sale.price; totalSessionRevenue += rowTotal;
        tbody.innerHTML += `
            <tr>
                <td style="font-family: monospace;">${sale.barcode}</td> <td>${sale.title}</td>
                <td><span style="background:var(--blue); color:white; padding:4px 8px; border-radius:4px; font-size:12px;">${sale.session}</span></td>
                <td><strong>${sale.count} Adet</strong></td> <td>${sale.price.toFixed(2)} TL</td>
                <td style="color:var(--green); font-weight:bold;">${rowTotal.toFixed(2)} TL</td>
            </tr>
        `;
    });
    tbody.innerHTML += `<tr style="background:#f0f2f5; font-weight:bold;"><td colspan="5" style="text-align:right;">Toplam Ciro:</td><td style="color:var(--green); font-size:16px;">${totalSessionRevenue.toFixed(2)} TL</td></tr>`;
}

window.clearSalesLogs = function() {
    if(confirm("Tüm oturumların rapor geçmişi silinecek, emin misin? (Stoklar etkilenmez)")) {
        localStorage.removeItem("erdem_bilisim_sales_logs");
        currentActiveReportTab = "Satış 1"; document.getElementById("active-sale-session").value = "Satış 1";
        renderReportTabs();
    }
}