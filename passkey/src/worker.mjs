// 과제 8 — 소개 페이지 패스키 잠금 (Cloudflare Workers + D1)
// 비밀번호는 어디에도 만들지도 저장하지도 않습니다. 서버가 저장하는 것은 공개키뿐입니다.
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const RP_NAME = '나의 소개 페이지';
const SESSION_HOURS = 8;
const CHALLENGE_MINUTES = 5;
const COOKIE = 'pk_session';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, handle TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS credentials (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, public_key TEXT NOT NULL, counter INTEGER NOT NULL, transports TEXT, name TEXT NOT NULL, device_type TEXT, backed_up INTEGER, attachment TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS challenges (challenge TEXT PRIMARY KEY, purpose TEXT NOT NULL, user_id TEXT, pending_name TEXT, pending_handle TEXT, pending_passkey_name TEXT, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL)`;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const nowIso = () => new Date().toISOString();
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const randomB64u = (n) => b64u(crypto.getRandomValues(new Uint8Array(n)));
async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let schemaReady;
function ensureSchema(env) {
  schemaReady ??= env.DB.exec(SCHEMA.replace(/\n/g, ' ')).catch((e) => { schemaReady = undefined; throw e; });
  return schemaReady;
}

const first = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const all = async (env, sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
const run = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).run();

function json(status, body, headers) {
  const h = new Headers(headers);
  h.set('content-type', 'application/json; charset=utf-8');
  h.set('cache-control', 'no-store');
  h.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(body), { status, headers: h });
}

async function readJson(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) throw new HttpError(415, 'JSON으로 보내야 합니다.');
  const text = await request.text();
  if (text.length > 100_000) throw new HttpError(413, '요청이 너무 큽니다.');
  try { return JSON.parse(text || '{}'); } catch { throw new HttpError(400, 'JSON 형식이 잘못됐습니다.'); }
}

function cookieOf(request, name) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

// ---- 세션: 쿠키에는 난수 토큰, DB에는 그 해시만 저장 -------------------------------
async function createSession(env, ctx, userId) {
  const token = randomB64u(32);
  await run(env, 'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)', await sha256(token), userId, Date.now() + SESSION_HOURS * 3600_000);
  const attrs = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_HOURS * 3600}`];
  if (ctx.secure) attrs.push('Secure');
  ctx.headers.append('set-cookie', attrs.join('; '));
}

async function currentUser(env, request) {
  const token = cookieOf(request, COOKIE);
  if (!token) return null;
  const hash = await sha256(token);
  const row = await first(env, 'SELECT user_id, expires_at FROM sessions WHERE token_hash=?', hash);
  if (!row) return null;
  if (row.expires_at < Date.now()) { await run(env, 'DELETE FROM sessions WHERE token_hash=?', hash); return null; }
  return (await first(env, 'SELECT id, name FROM users WHERE id=?', row.user_id)) || null;
}

async function requireUser(env, request) {
  const user = await currentUser(env, request);
  if (!user) throw new HttpError(401, '로그인이 필요합니다. 패스키로 들어가 주세요.');
  return user;
}

// ---- 질문(challenge): 서버가 만들고, 한 번만 쓸 수 있고, 5분 뒤 만료 -----------------
async function saveChallenge(env, challenge, purpose, extra = {}) {
  // 만료된 질문·세션은 새 질문을 만들 때마다 함께 치운다
  await run(env, 'DELETE FROM challenges WHERE expires_at < ?', Date.now() - 3600_000);
  await run(env, 'DELETE FROM sessions WHERE expires_at < ?', Date.now());
  await run(env, `INSERT INTO challenges (challenge, purpose, user_id, pending_name, pending_handle, pending_passkey_name, expires_at)
    VALUES (?,?,?,?,?,?,?)`, challenge, purpose, extra.userId ?? null, extra.name ?? null, extra.handle ?? null,
  extra.passkeyName ?? null, Date.now() + CHALLENGE_MINUTES * 60_000);
}

