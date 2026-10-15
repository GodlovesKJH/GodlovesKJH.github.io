/* ============================================================
   ○○교회 카페 — 화면
   데이터는 전부 data.js를 거칩니다.
   ============================================================ */
import { SHOP, BANK, OPS, CARD_ENABLED } from "./config.js";
import {
  DB, onChange, startAuth, staffSignIn, staffSignOut, todayStr,
  createOrder, patchOrder, cancelOrder, assignTag, releaseTag, clearStaleTags,
  saveMenu, deleteMenu, swapMenuOrder, setOpen, seedMenus, newMenuId, watchDay
} from "./data.js";

/* ---------- 고정 정의 ---------- */
const OPT_DEFS = {
  temp: { label:"온도",    type:"single", choices:[{v:"HOT",p:0},{v:"ICE",p:0}], def:"HOT" },
  shot: { label:"샷 추가", type:"single", choices:[{v:"기본",p:0},{v:"1샷 +500",p:500}], def:"기본" }
};
const CONTAINERS = {
  disposable:      { label:"일회용컵",         icon:"🥤", short:"일회용" },
  shared_tumbler:  { label:"공용 텀블러 대여", icon:"🍵", short:"공용텀블러" },
  personal_tumbler:{ label:"개인 텀블러 지참", icon:"🥤", short:"개인텀블러" }
};
const PAYS = {
  transfer: { label:"계좌이체",     icon:"🏦" },
  cash:     { label:"현금",         icon:"💵" },
  refill:   { label:"무료 리필",    icon:"♻️" },
  card:     { label:"카드·간편결제", icon:"💳" }
};
const PICS = ["☕","🥛","🧋","🍓","🍫","🍵","🌼","🍊","🍹","🍪","🥐","🍰","🧁","🍞","🥤","🍯","🫖","🧃","🍋","🌰"];
const SAMPLE = [
  { id:"m1", name:"아메리카노",  cat:"커피",   price:2000, pic:"☕", soldOut:false, retired:false, allowDisposable:false, allowTumbler:true,  allowRefill:true,  opts:["temp","shot"] },
  { id:"m2", name:"카페라떼",    cat:"커피",   price:3000, pic:"🥛", soldOut:false, retired:false, allowDisposable:true,  allowTumbler:true,  allowRefill:false, opts:["temp","shot"] },
  { id:"m3", name:"콜드브루",    cat:"커피",   price:3000, pic:"🧋", soldOut:false, retired:false, allowDisposable:false, allowTumbler:true,  allowRefill:true,  opts:["shot"] },
  { id:"m4", name:"딸기라떼",    cat:"논커피", price:4000, pic:"🍓", soldOut:false, retired:false, allowDisposable:true,  allowTumbler:true,  allowRefill:false, opts:[] },
  { id:"m5", name:"캐모마일차",  cat:"차",     price:2500, pic:"🌼", soldOut:false, retired:false, allowDisposable:true,  allowTumbler:true,  allowRefill:false, opts:["temp"] },
  { id:"m6", name:"수제 쿠키",   cat:"디저트", price:1500, pic:"🍪", soldOut:false, retired:false, allowDisposable:true,  allowTumbler:false, allowRefill:false, opts:[] }
];

/* ---------- 화면 상태 (저장 안 함) ---------- */
let mode = "customer", pinOk = false;
let cs = { screen:"menu", cat:"전체", mid:null, opt:{}, container:"disposable", qty:1,
           cart:[], name:"", pickupType:"now", orderId:null };
let as = { tab:"board", date:todayStr(), q:"" };
const seen = new Set();
let lastShown = {};

/* ---------- 유틸 ---------- */
const p2 = n => String(n).padStart(2,"0");
const won = n => Number(n||0).toLocaleString("ko-KR")+"원";
const hhmm = iso => { const d=new Date(iso); return p2(d.getHours())+":"+p2(d.getMinutes()); };
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const range = (a,b) => { const r=[]; for(let i=a;i<=b;i++) r.push(i); return r; };
const VC = document.getElementById("viewCustomer");
const VA = document.getElementById("viewAdmin");
const VD = document.getElementById("viewDisplay");
const MR = document.getElementById("modalRoot");

function activeMenus(){ return DB.menus.filter(m=>!m.retired); }
function menuById(id){ return DB.menus.find(m=>m.id===id); }
function orderById(id){ return DB.myOrders.find(o=>o.id===id) || DB.orders.find(o=>o.id===id); }
/* 빈 배열 = 용기를 고르지 않는 메뉴 (쿠키·케이크 같은 디저트) */
function containersFor(m){
  const ks=[];
  if(m.allowDisposable!==false) ks.push("disposable");
  if(m.allowTumbler) ks.push("shared_tumbler","personal_tumbler");
  return ks;
}
const noContainer = m => m.allowDisposable===false && !m.allowTumbler;
const isTumbler = c => c==="personal_tumbler" || c==="shared_tumbler";
const tumblerOnly = m => m.allowDisposable===false && m.allowTumbler;
const refillable  = m => !!m.allowRefill && tumblerOnly(m);
function itemPrice(m, opt){
  let p = m.price;
  (m.opts||[]).forEach(k=>{ const c=OPT_DEFS[k].choices.find(c=>c.v===opt[k]); if(c) p+=c.p; });
  return p;
}
function optText(i){
  const parts = Object.keys(i.opt||{}).map(k=>i.opt[k]).filter(v=>v&&v!=="기본");
  if(i.container && i.container!=="disposable") parts.push(CONTAINERS[i.container].icon+" "+CONTAINERS[i.container].label);
  return parts.join(" · ");
}
const cartTotal = () => cs.cart.reduce((s,i)=>s+i.price*i.qty,0);
const hasPersonalTumbler = o => (o.items||[]).some(i=>i.container==="personal_tumbler");
const itemsSum = o => (o.items||[]).reduce((s,i)=>s+i.price*i.qty,0);
const tagsInUse = () => Object.keys(DB.tags);

/* 장바구니와 현재 메뉴판을 맞춘다 (봉사자가 그 사이 메뉴를 고쳤을 수 있다) */
function syncCart(){
  const notes = [];
  cs.cart = cs.cart.filter(i=>{
    const m = menuById(i.mid);
    if(!m || m.retired){ notes.push(i.name+" — 메뉴판에서 내려가 장바구니에서 뺐습니다"); return false; }
    if(m.soldOut){ notes.push(i.name+" — 품절되어 장바구니에서 뺐습니다"); return false; }
    const ok = containersFor(m);
    if(!ok.length){
      if(i.container){ i.container = null; notes.push(m.name+" — 용기를 고르지 않는 메뉴로 바뀌었습니다"); }
    } else if(!ok.includes(i.container)){
      i.container = ok[0];
      notes.push(m.name+" — 컵이 "+CONTAINERS[ok[0]].label+"(으)로 바뀌었습니다");
    }
    const np = itemPrice(m, i.opt);
    if(np !== i.price){ notes.push(m.name+" 가격이 "+won(i.price)+" → "+won(np)+"으로 바뀌었습니다"); i.price = np; }
    i.name = m.name; i.pic = m.pic;
    return true;
  });
  return notes;
}
function warnCart(notes){
  if(!notes.length) return;
  modal('<h3>메뉴가 바뀌었어요</h3><p class="note">주문하시는 동안 카운터에서 메뉴를 수정했습니다. 확인하고 결제해 주세요.</p>'+
    '<div class="sect" style="margin-top:12px">'+notes.map(n=>'<div style="padding:5px 0;font-size:14.5px">· '+esc(n)+'</div>').join("")+'</div>'+
    '<button class="btn brass" style="width:100%;margin-top:14px" data-close>확인</button>', {});
}

/* 오늘 내가 리필받을 수 있는 메뉴 — 내 주문만 보고 판단합니다 */
function refillableMenus(){
  const t = todayStr();
  const mine = DB.myOrders.filter(o=>o.day===t && o.st!=="canceled");
  const ordered = new Set(), used = new Set();
  mine.forEach(o=>{
    if(o.isRefill){ (o.items||[]).forEach(i=>used.add(i.mid)); return; }
    (o.items||[]).forEach(i=>{ if(isTumbler(i.container)) ordered.add(i.mid); });
  });
  return activeMenus().filter(m=> refillable(m) && ordered.has(m.id) && !used.has(m.id) && !m.soldOut);
}

/* ---------- 모달 · 토스트 · 소리 ---------- */
let modalCloser = null;
function modal(html, opts){
  opts = opts||{};
  MR.innerHTML = '<div class="scrim" data-close></div><div class="sheet" style="position:relative">'+
    (opts.noX?"":'<button class="x" data-close aria-label="닫기">✕</button>')+html+'</div>';
  MR.classList.add("on");
  modalCloser = opts.onClose||null;
  MR.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>closeModal());
  document.body.style.overflow="hidden";
}
function closeModal(){
  MR.classList.remove("on"); MR.innerHTML=""; document.body.style.overflow="";
  const f=modalCloser; modalCloser=null; if(f) f();
}
function toast(msg, ms){
  const t=document.createElement("div"); t.className="toast"; t.textContent=msg;
  document.body.appendChild(t); setTimeout(()=>t.remove(), ms||2200);
}
let AC=null;
function ding(){
  try{
    AC = AC || new (window.AudioContext||window.webkitAudioContext)();
    [880,1174].forEach((f,i)=>{
      const o=AC.createOscillator(), g=AC.createGain();
      o.type="sine"; o.frequency.value=f;
      g.gain.setValueAtTime(.0001, AC.currentTime+i*.16);
      g.gain.exponentialRampToValueAtTime(.22, AC.currentTime+i*.16+.02);
      g.gain.exponentialRampToValueAtTime(.0001, AC.currentTime+i*.16+.34);
      o.connect(g); g.connect(AC.destination); o.start(AC.currentTime+i*.16); o.stop(AC.currentTime+i*.16+.36);
    });
  }catch(e){}
}
function buzz(p){ try{ if(navigator.vibrate) navigator.vibrate(p||[0,90,70,90,70,220]); }catch(e){} }
async function guard(fn, msg){
  try{ await fn(); }
  catch(e){
    if(String(e.message||e).includes("TAG_TAKEN")) toast("방금 다른 봉사자가 그 번호를 가져갔어요");
    else if(String(e.code||"").includes("permission-denied")) toast("권한이 없습니다. 봉사자로 로그인했는지 확인하세요");
    else toast(msg || "저장하지 못했습니다. 연결을 확인해 주세요");
  }
}

/* ============================================================
   1. 주문자 앱
   ============================================================ */
function bar(inner){ return '<div class="bottombar"><div class="inner">'+inner+'</div></div>'; }

