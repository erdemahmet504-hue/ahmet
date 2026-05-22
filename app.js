// ==========================================
// 1. BULUT VERİTABANI BAĞLANTI BİLGİLERİ
// ==========================================
const SUPABASE_URL = "https://zwayidssoujhrjxzgdql.supabase.co/rest/v1"; 
const SUPABASE_KEY = "BURAYA_KENDİ_UZUN_SUPABASE_KEYİNİ_YAPIŞTIR"; 

let globalStocks = [];
let currentActiveReportTab = "Satış 1";
let hasSelectedRole = false; 

// 🔑 CİHAZA ÖZEL BENZERSİZ ZİYARETÇİ KİMLİĞİ ÜRETİCİ
// Bu fonksiyon sayesinde A müşterisi dükkana girdiğinde, B müşterisinin veritabanına yazdığı teklifleri asla göremez.
function getOrCreateVisitorId() {
    let vid = localStorage.getItem("erdem_bilisim_visitor_id");
    if (!vid) {
        vid = "MUSTERI_" + Math.random().toString(36).substring(2, 11).toUpperCase();
        localStorage.setItem("erdem_bilisim_visitor_id", vid);
    }
    return vid;
}
const MY_VISITOR_ID = getOrCreateVisitorId();

// ==========================================
// 2. SAYFA YÜKLENDİĞİNDE YETKİ VE HAFIZA KONTROLÜ
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mod'); 
    const isAdmin = (mode === 'ahmet');

    // Eğer admin modundaysa, müşteri kilitlerini kaldır ki her şeye erişebilsin
    if (isAdmin) {
        localStorage.removeItem("erdem_bilisim_locked_role");
        const adminBadge = document.getElementById("admin-status-badge");
        if (adminBadge) adminBadge.style.display = "block";
    }

    const adminSection = document.getElementById("admin-panel");
    if (adminSection) adminSection.style.display = isAdmin ? "block" : "none";

    const barcodeSaleSection = document.getElementById("barcode-sale-panel");
    if (barcodeSaleSection) barcodeSaleSection.style.display = isAdmin ? "block" : "none";

    const grandTotalSection = document.getElementById("grand-total-section");
    if (grandTotalSection) grandTotalSection.style.display = isAdmin ? "flex" : "none";

    const reportsSection = document.getElementById("reports-panel");
    if (reportsSection) reportsSection.style.display = isAdmin ? "block" : "none";

    const roleSelector = document.getElementById("customer-role-selector");
    if (roleSelector) roleSelector.style.display = isAdmin ? "none" : "block";

    const containerLow = document.getElementById("container-low");
    const containerDefective = document.getElementById("container-defective");
    
    updateTableHeadersDirect(isAdmin);

    if (isAdmin) {
        if (containerLow) containerLow.style.display = "block";
        if (containerDefective) containerDefective.style.display = "block";
        renderSalesReport();
    } else {
        // 🔒 F5 KORUMASI: Seçilen rol hafızadan okunup anında kitleniyor
        const savedRole = localStorage.getItem("erdem_bilisim_locked_role");
        if (savedRole) {
            hasSelectedRole = true;
            const radioToSelect = document.querySelector(`input[name="user-role-radio"][value="${savedRole}"]`);
            if (radioToSelect) radioToSelect.checked = true;

            const radios = document.querySelectorAll('input[name="user-role-radio"]');
            radios.forEach(radio => radio.disabled = true);
            if (roleSelector) {
                roleSelector.style.opacity = "0.6";
                roleSelector.style.pointerEvents = "none";
            }

            const sellerFormPanel = document.getElementById("customer-seller-panel");
            if (savedRole === "satici") {
                if (containerLow) containerLow.style.display = "block";
                if (containerDefective) containerDefective.style.display = "block";
                if (sellerFormPanel) sellerFormPanel.style.display = "block";
            } else {
                if (containerLow) containerLow.style.display = "none";
                if (containerDefective) containerDefective.style.display = "none";
                if (sellerFormPanel) sellerFormPanel.style.display = "none";
            }
        } else {
            if (containerLow) containerLow.style.display = "none";
            if (containerDefective) containerDefective.style.display = "none";
        }
    }

    fetchStocksFromCloud(isAdmin);
});

