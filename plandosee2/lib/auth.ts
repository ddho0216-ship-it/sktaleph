import { env } from 'cloudflare:workers';

export const COOKIE = 'planloop_session';
export const HOURS = 8;
export const GENERIC = '아이디 또는 비밀번호를 확인해 주세요.';
export class HttpError extends Error { constructor(public status:number, message:string) { super(message); } }
export function db() { if (!env.DB) throw new HttpError(503,'저장소 연결을 확인해 주세요.'); return env.DB; }
// Schema is owned by the versioned Drizzle migration, never runtime DDL.
export async function init() { db(); }
const enc = new TextEncoder();
export const hex = (b:ArrayBuffer|Uint8Array) => Array.from(new Uint8Array(b)).map(v=>v.toString(16).padStart(2,'0')).join('');
export const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(value:string) { return hex(await crypto.subtle.digest('SHA-256',enc.encode(value))); }
export async function hashPassword(password:string, salt=hex(crypto.getRandomValues(new Uint8Array(16)))) {
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  const value=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-512',iterations:100000,salt:enc.encode(salt)},key,256);
  return `pbkdf2-sha512$100000$${salt}$${hex(value)}`;
}
export async function verify(password:string, stored:string) {
  const salt=stored.split('$')[2];
  if(!salt) return false;
  const candidate=await hashPassword(password,salt);
  let difference=candidate.length ^ stored.length;
  for(let i=0;i<candidate.length;i++) difference |= candidate.charCodeAt(i) ^ (stored.charCodeAt(i)||0);
  return difference===0;
}
export function tokenFromCookie(cookie:string) { return cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||''; }
export async function userFromCookie(cookie:string) {
  await init();
  const token=tokenFromCookie(cookie);
  if(!/^[a-f0-9]{64}$/.test(token)) return null;
  return db().prepare('SELECT u.id, u.username, s.expires_at AS expiresAt FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(token),Date.now()).first<{id:string;username:string;expiresAt:number}>();
}
export async function requireUser(request:Request) { const u=await userFromCookie(request.headers.get('cookie')||''); if(!u) throw new HttpError(401,'로그인이 필요합니다.'); return u; }
export function guardOrigin(request:Request) {
  const origin=request.headers.get('origin');
  const site=request.headers.get('sec-fetch-site');
  if(site==='cross-site'||(origin&&origin!==new URL(request.url).origin)) throw new HttpError(403,'허용되지 않은 요청입니다.');
  if(!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415,'JSON 요청만 허용합니다.');
}
export async function jsonBody(request:Request) {
  if(Number(request.headers.get('content-length')||0)>1000000) throw new HttpError(413,'파일은 1MB 이내로 올려 주세요.');
  const raw=await request.text();
  if(raw.length>1000000) throw new HttpError(413,'파일은 1MB 이내로 올려 주세요.');
  try { const value=JSON.parse(raw); if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error(); return value as Record<string,unknown>; }
  catch {throw new HttpError(400,'입력 내용을 확인해 주세요.');}
}
export function reply(body:unknown,status=200,extra:Record<string,string>={}) { return Response.json(body,{status,headers:{'cache-control':'no-store, private','x-content-type-options':'nosniff',...extra}}); }
export function failed(e:unknown) { return e instanceof HttpError?reply({error:e.message},e.status):reply({error:'요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'},500); }
export function cookie(request:Request,token:string,maxAge=HOURS*3600) {return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
export async function session(request:Request,userId:string) {
  const token=random();
  await db().prepare('INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await digest(token),userId,Date.now()+HOURS*3600000).run();
  return cookie(request,token);
}
export async function limit(request:Request) {
  await init();
  const key=await digest('auth:'+ (request.headers.get('cf-connecting-ip')||'local'));
  const now=Date.now();
  await db().prepare('INSERT INTO auth_limits (key,hits,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN reset_at<? THEN 1 ELSE hits+1 END, reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END').bind(key,now+600000,now,now).run();
  const row=await db().prepare('SELECT hits FROM auth_limits WHERE key=?').bind(key).first<{hits:number}>();
  if((row?.hits||0)>30) throw new HttpError(429,'시도가 많습니다. 10분 후 다시 시도해 주세요.');
}
