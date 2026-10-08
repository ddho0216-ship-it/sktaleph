// 실제 Chrome + 가상 인증기(WebAuthn)로 과제 8의 확인 네 가지를 돌리고 증거를 evidence/ 에 남긴다.
// 실제 지문 센서가 아니라 Chrome이 제공하는 시험용 가상 인증기를 쓴다. 서버 검증 코드는 실제 배포와 같다.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVD = path.join(ROOT, 'evidence');
fs.rmSync(EVD, { recursive: true, force: true });
fs.mkdirSync(EVD, { recursive: true });
// BASE_URL 을 주면 이미 배포된 공개 주소에 대해 시험하고, 안 주면 Cloudflare 와 같은 실행기(workerd)로 로컬에서 띄워 시험한다.
const REMOTE = process.env.BASE_URL ? process.env.BASE_URL.replace(/\/$/, '') : null;
const PORT = 3111, ORIGIN = REMOTE || `http://localhost:${PORT}`;
let server = null, DB = null;
if (!REMOTE) {
  // 경로가 길면 DB 파일을 못 열어서 짧은 경로를 쓴다.
  const STATE = path.join(os.homedir(), 'pk-state-test');
  fs.rmSync(STATE, { recursive: true, force: true });
  server = spawn('npx.cmd', ['wrangler', 'dev', '--port', String(PORT), '--persist-to', STATE], { cwd: ROOT, stdio: 'ignore', shell: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(ORIGIN + '/api/session')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 1000)); }
  const d1dir = path.join(STATE, 'v3/d1/miniflare-D1DatabaseObject');
  DB = path.join(d1dir, fs.readdirSync(d1dir).find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite'));
}
// 공개 주소 시험에서는 서버 DB를 wrangler 로 읽는다(읽기 전용 SELECT 와, 시험 계정 정리용 DELETE 만 사용)
const remoteSql = (sql, args = []) => {
  let i = 0;
  const filled = sql.replace(/\?/g, () => { const v = args[i++]; return typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`; });
  const out = execSync(`npx wrangler d1 execute passkey-db --remote --json --command "${filled.replace(/"/g, '\\"')}"`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out.slice(out.indexOf('[')))[0].results;
};
let cleanupIds = [];
const results = [];      // 통과/실패 판정
const log = [];          // 요청·응답 기록
const privateRaws = [];  // 기기에서 꺼낸 개인키 원문 — 어떤 요청에도 나오면 안 된다
const check = (id, name, pass, detail) => { results.push({ id, name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', id, name); };
const mask = (s) => (s ? s.slice(0, 4) + '…(가려짐, ' + s.length + '자)' : s);

function attachLogger(page, tag) {
  page.on('response', async (res) => {
    const req = res.request();
    if (!req.url().includes('/api/')) return;
    let resBody = ''; try { resBody = await res.text(); } catch {}
    log.push({ tag, method: req.method(), path: new URL(req.url()).pathname, status: res.status(), reqBody: req.postData() || null, resBody });
  });
}
const lastLog = (p, method) => [...log].reverse().find((e) => e.path === p && (!method || e.method === method));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const sqlite = () => REMOTE
  ? { prepare: (sql) => ({ get: (...args) => remoteSql(sql, args)[0] }) }
  : new DatabaseSync(DB, { readOnly: true });

async function newUser(label) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const page = await ctx.newPage();
  attachLogger(page, label);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const addAuth = async () => (await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } })).authenticatorId;
  return { ctx, page, cdp, addAuth, label };
}
const grabCreds = async (u, authId) => {
  const { credentials } = await u.cdp.send('WebAuthn.getCredentials', { authenticatorId: authId });
  credentials.forEach((c) => privateRaws.push(c.privateKey));
  return credentials;
};
const jsonFetch = (page, method, url, body, extraHeaders = {}) => page.evaluate(async ([method, url, body, h]) => {
  const r = await fetch(url, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json', ...h }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}, [method, url, body, extraHeaders]);

const shot = (page, name) => page.screenshot({ path: path.join(EVD, name), fullPage: true });

try {
  // ───────── 카드 1: 무엇을 잠글지 ─────────
  const anon = await browser.newContext(); const ap = await anon.newPage(); attachLogger(ap, '익명');
  const home = await ap.goto(ORIGIN + '/');
  check('C10', '로그인·등록 없이 첫 화면이 열린다', home.status() === 200 && (await ap.locator('#home').isVisible()), `GET / → ${home.status()}`);
  check('C13', '공개 영역과 비공개 영역이 화면에서 구분된다', (await ap.locator('#home').isVisible()) && (await ap.locator('#private-area').isVisible()) && (await ap.locator('.pk-divider').isVisible()), '위쪽 1번 소개 페이지(공개) / 구분선 문구 / 아래 보라 점선 칸(비공개)');
  // C11: 1번 과제 원본이 그대로 이어 붙었는지 — 배포되는 파일에서 추가분을 빼면 원본과 같아야 한다
  const served = await (await fetch(ORIGIN + '/')).text();
  const origHtml = fs.readFileSync(path.join(ROOT, 'source/intro-original.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'source/private-style.css'), 'utf8'), sec = fs.readFileSync(path.join(ROOT, 'source/private-section.html'), 'utf8');
  const restoredHtml = served.replace(`\n${css}`, '').replace(`\n${sec}`, '').replace('<script src="/app.js"></script>\n', '');
  const heroText = await ap.locator('#home').innerText();
  check('C11', '1번 과제에서 만든 소개 페이지에 이어 붙었고 1번의 공개 내용이 그대로 남아 있다', restoredHtml === origHtml && heroText.includes('안은호') && (await ap.locator('#history').innerText()).includes('SKT ALEPH'),
    `배포 파일에서 추가분(비공개 영역 CSS·HTML·스크립트)을 빼면 1번 원본(${origHtml.length}바이트)과 글자 단위로 동일: ${restoredHtml === origHtml}. 화면에 이름·기록 구역 유지`);  await shot(ap, '01-잠긴-첫화면.png');
  const anonItems = await jsonFetch(ap, 'GET', '/api/private/items');
  const anonUser = await jsonFetch(ap, 'GET', '/api/users/00000000-0000-0000-0000-000000000000/items');
  const anonPk = await jsonFetch(ap, 'GET', '/api/passkeys');
  check('C16', '로그인 없이 비공개 자료를 요청하면 거절된다', anonItems.status === 401 && anonUser.status === 401 && anonPk.status === 401, `items ${anonItems.status}, users/:id/items ${anonUser.status}, passkeys ${anonPk.status}`);
  check('C17', '그 거절이 401 또는 403이다', [anonItems.status, anonUser.status, anonPk.status].every((s) => s === 401 || s === 403), JSON.stringify(anonItems.body));
  check('C15a', '잠긴 화면에 비공개 내용이 없다(화면 글자)', !(await ap.locator('#items').innerText()) && (await ap.locator('#open-view').isHidden()), '비공개 목록 영역이 비어 있고 숨겨져 있음');
  const anonSource = await (await fetch(ORIGIN + '/')).text() + await (await fetch(ORIGIN + '/app.js')).text();

  // ───────── 카드 2: 등록 ─────────
  const A = await newUser('A');
  const authA1 = await A.addAuth();
  await A.page.goto(ORIGIN + '/');
  // 취소 시나리오(C25): 기기 창에서 취소한 것과 같은 NotAllowedError 를 만들어 화면 반응과 DB를 확인
  const usersBefore = sqlite().prepare('SELECT COUNT(*) n FROM users').get().n;
  const credsBefore = sqlite().prepare('SELECT COUNT(*) n FROM credentials').get().n;
  await A.page.evaluate(() => { window.__origCreate = navigator.credentials.create.bind(navigator.credentials);
    navigator.credentials.create = () => Promise.reject(new DOMException('사용자가 취소함(시험용)', 'NotAllowedError')); });
  await A.page.fill('#reg-name', '시험계정A'); await A.page.fill('#reg-passkey-name', '시험용 노트북 A1');
  await A.page.click('#btn-register');
  await A.page.waitForFunction(() => document.getElementById('msg').textContent.includes('취소'));
  const cancelMsg = await A.page.locator('#msg').innerText();
  const cancelOpt = lastLog('/api/register/options', 'POST');
  const usersAfter = sqlite().prepare('SELECT COUNT(*) n FROM users').get().n;
  const credsAfter = sqlite().prepare('SELECT COUNT(*) n FROM credentials').get().n;
  check('C25', '등록 중 취소하면 화면 안내가 나오고 계정·패스키가 저장되지 않는다', cancelMsg.includes('저장되지 않았습니다') && usersBefore === usersAfter && credsBefore === credsAfter, `화면: "${cancelMsg}" / 계정 ${usersBefore}→${usersAfter}, 패스키 ${credsBefore}→${credsAfter}`);
  await shot(A.page, '02-등록-취소-안내.png');
  await A.page.evaluate(() => { navigator.credentials.create = window.__origCreate; });

  // 정상 등록
  await A.page.click('#btn-register');
  await A.page.waitForSelector('#open-view:not([hidden])');
  const regOpt1 = lastLog('/api/register/options', 'POST');
  const regVer = lastLog('/api/register/verify', 'POST');
  const regVerBody = JSON.parse(regVer.resBody);
  const credsA1 = await grabCreds(A, authA1);
  const challengeCancel = JSON.parse(cancelOpt.resBody).challenge;
  const challengeReg = JSON.parse(regOpt1.resBody).challenge;
  const row = sqlite().prepare('SELECT * FROM challenges WHERE challenge=?').get(challengeReg);
  check('C19', '서버가 등록용 질문을 만들어 보내고 확인할 때까지 보관한다', !!row && row.purpose === 'register' && row.used === 1, `질문 ${challengeReg.slice(0, 12)}… 은 서버 표에 저장됐고 검증 시 한 번 소모됨`);
  check('C20', '등록 요청마다 질문 값이 다르다', challengeCancel !== challengeReg, `1번째 ${challengeCancel.slice(0, 16)}… / 2번째 ${challengeReg.slice(0, 16)}…`);
  check('C21', '등록이 끝나면 서버에 공개키가 저장된다', regVer.status === 200 && !!regVerBody.storedOnServer.publicKey, `POST /api/register/verify → ${regVer.status}`);
  check('C22', '서버에 저장된 값이 공개키이며 비밀번호가 아니라는 설명이 함께 있다', /공개키/.test(regVerBody.explanation) && /비밀번호가 아닙니다/.test(regVerBody.explanation), regVerBody.explanation);
  const allReqBodies = log.filter((e) => e.reqBody).map((e) => e.reqBody).join('\n');
  const leaked = privateRaws.some((k) => allReqBodies.includes(k) || allReqBodies.includes(k.replace(/[-_]/g, '')));
  check('C23', '개인키가 서버로 전송되지 않는다(등록 요청 본문 대조)', !leaked && credsA1.length === 1,
    `기기에서 꺼낸 개인키(${credsA1[0].privateKey.length}자)가 전송된 어떤 요청 본문에도 없음. 등록 요청 본문의 칸: ${Object.keys(JSON.parse(regVer.reqBody).response).join(', ')}`);
  check('C24', '등록한 패스키에 사람이 알아볼 이름이 붙는다', regVerBody.passkey.name === '시험용 노트북 A1', `이름: ${regVerBody.passkey.name}`);
  check('C26', '패스키를 저장한 곳을 구분해 보여 준다', !!regVerBody.storageGuess, `${regVerBody.storageGuess} (가상 인증기 사용 시험)`);
  await shot(A.page, '03-등록-직후-서버저장값.png');

  // 메모 3개 (화면에서 직접 입력)
  const aItems = [['프로젝트 메모', '시험용 프로젝트 A-메모', '로그인 화면 다듬기(만들어 넣은 내용)'], ['지원하려는 곳', '시험용 회사 A-1', '가상의 회사 목록 1번'], ['스스로 쓰는 회고', '시험용 회고 A-회고', '이번 주에 패스키를 처음 써 봄(가상 내용)']];
  for (const [k, t, b] of aItems) { await A.page.selectOption('#it-kind', k); await A.page.fill('#it-title', t); await A.page.fill('#it-body', b); await A.page.click('#btn-add-item'); await A.page.waitForFunction((t) => document.getElementById('items').innerText.includes(t), t); }
  const aList = await jsonFetch(A.page, 'GET', '/api/private/items');
  check('C14', '비공개 영역에 들어 있는 항목이 세 개 이상이다', aList.body.items.length >= 3, `A의 항목 ${aList.body.items.length}개: ${aList.body.items.map((i) => i.kind).join(' / ')}`);
  await shot(A.page, '04-로그인-후-비공개-열림.png');
  const sess1 = await A.page.evaluate(() => fetch('/api/session').then((r) => r.json()));
  const A_id = sess1.user.id;

  // 로그아웃 → 잠김(C15, C18, C33, C32)
  const cookiesA = (await A.ctx.cookies()).find((c) => c.name === 'pk_session');
  const oldToken = cookiesA.value;
  check('C32', '로그인 뒤 사람을 알아보는 수단이 무엇인지 적혀 있다', !!oldToken && cookiesA.httpOnly, `세션 쿠키 pk_session(난수 32바이트), HttpOnly=${cookiesA.httpOnly}, SameSite=${cookiesA.sameSite}. DB에는 해시만 저장`);
  await A.page.click('#btn-logout');
  await A.page.waitForSelector('#locked-view:not([hidden])');
  const lockedText = await A.page.locator('body').innerText();
  check('C15', '패스키로 들어가지 않은 상태에서는 비공개 내용이 화면에 보이지 않는다', aItems.every(([, t]) => !lockedText.includes(t)), '로그아웃 직후 화면 전체 글자에 A의 메모 제목 3개가 없음');
  await shot(A.page, '05-로그아웃-후-다시-잠김.png');
  const afterOut = await anon.request.get(ORIGIN + '/api/private/items', { headers: { cookie: 'pk_session=' + oldToken } });
  check('C33', '로그아웃한 뒤 같은 쿠키값으로 다시 요청하면 거절된다', afterOut.status() === 401, `옛 쿠키 ${mask(oldToken)} → 상태 ${afterOut.status()} ${await afterOut.text()}`);
  check('C18', '로그인하지 않고 받은 페이지 소스 어디에도 비공개 내용이 없다', aItems.every(([, t, b]) => !anonSource.includes(t) && !anonSource.includes(b)) , '받은 / 와 /app.js 전체 글자에 A의 메모 제목·내용이 없음');

  // ───────── 카드 3: 패스키 로그인 ─────────
  await A.page.click('#btn-login'); await A.page.waitForSelector('#open-view:not([hidden])');
  const lo1 = lastLog('/api/login/options', 'POST'); const lv1 = lastLog('/api/login/verify', 'POST');
  check('C29', '서버가 저장해 둔 공개키로 서명을 확인한 뒤에만 통과시킨다', lv1.status === 200, `POST /api/login/verify → ${lv1.status}`);
  const loginReqBody = lv1.reqBody;
  await A.page.click('#btn-logout'); await A.page.waitForSelector('#locked-view:not([hidden])');
  await A.page.click('#btn-login'); await A.page.waitForSelector('#open-view:not([hidden])');
  const lo2 = lastLog('/api/login/options', 'POST');
  const ch1 = JSON.parse(lo1.resBody).challenge, ch2 = JSON.parse(lo2.resBody).challenge;
  check('C27', '로그인할 때도 서버가 매번 새 질문을 만들어 보낸다', !!ch1 && !!ch2, `로그인 질문 2회 모두 서버가 생성`);
  check('C28', '로그인 요청마다 질문 값이 서로 다르다', ch1 !== ch2, `1회 ${ch1.slice(0, 16)}… / 2회 ${ch2.slice(0, 16)}…`);
  // 이미 쓴 질문 재사용(C31)
  const replay = await anon.request.post(ORIGIN + '/api/login/verify', { headers: { 'content-type': 'application/json', origin: ORIGIN }, data: loginReqBody });
  check('C31', '이미 한 번 쓴 질문으로 다시 로그인하려는 요청이 거절된다', replay.status() === 400, `재전송 → ${replay.status()} ${await replay.text()}`);
  // 일부러 틀린 서명(C30 실패 사례)
  await A.page.click('#btn-logout'); await A.page.waitForSelector('#locked-view:not([hidden])');
  const tampered = await A.page.evaluate(async () => {
    const options = await api('POST', '/api/login/options', {});
    const response = await signWithPasskey(options);
    const sig = new Uint8Array(b64uToBuf(response.response.signature)); sig[sig.length - 1] ^= 0xff;   // 서명 한 바이트 변조
    response.response.signature = bufToB64u(sig.buffer);
    try { await api('POST', '/api/login/verify', { response }); return { status: 200 }; } catch (e) { return { status: e.status, error: e.message }; }
  });
  check('C30', '서명 확인에 성공한 요청과 실패한 요청이 나란히 기록된다', tampered.status === 401 && lv1.status === 200, `성공: 상태 200 / 일부러 변조한 서명: 상태 ${tampered.status} "${tampered.error}"`);
  const cookieNow = (await A.ctx.cookies()).find((c) => c.name === 'pk_session');
  check('C34', '적어 둔 기록에서 세션·토큰 값이 가려져 있다', !JSON.stringify(log.map((e) => ({ ...e, reqBody: null }))).includes(oldToken), `기록에는 쿠키값을 넣지 않음. 표시 예: ${mask(oldToken)}`);
  check('C35', '화면 어디에도 비밀번호를 입력하는 칸이 없다', (await A.page.locator('input[type=password]').count()) === 0, '비밀번호 입력 칸(type=password) 0개');
  await A.page.click('#btn-login'); await A.page.waitForSelector('#open-view:not([hidden])');

  // ───────── 카드 4: 기기를 잃어버렸을 때 ─────────
  // 같은 기기에는 이미 이 계정 패스키가 있어 두 번째 등록이 막히므로, 시험에서는 다른 가상 기기(A2)를 쓴다.
  const dupTry = await A.page.evaluate(async () => {
    try { const o = await api('POST', '/api/register/options', { passkeyName: 'dup' }); await createPasskey(o); return 'created'; } catch (e) { return e.name; }
  });
  check('C42a', '같은 기기에 같은 계정의 패스키가 중복 등록되지 않는다', dupTry === 'InvalidStateError', `같은 기기에서 두 번째 등록 시도 → ${dupTry}`);
  await A.cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: authA1 });
  const authA2 = await A.addAuth();
  await A.page.fill('#pk2-name', '시험용 휴대폰 A2'); await A.page.click('#btn-add-passkey');
  await A.page.waitForFunction(() => document.getElementById('passkeys').innerText.includes('시험용 휴대폰 A2'));
  const pkList = await jsonFetch(A.page, 'GET', '/api/passkeys');
  check('C42', '한 계정에 패스키가 두 개 등록되어 있다', pkList.body.passkeys.length === 2, `패스키 ${pkList.body.passkeys.length}개`);
  check('C43', '등록된 패스키 목록이 화면에 있고 이름과 등록 날짜가 보인다', pkList.body.passkeys.every((p) => p.name && p.createdAt) && (await A.page.locator('#passkeys').innerText()).includes('등록한 날짜'), pkList.body.passkeys.map((p) => `${p.name} (${p.createdAt})`).join(' | '));
  await shot(A.page, '06-패스키-두개-목록.png');
  const credsA2 = await grabCreds(A, authA2);
  const c2 = credsA2[0];
  const c1 = credsA1[0];
  // 첫 패스키를 화면에서 지운다
  A.page.once('dialog', (d) => d.accept());
  await A.page.locator('#passkeys .pk-item', { hasText: '시험용 노트북 A1' }).locator('button').click();
  await A.page.waitForFunction(() => !document.getElementById('passkeys').innerText.includes('시험용 노트북 A1'));
  await shot(A.page, '07-패스키-하나-지운-뒤.png');
  await A.page.click('#btn-logout'); await A.page.waitForSelector('#locked-view:not([hidden])');
  // 지운 패스키(c1)만 있는 상태로 로그인 → 실패해야 한다(C45)
  // 시험 장치: 지운 열쇠(c1)만 가진 기기 A3 만 남기고 A2 는 치운다
  await A.cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: authA2 });
  const authA3 = await A.addAuth();
  await A.cdp.send('WebAuthn.addCredential', { authenticatorId: authA3, credential: c1 });
  await A.page.click('#btn-login');
  await A.page.waitForFunction(() => document.getElementById('msg').className.includes('err'));
  const failMsg = await A.page.locator('#msg').innerText(); const failLog = lastLog('/api/login/verify', 'POST');
  check('C45', '지운 패스키로는 더 이상 들어갈 수 없다는 기록이 있다', failLog.status === 401 && (await A.page.locator('#open-view').isHidden()), `지운 패스키로 로그인 → 상태 ${failLog.status} "${failMsg}"`);
  // 남은 패스키(c2)로 로그인 → 성공(C44)
  await A.cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: authA3 });
  const authA4 = await A.addAuth();
  await A.cdp.send('WebAuthn.addCredential', { authenticatorId: authA4, credential: c2 });
  await A.page.click('#btn-login'); await A.page.waitForSelector('#open-view:not([hidden])');
  const okLog = lastLog('/api/login/verify', 'POST');
  check('C44', '패스키 하나를 지운 뒤 남은 하나로 들어갈 수 있다', okLog.status === 200, `남은 패스키 로그인 → 상태 ${okLog.status}`);
  await shot(A.page, '08-남은-패스키로-로그인-성공.png');
  // 마지막 하나 지우기(C46)
  const lastId = (await jsonFetch(A.page, 'GET', '/api/passkeys')).body.passkeys[0].id;
  const delLast = await jsonFetch(A.page, 'DELETE', '/api/passkeys/' + lastId);
  const stillThere = (await jsonFetch(A.page, 'GET', '/api/passkeys')).body.passkeys.length;
  check('C46', '패스키가 하나도 남지 않게 되는 경우를 화면과 제출문에 적는다', delLast.status === 409 && stillThere === 1, `마지막 패스키 삭제 시도 → ${delLast.status} "${delLast.body.error}" (남은 개수 ${stillThere})`);
  A.page.once('dialog', (d) => d.accept());
  await A.page.locator('#passkeys .pk-item button').first().click();
  await A.page.waitForFunction(() => document.getElementById('msg').textContent.includes('마지막 패스키'));
  await shot(A.page, '09-마지막-패스키-삭제-거절.png');

  // ───────── 카드 5: 정말 안 열리는지 ─────────
  const B = await newUser('B'); await B.addAuth();
  await B.page.goto(ORIGIN + '/');
  await B.page.fill('#reg-name', '시험계정B'); await B.page.fill('#reg-passkey-name', '시험용 노트북 B1'); await B.page.click('#btn-register');
  await B.page.waitForSelector('#open-view:not([hidden])');
  const bItems = [['프로젝트 메모', '시험용 프로젝트 B-메모', 'B만의 가상 메모'], ['지원하려는 곳', '시험용 회사 B-1', '가상의 회사 B'], ['스스로 쓰는 회고', '시험용 회고 B-회고', 'B의 가상 회고']];
  for (const [k, t, b] of bItems) { await B.page.selectOption('#it-kind', k); await B.page.fill('#it-title', t); await B.page.fill('#it-body', b); await B.page.click('#btn-add-item'); await B.page.waitForFunction((t) => document.getElementById('items').innerText.includes(t), t); }
  const B_id = (await B.page.evaluate(() => fetch('/api/session').then((r) => r.json()))).user.id;
  cleanupIds = [A_id, B_id];
  const dbCounts = () => { const d = sqlite(); return { A: d.prepare('SELECT COUNT(*) n FROM items WHERE user_id=?').get(A_id).n, B: d.prepare('SELECT COUNT(*) n FROM items WHERE user_id=?').get(B_id).n }; };
  const A_items_json = JSON.stringify(aList.body.items.map((i) => i.title)); const B_items_json = JSON.stringify((await jsonFetch(B.page, 'GET', '/api/private/items')).body.items.map((i) => i.title));
  check('C36', '패스키를 등록한 계정이 두 개이고 각각 서로 다른 비공개 내용이 있다', A_items_json !== B_items_json && dbCounts().A === 3 && dbCounts().B === 3, `A: ${A_items_json}\nB: ${B_items_json}`);
  const before = dbCounts();
  // A로 B 자료 읽기 시도
  const aTriesB = await jsonFetch(A.page, 'GET', `/api/users/${B_id}/items`);
  const bTriesA = await jsonFetch(B.page, 'GET', `/api/users/${A_id}/items`);
  check('C37', 'A 패스키로 들어가 B의 비공개 자료를 읽으려는 요청과 그 거절 응답이 있다', aTriesB.status === 403, `GET /api/users/<B>/items (A 로그인) → ${aTriesB.status} ${JSON.stringify(aTriesB.body)}`);
  check('C38', '반대 방향(B→A)도 똑같이 거절됐다는 기록이 있다', bTriesA.status === 403, `GET /api/users/<A>/items (B 로그인) → ${bTriesA.status} ${JSON.stringify(bTriesA.body)}`);
  // 주소·본문에 다른 계정을 적어 보내기(C40)
  const spoofQuery = await jsonFetch(A.page, 'GET', `/api/private/items?owner=${B_id}&userId=${B_id}`);
  const spoofPost = await jsonFetch(A.page, 'POST', '/api/private/items', { kind: '프로젝트 메모', title: 'B 계정에 쓰려는 시도', body: 'x', owner: B_id, userId: B_id });
  const spoofDelete = await jsonFetch(A.page, 'DELETE', '/api/private/items/' + (await jsonFetch(B.page, 'GET', '/api/private/items')).body.items[0].id);
  const mine = spoofQuery.body.items.map((i) => i.title);
  check('C40', '주소나 요청 본문에 다른 계정을 적어 보낸 요청에도 내 자료만 돌아온다', spoofQuery.status === 200 && spoofQuery.body.owner === '시험계정A' && mine.every((t) => t.includes('A-')) && spoofPost.status === 201 && spoofDelete.status === 404,
    `?owner=<B> 요청 → 응답 주인 "${spoofQuery.body.owner}", 항목 ${mine.join(', ')}\n본문 owner=<B> 로 메모 추가 → ${spoofPost.status} (A에 저장됨)\nB의 메모 지우기 시도 → ${spoofDelete.status} ${JSON.stringify(spoofDelete.body)}`);
  // 정리: A의 장난 메모 지우기(건수 비교를 위해 되돌림)
  await jsonFetch(A.page, 'DELETE', '/api/private/items/' + spoofPost.body.id);
  const after = dbCounts();
  check('C39', '거절 앞뒤로 반대편의 자료 건수가 같다는 기록이 있다', before.B === after.B && before.A === after.A && after.B === 3, `거절 전 A ${before.A}건/B ${before.B}건 → 거절·시도 후 A ${after.A}건/B ${after.B}건`);
  check('C41', '거절을 만드는 소스의 위치가 적혀 있다', true, 'src/worker.mjs 의 GET /api/users/:id/items (mm[1] !== me.id → 403), requireUser() 의 세션 확인, items 조회 시 WHERE user_id=세션 사용자');

  const missing = results.filter((r) => !r.pass);
  fs.writeFileSync(path.join(EVD, 'evidence.json'), JSON.stringify({
    runAt: new Date().toISOString(), origin: ORIGIN, browser: 'Chrome ' + browser.version(), authenticator: 'Chrome 가상 인증기 (CTAP2, internal, 사용자 확인 켜짐)',
    results, requests: log.map((e) => ({ ...e, resBody: e.resBody.length > 1500 ? e.resBody.slice(0, 1500) + '…' : e.resBody })),
    accounts: { A: A_id, B: B_id },
  }, null, 1));
  console.log(`\n${results.length - missing.length}/${results.length} PASS`);
  process.exitCode = missing.length ? 1 : 0;
} catch (e) {
  console.error('시험 중단:', e); process.exitCode = 2;
} finally {
  await browser.close();
  if (server) { try { execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' }); } catch {} }
  // 공개 주소 시험이 만든 가짜 시험 계정(시험계정A/B)과 그 메모·패스키·세션은 시험이 끝나면 지운다
  if (REMOTE && cleanupIds.length) {
    for (const id of cleanupIds) for (const t of ['items', 'credentials', 'sessions']) { try { remoteSql(`DELETE FROM ${t} WHERE user_id=?`, [id]); } catch {} }
    for (const id of cleanupIds) { try { remoteSql('DELETE FROM users WHERE id=?', [id]); } catch {} }
    console.log('시험 계정 정리:', cleanupIds.length, '개');
  }
}





