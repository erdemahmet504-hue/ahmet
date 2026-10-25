// ============================================================================
// Erdem Bilişim — Ödeme sağlayıcı webhook'u (Supabase Edge Function)
// ----------------------------------------------------------------------------
// Durum: HAZIR ama ETKİN DEĞİL. Sanal POS sağlayıcısı (iyzico / PayTR / Param
// vb.) hesabı bağlandığında aktif edilecek. Sağlayıcının kendi imza ve
// callback formatı farklıdır; bu fonksiyon sağlayıcıdan bağımsız, güvenli bir
// geçittir. Sağlayıcıya özel doğrulama adaptörü gerekirse verifySignature()
// içinde değiştirin — diğer kurallar (imza, zaman damgası, tutar eşleşmesi,
// idempotency) aynen kalmalıdır.
//
// Beklenen istek:
//   POST /functions/v1/payment-webhook
//   Headers: x-timestamp: <unix saniye>, x-signature: <hex HMAC-SHA256>
//   Body (JSON): { "order_id": 123, "provider_ref": "TXN-..", "amount": 1234.5,
//                  "status": "success" | "failed" }
//   İmza: HMAC-SHA256(PAYMENT_WEBHOOK_SECRET, `${x-timestamp}.${raw_body}`)
//
// Ortam değişkenleri (Supabase Dashboard > Edge Functions > Secrets):
//   PAYMENT_WEBHOOK_SECRET   — sağlayıcı ile paylaşılan gizli anahtar
//   SUPABASE_URL             — otomatik sağlanır
//   SUPABASE_SERVICE_ROLE_KEY — otomatik sağlanır (SADECE sunucuda; tarayıcıya asla)
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const MAX_BODY_BYTES = 10_000;
const MAX_CLOCK_SKEW_SECONDS = 300; // tekrar (replay) saldırılarına karşı 5 dk pencere

const encoder = new TextEncoder();

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

// Sabit zamanlı karşılaştırma: sızıntı yaratan erken çıkış yok.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySignature(
  secret: string,
  timestamp: string,
  raw: string,
  signature: string,
): Promise<boolean> {
  const ts = Number(timestamp);
  if (!Number.isInteger(ts)) return false;
  const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (skew > MAX_CLOCK_SKEW_SECONDS) return false;
  const expected = await hmacSha256Hex(secret, `${timestamp}.${raw}`);
  return timingSafeEqual(signature.toLowerCase(), expected);
}

function parsePayload(raw: string):
  | { order_id: number; provider_ref: string; amount: number; status: string }
  | null {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const orderId = Number(data?.order_id);
  const amount = Number(data?.amount);
  const providerRef = String(data?.provider_ref ?? "").trim();
  const status = String(data?.status ?? "");
  if (!Number.isInteger(orderId) || orderId <= 0) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (providerRef.length < 3 || providerRef.length > 100) return null;
  if (status !== "success" && status !== "failed") return null;
  return { order_id: orderId, provider_ref: providerRef, amount, status };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const secret = Deno.env.get("PAYMENT_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !supabaseUrl || !serviceKey) {
    console.error("payment-webhook: eksik ortam değişkeni");
    return json(500, { error: "server_misconfigured" });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: "payload_too_large" });

  const timestamp = req.headers.get("x-timestamp") ?? "";
  const signature = req.headers.get("x-signature") ?? "";
  if (!timestamp || !signature || !(await verifySignature(secret, timestamp, raw, signature))) {
    console.warn("payment-webhook: imza doğrulanamadı");
    return json(401, { error: "invalid_signature" });
  }

  const payload = parsePayload(raw);
  if (!payload) return json(400, { error: "invalid_payload" });

  // Başarısız ödeme: sipariş 'pending_payment' kalır; stok serbest bırakma
  // işi ayrı bir zamanlanmış görevle yapılmalıdır (README'ye bakın).
  if (payload.status === "failed") {
    return json(200, { received: true, paid: false });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc("mark_order_paid", {
    p_order_id: payload.order_id,
    p_provider_ref: payload.provider_ref,
    p_amount: payload.amount,
  });

  if (error) {
    // 500 dönerek sağlayıcının yeniden denemesini sağlıyoruz; mark_order_paid idempotent.
    console.error("payment-webhook: mark_order_paid hatası", error.message);
    return json(500, { error: "update_failed" });
  }

  return json(200, { received: true, paid: data === true });
});
