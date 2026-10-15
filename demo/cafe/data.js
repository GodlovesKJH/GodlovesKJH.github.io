/* ============================================================
   교회 카페 주문 앱 체험판 — 데이터 계층 (Firestore 대신 이 브라우저 안에 저장)
   실제 앱의 data.js와 같은 함수를 내보내므로 화면 코드(app.js)는 그대로입니다.
   같은 브라우저의 손님 탭·봉사자 탭은 서로 실시간으로 반영됩니다.
   ============================================================ */
import { OPS } from "./config.js";

const KEY = "cafe-demo-v1";
const bc = ("BroadcastChannel" in window) ? new BroadcastChannel("cafe-demo") : null;

export function todayStr(d){
  d = d || new Date();
  return d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate());
}
function p2(n){ return String(n).padStart(2,"0"); }
const clone = x => JSON.parse(JSON.stringify(x));
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);

export const DB = {
  ready:false, online:true, uid:null, staff:false, authError:null,
  shop:{ isOpen:true }, menus:[], orders:[], myOrders:[], tags:{}, histDate:null, histOrders:[]
};
let notify = ()=>{};
export function onChange(fn){ notify = fn; }

/* ---------- 저장소 ---------- */
function seed(){
  const day = todayStr(), now = Date.now();
  const at = min => new Date(now - min*60000).toISOString();
  const menus = [
    { id:"m1", name:"아메리카노", cat:"커피",   price:2000, pic:"☕", soldOut:false, retired:false, allowDisposable:false, allowTumbler:true,  allowRefill:true,  opts:["temp","shot"], order:10 },
    { id:"m2", name:"카페라떼",   cat:"커피",   price:3000, pic:"🥛", soldOut:false, retired:false, allowDisposable:true,  allowTumbler:true,  allowRefill:false, opts:["temp","shot"], order:20 },
    { id:"m3", name:"콜드브루",   cat:"커피",   price:3000, pic:"🧋", soldOut:false, retired:false, allowDisposable:false, allowTumbler:true,  allowRefill:true,  opts:["shot"], order:30 },
    { id:"m4", name:"딸기라떼",   cat:"논커피", price:4000, pic:"🍓", soldOut:false, retired:false, allowDisposable:true,  allowTumbler:true,  allowRefill:false, opts:[], order:40 },
    { id:"m5", name:"캐모마일차", cat:"차",     price:2500, pic:"🌼", soldOut:false, retired:false, allowDisposable:true,  allowTumbler:true,  allowRefill:false, opts:["temp"], order:50 },
    { id:"m6", name:"수제 쿠키",  cat:"디저트", price:1500, pic:"🍪", soldOut:true,  retired:false, allowDisposable:true,  allowTumbler:false, allowRefill:false, opts:[], order:60 }
  ];
  const base = { customerUid:"demo-guest", isRefill:false, refillOf:null, tagReturnedAt:null, handedOver:false,
                 cashGiven:null, cashChange:0, canceledReason:null, pickupType:"now" };
  const orders = [
    { ...base, id:"d1", seq:1, day, name:"김예시", amount:4000, payMethod:"transfer", paid:true, st:"done", pickupTag:3, handedOver:true, createdAt:at(42),
      items:[{ mid:"m1", name:"아메리카노", pic:"☕", opt:{ temp:"ICE", shot:"기본" }, container:"shared_tumbler", price:2000, qty:2 }] },
    { ...base, id:"d2", seq:2, day, name:"이체험", amount:3000, payMethod:"cash", paid:true, cashGiven:5000, cashChange:2000, st:"making", pickupTag:7, createdAt:at(15),
      items:[{ mid:"m2", name:"카페라떼", pic:"🥛", opt:{ temp:"HOT", shot:"기본" }, container:"disposable", price:3000, qty:1 }] },
    { ...base, id:"d3", seq:3, day, name:"박가상", amount:6500, payMethod:"transfer", paid:false, st:"new", pickupTag:null, createdAt:at(4),
      items:[{ mid:"m4", name:"딸기라떼", pic:"🍓", opt:{}, container:"disposable", price:4000, qty:1 },
             { mid:"m5", name:"캐모마일차", pic:"🌼", opt:{ temp:"HOT" }, container:"personal_tumbler", price:2500, qty:1 }] }
  ];
  return { shop:{ isOpen:true }, menus, orders, tags:{ "3":{ orderId:"d1", day }, "7":{ orderId:"d2", day } }, counters:{ [day]:3 } };
}
let mem = null;
function load(){
  if(mem) return mem;
  try{ mem = JSON.parse(localStorage.getItem(KEY)); }catch(e){ mem = null; }
  if(!mem || !mem.menus){ mem = seed(); persist(false); }
  return mem;
}
function persist(broadcast = true){
  try{ localStorage.setItem(KEY, JSON.stringify(mem)); }catch(e){}
  if(broadcast && bc) bc.postMessage("changed");
}
function myUid(){
  let u = null;
  try{ u = localStorage.getItem(KEY + "-uid"); }catch(e){}
  if(!u){ u = "guest-" + rid(); try{ localStorage.setItem(KEY + "-uid", u); }catch(e){} }
  return u;
}
function refresh(){
  const d = load(), today = todayStr();
  const byNewest = (a,b) => String(b.createdAt).localeCompare(String(a.createdAt));
  DB.shop   = clone(d.shop);
  DB.menus  = clone(d.menus).sort((a,b)=>(a.order||0)-(b.order||0));
  DB.tags   = clone(d.tags);
  DB.myOrders = clone(d.orders.filter(o=>o.customerUid===DB.uid)).sort(byNewest).slice(0,25);
  DB.orders = DB.staff ? clone(d.orders.filter(o=>o.day===today)).sort((a,b)=>b.seq-a.seq) : [];
  if(DB.histDate) DB.histOrders = clone(d.orders.filter(o=>o.day===DB.histDate)).sort((a,b)=>b.seq-a.seq);
  DB.ready = true; DB.online = true;
  notify();
}
if(bc) bc.onmessage = () => { mem = null; refresh(); };
window.addEventListener("storage", e => { if(e.key === KEY){ mem = null; refresh(); } });
const tick = () => new Promise(r => setTimeout(r, 120));
function commit(){ persist(); refresh(); }

