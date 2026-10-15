/* 체험판 공통 안내 띠 — 가상 데이터 · 이 브라우저에만 저장 · 처음 상태로 되돌리기 */
(function () {
  var cfg = window.DEMO_BANNER || {};
  var keys = cfg.resetKeys || [];
  var prefixes = cfg.resetPrefixes || [];
  function reset() {
    if (!confirm('체험하며 입력한 내용을 모두 지우고 처음 예시 상태로 돌릴까요?')) return;
    try {
      var all = [];
      for (var i = 0; i < localStorage.length; i++) all.push(localStorage.key(i));
      all.forEach(function (k) {
        if (keys.indexOf(k) >= 0 || prefixes.some(function (p) { return k.indexOf(p) === 0; })) localStorage.removeItem(k);
      });
      sessionStorage.clear();
    } catch (e) {}
    location.reload();
  }
  function mount() {
    var bar = document.createElement('div');
    bar.setAttribute('role', 'note');
    bar.style.cssText = 'position:' + (cfg.sticky === false ? 'relative' : 'sticky') + ';top:0;z-index:99999;display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;' +
      'padding:8px 14px;background:#18231f;color:#f5f7f4;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    var msg = document.createElement('span');
    msg.style.cssText = 'flex:1 1 220px;min-width:0';
    msg.innerHTML = '<b style="color:#e0a464">체험판</b> · 가상 데이터, 이 브라우저에만 저장' +
      (cfg.hint ? ' · <span style="opacity:.85">' + cfg.hint + '</span>' : '');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '처음 상태로';
    btn.onclick = reset;
    var back = document.createElement('a');
    back.href = cfg.back || '../../';
    back.textContent = '← 포트폴리오';
    [btn, back].forEach(function (el) {
      el.style.cssText = 'font:inherit;color:#f5f7f4;background:transparent;border:1px solid rgba(245,247,244,.45);border-radius:999px;padding:3px 11px;cursor:pointer;text-decoration:none;white-space:nowrap';
    });
    bar.appendChild(msg); bar.appendChild(btn); bar.appendChild(back);
    document.body.insertBefore(bar, document.body.firstChild);
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