function updateTableHeadersDirect(isAdmin) {
    ["table-healthy", "table-low", "table-defective"].forEach(tableId => {
        const table = document.getElementById(tableId);
        if (!table) return;
        const theadRow = table.querySelector("thead tr");
        if (!theadRow) return;

        let headersHTML = "";
        if (isAdmin) {
            headersHTML = `
                <th>Barkod / Tür</th>
                <th>Marka</th>
                <th>Boyut</th>
                <th>İnç</th>
                <th>Mevcut Stok</th>
                <th style="color: #10b981;">Müşteri Alıcı Teklifi</th>
                <th style="color: #f97316; background: rgba(249,115,22,0.1);">Gelen Satıcı Arzı (Adet & İstenen)</th>
                <th style="color: #38bdf8;">Dükkan Alış Fiyatı (Senin)</th>
                <th>Dükkan Satış Fiyatı</th>
                <th>Toplam Maliyet</th>
                <th>İşlemler</th>
            `;
        } else {
            headersHTML = `
                <th>Barkod</th>
                <th>Marka</th>
                <th>Boyut</th>
                <th>İnç</th>
                <th>Mevcut Stok</th>
                <th style="color: #10b981;">Dükkan Satış Fiyatı</th>
                <th style="color: #f97316;">Dükkan Alış Fiyatı</th>
                <th>Sizin Teklifiniz</th>
                <th>İşlemler</th>
            `;
        }
        theadRow.innerHTML = headersHTML;
    });
}

window.handleRoleChange = function() {
    if (hasSelectedRole) return;
    hasSelectedRole = true;

    const currentRole = getSelectedCustomerRole();
    localStorage.setItem("erdem_bilisim_locked_role", currentRole);

    const radios = document.querySelectorAll('input[name="user-role-radio"]');
    radios.forEach(radio => radio.disabled = true);

    const roleSelector = document.getElementById("customer-role-selector");
    if (roleSelector) {
        roleSelector.style.opacity = "0.6";
        roleSelector.style.pointerEvents = "none";
    }
    
    const containerLow = document.getElementById("container-low");
    const containerDefective = document.getElementById("container-defective");
    const sellerFormPanel = document.getElementById("customer-seller-panel");

    if (currentRole === "satici") {
        if (containerLow) containerLow.style.display = "block";
        if (containerDefective) containerDefective.style.display = "block";
        if (sellerFormPanel) sellerFormPanel.style.display = "block";
    } else {
        if (containerLow) containerLow.style.display = "none";
        if (containerDefective) containerDefective.style.display = "none";
        if (sellerFormPanel) sellerFormPanel.style.display = "none";
    }

    updateTablesByStatus(globalStocks, false);
}

function getSelectedCustomerRole() {
    const radio = document.querySelector('input[name="user-role-radio"]:checked');
    return radio ? radio.value : "alici";
}

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
        globalStocks = await response.json();
        if (Array.isArray(globalStocks)) {
            globalStocks.sort((a, b) => a.id - b.id);
            updateTablesByStatus(globalStocks, isAdmin);
        }
    } catch (error) {
        console.error(error);
    }
}

// 🔐 TİCARİ GİZLİLİK SÜZGEÇİ: Başka müşterilerin tekliflerini anında sansürler
function parseOfferNotesSecure(rawNotes, isAdmin) {
    let buyer = "Yok";
    let seller = "Yok";
    let originalCreator = "Sistem";

    if (rawNotes && rawNotes !== "Teklif Yok") {
        const parts = rawNotes.split("||");
        parts.forEach(part => {
            if (part.trim().startsWith("ALICI:")) buyer = part.replace("ALICI:", "").trim();
            else if (part.trim().startsWith("SATICI:")) seller = part.replace("SATICI:", "").trim();
            else if (part.trim().startsWith("OWNER:")) originalCreator = part.replace("OWNER:", "").trim();
        });
    }

    // 🔒 Ticari Koruma Bariyeri: Eğer admin değilse ve sahibinin ID'si uyuşmuyorsa sansürle!
    if (!isAdmin && originalCreator !== "Sistem" && originalCreator !== MY_VISITOR_ID) {
        buyer = "Yok";
        seller = "Yok";
    }

    return { buyer, seller, originalCreator };
}

