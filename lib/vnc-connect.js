// vnc-connect v1.0.0
// Lớp kết nối dùng chung cho funnel của VNC.
// Việc của file này: mỗi khi funnel có lead, có đơn, có tiền về, thì
//   1) lưu vào Supabase (nếu đã cài SUPABASE_URL và SUPABASE_SECRET_KEY)
//   2) đẩy người đó sang nền tảng email (nếu đã cài EMAIL_PROVIDER và EMAIL_API_KEY)
// Thiếu biến nào thì phần đó tự bỏ qua. Mọi lỗi chỉ ghi log, không bao giờ làm hỏng trang bán hàng.
// Không cần cài thư viện. Chạy trên Node 18 trở lên (Vercel mặc định đã đủ).

"use strict";

const crypto = require("crypto");

const VERSION = "1.0.0";

function env(k, d) {
  const v = process.env[k];
  return v == null || String(v).trim() === "" ? (d == null ? "" : d) : String(v).trim();
}
const TIMEOUT = () => Number(env("VNC_TIMEOUT_MS", "5000")) || 5000;

function log() {
  try { console.error.apply(console, ["[vnc-connect]"].concat([].slice.call(arguments))); } catch (_) {}
}

// ---------- Chuẩn hoá dữ liệu ----------

function clean(s, max) {
  return String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max || 300);
}
function noAccent(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
}
function normPhone(p) {
  let s = String(p == null ? "" : p).replace(/[^\d+]/g, "");
  if (s.startsWith("+84")) s = "0" + s.slice(3);
  else if (/^84\d{9}$/.test(s)) s = "0" + s.slice(2);
  return s;
}
function validPhone(p) { return /^0\d{9}$/.test(p); }
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
function givenName(full) {
  const parts = clean(full, 80).split(" ").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}
