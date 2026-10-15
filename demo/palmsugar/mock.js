/* 팜슈가 농원 주문 앱 체험판 — 서버(Apps Script) 대신 이 브라우저 안에서 동작하는 가상 데이터 */
(function () {
  var KEY = 'palmsugar-demo-v1', PIN = '0000';
  function fmt(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function iso(dd, h) { var d = new Date(); d.setDate(d.getDate() + dd); d.setHours(h || 10, 0, 0, 0); return fmt(d); }
  function day(dd) { var d = new Date(); d.setDate(d.getDate() + dd);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function seed() {
    var items1 = [{ itemId: 'i1', productId: 'p1', productName: '팜슈가 블록', qty: 3, unit: '봉', unitPriceCents: 400, amountCents: 1200,
      method: 'delivery', deliveryDate: day(2), addrHouse: '12', addrStreet: '000', addrSangkat: 'Sangkat (예시)', addrKhan: 'Khan (예시)', landmark: '파란 대문 집', mapLink: '',
      gift: '', giftName: '', giftPhone: '', delivered: '', prepared: 'Y' }];
    var items2 = [{ itemId: 'i2', productId: 'p2', productName: '팜슈가 시럽', qty: 2, unit: '병', unitPriceCents: 650, amountCents: 1300,
      method: 'church', handDate: day(4), handPlace: '(예시) 주일 예배 후 친교실', gift: 'Y', giftName: 'Sokha (예시)', giftPhone: '', delivered: '', prepared: '' }];
    return {
      products: [
        { id: 'p1', name: '팜슈가 블록', nameEn: 'Palm Sugar Block', nameKm: 'ស្ករត្នោតដុំ', priceCents: 400, unit: '봉', unitEn: 'bag', unitKm: 'កញ្ចប់', stock: 120, active: 'Y', image: '', saleStartDate: '' },
        { id: 'p2', name: '팜슈가 시럽', nameEn: 'Palm Sugar Syrup', nameKm: 'ទឹកស្ករត្នោត', priceCents: 650, unit: '병', unitEn: 'bottle', unitKm: 'ដប', stock: 60, active: 'Y', image: '', saleStartDate: '' },
        { id: 'p3', name: '팜슈가 가루', nameEn: 'Palm Sugar Powder', nameKm: 'ស្ករត្នោតម្សៅ', priceCents: 500, unit: '봉', unitEn: 'bag', unitKm: 'កញ្ចប់', stock: 80, active: 'Y', image: '', saleStartDate: '' },
      ],
      settings: { businessName: '팜슈가 농원 (예시)', greeting: '캄보디아 시골 마을에서 정성껏 졸여 만든 팜슈가입니다. (체험용 가상 농원입니다)',
        farmAddress: '(예시) Kampong Speu, Cambodia', farmMapLink: '', farmPhone: '000-000-000',
        deliveryFeeCents: 150, freeDeliveryThresholdCents: 2000, exchangeRate: 4100, showRiel: 'Y',
        landingPhoto1: '', landingPhoto2: '', landingPhoto3: '' },
      account: { khqrImage: '' },
      availability: [{ id: 'a1', date: day(3), start: '08:00', end: '12:00' }, { id: 'a2', date: day(5), start: '13:00', end: '17:00' }],
      news: [{ id: 'n1', title: '이번 주 수확 안내', body: '건기가 시작되어 수액이 아주 달아졌습니다.\n블록과 시럽 모두 넉넉히 준비했어요.', image: '', active: 'Y', createdAt: iso(-2, 9) }],
      orders: [
        { id: 'o1', name: 'Dara (예시)', phone: '000-000-001', kakaoId: '', referrer: '', createdAt: iso(-1, 9), fee: 150, total: 1350, smsSent: '', modified: '', cancelRequested: '',
          itemsJson: JSON.stringify(items1), messagesJson: JSON.stringify([{ from: 'buyer', text: '오전에 받을 수 있을까요?', at: iso(-1, 9) }]) },
        { id: 'o2', name: '김예시', phone: '010-0000-0002', kakaoId: 'demo', referrer: '', createdAt: iso(0, 8), fee: 0, total: 1300, smsSent: '', modified: '', cancelRequested: '',
          itemsJson: JSON.stringify(items2), messagesJson: '[]' },
      ],
    };
  }
  var db;
  function load() { if (db) return db; try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; } if (!db || !db.products) { db = seed(); save(); } return db; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function order(id) { return load().orders.find(function (o) { return o.id === id; }); }
  function upsert(list, obj) { var x = obj.id && list.find(function (v) { return v.id === obj.id; });
    if (x) Object.assign(x, clone(obj)); else { x = clone(obj); x.id = x.id || rid(); x.createdAt = x.createdAt || fmt(new Date()); list.push(x); } return x; }
  function withIds(items) { return clone(items || []).map(function (i) { i.itemId = i.itemId || rid(); return i; }); }
  function total(items, fee) { return items.reduce(function (s, i) { return s + (Number(i.amountCents) || 0); }, 0) + (Number(fee) || 0); }
  function needPin(p) { if (p.pin !== PIN) throw new Error('관리자 번호가 맞지 않습니다 (체험판 번호: 0000)'); }
  function handle(action, p) {
    var d = load(), o;
    if (action === 'public') return { products: d.products, settings: d.settings, account: d.account, availability: d.availability,
      news: d.news.filter(function (n) { return String(n.active) === 'Y'; }) };
    if (action === 'saveOrder') { var items = withIds(p.items);
      d.orders.push({ id: rid(), name: p.name, phone: p.phone, kakaoId: p.kakaoId || '', referrer: p.referrer || '', createdAt: fmt(new Date()),
        fee: p.feeCents || 0, total: total(items, p.feeCents), smsSent: '', modified: '', cancelRequested: '', itemsJson: JSON.stringify(items),
        messagesJson: JSON.stringify(p.firstMessage ? [{ from: 'buyer', text: p.firstMessage, at: fmt(new Date()) }] : []) });
      return {}; }
    if (action === 'lookup') return { orders: d.orders.filter(function (x) { return String(x.name).trim() === String(p.name).trim() && digits(x.phone) === digits(p.phone); }) };
    if (action === 'updateOrder') { o = order(p.id); if (!o) throw new Error('주문을 찾을 수 없습니다'); var it = withIds(p.items);
      Object.assign(o, { name: p.name, phone: p.phone, kakaoId: p.kakaoId || '', itemsJson: JSON.stringify(it), total: total(it, o.fee), modified: 'Y' }); return {}; }
    if (action === 'cancelRequest') { o = order(p.id); if (o) o.cancelRequested = 'Y'; return {}; }
    if (action === 'addMessage') { if (p.from === 'farm') needPin(p); o = order(p.id); if (o) { var m = JSON.parse(o.messagesJson || '[]');
      m.push({ from: p.from, text: p.text, at: fmt(new Date()) }); o.messagesJson = JSON.stringify(m); } return {}; }
    if (action === 'adminLogin') { needPin(p); return {}; }
    needPin(p);
    switch (action) {
      case 'adminAll': return { orders: d.orders, news: d.news, products: d.products, availability: d.availability, settings: d.settings, account: d.account };
      case 'setOrderFlag': o = order(p.id); if (o) { if (p.smsSent) o.smsSent = 'Y'; if (p.clearModified) o.modified = ''; } return {};
      case 'deleteOrder': d.orders = d.orders.filter(function (x) { return x.id !== p.id; }); return {};
      case 'adminPatchOrder': o = order(p.id); if (o) { var pi = withIds(p.items); o.itemsJson = JSON.stringify(pi); o.total = total(pi, o.fee); } return {};
      case 'setItemFlag': o = order(p.id); if (o) { var fi = JSON.parse(o.itemsJson || '[]');
        fi.forEach(function (i) { if (i.itemId === p.itemId) Object.keys(p).forEach(function (k) { if (['pin', 'id', 'itemId'].indexOf(k) < 0) i[k] = p[k] ? 'Y' : ''; }); });
        o.itemsJson = JSON.stringify(fi); } return {};
      case 'saveProduct': upsert(d.products, p.product); return {};
      case 'deleteProduct': d.products = d.products.filter(function (x) { return x.id !== p.id; }); return {};
      case 'saveAvailability': upsert(d.availability, p.slot); return {};
      case 'deleteAvailability': d.availability = d.availability.filter(function (x) { return x.id !== p.id; }); return {};
      case 'saveNews': upsert(d.news, p.news); return {};
      case 'deleteNews': d.news = d.news.filter(function (x) { return x.id !== p.id; }); return {};
      case 'saveSettings': Object.assign(d.settings, clone(p.settings)); return {};
      case 'saveAccount': d.account = clone(p.account); return {};
    }
    throw new Error('체험판에서 지원하지 않는 기능입니다');
  }
  window.MOCK_API = function (action, payload) {
    return new Promise(function (res) { setTimeout(res, 200); }).then(function () {
      var r = handle(action, payload || {}); save(); return Object.assign({ ok: true }, clone(r));
    });
  };
})();
