const PB_URL = process.env.PB_URL || 'https://fieldtrack-kenya.fly.dev'
const PLAN_PRICES = {
  monthly: { starter: 2499, growth: 4499, enterprise: 6499 },
  yearly: { starter: 24990, growth: 44990, enterprise: 64990 },
}
const j = (res, status, body) => res.status(status).json(body)
const bearer = req => { const v=String(req.headers.authorization||''); return v.startsWith('Bearer ')?v.slice(7).trim():'' }
async function body(r){const t=await r.text();if(!t)return {};try{return JSON.parse(t)}catch{return {}}}
async function adminToken(){
  if(!process.env.PB_ADMIN_EMAIL||!process.env.PB_ADMIN_PASSWORD) throw new Error('PocketBase admin credentials are not configured.')
  const r=await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identity:process.env.PB_ADMIN_EMAIL,password:process.env.PB_ADMIN_PASSWORD})})
  const d=await body(r);if(!r.ok||!d.token)throw new Error(`PocketBase admin authentication failed (${r.status}).`);return d.token
}
async function refresh(token){
  const r=await fetch(`${PB_URL}/api/collections/bs_admins/auth-refresh`,{method:'POST',headers:{Authorization:token}});const d=await body(r)
  if(!r.ok||!d.record?.id){const e=new Error('Your SalesTrack session is no longer valid.');e.statusCode=401;throw e}return d.record
}
async function membership(token,adminId,shopId){
  const f=encodeURIComponent(`shop_id="${shopId}" && admin_id="${adminId}"`)
  const r=await fetch(`${PB_URL}/api/collections/bs_shop_admins/records?filter=${f}&perPage=1`,{headers:{Authorization:token}});const d=await body(r)
  if(!r.ok||!Array.isArray(d.items)||!d.items.length){const e=new Error('You are not authorized to activate this shop.');e.statusCode=403;throw e}
}
async function verifyPaystack(ref){
  if(!process.env.PAYSTACK_SECRET_KEY)throw new Error('PAYSTACK_SECRET_KEY is not configured on the server.')
  const r=await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`,{headers:{Authorization:`Bearer ${process.env.PAYSTACK_SECRET_KEY}`}});const d=await body(r)
  if(!r.ok||!d.status||!d.data){const e=new Error(d.message||'Paystack could not verify this transaction.');e.statusCode=402;throw e}return d.data
}
async function get(token,path){const r=await fetch(`${PB_URL}${path}`,{headers:{Authorization:token}});const d=await body(r);if(!r.ok)throw new Error(`PocketBase read failed (${r.status}).`);return d}
async function patch(token,path,value){const r=await fetch(`${PB_URL}${path}`,{method:'PATCH',headers:{Authorization:token,'Content-Type':'application/json'},body:JSON.stringify(value)});const d=await body(r);if(!r.ok)throw new Error(`PocketBase update failed (${r.status}).`);return d}
function nextEnd(existing,period){const now=new Date();const x=existing?new Date(existing):null;const base=x&&!Number.isNaN(x.getTime())&&x>now?x:now;const n=new Date(base);if(period==='yearly')n.setUTCFullYear(n.getUTCFullYear()+1);else n.setUTCMonth(n.getUTCMonth()+1);return n.toISOString()}
async function referral(superToken,shop,hadPrevious){
  if(hadPrevious)return;const code=String(shop.referral_code_used||'').trim().toUpperCase();if(!code)return
  const f=encodeURIComponent(`referral_code="${code}"`);const r=await get(superToken,`/api/collections/bs_shops/records?filter=${f}&perPage=1`);const ref=Array.isArray(r.items)?r.items[0]:null;if(!ref||ref.id===shop.id)return
  const now=new Date();const x=ref.subscription_ends_at?new Date(ref.subscription_ends_at):null;const base=x&&!Number.isNaN(x.getTime())&&x>now?x:now;const n=new Date(base);n.setUTCMonth(n.getUTCMonth()+1)
  await patch(superToken,`/api/collections/bs_shops/records/${encodeURIComponent(ref.id)}`,{subscription_ends_at:n.toISOString(),subscription_status:'active'})
}
module.exports=async function handler(req,res){
  if(req.method!=='POST')return j(res,405,{error:'Method not allowed'})
  try{
    const token=bearer(req);if(!token)return j(res,401,{error:'Sign in again before activating a plan.'})
    const q=req.body||{},reference=String(q.reference||'').trim(),planId=String(q.planId||'').toLowerCase(),period=String(q.period||'').toLowerCase(),shopId=String(q.shopId||'').trim()
    if(!reference||!shopId||!PLAN_PRICES[period]||!PLAN_PRICES[period][planId])return j(res,400,{error:'Invalid payment activation request.'})
    const user=await refresh(token);await membership(token,user.id,shopId);const pay=await verifyPaystack(reference);const expected=PLAN_PRICES[period][planId]*100
    if(pay.status!=='success')return j(res,402,{error:'Paystack has not marked this transaction as successful.'})
    if(String(pay.currency||'').toUpperCase()!=='KES')return j(res,402,{error:'Payment currency does not match the selected plan.'})
    if(Number(pay.amount)!==expected)return j(res,402,{error:'Payment amount does not match the selected plan.'})
    const m=pay.metadata||{};if(m.plan_id&&String(m.plan_id).toLowerCase()!==planId)return j(res,402,{error:'Paystack plan metadata mismatch.'});if(m.period&&String(m.period).toLowerCase()!==period)return j(res,402,{error:'Paystack billing-period metadata mismatch.'})
    const superToken=await adminToken();const rf=encodeURIComponent(`last_payment_ref="${reference}"`);const prior=await get(superToken,`/api/collections/bs_shops/records?filter=${rf}&perPage=2`);const other=(prior.items||[]).find(x=>x.id!==shopId);if(other)return j(res,409,{error:'This payment reference has already activated another shop.'})
    const shop=await get(superToken,`/api/collections/bs_shops/records/${encodeURIComponent(shopId)}`);if(shop.last_payment_ref===reference)return j(res,200,{ok:true,idempotent:true,plan:shop.plan,subscriptionStatus:shop.subscription_status,subscriptionEndsAt:shop.subscription_ends_at,reference})
    const had=Boolean(String(shop.last_payment_ref||'').trim());const end=nextEnd(shop.subscription_ends_at,period);const updated=await patch(superToken,`/api/collections/bs_shops/records/${encodeURIComponent(shopId)}`,{plan:planId,subscription_status:'active',subscription_ends_at:end,last_payment_ref:reference});await referral(superToken,shop,had)
    return j(res,200,{ok:true,idempotent:false,plan:updated.plan,subscriptionStatus:updated.subscription_status,subscriptionEndsAt:updated.subscription_ends_at,reference})
  }catch(e){console.error('[verify-paystack] activation failed:',e?.message||e);return j(res,e?.statusCode||500,{error:e?.message||'Secure payment activation failed.'})}
}