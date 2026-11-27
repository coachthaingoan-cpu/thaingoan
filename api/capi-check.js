// Tạm thời: gửi lại lượt Mua hàng (Conversions API) cho một đơn ĐÃ THANH TOÁN trong 3 ngày qua, để kiểm tra mã truy cập.
// event_id = mã đơn nên Meta gộp với lượt từ trình duyệt, không đếm trùng.
"use strict";
const { sendPurchase } = require("../lib/meta-capi");
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const code = String((req.query && req.query.code) || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 20);
  if (!code) return res.status(400).json({ ok: false, error: "thiếu code" });
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const since = new Date(Date.now() - 3 * 864e5).toISOString();
  const r = await fetch(url + "/rest/v1/vnc_orders?code=eq." + code + "&status=eq.paid&paid_at=gte." + encodeURIComponent(since) + "&select=*&limit=1", { headers: { apikey: key, Authorization: "Bearer " + key } });
  const rows = r.ok ? await r.json() : [];
  if (!rows.length) return res.status(404).json({ ok: false, error: "không có đơn đã thanh toán gần đây với mã này" });
  const o = rows[0];
  const c = await sendPurchase({ code: o.code, amount: o.amount, email: o.email, phone: o.phone, name: o.name, items: o.items, paid_at: o.paid_at });
  return res.status(200).json(c);
};