// ==========================================
// 4. TABLO MOTORU VE SANSÜR SİSTEMİ
// ==========================================
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

    const currentRole = getSelectedCustomerRole();

    stocks.forEach(stock => {
        const currentStatus = (stock.status || "Sağlıklı").trim();
        const brand = stock.brand_name || "---";
        const capacity = stock.capacity_gb ? `${stock.capacity_gb} GB` : "---";
        const inch = stock.model || "---"; 
        const barcode = stock.barcode || "---";
        
        // Güvenli çözücü devreye giriyor
        const parsedOffers = parseOfferNotesSecure(stock.offer_notes, isAdmin);
        const count = parseInt(stock.stock_count || 0);
        const buyPrice = parseFloat(stock.price || 0);
        const sellPrice = parseFloat(stock.sale_price || 0);
        
        // Eğer dış arz satırıysa ve başka bir cihaza aitse, bu müşteri o satırı tamamen gizlesin
        if (!isAdmin && barcode === "Müşteri Arzı" && parsedOffers.originalCreator !== MY_VISITOR_ID) {
            return;
        }

        if (!isAdmin && currentRole !== "satici" && currentStatus !== "Sağlıklı") return;

        const row = document.createElement("tr");
        if (isAdmin && barcode === "Müşteri Arzı") {
            row.style.background = "rgba(249, 115, 22, 0.08)";
            row.style.borderLeft = "4px solid var(--orange)";
        }

        const totalBuyRow = count * buyPrice;
        const totalSellRow = count * sellPrice;

        if (currentStatus === "Sağlıklı") {
            healthyTotals.buy += totalBuyRow; healthyTotals.sell += totalSellRow;
        } else if (currentStatus === "Sağlığı Düşük") {
            lowTotals.buy += totalBuyRow; lowTotals.sell += totalSellRow;
        } else if (currentStatus === "Arızalı") {
            defectiveTotals.buy += totalBuyRow; defectiveTotals.sell += totalSellRow;
        }

        if (isAdmin) {
            // ==========================================
            // FULL YETKİLİ SATIN ALIM VE YÖNETİCİ EKRANI
            // ==========================================
            const buyerNotice = parsedOffers.buyer !== "Yok" ? `<span style="background:#eab308; color:#000; padding:2px 4px; border-radius:3px; font-size:10px; margin-right:4px; animation: blink 1s infinite;">YENİ</span>` : "";
            const sellerNotice = parsedOffers.seller !== "Yok" ? `<span style="background:#f97316; color:#fff; padding:2px 4px; border-radius:3px; font-size:10px; margin-right:4px; animation: blink 1s infinite;">TEKLİF</span>` : "";

            let barcodeDisplay = barcode === "Müşteri Arzı" ? `<span style="color:#f97316; font-weight:bold;">DIŞ ARZ</span>` : `<span style="font-family:monospace; color:#3498db;">${barcode}</span>`;

            row.innerHTML = `
                <td>${barcodeDisplay}</td>
                <td><strong>${brand}</strong></td>
                <td>${capacity}</td>
                <td><strong>${inch}"</strong></td>
                <td><span id="stock-count-${stock.id}" style="font-weight:bold;">${count}</span></td>
                
                <td style="color: #10b981;">
                    <div id="display-ALICI-${stock.id}">
                        ${buyerNotice}<span>${parsedOffers.buyer}</span>
                        <button class="btn-edit-offer" onclick="showInlineInput(${stock.id}, 'ALICI')">✍️ Onayla</button>
                    </div>
                    <div id="edit-ALICI-${stock.id}" style="display:none; gap:5px;">
                        <input type="text" id="input-ALICI-${stock.id}" value="${parsedOffers.buyer === "Yok" ? "" : parsedOffers.buyer}" style="width:100px; background:#222; color:#fff; border:1px solid #444;">
                        <button onclick="submitInlineOffer(${stock.id}, 'ALICI')" style="background:#10b981; color:white; border:none; padding:3px 6px; border-radius:3px;">✔️</button>
                    </div>
                </td>

                <td style="color: #f97316; font-weight: 500; background: rgba(249,115,22,0.03);">
                    ${sellerNotice}<span>${parsedOffers.seller}</span>
                </td>

                <td style="color: #38bdf8;">
                    <div id="display-ALIS-${stock.id}">
                        <strong>${buyPrice.toFixed(2)} TL</strong>
                        <button class="btn-edit-offer" style="background:#0284c7;" onclick="showInlineInput(${stock.id}, 'ALIS')">💰 Fiyat Ver</button>
                    </div>
                    <div id="edit-ALIS-${stock.id}" style="display:none; gap:5px;">
                        <input type="number" step="0.01" id="input-ALIS-${stock.id}" value="${buyPrice}" style="width:90px; background:#222; color:#fff; border:1px solid #38bdf8; padding:2px;">
                        <button onclick="submitDirectPrice(${stock.id}, 'ALIS')" style="background:#38bdf8; color:black; border:none; padding:3px 6px; border-radius:3px; font-weight:bold;">✔️</button>
                    </div>
                </td>

                <td style="color: #10b981;">
                    <div id="display-SATIS-${stock.id}">
                        <strong>${sellPrice.toFixed(2)} TL</strong>
                        <button class="btn-edit-offer" style="background:#059669;" onclick="showInlineInput(${stock.id}, 'SATIS')">✍️ Değiş</button>
                    </div>
                    <div id="edit-SATIS-${stock.id}" style="display:none; gap:5px;">
                        <input type="number" step="0.01" id="input-SATIS-${stock.id}" value="${sellPrice}" style="width:90px; background:#222; color:#fff; border:1px solid #10b981; padding:2px;">
                        <button onclick="submitDirectPrice(${stock.id}, 'SATIS')" style="background:#10b981; color:white; border:none; padding:3px 6px; border-radius:3px;">✔️</button>
                    </div>
                </td>

                <td style="color: #94a3b8;">${totalBuyRow.toFixed(2)} TL</td>
                <td>
                    <button class="btn-action btn-plus" onclick="changeStockInCloud(${stock.id}, 1)">+</button>
                    <button class="btn-action btn-minus" onclick="changeStockInCloud(${stock.id}, -1)">-</button>
                    <button class="btn-action btn-delete" onclick="deleteStockFromCloud(${stock.id})">Sil</button>
                </td>
            `;
        } else {
            // ==========================================
            // KORUMALI VE SANSÜRLÜ MÜŞTERİ PANELİ
            // ==========================================
            let buyerCellHTML = "";
            let sellerCellHTML = "";
            let customerStatusCellHTML = ""; 
            let actionButtons = "";

            if (currentRole === "alici") {
                buyerCellHTML = `<td style="color: #10b981; font-size:15px;"><strong>${sellPrice.toFixed(2)} TL</strong></td>`;
                sellerCellHTML = `<td style="color: #64748b; font-size:12px; opacity:0.4;">🔒 Gizli</td>`;
                customerStatusCellHTML = `<td style="color:#10b981; font-size:12px;">Sizin Teklifiniz: <br><strong>${parsedOffers.buyer}</strong></td>`;
                
                actionButtons = `
                    <td>
                        <div id="display-ALICI-${stock.id}">
                            <button class="btn-buyer" style="padding:6px 12px;" onclick="showInlineInput(${stock.id}, 'ALICI')">🛒 Satın Al / Teklif Ver</button>
                        </div>
                        <div id="edit-ALICI-${stock.id}" style="display:none; gap:5px; align-items:center;">
                            <input type="text" id="input-ALICI-${stock.id}" placeholder="Adet ve Fiyat Yazın" style="width:120px; background:#222; color:#fff; border:1px solid #10b981; padding:4px;">
                            <button onclick="submitInlineOffer(${stock.id}, 'ALICI')" style="background:#10b981; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer;">✔️</button>
                        </div>
                    </td>`;
            } else {
                buyerCellHTML = `<td style="color: #64748b; font-size:12px; opacity:0.4;">🔒 Gizli</td>`;
                sellerCellHTML = `<td style="color: #f97316; font-size:15px;"><strong>${buyPrice.toFixed(2)} TL</strong></td>`;
                customerStatusCellHTML = `<td style="color:#f97316; font-size:12px;">Sizin Dükkana Arzınız: <br><strong>${parsedOffers.seller}</strong></td>`;

                if (barcode === "Müşteri Arzı") {
                    actionButtons = `
                        <td>
                            <div id="display-SATICI-${stock.id}">
                                <button class="btn-delete" style="padding:6px 12px; font-size:12px;" onclick="deleteStockFromCloud(${stock.id})">❌ Teklifi İptal Et</button>
                            </div>
                        </td>`;
                } else {
                    actionButtons = `
                        <td>
                            <div id="display-SATICI-${stock.id}">
                                <button class="btn-seller" style="padding:6px 12px;" onclick="showInlineInput(${stock.id}, 'SATICI')">📦 Dükkana Sat / Fiyat Ver</button>
                            </div>
                            <div id="edit-SATICI-${stock.id}" style="display:none; gap:5px; align-items:center;">
                                <input type="text" id="input-SATICI-${stock.id}" placeholder="Adet ve Fiyat Yazın" style="width:120px; background:#222; color:#fff; border:1px solid #f97316; padding:4px;">
                                <button onclick="submitInlineOffer(${stock.id}, 'SATICI')" style="background:#f97316; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer;">✔️</button>
                            </div>
                        </td>`;
                }
            }

            row.innerHTML = `
                <td style="font-family: monospace; color: #3498db;">${barcode}</td>
                <td><strong>${brand}</strong></td>
                <td>${capacity}</td>
                <td><strong>${inch}"</strong></td>
                <td><strong>${count}</strong></td>
                ${buyerCellHTML}
                ${sellerCellHTML}
                ${customerStatusCellHTML}
                ${actionButtons}
            `;
        }

        if (currentStatus === "Sağlıklı" && healthyBody) healthyBody.appendChild(row);
        else if (currentStatus === "Sağlığı Düşük" && lowBody) lowBody.appendChild(row);
        else if (currentStatus === "Arızalı" && defectiveBody) defectiveBody.appendChild(row);
    });

    if (isAdmin) {
        addCategoryTotalRow(healthyBody, healthyTotals);
        addCategoryTotalRow(lowBody, lowTotals);
        addCategoryTotalRow(defectiveBody, defectiveTotals);

        const grandBuy = healthyTotals.buy + lowTotals.buy + defectiveTotals.buy;
        const grandSell = healthyTotals.sell + lowTotals.sell + defectiveTotals.sell;
        
        const gBuyEl = document.getElementById("grand-buy-value");
        const gSellEl = document.getElementById("grand-sell-value");
        if (gBuyEl) gBuyEl.innerText = grandBuy.toFixed(2);
        if (gSellEl) gSellEl.innerText = grandSell.toFixed(2);
    }
}