function renderCustomer(){
  if(!DB.ready) return VC.innerHTML = splash();
  const s = cs.screen;
  if(s==="menu")   return cMenu();
  if(s==="detail") return cDetail();
  if(s==="cart")   return cCart();
  if(s==="pay")    return cPay();
  if(s==="done")   return cDone();
  cMenu();
}
function splash(){
  return '<div style="padding:80px 24px;text-align:center;color:var(--ink-3)">'+
    '<div class="spin"></div><p class="note">메뉴판을 불러오는 중…</p>'+
    (DB.authError? '<p class="note" style="color:var(--clay);margin-top:14px">'+esc(DB.authError)+'</p>':"")+
  '</div>';
}
function cMenu(){
  const cats = ["전체", ...new Set(activeMenus().map(m=>m.cat).filter(Boolean))];
  const list = activeMenus().filter(m=> cs.cat==="전체" || m.cat===cs.cat);
  const refills = refillableMenus();
  const t = todayStr();
  const mine = DB.myOrders.filter(o=>o.day===t && o.st!=="canceled");
  const closed = DB.shop.isOpen===false;

  VC.innerHTML =
  '<div class="c-head"><h1 class="brand">'+esc(SHOP.businessName)+'</h1>'+
    '<div class="sub"><span class="badge '+(closed?"closed":"open")+'">'+(closed?"● 마감":"● 주문 가능")+'</span>'+
    '<span>'+(closed? "오늘 영업이 끝났습니다" : "메뉴를 골라 주문해 주세요")+'</span></div></div>'+
  '<div class="tabs">'+cats.map(c=>'<button data-cat="'+esc(c)+'" aria-current="'+(cs.cat===c)+'">'+esc(c)+'</button>').join("")+'</div>'+
  (list.length? '<div class="mlist">'+list.map(m=>{
    const dis = m.soldOut || closed;
    return '<button class="mcard" data-mid="'+m.id+'" '+(dis?"disabled":"")+'>'+
      '<span class="pic">'+m.pic+'</span>'+
      '<span style="flex:1"><span class="nm">'+esc(m.name)+
        (m.soldOut?'<span class="chip out">품절</span>':"")+
        (tumblerOnly(m)?'<span class="chip t">텀블러</span>':"")+
        (refillable(m)?'<span class="chip r">♻️ 리필</span>':"")+
      '</span><span class="pr">'+won(m.price)+'</span></span></button>';
  }).join("")+'</div>' : '<div class="mlist"><div class="empty" style="color:var(--ink-3);border-color:var(--line)">준비된 메뉴가 없습니다</div></div>')+

  (refills.length? '<div class="sect"><h3>♻️ 무료 리필</h3>'+
    '<p class="note">오늘 텀블러로 받으신 메뉴는 1회 다시 담아 드려요.</p>'+
    refills.map(m=>'<button class="myrow" data-refill="'+m.id+'"><span style="font-size:20px">'+m.pic+'</span>'+
      '<span style="flex:1;font-weight:700">'+esc(m.name)+'</span><span class="st done">리필 받기</span></button>').join("")+
  '</div>':"")+

  (mine.length? '<div class="sect"><h3>내 주문</h3>'+
    mine.map(o=>'<button class="myrow" data-open="'+o.id+'">'+
      '<span style="flex:1"><b>No.'+p2(o.seq)+'</b> '+esc((o.items[0]||{}).name||"")+
        (o.items.length>1? " 외 "+(o.items.length-1):"")+
        '<span style="display:block;font-size:12.5px;color:var(--ink-3)">'+hhmm(o.createdAt)+' · '+won(o.amount)+'</span></span>'+
      '<span class="st '+(o.st==="done"?"done":"")+'">'+stLabelShort(o)+'</span></button>').join("")+
  '</div>':"")+

  legalBlock()+
  bar('<button class="btn brass" data-go="cart" '+(cs.cart.length?"":"disabled")+'>'+
      (cs.cart.length? '장바구니 '+cs.cart.reduce((s,i)=>s+i.qty,0)+'개 · '+won(cartTotal()) : '메뉴를 골라주세요')+'</button>');

  VC.querySelectorAll("[data-cat]").forEach(b=>b.onclick=()=>{ cs.cat=b.dataset.cat; render(); });
  VC.querySelectorAll("[data-mid]").forEach(b=>b.onclick=()=>openDetail(b.dataset.mid));
  VC.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>{ cs.orderId=b.dataset.open; cs.screen="done"; render(); });
  VC.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>{ cs.screen=b.dataset.go; render(); });
  VC.querySelectorAll("[data-refill]").forEach(b=>b.onclick=()=>askRefill(b.dataset.refill));
}
function stLabelShort(o){
  if(o.st==="canceled") return "취소됨";
  if(o.st==="done") return o.pickupTag && !o.tagReturnedAt ? o.pickupTag+"번 준비완료" : "완료";
  if(o.st==="making") return "제조중";
  return o.paid? "접수됨" : "결제 대기";
}
function legalBlock(){
  return '<div class="legal">'+
    '<b>'+esc(SHOP.businessName)+'</b> · 대표 '+esc(SHOP.ownerName)+' · 사업자등록번호 '+esc(SHOP.businessNumber)+'<br>'+
    esc(SHOP.address)+' · '+esc(SHOP.phone)+'<br>'+
    '통신판매업 신고: '+esc(SHOP.mailOrderNumber)+'<br>'+
    '환불 규정: '+esc(SHOP.refundPolicy)+'<br>'+
    '주문 기록은 '+OPS.retentionDays+'일 후 자동으로 지워집니다.'+
  '</div>';
}
function openDetail(mid){
  const m = menuById(mid); if(!m) return;
  cs.mid = mid; cs.qty = 1; cs.opt = {}; cs.container = containersFor(m)[0] || null;
  (m.opts||[]).forEach(k=> cs.opt[k] = OPT_DEFS[k].def);
  cs.screen = "detail"; render();
}
function cDetail(){
  const m = menuById(cs.mid);
  if(!m){ cs.screen="menu"; return render(); }
  const price = itemPrice(m, cs.opt);
  const containers = containersFor(m);
  VC.innerHTML =
  '<div class="topnav"><button class="back" data-back>‹</button><span class="t">'+esc(m.name)+'</span></div>'+
  '<div class="screen">'+
    '<div style="display:flex;gap:14px;align-items:center">'+
      '<div style="width:76px;height:76px;font-size:38px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(150deg,var(--paper-2),#E3DBC8)">'+m.pic+'</div>'+
      '<div><div style="font-size:22px;font-weight:800;letter-spacing:-.02em">'+esc(m.name)+'</div>'+
      '<div class="mono" style="color:var(--ink-3)">'+won(m.price)+'</div></div>'+
    '</div>'+
    (m.opts||[]).map(k=>{
      const d = OPT_DEFS[k];
      return '<div class="optgrp"><div class="lb">'+d.label+'</div><div class="optrow">'+
        d.choices.map(c=>'<button class="opt" data-opt="'+k+'" data-val="'+esc(c.v)+'" aria-pressed="'+(cs.opt[k]===c.v)+'">'+esc(c.v)+'</button>').join("")+
      '</div></div>';
    }).join("")+
    (containers.length>1? '<div class="optgrp"><div class="lb">컵 선택</div>'+
      (tumblerOnly(m)?'<p class="note" style="margin:-4px 0 8px">이 메뉴는 텀블러에만 담아 드려요. 개인 텀블러가 없으시면 공용 텀블러를 빌려드립니다.</p>':"")+
      containers.map(k=>'<button class="opt wide" style="margin-bottom:8px" data-ct="'+k+'" aria-pressed="'+(cs.container===k)+'">'+
        '<span>'+CONTAINERS[k].icon+' '+CONTAINERS[k].label+
          (refillable(m) && k!=="disposable" ? '<span class="sub">♻️ 1회 무료 리필 가능</span>' : "")+'</span>'+
        (k==="personal_tumbler"?'<span class="side">번호판을<br>먼저 받아요</span>':"")+
      '</button>').join("")+'</div>':"")+
    '<div class="optgrp"><div class="lb">수량</div><div class="qty">'+
      '<button data-q="-1">−</button><span class="n">'+cs.qty+'</span><button data-q="1">＋</button></div></div>'+
  '</div>'+
  bar('<button class="btn brass" data-add>'+won(price*cs.qty)+' 담기</button>');

  VC.querySelector("[data-back]").onclick=()=>{ cs.screen="menu"; render(); };
  VC.querySelectorAll("[data-opt]").forEach(b=>b.onclick=()=>{ cs.opt[b.dataset.opt]=b.dataset.val; render(); });
  VC.querySelectorAll("[data-ct]").forEach(b=>b.onclick=()=>{ cs.container=b.dataset.ct; render(); });
  VC.querySelectorAll("[data-q]").forEach(b=>b.onclick=()=>{ cs.qty=Math.max(1,Math.min(9,cs.qty+Number(b.dataset.q))); render(); });
  VC.querySelector("[data-add]").onclick=()=>{
    cs.cart.push({ mid:m.id, name:m.name, pic:m.pic, opt:{...cs.opt}, container:cs.container,
                   price:itemPrice(m,cs.opt), qty:cs.qty });
    cs.screen="menu"; render(); toast(m.name+" 담았어요");
  };
}
function cCart(){
  const notes = syncCart();
  if(!cs.cart.length){ cs.screen="menu"; render(); warnCart(notes); return; }
  VC.innerHTML =
  '<div class="topnav"><button class="back" data-back>‹</button><span class="t">장바구니</span></div>'+
  '<div class="screen">'+
    cs.cart.map((i,ix)=>'<div style="display:flex;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line-2)">'+
      '<span style="font-size:26px">'+i.pic+'</span>'+
      '<span style="flex:1"><b>'+esc(i.name)+'</b>'+
        (optText(i)?'<span style="display:block;font-size:12.5px;color:var(--ink-3)">'+esc(optText(i))+'</span>':"")+
        '<span class="mono" style="display:block;font-size:14px;margin-top:4px">'+won(i.price*i.qty)+'</span></span>'+
      '<span style="display:grid;gap:6px;justify-items:end">'+
        '<span class="qty"><button data-cq="'+ix+'|-1">−</button><span class="n">'+i.qty+'</span><button data-cq="'+ix+'|1">＋</button></span>'+
        '<button style="font-size:12px;color:var(--clay);font-weight:700" data-del="'+ix+'">삭제</button>'+
      '</span></div>').join("")+
    '<div class="total"><span style="font-weight:800">합계</span><span class="v">'+won(cartTotal())+'</span></div>'+
    '<div class="field"><label for="nm">주문자 이름 (호출용)</label>'+
      '<input id="nm" placeholder="예) 김재환" value="'+esc(cs.name)+'" maxlength="12"></div>'+
    '<div class="optgrp"><div class="lb">픽업 시점</div><div class="optrow">'+
      '<button class="opt" data-pk="now" aria-pressed="'+(cs.pickupType==="now")+'">바로 받을게요</button>'+
      '<button class="opt" data-pk="after" aria-pressed="'+(cs.pickupType==="after")+'">예배 후에요</button>'+
    '</div></div>'+
    '<p class="note" style="margin-top:14px">이름은 음료를 찾으실 때 부르기 위해서만 쓰고, '+OPS.retentionDays+'일 후 자동 삭제됩니다.</p>'+
  '</div>'+
  bar('<button class="btn ghost" data-back>메뉴</button><button class="btn brass" data-pay>'+won(cartTotal())+' 주문하기</button>');

  VC.querySelectorAll("[data-back]").forEach(b=>b.onclick=()=>{ cs.screen="menu"; render(); });
  VC.querySelectorAll("[data-cq]").forEach(b=>b.onclick=()=>{
    const [ix,d]=b.dataset.cq.split("|");
    cs.cart[ix].qty = Math.max(1,Math.min(9,cs.cart[ix].qty+Number(d))); render();
  });
  VC.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{ cs.cart.splice(Number(b.dataset.del),1); render(); });
  VC.querySelectorAll("[data-pk]").forEach(b=>b.onclick=()=>{ cs.pickupType=b.dataset.pk; render(); });
  const nm=VC.querySelector("#nm"); nm.oninput=()=>{ cs.name=nm.value; };
  warnCart(notes);
  VC.querySelector("[data-pay]").onclick=()=>{ cs.name=nm.value; cs.screen="pay"; render(); };
}
function cPay(){
  const notes = syncCart();
  if(!cs.cart.length){ cs.screen="menu"; render(); warnCart(notes); return; }
  const tot = cartTotal();
  VC.innerHTML =
  '<div class="topnav"><button class="back" data-back>‹</button><span class="t">결제 방법</span></div>'+
  '<div class="screen">'+
    '<div class="total" style="padding-top:4px"><span style="font-weight:800">'+esc(cs.name||"손님")+'님 · '+cs.cart.length+'개</span><span class="v">'+won(tot)+'</span></div>'+
    '<button class="paybtn" data-m="transfer"><span class="ic">🏦</span><span style="flex:1">'+
      '<span class="nm">계좌이체</span><span class="ds">계좌로 보내고 접수 · 봉사자가 확인해요</span></span><span>›</span></button>'+
    '<button class="paybtn" data-m="cash"><span class="ic">💵</span><span style="flex:1">'+
      '<span class="nm">현금</span><span class="ds">주문만 접수 · 데스크에서 현금을 내면 결제 완료</span></span><span>›</span></button>'+
    (CARD_ENABLED? "" :
      '<div class="sect" style="margin-top:16px"><h3 style="font-size:14px">💳 카드 결제는 준비 중입니다</h3>'+
      '<p class="note">지금은 계좌이체와 현금만 받습니다.</p></div>')+
  '</div>';
  VC.querySelector("[data-back]").onclick=()=>{ cs.screen="cart"; render(); };
  warnCart(notes);
  VC.querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>{
    if(b.dataset.m==="transfer") openTransfer(tot);
    else openCash(tot);
  });
}
function qrSVG(seed){
  let h=0; for(const c of seed) h=(h*31+c.charCodeAt(0))>>>0;
  const N=21, cells=[];
  const finder=(r,c)=> (r<7&&c<7)||(r<7&&c>=N-7)||(r>=N-7&&c<7);
  for(let r=0;r<N;r++)for(let c=0;c<N;c++){
    let on;
    if(finder(r,c)){
      const rr=r<7?r:r-(N-7), cc=c<7?c:c-(N-7);
      on = (rr===0||rr===6||cc===0||cc===6)||(rr>=2&&rr<=4&&cc>=2&&cc<=4);
    } else { h=(h*1103515245+12345)>>>0; on=((h>>>16)&7)>2; }
    if(on) cells.push('<rect x="'+c+'" y="'+r+'" width="1" height="1"/>');
  }
  return '<svg class="qr" viewBox="-1 -1 23 23" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="계좌 QR"><g fill="#152A3F">'+cells.join("")+'</g></svg>';
}
async function submit(payMethod, extra){
  const btnBusy = document.querySelector("#payGo, #tdone, #cashGo");
  if(btnBusy){ btnBusy.disabled = true; btnBusy.textContent = "접수 중…"; }
  try{
    const id = await createOrder({
      name: cs.name.trim() || "손님",
      items: extra && extra.items ? extra.items : JSON.parse(JSON.stringify(cs.cart)),
      amount: extra && extra.amount!=null ? extra.amount : cartTotal(),
      payMethod, pickupType: cs.pickupType,
      isRefill: !!(extra && extra.isRefill), refillOf: (extra && extra.refillOf) || null
    });
    cs.orderId = id;
    if(!(extra && extra.isRefill)) cs.cart = [];
    cs.screen = "done";
    closeModal(); render();
    return true;
  }catch(e){
    if(btnBusy){ btnBusy.disabled = false; }
    toast("주문을 접수하지 못했습니다. 연결을 확인하고 다시 눌러주세요");
    return false;
  }
}
function openTransfer(amount){
  modal('<h3>계좌이체로 주문</h3>'+
    qrSVG(BANK.bank+BANK.number+amount)+
    '<p class="note" style="text-align:center">은행 앱에서 아래 계좌로 보내주세요.</p>'+
    '<div class="sect" style="margin:14px 0 0"><div class="mono" style="font-size:15px;font-weight:800">'+esc(BANK.bank)+' '+esc(BANK.number)+'</div>'+
    '<div style="font-size:13px;color:var(--ink-3)">예금주 '+esc(BANK.holder)+'</div>'+
    '<div class="mono" style="font-size:20px;font-weight:800;margin-top:8px">'+won(amount)+'</div>'+
    '<p class="note" style="margin-top:6px">보내는 분 이름을 <b>'+esc(cs.name||"손님")+'</b>으로 해주시면 확인이 빨라요.</p></div>'+
    '<button class="btn brass" style="width:100%;margin-top:14px" id="tdone">이체했어요</button>'+
    '<p class="note" style="text-align:center;margin-top:8px;font-size:11.5px">봉사자가 입금을 확인하면 제조가 시작됩니다.</p>', {});
  MR.querySelector("#tdone").onclick=()=>submit("transfer");
}
function openCash(amount){
  modal('<h3>💵 현금으로 주문</h3>'+
    '<p class="note">지금 누르면 <b>주문만 접수</b>됩니다. 데스크에 오셔서 현금을 내시면 그때 결제가 완료돼요.</p>'+
    '<div class="sect" style="margin:14px 0 0"><div class="mono" style="font-size:24px;font-weight:800">'+won(amount)+'</div>'+
    '<p class="note" style="margin-top:6px">거스름돈이 필요하시면 봉사자에게 말씀해 주세요. 음료가 준비되면 번호판 번호로 알려드립니다.</p></div>'+
    '<button class="btn brass" style="width:100%;margin-top:14px" id="cashGo">주문 접수하기</button>', {});
  MR.querySelector("#cashGo").onclick=()=>submit("cash");
}
function askRefill(mid){
  const m = menuById(mid); if(!m) return;
  modal('<h3>♻️ '+esc(m.name)+' 무료 리필</h3>'+
    '<p class="note">오늘 1회만 받을 수 있어요. 텀블러를 카운터에 맡겨주시면 다시 담아 드립니다.</p>'+
    '<div style="margin-top:14px">'+["shared_tumbler","personal_tumbler"].map(k=>
      '<button class="opt wide" style="margin-bottom:8px" data-rc="'+k+'">'+
      '<span>'+CONTAINERS[k].icon+' '+CONTAINERS[k].label+'</span><span>›</span></button>').join("")+'</div>', {});
  MR.querySelectorAll("[data-rc]").forEach(b=>b.onclick=()=>submit("refill",{
    items:[{ mid:m.id, name:m.name+" (리필)", pic:m.pic, opt:{}, container:b.dataset.rc, price:0, qty:1 }],
    amount:0, isRefill:true, refillOf:m.id
  }));
}

