// POST /api/hoi : luu cau hoi gui truoc buoi live vao bang vnc_questions (Supabase).
"use strict";
function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (_) { return {}; } }
  return {};
}
const t = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const b = body(req);
  if (b.website) return res.status(200).json({ ok: true });
  const q = String(b.cau_hoi || "").trim().slice(0, 2000);
  if (q.length < 3) return res.status(400).json({ ok: false, error: "Chị ghi câu hỏi giúp Ngoan nhé." });
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return res.status(500).json({ ok: false, error: "Chưa cài Supabase" });
  const tran = (Array.isArray(b.tran_tro) ? b.tran_tro : [b.tran_tro]).filter(Boolean).map((x) => t(x, 120)).slice(0, 10);
  const row = {
    name: t(b.name, 80) || null, zalo: t(b.zalo, 20) || null, nganh: t(b.nganh, 80) || null,
    tien_ve: t(b.tien_ve, 40) || null, tran_tro: tran, cau_hoi: q,
    mong_muon: String(b.mong_muon || "").trim().slice(0, 1000) || null,
    source: t(b.source, 80) || null, extra: { ua: t(req.headers["user-agent"], 200) },
  };
  const h = { apikey: key, "Content-Type": "application/json", Prefer: "return=minimal" };
  if (key.startsWith("eyJ")) h.Authorization = "Bearer " + key;
  try {
    const r = await fetch(url + "/rest/v1/vnc_questions", { method: "POST", headers: h, body: JSON.stringify(row) });
    if (!r.ok) return res.status(500).json({ ok: false, error: "Lưu chưa được, chị thử lại giúp Ngoan." });
  } catch (_) { return res.status(500).json({ ok: false, error: "Lưu chưa được, chị thử lại giúp Ngoan." }); }
  return res.status(200).json({ ok: true });
};
