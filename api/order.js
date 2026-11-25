// POST /api/order : tạo đơn có mã riêng cho trang thanh toán Money Root.
// Giá lấy ở máy chủ, không tin số tiền trình duyệt gửi lên.
// Lưu đơn "chờ thanh toán" vào Supabase (qua vnc-connect). SePay báo tiền về thì /api/vnc-sepay đánh dấu đã trả và gắn tag Kit.
"use strict";
const crypto = require("crypto");
const vnc = require("../lib/vnc-connect");

const PRODUCTS = {
  ws: { prefix: "MR", amount: 299000, name: "Money Root Workshop 08/12", tag: "WS" },
  vip: { prefix: "VIP", amount: 200000, name: "Nang cap VIP Money Root Workshop", tag: "VIP" },
};
const BUMP = { amount: 99000, name: "Money Date Kit", tag: "KIT" };

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (_) { return {}; } }
  return {};
}
function newCode(prefix) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  let s = "";
  for (let i = 0; i < 6; i++) s += abc[bytes[i] % abc.length];
  return prefix + s;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Chỉ nhận POST" });
  const b = readBody(req);
  const p = PRODUCTS[String(b.kind || "").toLowerCase()];
  if (!p) return res.status(400).json({ ok: false, error: "Sản phẩm không đúng" });
  const withBump = p === PRODUCTS.ws && (b.bump === true || b.bump === "1" || b.bump === "true");
  const amount = p.amount + (withBump ? BUMP.amount : 0);
  const code = newCode(p.prefix);
  const bumps = [p.tag].concat(withBump ? [BUMP.tag] : []);

  const r = await vnc.emit({
    type: "order",
    code,
    amount,
    items: p.name + (withBump ? " + " + BUMP.name : ""),
    bumps,
    fullname: b.fullname,
    zalo: b.zalo,
    email: b.email,
    utm_source: b.source,
    utm_campaign: b.campaign,
    utm_content: b.ad,
  });
  // Lưu đơn lỗi vẫn trả mã để khách chuyển khoản được; Thái Ngoan đối chiếu tay trên SePay.
  return res.status(200).json({ ok: true, code, amount, saved: r.db === "ok" });
};