/* ---------- 주문 상태 화면 ---------- */
function cDone(){
  const o = orderById(cs.orderId);
  if(!o){ cs.screen="menu"; return render(); }
  const ready    = o.st==="done" && !!o.pickupTag && !o.tagReturnedAt;
  const needCash = o.payMethod==="cash" && !o.paid && o.st!=="canceled";
  let stage, title, msg;

  if(o.st==="canceled"){
    stage='<div class="waiting">주문<br>취소</div>';
    title="주문이 취소되었습니다"; msg=o.canceledReason||"";
  } else if(ready){
    stage='<div class="plate-wrap reveal"><span class="cap"></span><div class="plate"><span class="num">'+o.pickupTag+'</span></div></div>';
    title="🔔 준비 완료!"; msg="번호판 "+o.pickupTag+"번을 픽업존에서 확인하세요";
  } else if(o.st==="done"){
    stage='<div class="waiting" style="border-style:solid;border-color:rgba(78,107,82,.4);color:var(--sage)">✓<br>전달<br>완료</div>';
    title="음료를 전달해 드렸습니다";
    msg = needCash? "현금 결제가 아직 확인되지 않았어요. 데스크에 문의해 주세요."
        : (o.cashChange>0? "거스름돈 "+won(o.cashChange)+"을 확인해 주세요" : "맛있게 드세요");
  } else if(o.pickupTag){
    stage='<div class="plate-wrap"><span class="cap"></span><div class="plate"><span class="num">'+o.pickupTag+'</span></div></div>';
    title="번호판 "+o.pickupTag+"번"; msg="텀블러에 번호판을 짝지었어요. 제조가 끝나면 픽업존에 놓입니다.";
  } else {
    stage='<div class="waiting"><span class="pulse">번호<br>준비중</span></div>';
    if(o.st==="making"){
      title="☕ 제조중...";
      msg = needCash? "데스크에서 현금을 내주시면 결제가 완료됩니다" : "곧 번호판을 배정해 드려요";
    }
    else if(needCash){ title=esc(o.name)+"님 주문이 접수되었습니다"; msg="데스크에 오셔서 현금을 내주세요"; }
    else if(o.payMethod==="transfer" && !o.paid){ title=esc(o.name)+"님 주문이 접수되었습니다"; msg="봉사자가 입금을 확인하는 중이에요"; }
    else { title=esc(o.name)+"님 주문이 접수되었습니다"; msg="접수됨 · 순서를 기다리고 있어요"; }
  }
  const cashBadge = needCash? '<div class="badge brass" style="margin-bottom:14px">💵 데스크에서 현금 '+won(o.amount)+' 결제</div>':"";
  const tumbler   = hasPersonalTumbler(o) && o.st==="new";

  VC.innerHTML =
  '<div class="done-wrap'+(ready?" ready":"")+'">'+
    '<div class="statusline">'+PAYS[o.payMethod].icon+' '+PAYS[o.payMethod].label+' · No.'+p2(o.seq)+' · '+
      (o.paid?'<span style="color:var(--sage)">결제완료</span>':'<span style="color:var(--clay)">결제 대기</span>')+'</div>'+
    '<div class="stage">'+stage+'</div>'+
    '<h2>'+title+'</h2><p class="msg">'+msg+'</p>'+
    cashBadge+
    (tumbler?'<div class="badge brass" style="margin-bottom:14px">🥤 텀블러를 카운터에 맡겨주세요</div>':"")+
    '<div class="sect" style="text-align:left">'+
      o.items.map(i=>'<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0">'+
        '<span>'+esc(i.name)+(i.qty>1?" ×"+i.qty:"")+(optText(i)?'<span style="display:block;font-size:12.5px;color:var(--ink-3)">'+esc(optText(i))+'</span>':"")+'</span>'+
        '<span class="mono">'+won(i.price*i.qty)+'</span></div>').join("")+
      '<div class="total" style="padding:10px 0 0;border-top:1px dashed var(--line)"><span style="font-weight:800">합계</span><span class="v" style="font-size:20px">'+won(o.amount)+'</span></div>'+
      (o.cashGiven? '<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--ink-3);padding-top:6px">'+
        '<span>받은 금액 '+won(o.cashGiven)+'</span><span>거스름돈 '+won(o.cashChange||0)+'</span></div>':"")+
    '</div>'+
    (o.paid? '<button class="btn ghost" style="width:100%;margin-top:14px" data-receipt>🧾 영수증 보기</button>':"")+
    '<button class="btn ghost" style="width:100%;margin-top:10px" data-home>메뉴로 돌아가기</button>'+
    (ready? '<p class="note" style="margin-top:14px">음료를 가져가신 뒤 번호판은 보관함 제자리에 놓아주세요.</p>':"")+
  '</div>'+ legalBlock();

  VC.querySelector("[data-home]").onclick=()=>{ cs.screen="menu"; render(); };
  const rb=VC.querySelector("[data-receipt]"); if(rb) rb.onclick=()=>openReceipt(o);

  const sig = o.st+"|"+(o.pickupTag||"")+"|"+o.paid;
  if(lastShown[o.id] && lastShown[o.id]!==sig && ready){ buzz(); ding(); }
  lastShown[o.id]=sig;
}

