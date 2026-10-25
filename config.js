// ============================================================================
// Yapılandırma — YALNIZCA genel (publishable) anahtar burada olabilir.
// service_role anahtarı ve ödeme sağlayıcı gizli anahtarları ASLA buraya konmaz.
// ============================================================================

export const SUPABASE_URL = 'https://zwayidssoujhrjxzgdql.supabase.co';

// NOT: Supabase yeni proje anahtarları genellikle "sb_publishable_..." biçimindedir.
// Mevcut anahtar bu biçimde değilse Supabase panelinden doğrulayıp güncelleyin.
export const SUPABASE_PUBLISHABLE_KEY = 'sbpublishablewHYCLbDylFN9wnRXuGCmFg_cl1OPZAC';

// Sanal POS: sağlayıcı hesabı bağlanana kadar false. Açılmadan önce
// supabase/functions/payment-webhook ve place_order içindeki card kuralı güncellenmelidir.
export const PAYMENT = Object.freeze({
  cardEnabled: false,
});

// Fatura üzerinde görünen firma bilgileri. Boş bırakılan alanlar faturada gösterilmez.
// Yasal fatura (e-Fatura / e-Arşiv) için bir entegratör gerekir; bu belge yasal fatura değildir.
export const COMPANY = Object.freeze({
  name: 'Erdem Bilişim',
  address: '',
  taxOffice: '',
  taxNo: '',
  phone: '0(212) 000 00 00',
  email: 'erdem.bilisim@hotmail.com',
});

export const PAGE_SIZE = 24;
