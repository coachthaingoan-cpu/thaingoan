/* vnc-connect v1.0.0
   Dùng cho funnel tĩnh (form gửi thẳng lên Google Sheet, không có api/lead.js).
   Tự bắt mọi form trên trang lúc khách bấm gửi, gửi thêm 1 bản sang /api/vnc-lead.
   Không chặn, không đổi cách form đang chạy.
   Form đặt lịch: thêm data-vnc="booking" vào thẻ <form>. Muốn bỏ qua 1 form: thêm data-vnc-off.
   Form không dùng sự kiện submit (bấm nút gọi hàm JS): gọi window.vncSend('lead', {name, phone, email}) trong hàm đó. */
(function () {
  if (window.vncSend) return;
  var ENDPOINT = "/api/vnc-lead";
  var sent = {};
  function normPhone(p) {
    var s = String(p || "").replace(/[^\d+]/g, "");
    if (s.indexOf("+84") === 0) s = "0" + s.slice(3);
    else if (/^84\d{9}$/.test(s)) s = "0" + s.slice(2);
    return s;
  }
  function okPhone(p) { return /^0\d{9}$/.test(normPhone(p)); }
  function okEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || "").trim()); }
  function utm() {
    var q = new URLSearchParams(location.search), out = {};
    var map = { utm_source: "source", utm_campaign: "campaign", utm_content: "ad" };
    for (var k in map) { var v = q.get(k); if (v) out[map[k]] = v; }
    return out;
  }
  window.vncSend = function (type, data) {
    try {
      data = data || {};
      var phone = "", email = "";
      for (var k in data) {
        var v = String(data[k] || "");
        if (!phone && okPhone(v) && !/@/.test(v)) phone = normPhone(v);
        if (!email && okEmail(v)) email = v.trim();
      }
      if (!phone && !email) return;
      var key = (type || "lead") + "|" + normPhone(phone) + "|" + String(email).toLowerCase();
      if (sent[key] && Date.now() - sent[key] < 15000) return;
      sent[key] = Date.now();
      var body = Object.assign({ type: type || "lead", page: location.pathname }, utm(), data);
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true
      }).catch(function () {});
    } catch (_) {}
  };
  document.addEventListener("submit", function (e) {
    try {
      var f = e.target;
      if (!f || f.tagName !== "FORM" || f.hasAttribute("data-vnc-off")) return;
      var data = {};
      new FormData(f).forEach(function (v, k) {
        if (typeof v === "string" && v.length < 2000 && !/pass|secret|token/i.test(k)) data[k] = v.trim();
      });
      f.querySelectorAll("input[id],select[id],textarea[id]").forEach(function (el) {
        if (!el.name && el.value && el.type !== "password" && el.type !== "hidden") data[el.id] = String(el.value).trim();
      });
      window.vncSend(f.getAttribute("data-vnc") || "lead", data);
    } catch (_) {}
  }, true);
})();