/* ---------- 영수증 ---------- */
function receiptHTML(o){
  return '<div class="recpt">'+
    '<h4>영 수 증</h4>'+
    '<div style="text-align:center;font-family:var(--sans);font-size:12px;color:var(--ink-3);margin-bottom:10px">'+esc(SHOP.businessName)+'</div><hr>'+
    '<div class="r"><span>대표자</span><span>'+esc(SHOP.ownerName)+'</span></div>'+
    '<div class="r"><span>사업자번호</span><span>'+esc(SHOP.businessNumber)+'</span></div>'+
    '<div class="r"><span>주소</span><span style="text-align:right;max-width:60%">'+esc(SHOP.address)+'</span></div>'+
    '<div class="r"><span>일시</span><span>'+o.day+' '+hhmm(o.createdAt)+'</span></div>'+
    '<div class="r"><span>주문번호</span><span>No.'+p2(o.seq)+'</span></div><hr>'+
    o.items.map(i=>'<div class="r"><span>'+esc(i.name)+' ×'+i.qty+'</span><span>'+won(i.price*i.qty)+'</span></div>').join("")+
    '<hr><div class="r big"><span>합계</span><span>'+won(o.amount)+'</span></div>'+
    '<div class="r"><span>결제수단</span><span>'+PAYS[o.payMethod].label+'</span></div>'+
    (o.payMethod==="cash"&&o.cashGiven?'<div class="r"><span>받은금액</span><span>'+won(o.cashGiven)+'</span></div>'+
      '<div class="r"><span>거스름돈</span><span>'+won(o.cashChange||0)+'</span></div>':"")+
    (o.isRefill?'<div class="r"><span>구분</span><span>무료 리필 (0원)</span></div>':"")+
    '<hr><div style="font-family:var(--sans);font-size:11px;color:#6B7F92;line-height:1.6">'+
      '통신판매업 신고: '+esc(SHOP.mailOrderNumber)+'<br>'+esc(SHOP.refundPolicy)+
    '</div></div>';
}
function openReceipt(o){
  modal(receiptHTML(o)+'<button class="btn ghost" style="width:100%;margin-top:14px" id="pr">인쇄 / PDF로 저장</button>',{});
  MR.querySelector("#pr").onclick=()=>window.print();
}

/* ============================================================
   2. 봉사자 앱
   ============================================================ */
function renderAdmin(){
  if(!DB.staff)  return staffLogin();
  if(!DB.ready)  return VA.innerHTML = '<div style="padding:60px;text-align:center;color:#B39A81"><div class="spin"></div>불러오는 중…</div>';
  if(!pinOk)     return pinLock();

  const today = DB.orders.filter(o=>o.st!=="canceled");
  const cols = [
    { k:"new",    t:"신규",   list:today.filter(o=>o.st==="new") },
    { k:"making", t:"제조중", list:today.filter(o=>o.st==="making") },
    { k:"done",   t:"완료",   list:today.filter(o=>o.st==="done") }
  ];
  VA.innerHTML =
  '<div class="a-head">'+
    '<span class="ttl">봉사자 화면</span>'+
    '<div class="atabs" role="tablist">'+
      [["board","주문 보드"],["menus","메뉴 관리"],["close","마감·정산"],["receipt","영수증 재발급"],["manage","관리자"]].map(([k,t])=>
      '<button data-atab="'+k+'" aria-current="'+(as.tab===k)+'">'+t+'</button>').join("")+
    '</div>'+
    '<div style="flex:1"></div>'+
    '<button class="tog" data-open-toggle aria-pressed="'+(DB.shop.isOpen!==false)+'">'+(DB.shop.isOpen!==false?"● 영업중":"● 마감")+'</button>'+
    '<button class="abtn mini" data-lock>잠금</button>'+
  '</div>'+
  '<div class="a-body">'+
    (as.tab==="board"? aBoard(cols) : as.tab==="menus"? aMenus() : as.tab==="close"? aClose() :
     as.tab==="receipt"? aReceipt() : aManage())+
  '</div>';

  VA.querySelectorAll("[data-atab]").forEach(b=>b.onclick=()=>{ as.tab=b.dataset.atab; if(as.tab==="receipt") watchDay(as.date); render(); });
  VA.querySelector("[data-open-toggle]").onclick=()=>guard(()=>setOpen(DB.shop.isOpen===false));
  VA.querySelector("[data-lock]").onclick=()=>{ pinOk=false; render(); };
  if(as.tab==="board")   bindBoard();
  if(as.tab==="menus")   bindMenus();
  if(as.tab==="close")   bindClose();
  if(as.tab==="receipt") bindReceipt();
  if(as.tab==="manage")  bindManage();

  let isNew=false;
  DB.orders.filter(o=>o.st==="new").forEach(o=>{ if(!seen.has(o.id)){ seen.add(o.id); isNew=true; } });
  if(isNew && as.tab==="board") ding();
}
function staffLogin(){
  VA.innerHTML='<div style="max-width:360px;margin:0 auto;padding:56px 20px">'+
    '<div style="font-family:var(--serif);font-size:24px;text-align:center">봉사자 로그인</div>'+
    '<div style="font-size:13.5px;color:#B39A81;text-align:center;margin-top:6px">교회에서 받은 공용 계정으로 들어오세요</div>'+
    '<div class="field" style="margin-top:22px"><label for="se">이메일</label>'+
      '<input class="ainput" id="se" type="email" autocomplete="username" value="'+esc(OPS.staffEmail||"")+'"></div>'+
    '<div class="field"><label for="sp">비밀번호</label>'+
      '<input class="ainput" id="sp" type="password" autocomplete="current-password"></div>'+
    (DB.authError? '<p style="color:#F0A79A;font-size:13.5px;margin-top:10px">'+esc(DB.authError)+'</p>':"")+
    '<button class="abtn" style="width:100%;margin-top:16px" id="sgo">로그인</button>'+
    '<p style="font-size:12px;color:#9C8672;margin-top:14px;line-height:1.7">손님은 로그인하지 않아도 주문할 수 있습니다. 이 화면은 카운터 담당자만 씁니다.</p>'+
  '</div>';
  const go = async ()=>{
    const e=VA.querySelector("#se").value, p=VA.querySelector("#sp").value;
    if(!e || !p){ toast("이메일과 비밀번호를 입력해 주세요"); return; }
    const btn=VA.querySelector("#sgo"); btn.disabled=true; btn.textContent="로그인 중…";
    const ok = await staffSignIn(e,p);
    if(!ok){ btn.disabled=false; btn.textContent="로그인"; render(); }
  };
  VA.querySelector("#sgo").onclick=go;
  VA.querySelector("#sp").onkeydown=e=>{ if(e.key==="Enter") go(); };
}
function pinLock(){
  VA.innerHTML='<div style="max-width:330px;margin:0 auto;padding:56px 20px;text-align:center">'+
    '<div style="font-family:var(--serif);font-size:24px;margin-bottom:6px">봉사자 화면</div>'+
    '<div style="font-size:13.5px;color:#B39A81">PIN '+String(OPS.staffPin).length+'자리를 입력하세요</div>'+
    '<div class="pindots" id="dots">'+String(OPS.staffPin).split("").map(()=>'<i></i>').join("")+'</div>'+
    '<div class="kp">'+[1,2,3,4,5,6,7,8,9].map(n=>'<button data-k="'+n+'">'+n+'</button>').join("")+
      '<button data-k="c" style="font-size:15px">지움</button><button data-k="0">0</button>'+
      '<button data-k="x" style="font-size:14px">로그아웃</button></div></div>';
  let pin="";
  const paint=()=>VA.querySelectorAll("#dots i").forEach((el,i)=>el.className=i<pin.length?"on":"");
  VA.querySelectorAll("[data-k]").forEach(b=>b.onclick=async ()=>{
    const k=b.dataset.k;
    if(k==="x"){ await staffSignOut(); pinOk=false; return; }
    if(k==="c") pin=pin.slice(0,-1); else if(pin.length<String(OPS.staffPin).length) pin+=k;
    paint();
    if(pin.length===String(OPS.staffPin).length){
      if(pin===String(OPS.staffPin)){ pinOk=true; DB.orders.forEach(o=>seen.add(o.id)); render(); }
      else { toast("PIN이 맞지 않습니다"); pin=""; paint(); }
    }
  });
}

