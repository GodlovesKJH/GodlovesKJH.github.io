/* 과수원 직거래 장터 체험판 — 서버(Apps Script) 대신 이 브라우저 안에서 동작하는 가상 데이터 */
(function () {
  var KEY = 'orchard-demo-v1';
  function iso(daysFromNow, h) { var d = new Date(); d.setDate(d.getDate() + daysFromNow); d.setHours(h || 10, 0, 0, 0); return d.toISOString(); }
  function day(daysFromNow) { var d = new Date(); d.setDate(d.getDate() + daysFromNow);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function seed() {
    return {
      fruits: [
        { id: 'f1', name: '샤인머스캣 2kg (3~4송이)', price: 32000, stock: 40, active: true, image: '', saleStartDate: '' },
        { id: 'f2', name: '신고배 7.5kg (12과)', price: 45000, stock: 25, active: true, image: '', saleStartDate: '' },
        { id: 'f3', name: '부사 사과 5kg (가정용)', price: 29000, stock: 30, active: true, image: '', saleStartDate: '' },
        { id: 'f4', name: '홍로 사과 5kg', price: 31000, stock: 0, active: false, image: '', saleStartDate: '' },
      ],
      orders: [
        { id: 'o1', name: '김예시', phone: '010-0000-0001', referrer: '', source: 'buyer', createdAt: iso(-2, 9), modified: false,
          messages: [{ id: 'm1', from: 'buyer', text: '선물용이라 상자가 깨끗하면 좋겠어요.', at: iso(-2, 9) },
                     { id: 'm2', from: 'admin', text: '네, 선물용으로 따로 포장해서 보내드릴게요!', at: iso(-2, 11) }],
          items: [{ itemId: 'o1-0', fruitId: 'f2', fruitName: '신고배 7.5kg (12과)', qty: 2, unitPrice: 45000, amount: 90000, shippingFee: 0, totalAmount: 90000,
            deliveryMethod: 'delivery', address: '(예시) 서울시 ○○구 ○○로 12', isGift: true, receiverName: '박받음', receiverPhone: '010-0000-0009', giftArrivalDate: day(3),
            visitDate: '', visitTime: '', visitPhone: '', churchDate: '', delivered: false, prepared: true }] },
        { id: 'o2', name: '이체험', phone: '010-0000-0002', referrer: '김예시', source: 'buyer', createdAt: iso(-1, 14), modified: false, messages: [],
          items: [{ itemId: 'o2-0', fruitId: 'f1', fruitName: '샤인머스캣 2kg (3~4송이)', qty: 1, unitPrice: 32000, amount: 32000, shippingFee: 0, totalAmount: 32000,
            deliveryMethod: 'pickup', address: '', isGift: false, receiverName: '', receiverPhone: '', giftArrivalDate: '',
            visitDate: day(3), visitTime: '10:30', visitPhone: '010-0000-0002', churchDate: '', delivered: false, prepared: false }] },
        { id: 'o3', name: '최가상', phone: '010-0000-0003', referrer: '', source: 'buyer', createdAt: iso(0, 8), modified: false, messages: [],
          items: [{ itemId: 'o3-0', fruitId: 'f3', fruitName: '부사 사과 5kg (가정용)', qty: 1, unitPrice: 29000, amount: 29000, shippingFee: 4000, totalAmount: 33000,
            deliveryMethod: 'delivery', address: '(예시) 경기도 ○○시 ○○길 7', isGift: false, receiverName: '', receiverPhone: '', giftArrivalDate: '',
            visitDate: '', visitTime: '', visitPhone: '', churchDate: '', delivered: false, prepared: false }] },
      ],
      account: { bank: '예시은행', number: '000-0000-0000-00', holder: '예시과수원', phone: '010-0000-0000' },
      businessName: '햇살 과수원 (예시)',
      greeting: '올해도 정성껏 키운 과일을 산지에서 바로 보내드립니다. (체험용 가상 농장입니다)',
      farmPhone: '010-0000-0000', farmAddress: '(예시) 경기도 ○○시 과수원길 1',
      smsTemplate: '', smsTemplateDelay: '', smsDefault: 'normal', notifyEmail: '',
      landingPhoto1: '', landingPhoto2: '', landingPhoto3: '',
      availability: [
        { id: 'a1', date: day(3), start: '09:00', end: '12:00' },
        { id: 'a2', date: day(4), start: '13:00', end: '18:00' },
        { id: 'a3', date: day(10), start: '09:00', end: '17:00' },
      ],
      news: [{ id: 'n1', title: '신고배 수확을 시작했습니다', body: '올해는 일교차가 커서 당도가 아주 좋습니다.\n주문하신 순서대로 보내드릴게요.', image: '', active: true, createdAt: iso(-3, 8) }],
    };
  }
  var db;
  function load() { if (db) return db; try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; } if (!db || !db.fruits) { db = seed(); save(); } return db; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function wait() { return new Promise(function (r) { setTimeout(r, 180); }); }
  function order(id) { return load().orders.find(function (o) { return o.id === id; }); }
  function del(list, id) { return list.filter(function (x) { return x.id !== id; }); }
  window.MOCK = {
    get: function () { return wait().then(function () { return clone(load()); }); },
    post: function (b) {
      return wait().then(function () {
        var d = load(), o;
        switch (b.action) {
          case 'addOrder': d.orders.push(clone(b.order)); break;
          case 'updateOrder': o = order(b.order.id); if (o) Object.assign(o, clone(b.order)); break;
          case 'deleteOrder': d.orders = del(d.orders, b.id); break;
          case 'requestCancel': o = order(b.id); if (o) o.cancelRequested = true; break;
          case 'confirmOrder': o = order(b.id); if (o) { o.modified = false; o.confirmed = true; } break;
          case 'markSmsSent': o = order(b.id); if (o) o.smsSent = true; break;
          case 'appendMessage': o = order(b.id); if (o) o.messages = clone(b.messages); break;
          case 'setItemFlag': o = order(b.orderId); if (o) o.items = clone(b.items); break;
          case 'addFruit': d.fruits.push({ id: b.id, name: b.name, price: b.price, stock: b.stock, active: b.active, image: b.image, saleStartDate: b.saleStartDate }); break;
          case 'updateFruit': d.fruits.forEach(function (f) { if (f.id === b.id) Object.assign(f, clone(b.patch)); }); break;
          case 'deleteFruit': d.fruits = del(d.fruits, b.id); break;
          case 'setAccount': d.account = { bank: b.bank, number: b.number, holder: b.holder, phone: b.phone }; break;
          case 'setSettings': Object.keys(b).forEach(function (k) { if (k !== 'action') d[k] = b[k]; }); break;
          case 'addAvail': d.availability.push({ id: b.id, date: b.date, start: b.start, end: b.end }); break;
          case 'deleteAvail': d.availability = del(d.availability, b.id); break;
          case 'addNews': var n = clone(b); delete n.action; d.news.push(n); break;
          case 'updateNews': d.news.forEach(function (x) { if (x.id === b.id) Object.assign(x, clone(b.patch)); }); break;
          case 'deleteNews': d.news = del(d.news, b.id); break;
        }
        save();
        return { ok: true };
      });
    },
  };
})();