/* ---------- 인증 (체험판: 아무 이메일·비밀번호로 봉사자 로그인) ---------- */
export function startAuth(){
  DB.uid = myUid();
  try{ DB.staff = sessionStorage.getItem(KEY + "-staff") === "1"; }catch(e){ DB.staff = false; }
  setTimeout(refresh, 150);
}
export async function staffSignIn(email, password){
  DB.authError = null; await tick();
  DB.staff = true;
  try{ sessionStorage.setItem(KEY + "-staff", "1"); }catch(e){}
  refresh();
  return true;
}
export async function staffSignOut(){
  DB.staff = false;
  try{ sessionStorage.removeItem(KEY + "-staff"); }catch(e){}
  refresh();
}
export function watchDay(dateStr){ DB.histDate = dateStr; refresh(); }

/* ---------- 주문 ---------- */
export async function createOrder(draft){
  await tick();
  const d = load(), day = todayStr();
  const seq = (d.counters[day] || 0) + 1; d.counters[day] = seq;
  const id = rid();
  d.orders.push({ id, seq, day, customerUid:DB.uid, name:draft.name || "손님", items:clone(draft.items), amount:draft.amount,
    payMethod:draft.payMethod, paid:false, st:"new", pickupType:draft.pickupType || "now", isRefill:!!draft.isRefill,
    refillOf:draft.refillOf || null, pickupTag:null, tagReturnedAt:null, handedOver:false, cashGiven:null, cashChange:0,
    canceledReason:null, createdAt:new Date().toISOString() });
  commit();
  return id;
}
function order(id){ return load().orders.find(o=>o.id===id); }
export async function patchOrder(id, patch){ await tick(); const o = order(id); if(o) Object.assign(o, clone(patch)); commit(); }
export async function cancelOrder(o, reason){
  await tick(); const d = load(), x = order(o.id);
  if(x) Object.assign(x, { st:"canceled", canceledReason: reason || "봉사자 취소", pickupTag:null });
  if(o.pickupTag) delete d.tags[String(o.pickupTag)];
  commit();
}

/* ---------- 픽업 번호판 ---------- */
export async function assignTag(orderId, n, nextState){
  await tick(); const d = load();
  if(d.tags[String(n)]) throw new Error("TAG_TAKEN");
  d.tags[String(n)] = { orderId, day: todayStr() };
  const o = order(orderId); if(o) Object.assign(o, { pickupTag:n, tagReturnedAt:null, st:nextState });
  commit();
}
export async function releaseTag(n, orderId, markReturned){
  await tick(); const d = load(); delete d.tags[String(n)];
  const o = orderId && order(orderId);
  if(o){ if(markReturned) o.tagReturnedAt = new Date().toISOString(); else o.pickupTag = null; }
  commit();
}
export async function clearStaleTags(){
  const d = load(), t = todayStr();
  const stale = Object.keys(d.tags).filter(n => d.tags[n].day !== t);
  stale.forEach(n => delete d.tags[n]);
  if(stale.length) commit();
  return stale.length;
}

/* ---------- 메뉴 ---------- */
export async function saveMenu(m){
  await tick(); const d = load(); const x = d.menus.find(v=>v.id===m.id);
  if(x) Object.assign(x, clone(m)); else d.menus.push(clone(m));
  commit();
}
export async function deleteMenu(id){ await tick(); const d = load(); d.menus = d.menus.filter(m=>m.id!==id); commit(); }
export async function swapMenuOrder(a, b){
  await tick(); const d = load();
  const x = d.menus.find(m=>m.id===a.id), y = d.menus.find(m=>m.id===b.id);
  if(x && y){ const t = x.order; x.order = y.order; y.order = t; }
  commit();
}
export async function setOpen(isOpen){ await tick(); load().shop.isOpen = isOpen; commit(); }
export async function seedMenus(list){
  await tick(); const d = load();
  list.forEach((m,i)=>{ const x = d.menus.find(v=>v.id===m.id); const v = { ...clone(m), order:(i+1)*10 }; if(x) Object.assign(x, v); else d.menus.push(v); });
  d.shop.isOpen = true; commit();
}
export function newMenuId(){ return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2,5); }
