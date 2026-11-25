// vnc-connect v1.0.0
// POST /api/vnc-lead : nhận form từ trang (dùng cho funnel tĩnh chưa có api/lead.js riêng).
// Lưu vào Supabase và đẩy sang nền tảng email nếu đã cài. Không cài gì thì chỉ trả ok.
"use strict";
const vnc = require("../lib/vnc-connect");

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (_) { return {}; } }
  return {};
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Chỉ nhận POST" });
  const b = readBody(req);
  // Ô bẫy chống spam: người thật không điền ô này.
  if (b.website || b._hp || b.hp) return res.status(200).json({ ok: true });
  const type = String(b.type || "").toLowerCase() === "booking" ? "booking" : "lead";
  const r = await vnc.emit(Object.assign({}, b, { type }));
  if (typeof r.db === "string" && r.db.indexOf("bỏ qua") === 0) return res.status(400).json({ ok: false, error: "Cần số Zalo 10 số hoặc email đúng." });
  return res.status(200).json({ ok: true, email: r.email });
};