/* ---------- 주문 보드 ---------- */
function aBoard(cols){
  const inUse = tagsInUse().length;
  const t = todayStr();
  const stale = Object.keys(DB.tags).filter(n=>DB.tags[n].day!==t).length;
  return '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;margin-bottom:16px">'+
    '<div><div style="font-size:12.5px;color:#B39A81;font-weight:700;margin-bottom:7px">픽업번호판 보관함 · 사용중 '+inUse+'/'+OPS.pickupTagCount+'</div>'+
    '<div class="tray">'+range(1,OPS.pickupTagCount).map(n=>{
      const used = !!DB.tags[String(n)];
      return used
        ? '<button class="slot out act" data-slot="'+n+'" title="'+n+'번 반납 확인">'+n+'</button>'
        : '<div class="slot" title="보관함에 있음">'+n+'</div>';
    }).join("")+'</div>'+
    '<div style="font-size:11.5px;color:#9C8672;margin-top:7px;max-width:340px">황동 칸 = 보관함에 있음 · <b style="color:var(--brass-hi)">점선 칸을 누르면 반납 확인</b> 창이 열립니다.</div>'+
    (stale? '<button class="abtn mini" style="margin-top:8px" data-stale>어제 번호판 '+stale+'개 정리</button>':"")+
    '</div>'+
    '<button class="abtn alt" style="flex:none;min-width:0" data-mode-display>🔢 완료현황판 열기</button>'+
  '</div>'+
  '<div class="kanban">'+cols.map(c=>
    '<div class="col"><h3>'+c.t+'<span class="cnt">'+c.list.length+'</span></h3>'+
    (c.list.length? c.list.map(ocard).join("") : '<div class="empty">'+
      (c.k==="new"?"새 주문이 들어오면 여기 표시됩니다":c.k==="making"?"제조 중인 주문 없음":"완료된 주문 없음")+'</div>')+
    '</div>').join("")+'</div>';
}
function ocard(o){
  const tum = hasPersonalTumbler(o);
  const needCash = o.payMethod==="cash" && !o.paid;
  const needTr   = o.payMethod==="transfer" && !o.paid;
  const mismatch = !o.isRefill && itemsSum(o) !== o.amount;
  const acts = [];
  if(o.st==="new"){
    if(needTr) acts.push('<button class="abtn" data-act="confirmpay|'+o.id+'">🏦 입금 확인</button>');
    else if(needCash){
      acts.push('<button class="abtn" data-act="takecash|'+o.id+'">💵 현금 받기</button>');
      acts.push('<button class="abtn alt" data-act="start|'+o.id+'">결제 전 제조 시작</button>');
    }
    else acts.push('<button class="abtn go" data-act="start|'+o.id+'">제조 시작 →</button>');
    acts.push('<button class="abtn mini" data-act="cancel|'+o.id+'">취소</button>');
  } else if(o.st==="making"){
    if(needCash) acts.push('<button class="abtn" data-act="takecash|'+o.id+'">💵 현금 받기</button>');
    if(o.pickupTag) acts.push('<button class="abtn go" data-act="finish|'+o.id+'">제조 완료 ('+o.pickupTag+'번)</button>');
    else {
      acts.push('<button class="abtn go" data-act="pick|'+o.id+'">완료 · 번호판 배정</button>');
      acts.push('<button class="abtn alt" data-act="handover|'+o.id+'">완료 · 직접 전달</button>');
    }
    acts.push('<button class="abtn mini" data-act="cancel|'+o.id+'">취소</button>');
  } else if(o.st==="done"){
    if(needCash)      acts.push('<button class="abtn" data-act="takecash|'+o.id+'">💵 미수금 '+won(o.amount)+' 받기</button>');
    else if(needTr)   acts.push('<button class="abtn" data-act="confirmpay|'+o.id+'">🏦 입금 확인</button>');
    if(o.pickupTag && !o.tagReturnedAt) acts.push('<button class="abtn alt" data-act="return|'+o.id+'">번호판 반납확인</button>');
    else if(!needCash && !needTr) acts.push('<span class="pill paid">✓ '+(o.handedOver?"직접 전달 완료":"전달 완료")+'</span>');
  }
  return '<div class="ocard'+(tum?" tum":"")+(o.st==="new"?" fresh":"")+'">'+
    '<div class="r1"><span class="no">No.'+p2(o.seq)+' · '+hhmm(o.createdAt)+'</span>'+
      '<span class="who">'+(tum?"🥤 ":"")+esc(o.name)+'</span></div>'+
    '<div class="items">'+o.items.map(i=>'<div>'+esc(i.name)+(i.qty>1?" <b>×"+i.qty+"</b>":"")+
      (optText(i)?'<span class="o"> '+esc(optText(i))+'</span>':"")+'</div>').join("")+'</div>'+
    '<div class="r2">'+
      '<span class="pill '+(o.paid?"paid":"unpaid")+'">'+PAYS[o.payMethod].icon+' '+
        (o.paid?"결제완료":(o.st==="new"?"결제 대기":"⚠ 미수금"))+'</span>'+
      '<span class="pill">'+won(o.amount)+'</span>'+
      (mismatch?'<span class="pill unpaid" title="품목 합계와 결제 금액이 다릅니다. 금액을 직접 확인해 주세요">⚠ 금액확인 '+won(itemsSum(o))+'</span>':"")+
      (o.isRefill?'<span class="pill refill">♻️ 리필</span>':"")+
      (o.pickupType==="after"?'<span class="pill">예배 후</span>':"")+
      (o.pickupTag?'<span class="pill tag">'+o.pickupTag+'번</span>':"")+
      (o.handedOver?'<span class="pill">🤝 직접 전달</span>':"")+
      (tum?'<span class="pill" style="background:rgba(127,176,138,.22);color:#A6D6B0">개인 텀블러</span>':"")+
    '</div>'+
    (acts.length?'<div class="acts">'+acts.join("")+'</div>':"")+
  '</div>';
}
function bindBoard(){
  VA.querySelectorAll("[data-act]").forEach(b=>b.onclick=()=>{
    const [act,id]=b.dataset.act.split("|");
    const o=DB.orders.find(x=>x.id===id); if(!o) return;
    if(act==="confirmpay") guard(async()=>{ await patchOrder(o.id,{paid:true}); toast("입금 확인 — 제조를 시작할 수 있어요"); });
    if(act==="takecash")   takeCash(o);
    if(act==="start"){
      if(hasPersonalTumbler(o)) pickTag(o,"making");
      else guard(()=>patchOrder(o.id,{st:"making"}));
    }
    if(act==="pick")     guardCash(o, ()=>pickTag(o,"done"));
    if(act==="finish")   guardCash(o, ()=>guard(async()=>{ await patchOrder(o.id,{st:"done"}); toast(o.pickupTag+"번 픽업존에 올려주세요"); }));
    if(act==="handover") guardCash(o, ()=>guard(async()=>{
      if(o.pickupTag) await releaseTag(o.pickupTag, null, false);
      await patchOrder(o.id,{st:"done", handedOver:true, pickupTag:null});
      toast("손님에게 직접 전달 완료");
    }));
    if(act==="return")   guard(async()=>{ await releaseTag(o.pickupTag, o.id, true); toast(o.pickupTag+"번 번호판 반납 확인"); });
    if(act==="cancel"){
      modal('<h3>주문을 취소할까요?</h3><p class="note">No.'+p2(o.seq)+' '+esc(o.name)+'님 · '+won(o.amount)+'</p>'+
        '<div style="display:flex;gap:8px;margin-top:16px"><button class="btn ghost" style="flex:1" data-close>그대로 두기</button>'+
        '<button class="btn clay" id="doCancel">주문 취소</button></div>',{});
      MR.querySelector("#doCancel").onclick=()=>guard(async()=>{ await cancelOrder(o); closeModal(); toast("주문을 취소했습니다"); });
    }
  });
  VA.querySelectorAll("[data-slot]").forEach(b=>b.onclick=()=>openTagSlot(Number(b.dataset.slot)));
  const st=VA.querySelector("[data-stale]");
  if(st) st.onclick=()=>guard(async()=>{ const n=await clearStaleTags(); toast(n+"개 정리했습니다"); });
  const dm=VA.querySelector("[data-mode-display]"); if(dm) dm.onclick=()=>setMode("display");
}
function takeCash(o, after){
  const due = o.amount;
  let given = due;
  const chips = [due,1000,5000,10000,20000,50000].filter(v=>v>=due).filter((v,i,a)=>a.indexOf(v)===i).slice(0,5);
  modal('<h3>💵 현금 받기</h3>'+
    '<div class="total" style="padding-top:0"><span style="font-weight:800">No.'+p2(o.seq)+' · '+esc(o.name)+'님</span>'+
      '<span class="v">'+won(due)+'</span></div>'+
    '<div class="field" style="margin-top:10px"><label for="gv">받은 금액</label>'+
      '<input id="gv" class="mono" inputmode="numeric" value="'+due+'"></div>'+
    '<div class="optrow" style="margin-top:8px">'+chips.map(v=>
      '<button class="opt" data-gv="'+v+'" style="font-size:14px;padding:9px 13px">'+(v===due?"정확히":won(v))+'</button>').join("")+'</div>'+
    '<div class="total" style="margin-top:12px"><span style="font-weight:800">거스름돈</span><span class="v" id="chg">0원</span></div>'+
    '<button class="btn brass" style="width:100%;margin-top:12px" id="cashOK">수령 완료</button>'+
    '<p class="note" style="text-align:center;margin-top:8px;font-size:11.5px">결제만 처리됩니다. 제조·전달은 아래 버튼으로 이어서 진행하세요.</p>', {});
  const gv=MR.querySelector("#gv"), chg=MR.querySelector("#chg");
  const paint=()=>{ chg.textContent = won(Math.max(0, given-due)); };
  gv.oninput=()=>{ gv.value=gv.value.replace(/\D/g,""); given=Number(gv.value||0); paint(); };
  MR.querySelectorAll("[data-gv]").forEach(b=>b.onclick=()=>{ given=Number(b.dataset.gv); gv.value=given; paint(); });
  paint();
  MR.querySelector("#cashOK").onclick=()=>{
    if(given < due){ toast("받은 금액이 결제 금액보다 적습니다"); return; }
    guard(async()=>{
      await patchOrder(o.id, { paid:true, cashGiven:given, cashChange:given-due });
      closeModal();
      toast(given-due>0 ? "수령 완료 · 거스름돈 "+won(given-due) : "현금 수령 완료");
      if(after) after();
    });
  };
}
function guardCash(o, run){
  if(!(o.payMethod==="cash" && !o.paid)){ run(); return; }
  modal('<h3>아직 현금을 받지 않았어요</h3>'+
    '<p class="note">No.'+p2(o.seq)+' '+esc(o.name)+'님 · '+won(o.amount)+' — 미수금 상태입니다. 어떻게 할까요?</p>'+
    '<button class="btn brass" style="width:100%;margin-top:14px" id="gTake">💵 지금 현금 받고 진행</button>'+
    '<button class="btn ghost" style="width:100%;margin-top:8px" id="gSkip">미수금으로 두고 진행</button>', {});
  MR.querySelector("#gTake").onclick=()=>takeCash(o, run);
  MR.querySelector("#gSkip").onclick=()=>{ closeModal(); run(); };
}
function pickTag(o, nextState){
  modal('<h3>번호판 선택</h3>'+
    '<p class="note">'+(nextState==="making"
      ? "텀블러에 짝지을 번호판을 손에 든 실물과 같은 숫자로 골라주세요. 이 번호대로 제조합니다."
      : "트레이에 올릴 번호판과 같은 숫자를 골라주세요.")+'</p>'+
    '<div class="tray" style="margin:14px auto 0;max-width:100%">'+
      range(1,OPS.pickupTagCount).map(n=>{
        const u=!!DB.tags[String(n)];
        return '<button class="slot '+(u?"out":"pick")+'" data-tag="'+n+'" '+(u?"disabled":"")+'>'+n+'</button>';
      }).join("")+'</div>'+
    '<p class="note" style="margin-top:10px">점선(비활성) 번호는 지금 사용중입니다.</p>'+
    (nextState==="done"?'<button class="btn ghost" style="width:100%;margin-top:14px" id="noTag">번호판 없이 손님에게 직접 전달</button>':""),{});
  MR.querySelectorAll("[data-tag]").forEach(b=>b.onclick=()=>{
    const n=Number(b.dataset.tag);
    guard(async()=>{
      await assignTag(o.id, n, nextState);
      closeModal();
      toast(n+"번 배정"+(nextState==="making"?" — 이 번호로 제조하세요":""));
    });
  });
  const nt=MR.querySelector("#noTag");
  if(nt) nt.onclick=()=>guard(async()=>{
    await patchOrder(o.id,{st:"done", pickupTag:null, handedOver:true});
    closeModal(); toast("손님에게 직접 전달 완료");
  });
}
function openTagSlot(n){
  const rec = DB.tags[String(n)];
  const o = rec ? DB.orders.find(x=>x.id===rec.orderId) : null;
  const plate = '<div style="display:flex;justify-content:center;height:118px;margin:14px 0 4px">'+
    '<div class="plate-wrap" style="transform:scale(.66);transform-origin:top center">'+
      '<span class="cap"></span><div class="plate"><span class="num">'+n+'</span></div></div></div>';
  let body;
  if(!o || o.st==="canceled"){
    body = '<p class="note">이 번호에 연결된 오늘 주문이 없습니다. 취소되었거나 어제 것이 남아 있는 경우입니다.</p>'+
      '<button class="btn brass" style="width:100%;margin-top:14px" id="tOK">빈 칸으로 되돌리기</button>';
  } else {
    const info = '<div class="sect" style="margin:0;text-align:left">'+
      '<div style="font-weight:800">No.'+p2(o.seq)+' · '+esc(o.name)+'님 · '+hhmm(o.createdAt)+'</div>'+
      o.items.map(i=>'<div style="font-size:14px;color:var(--ink-3)">· '+esc(i.name)+(i.qty>1?" ×"+i.qty:"")+'</div>').join("")+
      (o.paid?"":'<div style="font-size:13px;color:var(--clay);font-weight:700;margin-top:6px">⚠ 미수금 '+won(o.amount)+'</div>')+
      '</div>';
    body = o.st==="done"
      ? info+'<p class="note" style="margin-top:12px">손님이 음료를 가져가고 번호판을 보관함에 돌려주셨나요?</p>'+
        '<button class="btn brass" style="width:100%;margin-top:12px" id="tOK">반납 확인</button>'
      : info+'<p class="note" style="margin-top:12px;color:var(--clay)"><b>아직 제조가 끝나지 않은 주문입니다.</b> 지금 반납 처리하면 번호 연결이 풀리고, 제조 완료 때 번호를 다시 골라야 합니다.</p>'+
        '<button class="btn clay" style="width:100%;margin-top:12px" id="tOK">번호 연결 풀고 반납</button>';
  }
  modal('<h3>'+n+'번 번호판</h3>'+plate+body+
    '<button class="btn ghost" style="width:100%;margin-top:8px" data-close>닫기</button>',{});
  MR.querySelector("#tOK").onclick=()=>guard(async()=>{
    await releaseTag(n, o? o.id : null, !!(o && o.st==="done"));
    closeModal(); toast(n+"번 번호판 반납 처리했어요");
  });
}

