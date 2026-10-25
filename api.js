// ============================================================================
// API katmanı — tüm Supabase çağrıları burada. Arayüz tablo sorgusu yapmaz.
// Yetki kararları sunucudadır (RLS + security definer fonksiyonlar); buradaki
// kontroller yalnızca kullanıcıya doğru mesajı göstermek içindir.
// ============================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, PAGE_SIZE } from './config.js';
import { sanitizeSearchTerm, SELLABLE_STATUSES } from './lib.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export class AppError extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

const CATALOG_COLUMNS = 'id,brand_name,model,capacity_gb,stock_count,status,sale_price,image_url';

// Merkezi hata işleme: teknik ayrıntı konsola, kullanıcıya anlaşılır mesaj.
function fail(error, fallback) {
  console.error('[api]', error);
  if (error?.code === '42501') throw new AppError('Bu işlem için yetkiniz yok.', error.code);
  if (error?.code === '23505') throw new AppError('Bu kayıt zaten mevcut.', error.code);
  const message = error?.message && error.message.length < 300 ? error.message : fallback;
  throw new AppError(message || fallback, error?.code ?? null);
}

// ---------------------------------------------------------------- Oturum ----
export async function getSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) fail(error, 'Oturum bilgisi alınamadı.');
  return data.session;
}

export function onAuthChange(callback) {
  const { data } = sb.auth.onAuthStateChange((event, session) => callback(event, session));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new AppError('E-posta veya şifre hatalı.', error.code ?? null);
}

export async function signUp({ email, password, fullName, phone, address }) {
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone: phone || '', address },
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });
  if (error) {
    // Sunucu trigger'ından gelen Türkçe mesajlar (ör. aynı isim) aynen gösterilir.
    throw new AppError(error.message || 'Kayıt sırasında bir hata oluştu.', error.code ?? null);
  }
  return { needsEmailConfirmation: !data.session };
}

export async function signOut() {
  const { error } = await sb.auth.signOut();
  if (error) fail(error, 'Çıkış yapılamadı.');
}

export async function fetchMyRole(userId) {
  const { data, error } = await sb.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
  if (error) fail(error, 'Yetki bilgisi alınamadı.');
  return data?.role ?? 'customer';
}

// ---------------------------------------------------------------- Katalog ---
// Yalnızca yayındaki ve satılabilir ürünler. Alış fiyatı/tedarikçi bilgisi istenmez.
export async function fetchCatalog({ page = 0, search = '', brand = '', capacity = '', model = '', sort = 'newest' } = {}) {
  let query = sb.from('stocks').select(CATALOG_COLUMNS, { count: 'exact' })
    .in('status', SELLABLE_STATUSES)
    .gt('stock_count', 0)
    .gt('sale_price', 0);

  const term = sanitizeSearchTerm(search);
  if (term) query = query.or(`brand_name.ilike.%${term}%,model.ilike.%${term}%`);
  if (brand) query = query.eq('brand_name', brand);
  if (capacity) query = query.eq('capacity_gb', Number(capacity));
  if (model) query = query.eq('model', model);

  if (sort === 'price-asc') query = query.order('sale_price', { ascending: true }).order('id');
  else if (sort === 'price-desc') query = query.order('sale_price', { ascending: false }).order('id');
  else query = query.order('id', { ascending: false });

  const from = page * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) fail(error, 'Ürünler yüklenemedi.');
  return { rows: data ?? [], count: count ?? 0 };
}

// Filtre seçenekleri için (en fazla 1000 kayıt).
export async function fetchCatalogFacets() {
  const { data, error } = await sb.from('stocks').select('brand_name,capacity_gb,model')
    .in('status', SELLABLE_STATUSES).gt('stock_count', 0).limit(1000);
  if (error) fail(error, 'Filtreler yüklenemedi.');
  const brands = [...new Set((data ?? []).map((r) => r.brand_name).filter(Boolean))].sort();
  const capacities = [...new Set((data ?? []).map((r) => r.capacity_gb).filter(Boolean))].sort((a, b) => a - b);
  const models = [...new Set((data ?? []).map((r) => r.model).filter(Boolean))].sort();
  return { brands, capacities, models };
}

export async function fetchCatalogByIds(ids) {
  if (!ids.length) return [];
  const { data, error } = await sb.from('stocks').select(CATALOG_COLUMNS).in('id', ids);
  if (error) fail(error, 'Sepet ürünleri yüklenemedi.');
  return data ?? [];
}

// ------------------------------------------------------------- Siparişler ---
export async function placeOrder({ items, paymentMethod, address, customerName, idempotencyKey }) {
  const { data, error } = await sb.rpc('place_order', {
    p_items: items,
    p_payment_method: paymentMethod,
    p_shipping_address: address,
    p_customer_name: customerName,
    p_idempotency_key: idempotencyKey,
  });
  if (error) fail(error, 'Sipariş oluşturulamadı.');
  return data;
}

export async function cancelOrder(orderId) {
  const { data, error } = await sb.rpc('cancel_order', { p_order_id: orderId });
  if (error) fail(error, 'Sipariş iptal edilemedi.');
  return data;
}

