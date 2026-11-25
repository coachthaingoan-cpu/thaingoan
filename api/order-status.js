// GET /api/order-status?code=MRXXXXXX : trang thanh toán hỏi đơn đã nhận tiền chưa.
// Chỉ trả về đã trả hay chưa, không trả thông tin khách.
"use strict";

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const code = String((req.query || {}).code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || "");
  if (!code || !url || !key) return res.status(200).json({ paid: false });
  try {
    const headers = { apikey: key, Accept: "application/json" };
    if (key.startsWith("eyJ")) headers.Authorization = "Bearer " + key;
    const r = await fetch(url + "/rest/v1/vnc_orders?code=eq." + encodeURIComponent(code) + "&select=status&limit=1", { headers });
    const data = r.ok ? await r.json() : [];
    return res.status(200).json({ paid: !!(data[0] && data[0].status === "paid") });
  } catch (_) {
    return res.status(200).json({ paid: false });
  }
};
