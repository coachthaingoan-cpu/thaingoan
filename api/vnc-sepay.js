// vnc-connect v1.0.0
// POST /api/vnc-sepay : SePay gọi vào đây mỗi khi có tiền vào tài khoản.
// Tìm mã đơn trong nội dung chuyển khoản, đủ tiền thì đánh dấu đã thanh toán và gắn tag người mua bên email.
// Cài trên SePay: Webhook, chọn sự kiện Tiền vào, kiểu xác thực API Key, giá trị giống biến SEPAY_WEBHOOK_KEY.
"use strict";
const crypto = require("crypto");
const vnc = require("../lib/vnc-connect");

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (_) { return {}; } }
  return {};
}
function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(200).json({ ok: true, info: "Webhook SePay của funnel. SePay gửi POST vào đây." });
  const key = process.env.SEPAY_WEBHOOK_KEY || "";
  if (!key) return res.status(503).json({ success: false, error: "Chưa cài SEPAY_WEBHOOK_KEY" });
  const auth = String(req.headers.authorization || req.headers.Authorization || "");
  const given = auth.replace(/^\s*apikey\s+/i, "").trim();
  if (!same(given, key)) return res.status(401).json({ success: false, error: "Sai API Key" });
  const r = await vnc.handleBankTransfer(readBody(req));
  return res.status(200).json({ success: true, matched: !!r.matched, paid: !!r.paid });
};
