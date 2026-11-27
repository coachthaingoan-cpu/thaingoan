// Gửi lượt Mua hàng thẳng từ máy chủ lên Meta (Conversions API) khi SePay xác nhận tiền về.
// event_id = mã đơn, trùng eventID mà pay.js bắn từ trình duyệt, nên Meta gộp lại, không đếm hai lần.
// Cần biến môi trường META_CAPI_TOKEN. Không có thì bỏ qua, không ảnh hưởng luồng thanh toán.
"use strict";
const crypto = require("crypto");

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
function normPhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) d = "84" + d.slice(1);
  return d;
}
function names(full) {
  const parts = String(full || "").trim().toLowerCase().normalize("NFC").split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  return { fn: parts[parts.length - 1], ln: parts.length > 1 ? parts[0] : undefined };
}

async function sendPurchase(o) {
  const token = (process.env.META_CAPI_TOKEN || "").trim();
  if (!token) return { skipped: "chưa cài META_CAPI_TOKEN" };
  const pixel = (process.env.META_PIXEL_ID || "2207963839391469").trim();
  if (!o || !o.code) return { skipped: "không có mã đơn" };
  const ud = {};
  const email = String(o.email || "").trim().toLowerCase();
  if (email) ud.em = [sha(email)];
  const ph = normPhone(o.phone);
  if (ph) ud.ph = [sha(ph)];
  const n = names(o.name);
  if (n.fn) ud.fn = [sha(n.fn)];
  if (n.ln) ud.ln = [sha(n.ln)];
  ud.country = [sha("vn")];
  ud.external_id = [sha(email || ph || o.code)];
  const t = o.paid_at ? Math.floor(new Date(o.paid_at).getTime() / 1000) : Math.floor(Date.now() / 1000);
  const body = {
    data: [{
      event_name: "Purchase",
      event_time: t,
      event_id: o.code,
      action_source: "website",
      event_source_url: process.env.META_EVENT_SOURCE_URL || "https://moneyroot.binhantaichinh.com/",
      user_data: ud,
      custom_data: { value: Number(o.amount) || 0, currency: "VND", content_name: o.items || "", order_id: o.code },
    }],
  };
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch("https://graph.facebook.com/v21.0/" + pixel + "/events?access_token=" + encodeURIComponent(token), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal,
    });
    const txt = await r.text();
    return r.ok ? { ok: true } : { ok: false, error: txt.slice(0, 300) };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  } finally { clearTimeout(timer); }
}

module.exports = { sendPurchase };
