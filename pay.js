/* Thanh toán chuyển khoản VietQR (ACB, hộ kinh doanh). Dùng: MRPay.open({ amount, prefix, goi, next }) */
(function () {
  var BANK = { code: 'ACB', acc: '51449897', name: 'HO KINH DOANH COACH THAI NGOAN BINH AN TAI CHINH', label: 'ACB, Ngân hàng TMCP Á Châu' };
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbzVv_4f-BZKnlcRw48q89jmtYKAjD6To7Qu_i4j21tG2KSu9RdLm1yz0vMdY--Nlb8pPw/exec';
  var ZALO = '0914309986';

  var css = '.mrp{border:0;padding:0;margin:auto;border-radius:16px;max-width:420px;width:calc(100% - 24px);background:#F7F2E8;color:#14262B;font-family:"Be Vietnam Pro",system-ui,sans-serif}' +
    '.mrp::backdrop{background:rgba(11,33,40,.72)}' +
    '.mrp-in{padding:22px 20px 20px;max-height:calc(100vh - 24px);overflow:auto}' +
    '.mrp h3{font:700 24px/30px "Cormorant Garamond",Georgia,serif;margin:0 32px 4px 0}' +
    '.mrp-x{position:absolute;top:10px;right:12px;border:0;background:none;font-size:28px;line-height:1;cursor:pointer;color:#4A5C61;padding:6px}' +
    '.mrp-sub{font-size:14px;line-height:21px;color:#4A5C61;margin-bottom:14px}' +
    '.mrp-qr{display:block;width:100%;max-width:260px;margin:0 auto 12px;background:#fff;border-radius:12px;aspect-ratio:1/1;object-fit:contain}' +
    '.mrp-rows{background:#FFFDF8;border:1px solid rgba(201,169,106,.45);border-radius:12px;padding:4px 14px;margin-bottom:12px}' +
    '.mrp-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #EDE6D6;font-size:14px;line-height:20px}' +
    '.mrp-row:last-child{border-bottom:0}.mrp-row span{color:#4A5C61}.mrp-row b{text-align:right;font-weight:600;word-break:break-word}' +
    '.mrp-cp{border:1px solid #C9A96A;background:#fff;border-radius:999px;font-size:12px;padding:2px 10px;margin-left:8px;cursor:pointer;color:#7A5C24;white-space:nowrap}' +
    '.mrp-note{font-size:13px;line-height:20px;color:#4A5C61;margin:0 0 14px}' +
    '.mrp-f{margin-bottom:10px}.mrp-f label{display:block;font-size:13px;font-weight:600;margin-bottom:4px}' +
    '.mrp-f input{width:100%;min-height:46px;padding:10px 12px;border:1px solid #CFC4AE;border-radius:10px;font:400 16px/22px "Be Vietnam Pro",system-ui,sans-serif;box-sizing:border-box}' +
    '.mrp-f.bad input{border-color:#A63D2A}.mrp-err{display:none;color:#A63D2A;font-size:12px}.mrp-f.bad .mrp-err{display:block}' +
    '.mrp-btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:52px;border:0;border-radius:999px;background:#C9A96A;color:#0F2A33;font:600 16px/22px "Be Vietnam Pro",system-ui,sans-serif;cursor:pointer}' +
    '.mrp-btn:hover{background:#D7BC83}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function vnd(n) { return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ'; }
  function clean(v) { return (v || '').replace(/[\s.]/g, ''); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function buyer() { try { return JSON.parse(sessionStorage.getItem('mr_buyer') || 'null') || {}; } catch (x) { return {}; } }
  function save(b) { try { sessionStorage.setItem('mr_buyer', JSON.stringify(b)); } catch (x) {} }
  function send(data) {
    try {
      var fd = new URLSearchParams(); Object.keys(data).forEach(function (k) { fd.append(k, data[k]); });
      fetch(ENDPOINT, { method: 'POST', body: fd, mode: 'no-cors', keepalive: true });
    } catch (x) {}
  }
  function copy(t, btn) {
    function ok() { var o = btn.textContent; btn.textContent = 'Đã chép'; setTimeout(function () { btn.textContent = o; }, 1500); }
    try { navigator.clipboard.writeText(t).then(ok, ok); } catch (x) { ok(); }
  }

  var dlg;
  function open(o) {
    var b = buyer();
    var need = !(b.fullname && b.zalo && b.email);
    if (dlg) { dlg.remove(); }
    dlg = document.createElement('dialog'); dlg.className = 'mrp'; dlg.setAttribute('aria-label', 'Chuyển khoản');
    var form = need ? '<p class="mrp-sub">Chị điền thông tin để Thái Ngoan gửi link Zoom sau khi nhận tiền.</p>' +
      '<div class="mrp-f"><label for="mrp-n">Họ và tên</label><input id="mrp-n" autocomplete="name" value="' + esc(b.fullname || '') + '"><span class="mrp-err">Chị điền họ tên giúp em.</span></div>' +
      '<div class="mrp-f"><label for="mrp-z">Số Zalo</label><input id="mrp-z" inputmode="tel" autocomplete="tel" value="' + esc(b.zalo || '') + '"><span class="mrp-err">Số Zalo 10 số, ví dụ 0912345678.</span></div>' +
      '<div class="mrp-f"><label for="mrp-m">Email</label><input id="mrp-m" type="email" autocomplete="email" value="' + esc(b.email || '') + '"><span class="mrp-err">Email chưa đúng.</span></div>' +
      '<button class="mrp-btn" type="button" id="mrp-go">Hiện mã chuyển khoản</button>' : '';
    dlg.innerHTML = '<div class="mrp-in"><button class="mrp-x" type="button" aria-label="Đóng">×</button><h3>Chuyển khoản ' + vnd(o.amount) + '</h3>' +
      '<div id="mrp-a">' + form + '</div><div id="mrp-b"' + (need ? ' hidden' : '') + '></div></div>';
    document.body.appendChild(dlg);
    dlg.querySelector('.mrp-x').onclick = function () { dlg.close(); };
    var poll = 0;
    dlg.addEventListener('close', function () { clearTimeout(poll); poll = -1; });
    function utm() {
      var q = new URLSearchParams(location.search), out = {};
      try { out = JSON.parse(sessionStorage.getItem('mr_utm') || '{}') || {}; } catch (x) {}
      if (q.get('utm_source')) { out.source = q.get('utm_source'); out.campaign = q.get('utm_campaign') || ''; out.ad = q.get('utm_content') || ''; }
      return out;
    }
    /* Tạo đơn có mã riêng ở máy chủ. Máy chủ lỗi thì dùng mã cũ (tiền tố + số Zalo) để khách vẫn chuyển được. */
    function showQR() {
      var b2 = buyer();
      var box0 = dlg.querySelector('#mrp-b');
      box0.innerHTML = '<p class="mrp-sub">Đang tạo mã chuyển khoản…</p>'; box0.hidden = false; dlg.querySelector('#mrp-a').hidden = true;
      if (!o.kind || !window.fetch) { render((o.prefix + ' ' + clean(b2.zalo || '')).trim(), false); return; }
      var u = utm();
      var ctrl = window.AbortController ? new AbortController() : null;
      var t = setTimeout(function () { if (ctrl) { ctrl.abort(); } }, 8000);
      fetch('/api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl ? ctrl.signal : undefined,
        body: JSON.stringify({ kind: o.kind, bump: !!o.bump, fullname: b2.fullname || '', zalo: b2.zalo || '', email: b2.email || '', source: u.source || '', campaign: u.campaign || '', ad: u.ad || '' }) })
        .then(function (r) { return r.json(); })
        .then(function (d) { clearTimeout(t); if (d && d.ok && d.code) { o.amount = d.amount || o.amount; render(d.code, true); } else { render((o.prefix + ' ' + clean(b2.zalo || '')).trim(), false); } })
        .catch(function () { clearTimeout(t); render((o.prefix + ' ' + clean(b2.zalo || '')).trim(), false); });
    }
    var me = dlg;
    function watch(code) {
      if (poll === -1 || !document.body.contains(me)) { return; }
      poll = setTimeout(function () {
        fetch('/api/order-status?code=' + encodeURIComponent(code), { cache: 'no-store' })
          .then(function (r) { return r.json(); })
          .then(function (d) { if (!document.body.contains(me)) { return; } if (d && d.paid) { paid(code); } else { watch(code); } })
          .catch(function () { watch(code); });
      }, 4000);
    }
    function paid(code) {
      var box = me.querySelector('#mrp-b');
      box.innerHTML = '<h3>Đã nhận ' + vnd(o.amount) + '</h3><p class="mrp-sub">Cảm ơn chị. Đơn ' + esc(code) + ' đã xác nhận, đang chuyển trang…</p>';
      try { sessionStorage.setItem('mr_paid_' + code, '1'); } catch (x) {}
      /* Purchase chỉ bắn khi tiền về thật (SePay xác nhận). eventID = mã đơn để Meta không đếm trùng. */
      try { if (typeof fbq === 'function') { fbq('track', 'Purchase', { value: o.amount, currency: 'VND', content_name: o.goi || o.kind || '', order_id: code }, { eventID: code }); } } catch (x) {}
      if (o.onDone) { o.onDone(); }
      setTimeout(function () { window.location.href = o.next; }, 1200);
    }
    function render(code, live) {
      var b2 = buyer();
      var qr ='https://img.vietqr.io/image/' + BANK.code + '-' + BANK.acc + '-compact2.png?amount=' + o.amount +
        '&addInfo=' + encodeURIComponent(code) + '&accountName=' + encodeURIComponent(BANK.name);
      var box = dlg.querySelector('#mrp-b');
      box.innerHTML = '<p class="mrp-sub">Mở app ngân hàng, quét mã. Số tiền và nội dung đã điền sẵn.</p>' +
        '<img class="mrp-qr" alt="Mã VietQR chuyển khoản ' + vnd(o.amount) + '" src="' + qr + '">' +
        '<div class="mrp-rows">' +
        '<div class="mrp-row"><span>Ngân hàng</span><b>' + BANK.label + '</b></div>' +
        '<div class="mrp-row"><span>Số tài khoản</span><b>' + BANK.acc + '<button class="mrp-cp" type="button" data-c="' + BANK.acc + '">Chép</button></b></div>' +
        '<div class="mrp-row"><span>Chủ tài khoản</span><b>' + BANK.name + '</b></div>' +
        '<div class="mrp-row"><span>Số tiền</span><b>' + vnd(o.amount) + '<button class="mrp-cp" type="button" data-c="' + o.amount + '">Chép</button></b></div>' +
        '<div class="mrp-row"><span>Nội dung</span><b>' + esc(code) + '<button class="mrp-cp" type="button" data-c="' + esc(code) + '">Chép</button></b></div>' +
        '</div><p class="mrp-note">' + (live ? '<b>Chị giữ nguyên nội dung chuyển khoản</b> để hệ thống tự xác nhận. Tiền về, trang này tự chuyển tiếp. ' : '') +
        'Chuyển xong, chị bấm nút dưới. Link Zoom gửi qua email và Zalo trong 24 giờ. Cần hỗ trợ, chị nhắn Zalo ' +
        '<a href="https://zalo.me/' + ZALO + '" target="_blank" rel="noopener">0914 309 986</a>.</p>' +
        '<button class="mrp-btn" type="button" id="mrp-done">Tôi đã chuyển khoản</button>';
      box.hidden = false; dlg.querySelector('#mrp-a').hidden = true;
      Array.prototype.forEach.call(box.querySelectorAll('.mrp-cp'), function (btn) { btn.onclick = function () { copy(btn.getAttribute('data-c'), btn); }; });
      box.querySelector('#mrp-done').onclick = function () {
        send({ source: 'don-hang', fullname: b2.fullname || '', zalo: b2.zalo || '', email: b2.email || '', goi: o.goi, so_tien: o.amount, noi_dung_ck: code, trang: location.pathname.replace('/', '') });
        if (!live) {
          if (o.onDone) { o.onDone(); }
          setTimeout(function () { window.location.href = o.next; }, 300);
          return;
        }
        /* Có mã đơn: chờ ngân hàng báo tiền về, trang tự chuyển khi xác nhận. */
        var w = me.querySelector('#mrp-b');
        w.innerHTML = '<h3>Đang chờ ngân hàng xác nhận…</h3><p class="mrp-sub">Thường mất 10 đến 60 giây. Chị giữ trang này mở, tiền về là trang tự chuyển tiếp.</p>' +
          '<p class="mrp-note">Mã đơn của chị: <b>' + esc(code) + '</b></p><div id="mrp-late" hidden><p class="mrp-note">Sau 2 phút vẫn chưa thấy? Chị nhắn Zalo <a href="https://zalo.me/' + ZALO + '" target="_blank" rel="noopener">0914 309 986</a> kèm mã đơn, mình kiểm tra ngay. Chỗ của chị vẫn được giữ.</p>' +
          '<button class="mrp-btn" type="button" id="mrp-skip">Tiếp tục</button></div>';
        setTimeout(function () {
          var late = me.querySelector('#mrp-late'); if (!late) { return; }
          late.hidden = false;
          me.querySelector('#mrp-skip').onclick = function () { if (o.onDone) { o.onDone(); } window.location.href = o.next; };
        }, 120000);
      };
      if (live) { watch(code); }
    }
    if (need) {
      dlg.querySelector('#mrp-go').onclick = function () {
        var n = dlg.querySelector('#mrp-n'), z = dlg.querySelector('#mrp-z'), m = dlg.querySelector('#mrp-m'), bad = false;
        function mark(i, x) { i.closest('.mrp-f').classList.toggle('bad', x); if (x) { bad = true; } }
        mark(n, n.value.trim().length < 2); mark(z, !/^(0|\+84)\d{9}$/.test(clean(z.value))); mark(m, !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.value.trim()));
        if (bad) { return; }
        var b3 = buyer(); b3.fullname = n.value.trim(); b3.zalo = clean(z.value); b3.email = m.value.trim(); save(b3);
        showQR();
      };
    } else { showQR(); }
    if (typeof dlg.showModal === 'function') { dlg.showModal(); } else { dlg.setAttribute('open', ''); }
  }
  window.MRPay = { open: open };
})();