/* ---------- 메뉴 관리 (매주 진열 교체) ---------- */
function aMenus(){
  if(!DB.menus.length) return emptyMenus();
  const on = DB.menus.filter(m=>!m.retired), off = DB.menus.filter(m=>m.retired);
  const row = m => '<div class="mrow"'+(m.retired?' style="opacity:.6"':'')+'>'+
    '<button class="tog" data-t="show|'+m.id+'" aria-pressed="'+(!m.retired)+'" style="min-width:96px;justify-content:center">'+
      (m.retired?"이번 주 쉼":"진열중")+'</button>'+
    '<span style="font-size:22px">'+m.pic+'</span>'+
    '<span class="nm">'+esc(m.name)+'<span style="display:block;font-size:12.5px;color:#9C8672" class="mono">'+
      esc(m.cat)+' · '+won(m.price)+'</span></span>'+
    (m.retired ? '' :
      '<button class="tog" data-t="sold|'+m.id+'" aria-pressed="'+!!m.soldOut+'">'+(m.soldOut?"품절":"판매중")+'</button>'+
      '<button class="tog" data-t="disp|'+m.id+'" aria-pressed="'+(m.allowDisposable!==false)+'">🥛 일회용컵</button>'+
      '<button class="tog" data-t="tum|'+m.id+'" aria-pressed="'+!!m.allowTumbler+'">🥤 텀블러</button>'+
      '<button class="tog" data-t="ref|'+m.id+'" aria-pressed="'+!!m.allowRefill+'">♻️ 리필</button>')+
    '<button class="tog" data-t="price|'+m.id+'">가격</button>'+
  '</div>';
  return '<div style="max-width:820px">'+
    '<p style="font-size:13px;color:#B39A81;margin:0 0 14px;line-height:1.7">'+
      '<b style="color:var(--brass-hi)">매주 바뀌는 사이드 메뉴는 맨 앞의 [진열중 / 이번 주 쉼]만 눌러 바꾸세요.</b> '+
      '쉼으로 두면 손님 메뉴판에서 사라지고, 지난 주문·정산 기록은 그대로 남습니다.<br>'+
      '품절은 오늘 하루 재료가 떨어졌을 때 씁니다. 쿠키·케이크처럼 용기가 필요 없는 메뉴는 일회용컵과 텀블러를 <b>둘 다 꺼두면</b> 손님이 용기를 고르지 않습니다. '+
      '무료 리필은 <b>일회용컵을 쓰지 않는 텀블러 전용 메뉴</b>에만 켤 수 있습니다.</p>'+
    '<div style="font-size:13px;color:#D9C7B1;font-weight:800;letter-spacing:.04em;margin-bottom:4px">이번 주 진열 '+on.length+'개</div>'+
    (on.length? on.map(row).join("") : '<div class="empty">진열중인 메뉴가 없습니다</div>')+
    (off.length? '<div style="font-size:13px;color:#9C8672;font-weight:800;letter-spacing:.04em;margin:26px 0 4px">이번 주 쉬는 메뉴 '+off.length+'개</div>'+
      off.map(row).join("") : "")+
  '</div>';
}
function emptyMenus(){
  return '<div class="empty" style="max-width:520px">아직 메뉴가 없습니다.<br><br>'+
    '<button class="abtn" style="max-width:240px;margin:0 auto" data-seed>샘플 메뉴 6개 넣기</button>'+
    '<div style="margin-top:10px;font-size:12px">관리자 탭에서 하나씩 직접 추가할 수도 있습니다.</div></div>';
}
function bindMenus(){
  const sd=VA.querySelector("[data-seed]");
  if(sd) sd.onclick=()=>guard(async()=>{ await seedMenus(SAMPLE); toast("샘플 메뉴를 넣었습니다"); });
  VA.querySelectorAll("[data-t]").forEach(b=>b.onclick=()=>{
    const [k,id]=b.dataset.t.split("|");
    const m=menuById(id); if(!m) return;
    const patch = {};
    if(k==="show"){
      patch.retired = !m.retired;
      if(patch.retired) patch.soldOut = false;
      guard(async()=>{ await saveMenu({id, ...patch});
        toast(m.name+(patch.retired?" — 이번 주 쉼으로 내렸어요":" — 메뉴판에 진열했어요")); });
      return;
    }
    if(k==="sold") patch.soldOut = !m.soldOut;
    if(k==="disp"){
      patch.allowDisposable = (m.allowDisposable===false);
      if(patch.allowDisposable && m.allowRefill){ patch.allowRefill=false; toast("일회용컵을 제공하는 메뉴라 무료 리필을 껐습니다"); }
      if(!patch.allowDisposable && !m.allowTumbler) toast(m.name+" — 용기를 고르지 않는 메뉴가 됐어요");
    }
    if(k==="tum"){
      patch.allowTumbler = !m.allowTumbler;
      if(!patch.allowTumbler && m.allowRefill){ patch.allowRefill=false; toast("텀블러를 끄면서 무료 리필도 껐습니다"); }
      if(!patch.allowTumbler && m.allowDisposable===false) toast(m.name+" — 용기를 고르지 않는 메뉴가 됐어요");
    }
    if(k==="ref"){
      if(!m.allowRefill && !tumblerOnly(m)){ toast("무료 리필은 텀블러 전용 메뉴에만 켤 수 있습니다"); return; }
      patch.allowRefill = !m.allowRefill;
    }
    if(k==="price"){
      modal('<h3>'+esc(m.name)+' 가격</h3><div class="field"><label>판매 가격 (원)</label>'+
        '<input id="pv" class="mono" inputmode="numeric" value="'+m.price+'"></div>'+
        '<button class="btn brass" style="width:100%;margin-top:14px" id="pok">저장</button>',{});
      MR.querySelector("#pok").onclick=()=>{
        const v=Number(MR.querySelector("#pv").value.replace(/\D/g,""));
        if(!v){ toast("숫자를 입력해 주세요"); return; }
        guard(async()=>{ await saveMenu({id, price:v}); closeModal(); toast("가격을 저장했어요"); });
      };
      return;
    }
    guard(()=>saveMenu({id, ...patch}));
  });
}