function normCode(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function arr(x) {
  if (Array.isArray(x)) return x.map(String);
  if (typeof x === "string" && x.trim()) return x.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}
function num(x) {
  const n = Number(String(x == null ? "" : x).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const ALIASES = {
  name: ["name", "fullname", "full_name", "hoten", "ho_ten", "hoTen", "ten", "your_name"],
  phone: ["phone", "sdt", "so_dien_thoai", "soDienThoai", "zalo", "phone_number", "tel", "mobile", "dien_thoai"],
  email: ["email", "mail", "email_address", "e_mail"],
  source: ["source", "utm_source"],
  campaign: ["campaign", "utm_campaign"],
  ad: ["ad", "utm_content", "utm_term", "adset"],
};
const KNOWN = new Set([].concat(
  ALIASES.name, ALIASES.phone, ALIASES.email, ALIASES.source, ALIASES.campaign, ALIASES.ad,
  ["type", "event", "status", "code", "amount", "received", "items", "bumps", "paid", "via", "at", "secret", "funnel"]
));

function pickText(o, keys, max) {
  for (const k of keys) if (o[k] != null && String(o[k]).trim() !== "") return clean(o[k], max);
  return "";
}
function pickPhone(o) {
  for (const k of ALIASES.phone) {
    if (o[k] == null) continue;
    const p = normPhone(o[k]);
    if (validPhone(p)) return p;
  }
  return "";
}
function pickEmail(o) {
  for (const k of ALIASES.email) {
    if (o[k] == null) continue;
    const e = clean(o[k], 160).toLowerCase();
    if (validEmail(e)) return e;
  }
  return "";
}

function normalize(p) {
  const d = {
    name: pickText(p, ALIASES.name, 100),
    phone: pickPhone(p),
    email: pickEmail(p),
    source: pickText(p, ALIASES.source, 80),
    campaign: pickText(p, ALIASES.campaign, 120),
    ad: pickText(p, ALIASES.ad, 160),
    code: normCode(p.code).slice(0, 40),
    amount: num(p.amount),
    received: num(p.received),
    items: clean(p.items, 500),
    bumps: arr(p.bumps).slice(0, 20),
    via: clean(p.via, 40),
    funnel: clean(p.funnel, 80) || funnelName(),
    extra: {},
  };
  let n = 0;
  for (const k of Object.keys(p)) {
    if (KNOWN.has(k) || /secret|token|password|passwd|api_?key/i.test(k)) continue;
    const v = p[k];
    if (v == null || typeof v === "object") continue;
    if (++n > 40) break;
    d.extra[clean(k, 60)] = clean(v, 1000);
  }
  return d;
}

function funnelName() {
  return env("FUNNEL_NAME") || env("VERCEL_PROJECT_PRODUCTION_URL").split(".")[0] || "funnel";
}

// lead | booking | pending | paid | test
function kindOf(p) {
  const t = noAccent(p.type || p.event || "");
  const st = noAccent(p.status || "");
  if (t === "test") return "test";
  if (t === "lead" || t === "dang ky" || t === "optin" || t === "opt-in") return "lead";
  if (t.includes("booking") || t.includes("dat lich") || t === "call") return "booking";
  if (t.includes("order") || t === "don" || t === "don hang" || (p.code && !t)) {
    if (p.paid === true || /^(paid|success|da thanh toan|thanh cong|da tra)/.test(st)) return "paid";
    return "pending";
  }
  return "lead";
}

// ---------- HTTP ----------

async function http(method, url, headers, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT());
  try {
    const r = await fetch(url, {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
    return { ok: r.ok, status: r.status, data, text: text.slice(0, 500) };
  } catch (e) {
    return { ok: false, status: 0, data: null, text: String((e && e.name === "AbortError") ? "timeout" : (e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

function settle(promise) {
  return Promise.resolve(promise).then(
    (v) => v,
    (e) => ({ ok: false, error: String((e && e.message) || e) })
  );
}

// ---------- Supabase ----------

function sbConf() {
  const url = env("SUPABASE_URL").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const key = env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
  return url && key ? { url, key } : null;
}

async function sb(method, path, body, prefer) {
  const c = sbConf();
  if (!c) return { ok: false, skipped: true, status: 0, data: null, text: "chưa cài Supabase" };
  const headers = { apikey: c.key, "Content-Type": "application/json", Accept: "application/json" };
  // Key cũ (service_role) là JWT nên gửi kèm Authorization. Key mới sb_secret_ chỉ gửi apikey.
  if (c.key.startsWith("eyJ")) headers.Authorization = "Bearer " + c.key;
  if (prefer) headers.Prefer = prefer;
  return http(method, c.url + "/rest/v1/" + path, headers, body);
}

function sbHint(r) {
  if (!r) return "";
  const code = (r.data && r.data.code) || "";
  if (r.status === 401 || r.status === 403 && !code) return "Sai SUPABASE_SECRET_KEY (hoặc dán nhầm publishable key).";
  if (code === "PGRST205" || code === "42P01" || /does not exist|schema cache/i.test(r.text)) return "Chưa tạo bảng: chạy file schema.sql trong Supabase SQL Editor.";
  if (code === "42501" || /permission denied/i.test(r.text)) return "Thiếu quyền truy cập bảng: chạy lại toàn bộ file schema.sql (phần grant).";
  if (r.status === 0) return "Không gọi được Supabase: kiểm tra SUPABASE_URL, hoặc dự án Free đang bị tạm dừng (vào Supabase bấm Resume project).";
  return "Supabase trả lỗi " + r.status + ": " + r.text.slice(0, 200);
}

function compact(o) {
  const out = {};
  for (const k of Object.keys(o)) if (o[k] !== undefined && o[k] !== null && o[k] !== "") out[k] = o[k];
  return out;
}
const enc = encodeURIComponent;

async function dbInsertLead(kind, d) {
  if (!sbConf()) return { ok: false, skipped: true };
  const row = compact({
    funnel: d.funnel, type: kind, name: d.name, phone: d.phone, email: d.email,
    source: d.source, campaign: d.campaign, ad: d.ad,
  });
  row.extra = d.extra || {};
  const r = await sb("POST", "vnc_leads", row, "return=minimal");
  if (!r.ok) log("lưu lead lỗi:", sbHint(r));
  return { ok: r.ok, error: r.ok ? undefined : sbHint(r) };
}

async function dbUpsertPending(d) {
  if (!sbConf()) return { ok: false, skipped: true };
  const now = new Date().toISOString();
  const row = compact({
    code: d.code, funnel: d.funnel, amount: d.amount, name: d.name, phone: d.phone, email: d.email,
    items: d.items, source: d.source, campaign: d.campaign, ad: d.ad, updated_at: now,
  });
  if (d.bumps.length) row.bumps = d.bumps;
  if (Object.keys(d.extra || {}).length) row.extra = d.extra;
  const r = await sb("POST", "vnc_orders?on_conflict=code", row, "resolution=merge-duplicates,return=minimal");
  if (!r.ok) log("lưu đơn lỗi:", sbHint(r));
  return { ok: r.ok, error: r.ok ? undefined : sbHint(r) };
}

// Đánh dấu đơn đã thanh toán. Chạy nhiều lần vẫn an toàn.
// Trả về { row, first } với first = true nếu đây là lần đầu đơn chuyển sang đã thanh toán.
async function dbMarkPaid(d) {
  if (!sbConf() || !d.code) return null;
  const now = new Date().toISOString();
  const patch = compact({ status: "paid", paid_at: now, received: d.received, paid_via: d.via || "funnel", updated_at: now });
  if (d.bumps.length) patch.bumps = d.bumps;
  const r = await sb("PATCH", "vnc_orders?code=eq." + enc(d.code) + "&status=neq.paid", patch, "return=representation");
  if (r.ok && Array.isArray(r.data) && r.data.length) return { row: r.data[0], first: true };
  if (!r.ok) log("cập nhật đơn lỗi:", sbHint(r));
  const g = await sb("GET", "vnc_orders?code=eq." + enc(d.code) + "&select=*&limit=1");
  if (g.ok && Array.isArray(g.data) && g.data.length) return { row: g.data[0], first: false };
  // Chưa có dòng đơn (ví dụ Supabase được nối sau khi đơn đã tạo): tạo mới.
  const ins = compact({
    code: d.code, funnel: d.funnel, status: "paid", amount: d.amount, received: d.received,
    name: d.name, phone: d.phone, email: d.email, paid_at: now, paid_via: d.via || "funnel", updated_at: now,
  });
  if (d.bumps.length) ins.bumps = d.bumps;
  const c = await sb("POST", "vnc_orders?on_conflict=code", ins, "resolution=merge-duplicates,return=representation");
  if (!c.ok) log("tạo đơn đã thanh toán lỗi:", sbHint(c));
  return { row: (c.ok && Array.isArray(c.data) && c.data[0]) || ins, first: true };
}

// ---------- Nền tảng email ----------
// EMAIL_PROVIDER: kit | brevo | getresponse | mailchimp
// EMAIL_TARGET_LEAD / _BOOKING / _PENDING / _BUYER / _BUMP_<ID>:
//   Kit: ID tag (hoặc "seq:ID" để thêm thẳng vào chuỗi email, "form:ID" để thêm vào form). Brevo: ID danh sách (list). GetResponse: campaignId (danh sách). Mailchimp: tên tag.
//   Nhiều giá trị thì ngăn bằng dấu phẩy.

function emailConf() {
  const provider = env("EMAIL_PROVIDER").toLowerCase().replace(/[^a-z]/g, "");
  const key = env("EMAIL_API_KEY");
  if (!provider || !key) return null;
  return { provider: provider === "convertkit" ? "kit" : provider, key };
}
function targets(name) { return arr(env("EMAIL_TARGET_" + name)); }
function firstName(full) {
  return env("EMAIL_NAME_MODE").toLowerCase() === "full" ? clean(full, 100) : givenName(full);
}

const PROVIDERS = {
  async kit(c, person, add, remove) {
    const base = env("VNC_KIT_BASE", "https://api.kit.com");
    const h = { "X-Kit-Api-Key": c.key, "Content-Type": "application/json", Accept: "application/json" };
    const body = { email_address: person.email, state: "active" };
    const fn = firstName(person.name);
    if (fn) body.first_name = fn;
    const pf = env("EMAIL_PHONE_FIELD");
    if (pf && person.phone) body.fields = { [pf]: person.phone };
    let r = await http("POST", base + "/v4/subscribers", h, body);
    if (!r.ok && body.fields) { delete body.fields; r = await http("POST", base + "/v4/subscribers", h, body); }
    if (!r.ok) throw new Error("Kit tạo người nhận lỗi " + r.status + ": " + r.text.slice(0, 160));
    // Mỗi giá trị target: số hoặc "tag:123" là tag, "seq:123" là chuỗi email (sequence), "form:123" là form.
    const errs = [];
    for (const raw of add) {
      const m = /^(tag|seq|sequence|form):\s*(.+)$/i.exec(raw);
      const kind = m ? m[1].toLowerCase() : "tag";
      const id = m ? m[2].trim() : raw;
      const path = kind === "form" ? "/v4/forms/" : kind === "tag" ? "/v4/tags/" : "/v4/sequences/";
      const t = await http("POST", base + path + enc(id) + "/subscribers", h, { email_address: person.email });
      if (!t.ok) errs.push(kind + " " + id + " lỗi " + t.status);
    }
    for (const raw of remove) {
      const m = /^(tag|seq|sequence|form):\s*(.+)$/i.exec(raw);
      if (m && m[1].toLowerCase() !== "tag") continue; // chỉ gỡ được tag
      const id = m ? m[2].trim() : raw;
      await http("DELETE", base + "/v4/tags/" + enc(id) + "/subscribers?email_address=" + enc(person.email), h);
    }
    if (errs.length) throw new Error("Kit: " + errs.join("; "));
    return true;
  },

  async brevo(c, person, add, remove) {
    const base = env("VNC_BREVO_BASE", "https://api.brevo.com/v3");
    const h = { "api-key": c.key, "Content-Type": "application/json", Accept: "application/json" };
    const attrs = {};
    const fn = firstName(person.name);
    if (fn) attrs[env("EMAIL_NAME_FIELD", "FIRSTNAME")] = fn;
    const pf = env("EMAIL_PHONE_FIELD");
    if (pf && person.phone) attrs[pf] = pf.toUpperCase() === "SMS" ? "+84" + person.phone.slice(1) : person.phone;
    const body = { email: person.email, attributes: attrs, updateEnabled: true };
    const lists = add.map(Number).filter(Number.isFinite);
    if (lists.length) body.listIds = lists;
    let r = await http("POST", base + "/contacts", h, body);
    if (!r.ok && r.status === 400) { delete body.attributes; r = await http("POST", base + "/contacts", h, body); }
    if (!r.ok) throw new Error("Brevo lỗi " + r.status + ": " + r.text.slice(0, 160));
    for (const id of remove) {
      await http("POST", base + "/contacts/lists/" + enc(id) + "/contacts/remove", h, { emails: [person.email] });
    }
    return true;
  },

  async getresponse(c, person, add, remove) {
    const base = env("VNC_GR_BASE", "https://api.getresponse.com/v3");
    const h = { "X-Auth-Token": "api-key " + c.key, "Content-Type": "application/json", Accept: "application/json" };
    if (env("GETRESPONSE_DOMAIN")) h["X-Domain"] = env("GETRESPONSE_DOMAIN");
    const errs = [];
    for (const campaignId of add) {
      const body = { email: person.email, campaign: { campaignId }, dayOfCycle: 0 };
      // Gửi tên gọi (Lan) thay vì họ tên (Nguyễn Thị Lan) để thẻ [[name]] trong email chào đúng tên.
      let nm = firstName(person.name);
      if (nm.length < 2) nm = clean(person.name, 120);
      if (nm.length >= 2) body.name = nm;
      const pf = env("EMAIL_PHONE_FIELD");
      if (pf && person.phone) body.customFieldValues = [{ customFieldId: pf, value: [person.phone] }];
      let r = await http("POST", base + "/contacts", h, body);
      if (!r.ok && r.status === 400 && body.customFieldValues) { delete body.customFieldValues; r = await http("POST", base + "/contacts", h, body); }
      if (!r.ok && r.status !== 409) errs.push("thêm vào " + campaignId + " lỗi " + r.status + ": " + r.text.slice(0, 120));
    }
    for (const campaignId of remove) {
      const q = await http("GET", base + "/contacts?query[email]=" + enc(person.email) + "&query[campaignId]=" + enc(campaignId) + "&fields=contactId", h);
      if (q.ok && Array.isArray(q.data)) {
        for (const ct of q.data) if (ct && ct.contactId) await http("DELETE", base + "/contacts/" + enc(ct.contactId), h);
      }
    }
    if (errs.length) throw new Error("GetResponse: " + errs.join("; "));
    return true;
  },

  async mailchimp(c, person, add, remove) {
    const list = env("EMAIL_LIST_ID");
    if (!list) throw new Error("Mailchimp cần EMAIL_LIST_ID (Audience ID).");
    const dc = (c.key.split("-")[1] || "").trim();
    const base = env("VNC_MC_BASE", "https://" + dc + ".api.mailchimp.com/3.0");
    const h = {
      Authorization: "Basic " + Buffer.from("vnc:" + c.key).toString("base64"),
      "Content-Type": "application/json", Accept: "application/json",
    };
    const hash = crypto.createHash("md5").update(person.email.toLowerCase()).digest("hex");
    const mf = {};
    const fn = firstName(person.name);
    if (fn) mf[env("EMAIL_NAME_FIELD", "FNAME")] = fn;
    const pf = env("EMAIL_PHONE_FIELD");
    if (pf && person.phone) mf[pf] = person.phone;
    const body = { email_address: person.email, status_if_new: "subscribed", merge_fields: mf };
    const url = base + "/lists/" + enc(list) + "/members/" + hash;
    let r = await http("PUT", url, h, body);
    if (!r.ok && r.status === 400) { delete body.merge_fields; r = await http("PUT", url, h, body); }
    if (!r.ok) throw new Error("Mailchimp lỗi " + r.status + ": " + r.text.slice(0, 160));
    const tags = add.map((name) => ({ name, status: "active" })).concat(remove.map((name) => ({ name, status: "inactive" })));
    if (tags.length) {
      const t = await http("POST", url + "/tags", h, { tags });
      if (!t.ok) throw new Error("Mailchimp gắn tag lỗi " + t.status);
    }
    return true;
  },
};

async function emailSync(person, add, remove) {
  const c = emailConf();
  if (!c) return { ok: false, skipped: true };
  if (!person || !validEmail(person.email || "")) return { ok: false, skipped: true, error: "không có email" };
  const fn = PROVIDERS[c.provider];
  if (!fn) return { ok: false, error: "EMAIL_PROVIDER không hỗ trợ: " + c.provider + " (dùng kit, brevo, getresponse hoặc mailchimp)" };
  const addT = add.filter(Boolean);
  const remT = remove.filter((x) => x && !addT.includes(x));
  if (!addT.length && !remT.length && c.provider !== "kit" && c.provider !== "brevo" && c.provider !== "mailchimp") {
    return { ok: false, skipped: true, error: "chưa cài EMAIL_TARGET cho bước này" };
  }
  try {
    await fn(c, person, addT, remT);
    return { ok: true };
  } catch (e) {
    log("email lỗi:", e.message);
    return { ok: false, error: e.message };
  }
}

// ---------- Luồng chính ----------

async function processPaid(d) {
  const m = await dbMarkPaid(d);
  const row = (m && m.row) || {};
  const person = { email: row.email || d.email, name: row.name || d.name, phone: row.phone || d.phone };
  const bumps = d.bumps.length ? d.bumps : arr(row.bumps);
  const out = { first: m ? m.first : null, code: d.code, db: m ? "ok" : (sbConf() ? "error" : "skip"), email: "skip" };
  if (!emailConf()) return out;
  if (row.email_synced_at) { out.email = "đã gửi trước đó"; return out; }
  if (!validEmail(person.email || "")) { out.email = "không có email để gắn"; return out; }
  const add = targets("BUYER").concat(...bumps.map((b) => targets("BUMP_" + normCode(b))));
  const e = await emailSync(person, add, targets("PENDING"));
  out.email = e.ok ? "ok" : (e.skipped ? "skip" : e.error);
  if (e.ok && m && d.code) {
    await sb("PATCH", "vnc_orders?code=eq." + enc(d.code), { email_synced_at: new Date().toISOString() }, "return=minimal");
  }
  return out;
}

async function emit(payload) {
  const res = { version: VERSION, kind: null, db: "skip", email: "skip" };
  try {
    const p = payload && typeof payload === "object" ? payload : {};
    const kind = kindOf(p);
    res.kind = kind;
    const d = normalize(p);

    if (kind === "lead" || kind === "booking" || kind === "test") {
      if (kind !== "test" && !d.email && !d.phone) { res.db = "bỏ qua: không có email hoặc số điện thoại hợp lệ"; return res; }
      const jobs = [settle(dbInsertLead(kind, d))];
      if (kind !== "test") jobs.push(settle(emailSync(d, targets(kind === "booking" ? "BOOKING" : "LEAD"), [])));
      const [a, b] = await Promise.all(jobs);
      res.db = a.skipped ? "skip" : a.ok ? "ok" : a.error;
      if (b) res.email = b.skipped ? "skip" : b.ok ? "ok" : b.error;
      return res;
    }

    if (kind === "pending") {
      if (!d.code) { res.db = "bỏ qua: đơn không có mã"; return res; }
      const [a, b] = await Promise.all([
        settle(dbUpsertPending(d)),
        settle(emailSync(d, targets("PENDING"), [])),
      ]);
      res.db = a.skipped ? "skip" : a.ok ? "ok" : a.error;
      res.email = b.skipped ? "skip" : b.ok ? "ok" : b.error;
      return res;
    }

    if (kind === "paid") {
      if (!d.code && !d.email) { res.db = "bỏ qua: không có mã đơn"; return res; }
      const r = await processPaid(d);
      res.db = r.db;
      res.email = r.email;
      res.first = r.first;
      return res;
    }
  } catch (e) {
    log("emit lỗi:", (e && e.message) || e);
    res.error = String((e && e.message) || e);
  }
  return res;
}

// ---------- Tiền về qua webhook SePay ----------
// Xác nhận đơn kể cả khi khách đã đóng trang thanh toán.

async function handleBankTransfer(t) {
  try {
    if (!t || typeof t !== "object") return { skipped: "payload rỗng" };
    if (String(t.transferType || "").toLowerCase() !== "in") return { skipped: "không phải tiền vào" };
    if (!sbConf()) return { skipped: "chưa cài Supabase" };
    const amount = num(t.transferAmount) || 0;
    const hay = normCode(t.content) + "|" + normCode(t.code) + "|" + normCode(t.description);

    let order = null;
    const direct = normCode(t.code);
    if (direct) {
      const g = await sb("GET", "vnc_orders?code=eq." + enc(direct) + "&select=code,amount,status&limit=1");
      if (g.ok && Array.isArray(g.data) && g.data.length) order = g.data[0];
    }
    if (!order) {
      const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString();
      const q = await sb("GET", "vnc_orders?status=eq.pending&created_at=gte." + enc(since) + "&select=code,amount,status&order=created_at.desc&limit=3000");
      if (q.ok && Array.isArray(q.data)) {
        order = q.data
          .filter((o) => o.code && o.code.length >= 4 && hay.includes(normCode(o.code)))
          .sort((a, b) => b.code.length - a.code.length)[0] || null;
      }
    }

    const payRow = compact({
      id: num(t.id), gateway: clean(t.gateway, 60), account_number: clean(t.accountNumber, 40),
      sub_account: clean(t.subAccount, 40), code: clean(t.code, 60), content: clean(t.content, 500),
      amount, reference_code: clean(t.referenceCode, 80), transaction_date: clean(t.transactionDate, 40),
      matched_order: order ? order.code : null,
    });
    payRow.raw = t;
    if (payRow.id == null) return { skipped: "giao dịch không có id" };
    const ins = await sb("POST", "vnc_payments?on_conflict=id", payRow, "resolution=ignore-duplicates,return=minimal");
    if (!ins.ok) log("lưu giao dịch lỗi:", sbHint(ins));

    if (!order) return { matched: false };

    const s = await sb("GET", "vnc_payments?matched_order=eq." + enc(order.code) + "&select=amount");
    const sum = s.ok && Array.isArray(s.data) ? s.data.reduce((a, x) => a + (num(x.amount) || 0), 0) : amount;
    const need = num(order.amount) || 0;
    if (sum < need) return { matched: true, code: order.code, paid: false, received: sum, need };

    const d = normalize({ type: "order", status: "paid", code: order.code, amount: need, received: sum, via: "sepay-webhook" });
    const r = await processPaid(d);
    return { matched: true, code: order.code, paid: true, received: sum, first: r.first, email: r.email };
  } catch (e) {
    log("webhook lỗi:", (e && e.message) || e);
    return { error: String((e && e.message) || e) };
  }
}

// ---------- Liệt kê nhóm trên nền tảng email (để lấy ID điền vào EMAIL_TARGET_...) ----------

async function listGroups(c) {
  try {
    if (c.provider === "kit") {
      const base = env("VNC_KIT_BASE", "https://api.kit.com");
      const h = { "X-Kit-Api-Key": c.key, Accept: "application/json" };
      const t = await http("GET", base + "/v4/tags?per_page=500", h);
      const q = await http("GET", base + "/v4/sequences?per_page=500", h);
      return {
        tags: ((t.data && t.data.tags) || []).map((x) => ({ id: x.id, name: x.name })),
        sequences: ((q.data && q.data.sequences) || []).map((x) => ({ id: "seq:" + x.id, name: x.name })),
      };
    }
    if (c.provider === "brevo") {
      const r = await http("GET", env("VNC_BREVO_BASE", "https://api.brevo.com/v3") + "/contacts/lists?limit=50", { "api-key": c.key, Accept: "application/json" });
      return { lists: ((r.data && r.data.lists) || []).map((x) => ({ id: x.id, name: x.name })) };
    }
    if (c.provider === "getresponse") {
      const h = { "X-Auth-Token": "api-key " + c.key, Accept: "application/json" };
      if (env("GETRESPONSE_DOMAIN")) h["X-Domain"] = env("GETRESPONSE_DOMAIN");
      const r = await http("GET", env("VNC_GR_BASE", "https://api.getresponse.com/v3") + "/campaigns?perPage=100", h);
      return { lists: (Array.isArray(r.data) ? r.data : []).map((x) => ({ id: x.campaignId, name: x.name })) };
    }
    if (c.provider === "mailchimp") {
      const dc = (c.key.split("-")[1] || "").trim();
      const r = await http("GET", env("VNC_MC_BASE", "https://" + dc + ".api.mailchimp.com/3.0") + "/lists?count=50", { Authorization: "Basic " + Buffer.from("vnc:" + c.key).toString("base64") });
      return { audiences: ((r.data && r.data.lists) || []).map((x) => ({ id: x.id, name: x.name })), note: "Mailchimp: EMAIL_TARGET_... ghi tên tag, EMAIL_LIST_ID ghi id audience" };
    }
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
  return {};
}

// ---------- Kiểm tra cấu hình ----------

async function health(opts) {
  const o = opts || {};
  const out = {
    version: VERSION,
    funnel: funnelName(),
    supabase: { configured: !!sbConf() },
    email: { configured: !!emailConf(), provider: (emailConf() || {}).provider || null, targets: {} },
    sepayWebhook: { configured: !!env("SEPAY_WEBHOOK_KEY") },
  };
  for (const k of ["LEAD", "BOOKING", "PENDING", "BUYER"]) out.email.targets[k] = targets(k).length > 0;
  const bumps = Object.keys(process.env).filter((k) => k.startsWith("EMAIL_TARGET_BUMP_"));
  if (bumps.length) out.email.targets.BUMPS = bumps.map((k) => k.replace("EMAIL_TARGET_", ""));

  if (sbConf()) {
    const r = await sb("GET", "vnc_orders?select=code&limit=1");
    const r2 = r.ok ? await sb("GET", "vnc_leads?select=id&limit=1") : r;
    const r3 = r2.ok ? await sb("GET", "vnc_payments?select=id&limit=1") : r2;
    out.supabase.ok = !!(r.ok && r2.ok && r3.ok);
    if (!out.supabase.ok) out.supabase.error = sbHint(r.ok ? (r2.ok ? r3 : r2) : r);
    if (out.supabase.ok && o.test) {
      const ins = await sb("POST", "vnc_leads", { funnel: funnelName(), type: "test", name: "VNC kiem tra ket noi", extra: {} }, "return=representation");
      out.supabase.writeTest = ins.ok ? "ok" : sbHint(ins);
      if (ins.ok && Array.isArray(ins.data) && ins.data[0] && ins.data[0].id != null) {
        await sb("DELETE", "vnc_leads?id=eq." + enc(ins.data[0].id), null, "return=minimal");
      }
    }
  }

  const c = emailConf();
  if (c && o.lists) {
    out.email.lists = await listGroups(c);
  }
  if (c) {
    let r = null;
    if (c.provider === "kit") r = await http("GET", env("VNC_KIT_BASE", "https://api.kit.com") + "/v4/account", { "X-Kit-Api-Key": c.key, Accept: "application/json" });
    else if (c.provider === "brevo") r = await http("GET", env("VNC_BREVO_BASE", "https://api.brevo.com/v3") + "/account", { "api-key": c.key, Accept: "application/json" });
    else if (c.provider === "getresponse") {
      const h = { "X-Auth-Token": "api-key " + c.key, Accept: "application/json" };
      if (env("GETRESPONSE_DOMAIN")) h["X-Domain"] = env("GETRESPONSE_DOMAIN");
      r = await http("GET", env("VNC_GR_BASE", "https://api.getresponse.com/v3") + "/accounts", h);
    } else if (c.provider === "mailchimp") {
      const dc = (c.key.split("-")[1] || "").trim();
      r = await http("GET", env("VNC_MC_BASE", "https://" + dc + ".api.mailchimp.com/3.0") + "/ping", { Authorization: "Basic " + Buffer.from("vnc:" + c.key).toString("base64") });
      if (r.ok && !env("EMAIL_LIST_ID")) { r = { ok: false, status: 0, text: "thiếu EMAIL_LIST_ID" }; }
    } else {
      r = { ok: false, status: 0, text: "EMAIL_PROVIDER không hỗ trợ" };
    }
    out.email.ok = !!(r && r.ok);
    if (!out.email.ok) out.email.error = r && (r.status === 401 || r.status === 403) ? "Sai EMAIL_API_KEY." : (r ? (r.status + " " + r.text.slice(0, 160)) : "");
  }
  return out;
}

module.exports = {
  VERSION, emit, health, handleBankTransfer,
  // dùng cho kiểm thử
  _internal: { kindOf, normalize, normPhone, givenName, normCode, targets },
};