// 응답에 들어 있는 질문 값을 찾아 한 번만 소모한다. 없거나 이미 썼거나 만료면 거절.
async function consumeChallenge(env, clientDataJSON, purpose) {
  let challenge;
  try { challenge = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8')).challenge; }
  catch { throw new HttpError(400, '응답 형식이 잘못됐습니다.'); }
  const row = await first(env, 'SELECT * FROM challenges WHERE challenge=? AND purpose=?', challenge, purpose);
  if (!row) throw new HttpError(400, '서버가 낸 적 없는 질문입니다.');
  // 성공이든 실패든 이 질문은 여기서 폐기한다. 조건부 갱신이라 동시에 두 번 써도 한 번만 통과한다.
  const r = await run(env, 'UPDATE challenges SET used=1 WHERE challenge=? AND used=0', challenge);
  if (!r.meta.changes) throw new HttpError(400, '이미 사용한 질문입니다. 새 질문으로 다시 시도해 주세요.');
  if (row.expires_at < Date.now()) throw new HttpError(400, '질문의 유효 시간이 지났습니다.');
  return row;
}

const publicPasskey = (c) => ({ id: c.id, name: c.name, createdAt: c.created_at, deviceType: c.device_type, backedUp: !!c.backed_up, attachment: c.attachment });

function storageGuess(c) {
  if (c.attachment === 'cross-platform') return '보안 키(또는 다른 기기)에 저장된 것으로 보입니다';
  if (c.device_type === 'multiDevice' && c.backed_up) return '비밀번호 관리자(구글·애플 등)에 동기화되어 저장된 것으로 보입니다';
  if (c.device_type === 'multiDevice') return '비밀번호 관리자에 저장될 수 있는 패스키입니다(백업 여부는 아직 보고되지 않음)';
  return '이 기기 자체에만 저장된 것으로 보입니다';
}

// ---- 라우트 ---------------------------------------------------------------------
async function handleApi(request, env, url, ctx) {
  const m = request.method;
  const p = url.pathname;
  const { origin: ORIGIN, rpID: RP_ID } = ctx;

  if (m !== 'GET' && m !== 'HEAD') {
    const o = request.headers.get('origin');
    if (o && o !== ORIGIN) throw new HttpError(403, '허용되지 않은 출처의 요청입니다.');
  }

  if (m === 'GET' && p === '/api/session') {
    const u = await currentUser(env, request);
    return json(200, u ? { loggedIn: true, user: u } : { loggedIn: false }, ctx.headers);
  }

  // 등록 1단계: 서버가 등록용 질문을 만들어 보낸다 (로그인 상태면 두 번째 패스키 추가)
  if (m === 'POST' && p === '/api/register/options') {
    const body = await readJson(request);
    const me = await currentUser(env, request);
    let userId, name, handle, existing = [];
    if (me) {
      userId = me.id; name = me.name;
      handle = (await first(env, 'SELECT handle FROM users WHERE id=?', me.id)).handle;
      existing = await all(env, 'SELECT id, transports FROM credentials WHERE user_id=?', me.id);
    } else {
      name = String(body.name || '').trim();
      if (name.length < 2 || name.length > 20) throw new HttpError(400, '이름은 2~20자로 적어 주세요.');
      userId = crypto.randomUUID();
      handle = randomB64u(32);
    }
    const passkeyName = String(body.passkeyName || '').trim().slice(0, 30) || null;
    const options = await generateRegistrationOptions({
      rpName: RP_NAME, rpID: RP_ID, userName: name, userDisplayName: name,
      userID: Buffer.from(handle, 'base64url'),
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports ? c.transports.split(',') : undefined })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    });
    await saveChallenge(env, options.challenge, 'register', { userId: me ? userId : null, name, handle, passkeyName });
    return json(200, options, ctx.headers);
  }

  // 등록 2단계: 공개키와 서명이 돌아오면 확인하고 공개키만 저장한다
  if (m === 'POST' && p === '/api/register/verify') {
    const body = await readJson(request);
    const resp = body.response;
    if (!resp?.response?.clientDataJSON) throw new HttpError(400, '응답이 비어 있습니다.');
    const row = await consumeChallenge(env, resp.response.clientDataJSON, 'register');
    let result;
    try {
      result = await verifyRegistrationResponse({
        response: resp, expectedChallenge: row.challenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID, requireUserVerification: false,
      });
    } catch (e) { throw new HttpError(400, '패스키 확인에 실패했습니다: ' + e.message); }
    if (!result.verified) throw new HttpError(400, '패스키 확인에 실패했습니다.');
    const cred = result.registrationInfo.credential;
    if (await first(env, 'SELECT 1 AS x FROM credentials WHERE id=?', cred.id)) throw new HttpError(409, '이미 등록된 패스키입니다.');

    const isNew = !row.user_id;
    const userId = isNew ? crypto.randomUUID() : row.user_id;
    if (isNew) await run(env, 'INSERT INTO users (id,name,handle,created_at) VALUES (?,?,?,?)', userId, row.pending_name, row.pending_handle, nowIso());
    else if ((await currentUser(env, request))?.id !== userId) throw new HttpError(401, '로그인 상태가 바뀌었습니다. 다시 시도해 주세요.');
    const count = (await first(env, 'SELECT COUNT(*) AS n FROM credentials WHERE user_id=?', userId)).n;
    const name = row.pending_passkey_name || `${row.pending_name}의 패스키 ${count + 1}`;
    const info = result.registrationInfo;
    await run(env, `INSERT INTO credentials (id,user_id,public_key,counter,transports,name,device_type,backed_up,attachment,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, cred.id, userId, b64u(cred.publicKey), cred.counter,
    (resp.response.transports || []).join(',') || null, name, info.credentialDeviceType, info.credentialBackedUp ? 1 : 0,
    resp.authenticatorAttachment || null, nowIso());
    if (isNew) await createSession(env, ctx, userId);
    const saved = await first(env, 'SELECT * FROM credentials WHERE id=?', cred.id);
    return json(200, {
      ok: true, newAccount: isNew, user: { id: userId, name: row.pending_name },
      passkey: publicPasskey(saved),
      storedOnServer: { publicKey: saved.public_key, credentialId: saved.id },
      storageGuess: storageGuess(saved),
      explanation: '서버에 저장된 값은 공개키입니다. 공개키는 서명이 맞는지 확인하는 데만 쓰이며 비밀번호가 아닙니다. 개인키는 이 기기 밖으로 나오지 않아 서버로 전송되지 않았습니다.',
    }, ctx.headers);
  }

  // 로그인 1단계: 매번 새 질문
  if (m === 'POST' && p === '/api/login/options') {
    await readJson(request);
    const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: 'preferred', allowCredentials: [] });
    await saveChallenge(env, options.challenge, 'login');
    return json(200, options, ctx.headers);
  }

  // 로그인 2단계: 저장해 둔 공개키로 서명을 확인한 뒤에만 세션 발급
  if (m === 'POST' && p === '/api/login/verify') {
    const body = await readJson(request);
    const resp = body.response;
    if (!resp?.response?.clientDataJSON || !resp.id) throw new HttpError(400, '응답이 비어 있습니다.');
    const row = await consumeChallenge(env, resp.response.clientDataJSON, 'login');
    const c = await first(env, 'SELECT * FROM credentials WHERE id=?', resp.id);
    if (!c) throw new HttpError(401, '이 서버에 등록되지 않았거나 이미 지운 패스키입니다.');
    let result;
    try {
      result = await verifyAuthenticationResponse({
        response: resp, expectedChallenge: row.challenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID,
        credential: { id: c.id, publicKey: Buffer.from(c.public_key, 'base64url'), counter: c.counter,
          transports: c.transports ? c.transports.split(',') : undefined },
        requireUserVerification: false,
      });
    } catch (e) { throw new HttpError(401, '서명 확인에 실패했습니다: ' + e.message); }
    if (!result.verified) throw new HttpError(401, '서명 확인에 실패했습니다.');
    await run(env, 'UPDATE credentials SET counter=? WHERE id=?', result.authenticationInfo.newCounter, c.id);
    await createSession(env, ctx, c.user_id);
    const user = await first(env, 'SELECT id, name FROM users WHERE id=?', c.user_id);
    return json(200, { ok: true, user, passkeyName: c.name }, ctx.headers);
  }

  if (m === 'POST' && p === '/api/logout') {
    const token = cookieOf(request, COOKIE);
    if (token) await run(env, 'DELETE FROM sessions WHERE token_hash=?', await sha256(token));
    ctx.headers.append('set-cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${ctx.secure ? '; Secure' : ''}`);
    return json(200, { ok: true }, ctx.headers);
  }

  // 패스키 목록·삭제
  if (m === 'GET' && p === '/api/passkeys') {
    const me = await requireUser(env, request);
    const rows = await all(env, 'SELECT * FROM credentials WHERE user_id=? ORDER BY created_at', me.id);
    return json(200, { passkeys: rows.map((r) => ({ ...publicPasskey(r), storageGuess: storageGuess(r) })) }, ctx.headers);
  }
  let mm;
  if (m === 'DELETE' && (mm = p.match(/^\/api\/passkeys\/([\w-]+)$/))) {
    const me = await requireUser(env, request);
    const c = await first(env, 'SELECT id FROM credentials WHERE id=? AND user_id=?', mm[1], me.id);
    if (!c) throw new HttpError(404, '내 패스키 중에 없습니다.');
    const n = (await first(env, 'SELECT COUNT(*) AS n FROM credentials WHERE user_id=?', me.id)).n;
    if (n <= 1) throw new HttpError(409, '마지막 패스키는 지울 수 없습니다. 지우면 이 계정으로 다시 들어올 방법이 없어집니다. 먼저 다른 패스키를 등록해 주세요.');
    await run(env, 'DELETE FROM credentials WHERE id=?', c.id);
    return json(200, { ok: true, remaining: n - 1 }, ctx.headers);
  }

  // 비공개 자료: 소유자는 요청이 아니라 세션에서만 정한다
  if (m === 'GET' && p === '/api/private/items') {
    const me = await requireUser(env, request);   // ?owner= 같은 값이 와도 읽지 않는다
    const items = await all(env, 'SELECT id, kind, title, body, created_at FROM items WHERE user_id=? ORDER BY id', me.id);
    return json(200, { owner: me.name, items }, ctx.headers);
  }
  if (m === 'GET' && (mm = p.match(/^\/api\/users\/([\w-]+)\/items$/))) {
    const me = await requireUser(env, request);
    if (mm[1] !== me.id) throw new HttpError(403, '다른 사람의 비공개 자료는 읽을 수 없습니다.');
    const items = await all(env, 'SELECT id, kind, title, body, created_at FROM items WHERE user_id=? ORDER BY id', me.id);
    return json(200, { owner: me.name, items }, ctx.headers);
  }
  if (m === 'POST' && p === '/api/private/items') {
    const me = await requireUser(env, request);
    const body = await readJson(request);  // body.owner / body.userId 가 있어도 무시한다
    const kind = ['프로젝트 메모', '지원하려는 곳', '스스로 쓰는 회고'].includes(body.kind) ? body.kind : null;
    const title = String(body.title || '').trim().slice(0, 60);
    const text = String(body.body || '').trim().slice(0, 500);
    if (!kind || !title) throw new HttpError(400, '종류와 제목을 적어 주세요.');
    const r = await run(env, 'INSERT INTO items (user_id,kind,title,body,created_at) VALUES (?,?,?,?,?)', me.id, kind, title, text, nowIso());
    return json(201, { ok: true, id: r.meta.last_row_id }, ctx.headers);
  }
  if (m === 'DELETE' && (mm = p.match(/^\/api\/private\/items\/(\d+)$/))) {
    const me = await requireUser(env, request);
    const r = await run(env, 'DELETE FROM items WHERE id=? AND user_id=?', Number(mm[1]), me.id);
    if (!r.meta.changes) throw new HttpError(404, '내 자료 중에 없습니다.');
    return json(200, { ok: true }, ctx.headers);
  }

  throw new HttpError(404, '없는 주소입니다.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // /api/ 가 아닌 주소(공개 소개 페이지 등)는 public/ 폴더의 정적 파일로 보낸다.
    // 비공개 내용은 public/ 에 절대 두지 않는다.
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const ctx = { origin: url.origin, rpID: url.hostname, secure: url.protocol === 'https:', headers: new Headers() };
    try {
      await ensureSchema(env);
      return await handleApi(request, env, url, ctx);
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e);
      return json(e.status || 500, { error: e.status ? e.message : '서버 오류가 났습니다.' });
    }
  },
};