/* ---------- 관리자 탭 ---------- */
function aManage(){
  const act = DB.menus.filter(m=>!m.retired), ret = DB.menus.filter(m=>m.retired);
  const row = (m, idx)=> '<div class="mrow">'+
    '<span style="font-size:22px">'+m.pic+'</span>'+
    '<span class="nm">'+esc(m.name)+
      '<span style="display:block;font-size:12.5px;color:#9C8672" class="mono">'+esc(m.cat)+' · '+won(m.price)+
      (m.soldOut?" · 품절":"")+
      (noContainer(m)?" · 용기 없음":tumblerOnly(m)?" · 텀블러 전용":(m.allowTumbler?" · 일회용+텀블러":" · 일회용컵만"))+
      (refillable(m)?" · 리필":"")+'</span></span>'+
    '<span style="display:flex;gap:4px">'+
      '<button class="abtn mini" data-mv="up|'+m.id+'" '+(idx===0?"disabled style=opacity:.35":"")+' aria-label="위로">↑</button>'+
      '<button class="abtn mini" data-mv="down|'+m.id+'" '+(idx===act.length-1?"disabled style=opacity:.35":"")+' aria-label="아래로">↓</button>'+
    '</span>'+
    '<button class="tog" data-edit="'+m.id+'">수정</button>'+
    '<button class="abtn mini" data-retire="'+m.id+'">이번 주 쉼</button>'+
  '</div>';
  return '<div style="max-width:820px">'+
    '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px">'+
      '<button class="abtn" style="flex:none" data-new>＋ 메뉴 추가</button>'+
      '<span style="font-size:12.5px;color:#9C8672">진열중 '+act.length+'개'+(ret.length?' · 이번 주 쉼 '+ret.length+'개':'')+'</span>'+
    '</div>'+
    '<p style="font-size:12.5px;color:#B39A81;margin:0 0 14px;line-height:1.7">'+
      '[이번 주 쉼]은 손님 메뉴판에서만 감춥니다. 기록은 그대로 남고 언제든 다시 진열할 수 있어요. 매주 켜고 끄는 일은 <b>메뉴 관리</b> 탭이 더 빠릅니다.<br>'+
      '사진은 이모지로 고릅니다.</p>'+
    (act.length? act.map(row).join("") : '<div class="empty">진열중인 메뉴가 없습니다</div>')+
    (ret.length? '<h3 style="font-size:14px;color:#D9C7B1;margin:26px 0 6px;letter-spacing:.04em">이번 주 쉬는 메뉴</h3>'+
      ret.map(m=>'<div class="mrow" style="opacity:.7">'+
        '<span style="font-size:22px">'+m.pic+'</span>'+
        '<span class="nm">'+esc(m.name)+'<span style="display:block;font-size:12.5px;color:#9C8672" class="mono">'+
          esc(m.cat)+' · '+won(m.price)+'</span></span>'+
        '<button class="tog" data-revive="'+m.id+'">진열하기</button>'+
        '<button class="abtn mini" data-del="'+m.id+'" style="color:#F0A79A">완전 삭제</button>'+
      '</div>').join("") : "")+
  '</div>';
}
function bindManage(){
  VA.querySelector("[data-new]").onclick=()=>openMenuForm(null);
  VA.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openMenuForm(b.dataset.edit));
  VA.querySelectorAll("[data-mv]").forEach(b=>b.onclick=()=>{
    const [dir,id]=b.dataset.mv.split("|");
    const act = DB.menus.filter(m=>!m.retired);
    const i = act.findIndex(m=>m.id===id);
    const j = dir==="up" ? i-1 : i+1;
    if(j<0 || j>=act.length) return;
    guard(()=>swapMenuOrder(act[i], act[j]));
  });
  VA.querySelectorAll("[data-retire]").forEach(b=>b.onclick=()=>{
    const m=menuById(b.dataset.retire);
    modal('<h3>'+esc(m.name)+'을 이번 주 쉼으로 내릴까요?</h3>'+
      '<p class="note">손님 메뉴판에서 사라집니다. 장바구니에 담아둔 손님에게는 주문 전에 안내됩니다.</p>'+
      '<div style="display:flex;gap:8px;margin-top:16px"><button class="btn ghost" style="flex:1" data-close>그대로 두기</button>'+
      '<button class="btn" id="ok">이번 주 쉼</button></div>',{});
    MR.querySelector("#ok").onclick=()=>guard(async()=>{
      await saveMenu({id:m.id, retired:true, soldOut:false}); closeModal(); toast(m.name+" — 이번 주 쉼으로 내렸습니다"); });
  });
  VA.querySelectorAll("[data-revive]").forEach(b=>b.onclick=()=>{
    const m=menuById(b.dataset.revive);
    guard(async()=>{ await saveMenu({id:m.id, retired:false}); toast(m.name+" 다시 진열합니다"); });
  });
  VA.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{
    const m=menuById(b.dataset.del);
    modal('<h3>'+esc(m.name)+'을 완전히 삭제할까요?</h3>'+
      '<p class="note">되돌릴 수 없습니다. 지난 주문 기록에는 주문 당시의 이름과 가격이 그대로 남아 정산에는 영향이 없습니다.</p>'+
      '<div class="field"><label>확인을 위해 메뉴 이름을 입력해 주세요</label><input id="cf" placeholder="'+esc(m.name)+'"></div>'+
      '<div style="display:flex;gap:8px;margin-top:16px"><button class="btn ghost" style="flex:1" data-close>취소</button>'+
      '<button class="btn clay" id="ok">완전 삭제</button></div>',{});
    MR.querySelector("#ok").onclick=()=>{
      if(MR.querySelector("#cf").value.trim()!==m.name){ toast("이름이 맞지 않습니다"); return; }
      guard(async()=>{ await deleteMenu(m.id); closeModal(); toast("삭제했습니다"); });
    };
  });
}
function openMenuForm(id){
  const isNew = !id;
  const src = isNew
    ? { id:newMenuId(), name:"", cat:"", price:0, pic:"☕", soldOut:false, retired:false,
        allowDisposable:true, allowTumbler:false, allowRefill:false, opts:[],
        order:(DB.menus.reduce((mx,m)=>Math.max(mx,m.order||0),0)+10) }
    : menuById(id);
  const d = JSON.parse(JSON.stringify(src));
  if(d.allowDisposable===undefined) d.allowDisposable = true;
  d.opts = d.opts || [];
  const cats = [...new Set(DB.menus.map(m=>m.cat).filter(Boolean))];
  function readInputs(){
    const n=MR.querySelector("#f_name"), c=MR.querySelector("#f_cat"), p=MR.querySelector("#f_price");
    if(n) d.name=n.value; if(c) d.cat=c.value;
    if(p) d.price=Number(String(p.value).replace(/\D/g,""))||0;
  }
  function paint(){
    modal('<h3>'+(isNew?"메뉴 추가":"메뉴 수정")+'</h3>'+
      '<div class="field"><label for="f_name">메뉴 이름</label><input id="f_name" value="'+esc(d.name)+'" placeholder="예) 바닐라라떼" maxlength="20"></div>'+
      '<div class="field"><label for="f_cat">카테고리</label><input id="f_cat" value="'+esc(d.cat)+'" placeholder="예) 커피" maxlength="10">'+
        '<div class="optrow" style="margin-top:8px">'+cats.map(c=>'<button class="opt" style="padding:7px 12px;font-size:14px" data-fcat="'+esc(c)+'" aria-pressed="'+(d.cat===c)+'">'+esc(c)+'</button>').join("")+'</div></div>'+
      '<div class="field"><label for="f_price">가격 (원)</label><input id="f_price" class="mono" inputmode="numeric" value="'+d.price+'"></div>'+
      '<div class="optgrp"><div class="lb">사진 (이모지)</div><div class="optrow">'+
        PICS.map(e=>'<button class="opt" style="padding:9px 11px;font-size:20px" data-pic="'+e+'" aria-pressed="'+(d.pic===e)+'">'+e+'</button>').join("")+'</div></div>'+
      '<div class="optgrp"><div class="lb">옵션</div>'+
        '<button class="opt wide" style="margin-bottom:8px" data-opt="temp" aria-pressed="'+d.opts.includes("temp")+'"><span>HOT / ICE 선택</span><span>'+(d.opts.includes("temp")?"켜짐":"꺼짐")+'</span></button>'+
        '<button class="opt wide" data-opt="shot" aria-pressed="'+d.opts.includes("shot")+'"><span>샷 추가 (+500원)</span><span>'+(d.opts.includes("shot")?"켜짐":"꺼짐")+'</span></button></div>'+
      '<div class="optgrp"><div class="lb">담아 드리는 용기</div>'+
        (d.allowDisposable===false && !d.allowTumbler
          ? '<p class="note" style="margin:-4px 0 8px">둘 다 꺼져 있습니다. <b>손님이 용기를 고르지 않는 메뉴</b>가 됩니다 — 쿠키·케이크 같은 디저트에 쓰세요.</p>' : "")+
        '<button class="opt wide" style="margin-bottom:8px" data-fl="allowDisposable" aria-pressed="'+d.allowDisposable+'"><span>🥛 일회용컵 제공</span><span>'+(d.allowDisposable?"제공":"안 함")+'</span></button>'+
        '<button class="opt wide" style="margin-bottom:8px" data-fl="allowTumbler" aria-pressed="'+d.allowTumbler+'"><span>🥤 텀블러 사용 가능<span class="sub">개인 지참 · 공용 대여</span></span><span>'+(d.allowTumbler?"가능":"불가")+'</span></button>'+
        '<button class="opt wide" data-fl="allowRefill" aria-pressed="'+d.allowRefill+'"><span>♻️ 무료 리필<span class="sub">텀블러 전용 메뉴에만</span></span><span>'+(d.allowRefill?"제공":"안 함")+'</span></button></div>'+
      '<button class="btn brass" style="width:100%;margin-top:16px" id="mok">'+(isNew?"메뉴 추가":"저장")+'</button>',{});
    MR.querySelectorAll("[data-fcat]").forEach(b=>b.onclick=()=>{ readInputs(); d.cat=b.dataset.fcat; paint(); });
    MR.querySelectorAll("[data-pic]").forEach(b=>b.onclick=()=>{ readInputs(); d.pic=b.dataset.pic; paint(); });
    MR.querySelectorAll("[data-opt]").forEach(b=>b.onclick=()=>{
      readInputs(); const k=b.dataset.opt;
      d.opts = d.opts.includes(k) ? d.opts.filter(x=>x!==k) : [...d.opts,k];
      paint();
    });
    MR.querySelectorAll("[data-fl]").forEach(b=>b.onclick=()=>{
      readInputs(); const k=b.dataset.fl;
      d[k] = !d[k];
      if(k==="allowDisposable" && d.allowDisposable && d.allowRefill) d.allowRefill=false;
      if(k==="allowTumbler" && !d.allowTumbler && d.allowRefill) d.allowRefill=false;
      if(k==="allowTumbler" && !d.allowTumbler && d.allowRefill) d.allowRefill=false;
      paint();
    });
    MR.querySelector("#mok").onclick=()=>{
      readInputs();
      if(!d.name.trim()){ toast("메뉴 이름을 입력해 주세요"); return; }
      if(!d.cat.trim()){ toast("카테고리를 입력하거나 골라주세요"); return; }
      if(DB.menus.some(m=>m.id!==d.id && !m.retired && m.name.trim()===d.name.trim())){ toast("같은 이름의 메뉴가 이미 있습니다"); return; }
      if(d.price<0 || d.price>100000){ toast("가격을 다시 확인해 주세요"); return; }
      if(d.allowRefill && !tumblerOnly(d)){ toast("무료 리필은 텀블러 전용 메뉴에만 켤 수 있습니다"); return; }
      d.name=d.name.trim(); d.cat=d.cat.trim(); d.retired=false;
      guard(async()=>{ await saveMenu(d); closeModal(); toast(isNew? d.name+" 메뉴를 추가했습니다":"저장했습니다"); });
    };
  }
  paint();
}