function addCategoryTotalRow(tbody, totals) {
    if (!tbody) return;
    const row = document.createElement("tr");
    row.className = "total-row";
    row.innerHTML = `
        <td colspan="5" style="text-align: right; color: #aaa;">Kategori Toplamı:</td>
        <td style="color: #3498db;" colspan="2">Alış Maliyeti: ${totals.buy.toFixed(2)} TL</td>
        <td style="color: #10b981;" colspan="4">Beklenen Ciro: ${totals.sell.toFixed(2)} TL</td>
    `;
    tbody.appendChild(row);
}

window.showInlineInput = function(id, role) {
    const dispEl = document.getElementById(`display-${role}-${id}`);
    const editEl = document.getElementById(`edit-${role}-${id}`);
    if (dispEl) dispEl.style.display = "none";
    if (editEl) editEl.style.display = "flex";
}

window.submitInlineOffer = async function(id, role) {
    const urlParams = new URLSearchParams(window.location.search);
    const isAdmin = (urlParams.get('mod') === 'ahmet');
    
    const stockItem = globalStocks.find(s => s.id === id);
    if (!stockItem) return;

    const parsed = parseOfferNotesSecure(stockItem.offer_notes, true); 
    const inputVal = document.getElementById(`input-${role}-${id}`).value.trim();

    if (role === 'ALICI') parsed.buyer = inputVal === "" ? "Yok" : inputVal;
    else if (role === 'SATICI') parsed.seller = inputVal === "" ? "Yok" : inputVal;

    // 🔒 Teklifi veritabanına gönderirken tarayıcının kimliğini (`OWNER`) ekliyoruz
    const finalOfferString = `ALICI: ${parsed.buyer} || SATICI: ${parsed.seller} || OWNER: ${isAdmin ? parsed.originalCreator : MY_VISITOR_ID}`;
    let updatePayload = { offer_notes: finalOfferString };

    try {
        const response = await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, {
            method: "PATCH",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(updatePayload)
        });
        if (response.ok) fetchStocksFromCloud(isAdmin);
    } catch (error) {
        console.error(error);
    }
}

