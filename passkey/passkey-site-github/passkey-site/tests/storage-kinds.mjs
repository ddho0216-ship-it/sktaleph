// C26 보강: 저장 위치가 다른 세 종류의 패스키를 만들어 앱이 어떻게 구분해 보여 주는지 확인한다.
//  1) 동기화되는 패스키(구글 비밀번호 관리자·iCloud 키체인 같은 것)  2) 이 기기에만 저장되는 패스키(Windows Hello 같은 것)  3) 보안 키(USB)
// 크롬의 가상 인증기에 "백업 가능/백업됨" 표시와 전송 방식(내장/USB)을 지정해 흉내 낸다. 실제 구글·윈도우 서비스를 쓴 것은 아니다.
// 사용: BASE_URL=https://... node tests/storage-kinds.mjs   (없으면 로컬 http://localhost:8787, wrangler dev 필요)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.BASE_URL || 'http://localhost:8787').replace(/\/$/, '');
const kinds = [
  { key: 'synced', label: '동기화되는 패스키 (구글 비밀번호 관리자 같은 것)', opts: { transport: 'internal', defaultBackupEligibility: true, defaultBackupState: true }, expect: '동기화' },
  { key: 'device', label: '이 기기에만 저장되는 패스키 (Windows Hello 같은 것)', opts: { transport: 'internal', defaultBackupEligibility: false, defaultBackupState: false }, expect: '이 기기 자체' },
  { key: 'usb', label: '보안 키 (USB)', opts: { transport: 'usb' }, expect: '보안 키' },
];
const out = [], ids = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const k of kinds) {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page); await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, ...k.opts } });
    let reg;
    page.on('response', async (r) => { if (r.url().endsWith('/api/register/verify')) reg = JSON.parse(await r.text()); });
    await page.goto(BASE + '/');
    await page.fill('#reg-name', '저장위치시험-' + k.key); await page.fill('#reg-passkey-name', k.label.slice(0, 20));
    await page.click('#btn-register'); await page.waitForSelector('#open-view:not([hidden])');
    ids.push(reg.user.id);
    await page.waitForFunction(() => document.getElementById('passkeys').innerText.includes('등록한 날짜'));
    const listed = await page.locator('#passkeys').innerText();
    const ok = reg.storageGuess.includes(k.expect) && listed.includes(k.expect);
    out.push({ kind: k.label, deviceType: reg.passkey.deviceType, backedUp: reg.passkey.backedUp, attachment: reg.passkey.attachment, shown: reg.storageGuess, expectedKeyword: k.expect, pass: ok });
    console.log(ok ? 'PASS' : 'FAIL', k.label, '→', reg.storageGuess);
    await ctx.close();
  }
} finally {
  await browser.close();
  if (process.env.BASE_URL) for (const id of ids) for (const t of ['items', 'credentials', 'sessions']) {
    try { execSync(`npx wrangler d1 execute passkey-db --remote --command "DELETE FROM ${t} WHERE user_id='${id}'"`, { cwd: ROOT, stdio: 'ignore' }); } catch {}
  }
  if (process.env.BASE_URL) for (const id of ids) { try { execSync(`npx wrangler d1 execute passkey-db --remote --command "DELETE FROM users WHERE id='${id}'"`, { cwd: ROOT, stdio: 'ignore' }); } catch {} }
}
fs.mkdirSync(path.join(ROOT, 'evidence'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'evidence/storage-kinds.json'), JSON.stringify({ runAt: new Date().toISOString(), base: BASE, results: out }, null, 1));
process.exitCode = out.every((o) => o.pass) && out.length === kinds.length ? 0 : 1;
