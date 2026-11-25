// vnc-connect v1.0.0
// GET /api/vnc-health : xem nhanh funnel đã nối Supabase, email, webhook SePay chưa. Không lộ key.
// Thêm ?test=1 để thử ghi 1 dòng vào Supabase rồi xoá ngay.
// Thêm ?lists=1&key=<VNC_ADMIN_KEY> để xem tên và ID các nhóm (tag, list) trên nền tảng email.
"use strict";
const crypto = require("crypto");
const vnc = require("../lib/vnc-connect");

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const q = req.query || {};
  const admin = process.env.VNC_ADMIN_KEY || "";
  const lists = String(q.lists || "") === "1" && admin.length >= 16 && same(String(q.key || ""), admin);
  const out = await vnc.health({ test: String(q.test || "") === "1", lists });
  if (String(q.lists || "") === "1" && !lists) out.note = "Muốn xem danh sách nhóm: cài biến VNC_ADMIN_KEY (từ 16 ký tự) rồi thêm &key=<giá trị đó>.";
  return res.status(200).json(out);
};