window.submitDirectPrice = async function(id, type) {
    let updatePayload = {};
    const inputVal = parseFloat(document.getElementById(`input-${type}-${id}`).value || 0);

    if (type === 'ALIS') updatePayload.price = inputVal;
    else if (type === 'SATIS') updatePayload.sale_price = inputVal;

    try {
        const response = await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, {
            method: "PATCH",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(updatePayload)
        });
        if (response.ok) fetchStocksFromCloud(true);
    } catch (error) {
        console.error(error);
    }
}

window.submitNewOfferFromSeller = async function(event) {
    event.preventDefault();

    const brand = document.getElementById("offer-brand").value;
    const capacity = parseInt(document.getElementById("offer-capacity").value);
    const inch = document.getElementById("offer-inch").value;
    const status = document.getElementById("offer-status").value;
    const count = document.getElementById("offer-count").value;
    const priceAndTel = document.getElementById("offer-price").value;

    // 🔒 Sıfırdan yapılan arzlarda cihaz kimliğini basıyoruz
    const offerNotes = `ALICI: Yok || SATICI: ${count} Adet - İstenen: ${priceAndTel} || OWNER: ${MY_VISITOR_ID}`;

    try {
        const response = await fetch(`${SUPABASE_URL}/stocks`, {
            method: "POST",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                barcode: "Müşteri Arzı",
                brand_name: brand,
                capacity_gb: capacity,
                model: inch, 
                stock_count: 0, 
                price: 0,
                sale_price: 0,
                offer_notes: offerNotes,
                status: status
            })
        });
        if (response.ok) {
            document.getElementById("customer-offer-form").reset();
            alert("Teklifiniz dükkan yönetimine başarıyla iletildi abim.");
            fetchStocksFromCloud(false);
        }
    } catch (error) {
        console.error(error);
    }
}

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
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ stock_count: newStock })
        });
    } catch (error) {
        console.error(error);
    }
}