/* ---------- 마감 · 정산 ---------- */
function aClose(){
  const os = DB.orders.filter(o=>o.st!=="canceled");
  const sum = k => os.filter(o=>o.payMethod===k && o.paid).reduce((s,o)=>s+o.amount,0);
  const cnt = k => os.filter(o=>o.payMethod===k).length;
  const refills = os.filter(o=>o.isRefill);
  const unpaid  = os.filter(o=>!o.paid && !o.isRefill);
  const revenue = sum("transfer")+sum("cash");
  return '<div style="max-width:900px">'+
    '<div class="stat">'+
      ["transfer","cash"].map(k=>'<div class="statcard"><div class="k">'+PAYS[k].icon+' '+PAYS[k].label+'</div>'+
        '<div class="v">'+won(sum(k))+'</div><div class="s">'+cnt(k)+'건</div></div>').join("")+
      '<div class="statcard" style="border-color:var(--brass)"><div class="k">오늘 매출 합계</div>'+
        '<div class="v">'+won(revenue)+'</div><div class="s">'+os.filter(o=>o.paid).length+'건 결제완료</div></div>'+
      '<div class="statcard"><div class="k">♻️ 무료 리필</div><div class="v">'+refills.length+'건</div>'+
        '<div class="s">0원 · 매출 제외, 재료 소진 참고</div></div>'+
      '<div class="statcard"><div class="k">미수금</div><div class="v">'+unpaid.length+'건</div>'+
        '<div class="s">'+won(unpaid.reduce((s,o)=>s+o.amount,0))+' 확인 필요</div></div>'+
    '</div>'+
    (unpaid.length? '<div style="margin-top:18px;max-width:640px">'+
      '<div style="font-size:13px;color:#F0BE84;font-weight:800;margin-bottom:4px">⚠ 미수금 '+unpaid.length+'건 — 받아야 할 돈</div>'+
      unpaid.map(o=>'<div class="mrow" style="padding:9px 0">'+
        '<span class="nm">No.'+p2(o.seq)+' '+esc(o.name)+'님'+
          '<span style="display:block;font-size:12px;color:#9C8672">'+PAYS[o.payMethod].label+' · '+
          (({new:"신규",making:"제조중",done:"전달완료"})[o.st]||o.st)+'</span></span>'+
        '<span class="pill unpaid">'+won(o.amount)+'</span></div>').join("")+'</div>' : "")+
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">'+
      '<button class="abtn" style="flex:none" id="csv">CSV 내보내기</button>'+
      '<button class="abtn alt" style="flex:none" data-open-toggle2>'+(DB.shop.isOpen!==false?"영업 마감하기":"영업 시작하기")+'</button>'+
    '</div>'+
    '<p style="font-size:12px;color:#9C8672;margin-top:10px">CSV는 UTF-8 BOM으로 저장되어 엑셀에서 한글이 깨지지 않습니다.</p>'+
  '</div>';
}
function bindClose(){
  VA.querySelector("#csv").onclick=exportCSV;
  const t=VA.querySelector("[data-open-toggle2]");
  if(t) t.onclick=()=>guard(()=>setOpen(DB.shop.isOpen===false));
}
function exportCSV(){
  const rows=[["일시","주문번호","주문자","메뉴","수량","금액","결제수단","결제상태","받은현금","거스름돈","픽업번호","전달방식","용기","리필","진행상태"]];
  DB.orders.filter(o=>o.st!=="canceled").slice().reverse().forEach(o=>{
    rows.push([
      o.day+" "+hhmm(o.createdAt), "No."+p2(o.seq), o.name,
      o.items.map(i=>i.name+(optText(i)?"("+optText(i)+")":"")).join(" / "),
      o.items.reduce((s,i)=>s+i.qty,0), o.amount,
      PAYS[o.payMethod].label, o.paid?"결제완료":"미수금",
      o.cashGiven||"", o.cashChange||"",
      o.pickupTag||"", (o.pickupTag?"번호판":(o.handedOver?"직접 전달":"")),
      (o.items[0]&&CONTAINERS[o.items[0].container]?CONTAINERS[o.items[0].container].short:""),
      o.isRefill?"리필":"", ({new:"신규",making:"제조중",done:"완료"})[o.st]||o.st
    ]);
  });
  const csv="\uFEFF"+rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(",")).join("\r\n");
  const name="마감정산_"+todayStr()+".csv";
  let ok=false;
  try{
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    const a=document.createElement("a"); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500); ok=true;
  }catch(e){}
  modal('<h3>마감 정산 CSV</h3><p class="note">'+(ok?esc(name)+" 파일을 내려받았습니다.":"내려받기가 막힌 환경입니다. 아래 내용을 복사해 사용하세요.")+'</p>'+
    '<textarea readonly id="csvt" style="width:100%;height:170px;margin-top:12px;font-family:var(--mono);font-size:11.5px;padding:10px;border-radius:10px;border:1.5px solid var(--line);background:var(--card)">'+esc(csv)+'</textarea>'+
    '<button class="btn brass" style="width:100%;margin-top:12px" id="cp">복사</button>',{});
  MR.querySelector("#cp").onclick=()=>{
    const t=MR.querySelector("#csvt"); t.select();
    try{ document.execCommand("copy"); toast("복사했어요"); }catch(e){ toast("직접 선택해 복사해 주세요"); }
  };
}

/* ---------- 영수증 재발급 ---------- */
function aReceipt(){
  const hits = DB.histOrders.filter(o=> o.st!=="canceled" && (!as.q || (o.name||"").includes(as.q)));
  return '<div style="max-width:640px">'+
    '<p style="font-size:13px;color:#B39A81;margin:0 0 12px">이메일·전화번호를 저장하지 않으므로 <b>날짜 + 이름</b>으로 찾습니다. 최근 '+OPS.retentionDays+'일 주문만 남아 있습니다.</p>'+
    '<div style="display:flex;gap:10px;flex-wrap:wrap">'+
      '<input class="ainput" style="flex:1;min-width:150px" type="date" id="rd" value="'+as.date+'">'+
      '<input class="ainput" style="flex:1;min-width:150px" id="rq" placeholder="주문자 이름" value="'+esc(as.q)+'">'+
    '</div>'+
    '<div style="margin-top:14px">'+
      (hits.length? hits.map(o=>'<button class="mrow" style="width:100%;text-align:left" data-r="'+o.id+'">'+
        '<span class="nm">'+esc(o.name)+'<span style="display:block;font-size:12.5px;color:#9C8672" class="mono">'+
        hhmm(o.createdAt)+' · No.'+p2(o.seq)+' · '+esc(o.items.map(i=>i.name).join(", "))+'</span></span>'+
        '<span class="pill">'+won(o.amount)+'</span><span class="pill '+(o.paid?"paid":"unpaid")+'">'+PAYS[o.payMethod].label+'</span>'+
        '</button>').join("")
      : '<div class="empty">해당 날짜·이름의 주문이 없습니다</div>')+
    '</div></div>';
}
function bindReceipt(){
  const rd=VA.querySelector("#rd"), rq=VA.querySelector("#rq");
  rd.onchange=()=>{ as.date=rd.value; watchDay(as.date); };
  let tm=null;
  rq.oninput=()=>{ clearTimeout(tm); tm=setTimeout(()=>{ as.q=rq.value; render(); const n=VA.querySelector("#rq"); if(n) n.focus(); },350); };
  VA.querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{
    const o = DB.histOrders.find(x=>x.id===b.dataset.r);
    if(o) openReceipt(o);
  });
}

/* ============================================================
   3. 완료현황판
   ============================================================ */
function renderDisplay(){
  const waiting = DB.orders.filter(o=>o.st==="done" && o.pickupTag && !o.tagReturnedAt);
  VD.innerHTML =
    '<div class="dh">픽업 대기중인 번호</div>'+
    '<div style="font-size:13px;color:#7E97AF;margin-top:4px">번호판을 확인하고 픽업존에서 음료를 가져가세요</div>'+
    (waiting.length
      ? '<div class="dgrid">'+waiting.map(o=>'<div class="dnum">'+o.pickupTag+'<small>'+esc(o.name)+'님</small></div>').join("")+'</div>'
      : '<div style="margin-top:70px;color:#5C7794;font-size:16px">지금 대기중인 번호가 없습니다</div>')+
    '<button class="btn ghost" style="max-width:240px;margin:36px auto 0;color:#B9CDE0;border-color:rgba(255,255,255,.2)" id="dBack">봉사자 화면으로</button>';
  VD.querySelector("#dBack").onclick=()=>setMode("admin");
}

/* ============================================================
   4. 모드 · 렌더 · 부팅
   ============================================================ */
function setMode(m){
  mode = m;
  document.querySelectorAll("#topbar .sw button").forEach(b=>b.setAttribute("aria-current", String(b.dataset.mode===m)));
  VC.classList.toggle("hide", m!=="customer");
  VA.classList.toggle("hide", m!=="admin");
  VD.classList.toggle("hide", m!=="display");
  window.scrollTo(0,0);
  render();
}
function paintSync(){
  const d=document.getElementById("syncDot");
  if(!d) return;
  d.className = "dot" + (DB.online && DB.ready ? "" : " off");
  d.title = DB.online && DB.ready ? "실시간 연결됨" : "연결을 기다리는 중 — 화면은 저장된 내용으로 보입니다";
}
let raf = null;
function render(){
  paintSync();
  if(mode==="customer") renderCustomer();
  else if(mode==="admin") renderAdmin();
  else renderDisplay();
}
function scheduleRender(){
  if(raf) return;
  raf = requestAnimationFrame(()=>{ raf=null; render(); });
}

document.querySelectorAll("#topbar .sw button").forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
document.addEventListener("keydown", e=>{ if(e.key==="Escape" && MR.classList.contains("on")) closeModal(); });
document.getElementById("shopName").textContent = SHOP.businessName;

onChange(scheduleRender);
startAuth();
setMode("customer");