export async function fetchMyOrders() {
  const { data, error } = await sb.from('orders').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) fail(error, 'Siparişler yüklenemedi.');
  return data ?? [];
}

// ---------------------------------------------------------- Bildirimler ----
export async function fetchNotifications() {
  const { data, error } = await sb.from('notifications').select('id,message,is_read,created_at')
    .order('created_at', { ascending: false }).limit(50);
  if (error) fail(error, 'Bildirimler yüklenemedi.');
  return data ?? [];
}

export async function markNotificationRead(id) {
  const { error } = await sb.from('notifications').update({ is_read: true }).eq('id', id);
  if (error) fail(error, 'Bildirim güncellenemedi.');
}

// ------------------------------------------------------------- Profil -------
export async function fetchProfile(userId) {
  const { data, error } = await sb.from('user_profiles').select('full_name,phone,address_text').eq('id', userId).maybeSingle();
  if (error) fail(error, 'Profil yüklenemedi.');
  return data;
}

export async function updateProfile(userId, { phone, address_text }) {
  const { error } = await sb.from('user_profiles')
    .update({ phone, address_text, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) fail(error, 'Profil kaydedilemedi.');
}

// ------------------------------------------------------- Tedarikçi / Yönetici
export async function staffListStocks() {
  const { data, error } = await sb.rpc('staff_list_stocks');
  if (error) fail(error, 'Stok listesi yüklenemedi.');
  return data ?? [];
}

export async function adminInsertStock(row) {
  const { error } = await sb.from('stocks').insert(row);
  if (error) fail(error, 'Ürün eklenemedi.');
}

export async function adminUpdateStock(id, fields) {
  const { error } = await sb.from('stocks').update(fields).eq('id', id);
  if (error) fail(error, 'Ürün güncellenemedi.');
}

export async function adminDeleteStock(id) {
  const { error } = await sb.from('stocks').delete().eq('id', id);
  if (error) fail(error, 'Ürün silinemedi.');
}

export async function submitSupplierOffer(offer) {
  const { data, error } = await sb.rpc('submit_supplier_offer', {
    p_brand: offer.brand,
    p_model: offer.model,
    p_capacity_gb: offer.capacityGb,
    p_qty: offer.qty,
    p_status: offer.status,
    p_requested_price: offer.requestedPrice,
    p_note: offer.note ?? '',
  });
  if (error) fail(error, 'Teklif gönderilemedi.');
  return data;
}

export async function recordPosSale(barcode, session) {
  const { data, error } = await sb.rpc('record_pos_sale', { p_barcode: barcode, p_session: session });
  if (error) fail(error, 'Satış kaydedilemedi.');
  return data;
}

export async function fetchSales(sinceIso) {
  let query = sb.from('sales_logs').select('id,barcode,title,session_name,sale_count,price,buy_price,sale_date,created_at')
    .order('created_at', { ascending: false }).limit(1000);
  if (sinceIso) query = query.gte('created_at', sinceIso);
  const { data, error } = await query;
  if (error) fail(error, 'Satış raporu yüklenemedi.');
  return data ?? [];
}

export async function adminListOrders() {
  const { data, error } = await sb.from('orders')
    .select('id,order_no,user_id,customer_name,shipping_address,total_price,status,payment_method,payment_status,created_at,items')
    .order('created_at', { ascending: false }).limit(200);
  if (error) fail(error, 'Siparişler yüklenemedi.');
  return data ?? [];
}

export async function adminSetOrderStatus(orderId, status) {
  // Yalnızca kargo/teslim durumları. İptal cancelOrder ile (stok geri eklenir).
  if (!['shipped', 'delivered'].includes(status)) throw new AppError('Geçersiz durum değişikliği.');
  const { error } = await sb.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', orderId);
  if (error) fail(error, 'Sipariş durumu güncellenemedi.');
}

export async function adminListUsers() {
  const [{ data: profiles, error: e1 }, { data: roles, error: e2 }] = await Promise.all([
    sb.from('user_profiles').select('id,full_name,phone,address_text').order('full_name').limit(500),
    sb.from('user_roles').select('user_id,role').limit(1000),
  ]);
  if (e1 || e2) fail(e1 || e2, 'Kullanıcılar yüklenemedi.');
  const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
  return (profiles ?? []).map((p) => ({ ...p, role: roleMap.get(p.id) ?? 'customer' }));
}

export async function adminSetRole(userId, role) {
  if (!['customer', 'supplier', 'admin'].includes(role)) throw new AppError('Geçersiz rol.');
  const { error } = await sb.from('user_roles').upsert({ user_id: userId, role }, { onConflict: 'user_id' });
  if (error) fail(error, 'Rol güncellenemedi.');
}

export async function fetchAuditLogs() {
  const { data, error } = await sb.from('audit_logs').select('action,target,created_at')
    .order('created_at', { ascending: false }).limit(100);
  if (error) fail(error, 'Denetim kayıtları yüklenemedi.');
  return data ?? [];
}