window.addNewStock = async function(event) {
    event.preventDefault();
    const barcode = document.getElementById("prod-barcode").value;
    const brand = document.getElementById("prod-brand").value;
    const capacity = parseInt(document.getElementById("prod-capacity").value);
    const inch = document.getElementById("prod-inch").value;
    const stock = parseInt(document.getElementById("prod-stock").value);
    const buyPrice = parseFloat(document.getElementById("prod-price").value || 0);
    const sellPrice = parseFloat(document.getElementById("prod-sale-price").value || 0);
    const status = document.getElementById("prod-status").value;

    try {
        const response = await fetch(`${SUPABASE_URL}/stocks`, {
            method: "POST",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                barcode: barcode,
                brand_name: brand,
                capacity_gb: capacity,
                model: inch, 
                stock_count: stock,
                price: buyPrice,
                sale_price: sellPrice,
                offer_notes: "ALICI: Yok || SATICI: Yok || OWNER: Sistem",
                status: status
            })
        });
        if (response.ok) {
            document.getElementById("add-stock-form").reset();
            fetchStocksFromCloud(true);
        }
    } catch (error) {
        console.error(error);
    }
}

window.deleteStockFromCloud = async function(id) {
    const urlParams = new URLSearchParams(window.location.search);
    const isAdmin = (urlParams.get('mod') === 'ahmet');
    try {
        const response = await fetch(`${SUPABASE_URL}/stocks?id=eq.${id}`, {
            method: "DELETE",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`
            }
        });
        if (response.ok) fetchStocksFromCloud(isAdmin);
    } catch (error) {
        console.error(error);
    }
}

window.barcodeSaleStockDrop = async function(event) {
    event.preventDefault();
    const barcodeInput = document.getElementById("scan-barcode-input");
    const sessionSelect = document.getElementById("active-sale-session");
    const scannedBarcode = barcodeInput.value.trim();
    const targetSession = sessionSelect.value;
    if (!scannedBarcode) return;

    const matchedStock = globalStocks.find(s => s.barcode && s.barcode.trim() === scannedBarcode);
    if (!matchedStock || parseInt(matchedStock.stock_count || 0) <= 0) {
        barcodeInput.value = "";
        barcodeInput.focus();
        return;
    }

    let newStockCount = parseInt(matchedStock.stock_count) - 1;

    try {
        // Eğer stok 0'a düşüyorsa PATCH yerine DELETE yap, yoksa günceller
        if (newStockCount <= 0) {
            await fetch(`${SUPABASE_URL}/stocks?id=eq.${matchedStock.id}`, {
                method: "DELETE",
                headers: {
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${SUPABASE_KEY}`
                }
            });
        } else {
            await fetch(`${SUPABASE_URL}/stocks?id=eq.${matchedStock.id}`, {
                method: "PATCH",
                headers: {
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${SUPABASE_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ stock_count: newStockCount })
            });
        }

        // Satış günlüğüne kaydet ve ekranı tazele
        saveSaleToSessionLogs(scannedBarcode, matchedStock.brand_name, `${matchedStock.capacity_gb}GB ${matchedStock.model}"`, targetSession, parseFloat(matchedStock.sale_price || 0));
        barcodeInput.value = "";
        barcodeInput.focus();
        fetchStocksFromCloud(true);
    } catch (error) {
        console.error(error);
    }
}

function saveSaleToSessionLogs(barcode, brand, desc, sessionName, salePrice) {
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    let existingIndex = allSales.findIndex(s => s.barcode === barcode && s.session === sessionName);
    if (existingIndex > -1) allSales[existingIndex].count += 1;
    else {
        allSales.push({
            barcode: barcode, title: `${brand} ${desc}`, session: sessionName, count: 1, price: salePrice
        });
    }
    localStorage.setItem("erdem_bilisim_sales_logs", JSON.stringify(allSales));
}

window.switchReportTab = function(sessionName) {
    currentActiveReportTab = sessionName;
    document.querySelectorAll(".tab-btn").forEach(btn => {
        if (btn.innerText.trim() === sessionName) btn.classList.add("active");
        else btn.classList.remove("active");
    });
    renderSalesReport();
}

function renderSalesReport() {
    const tbody = document.getElementById("reports-tbody");
    if (!tbody) return;
    let allSales = JSON.parse(localStorage.getItem("erdem_bilisim_sales_logs")) || [];
    let filteredSales = allSales.filter(s => s.session === currentActiveReportTab);
    if (filteredSales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="color: #64748b; text-align: center;">Satış yok.</td></tr>`;
        return;
    }
    tbody.innerHTML = "";
    let totalSessionRevenue = 0;
    filteredSales.forEach(sale => {
        const rowTotal = sale.count * sale.price;
        totalSessionRevenue += rowTotal;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="font-family: monospace; color: #38bdf8;">${sale.barcode}</td>
            <td>${sale.title}</td>
            <td><span style="background-color: #1e3a8a; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${sale.session}</span></td>
            <td><strong>${sale.count} Adet</strong></td>
            <td>${sale.price.toFixed(2)} TL</td>
            <td style="color: #34d399; font-weight: bold;">${rowTotal.toFixed(2)} TL</td>
        `;
        tbody.appendChild(tr);
    });
    const totalTr = document.createElement("tr");
    totalTr.style.backgroundColor = "#1e293b";
    totalTr.style.fontWeight = "bold";
    totalTr.innerHTML = `
        <td colspan="5" style="text-align: right; color: #94a3b8;">Toplam Ciro:</td>
        <td style="color: #34d399; font-size: 16px;">${totalSessionRevenue.toFixed(2)} TL</td>
    `;
    tbody.appendChild(totalTr);
}

const style = document.createElement('style');
style.innerHTML = `
@keyframes blink {
    0% { opacity: 1; }
    50% { opacity: 0.3; }
    100% { opacity: 1; }
}
`;
document.head.appendChild(style);