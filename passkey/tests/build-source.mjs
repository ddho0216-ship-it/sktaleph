// 소스 URL(C02)용: 같은 사이트 안에 /source.html (코드 보기)과 /source.zip (전체 소스)을 만든다.
// 로그인 없이 열린다. 비밀값(토큰·비밀번호)은 이 프로젝트에 원래 없고, evidence/ 와 node_modules 는 넣지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE = ['package.json', 'package-lock.json', 'wrangler.jsonc', '.gitignore', 'DEPLOY.md', 'src', 'public/index.html', 'public/app.js', 'source', 'tests'];
const stage = path.join(os.homedir(), 'pk-source-stage', 'passkey-site');
fs.rmSync(path.dirname(stage), { recursive: true, force: true });
for (const rel of INCLUDE) {
  const from = path.join(ROOT, rel);
  if (!fs.existsSync(from)) continue;
  const to = path.join(stage, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}
const zip = path.join(ROOT, 'public/source.zip');
fs.rmSync(zip, { force: true });
execSync(`tar -a -c -f "${zip}" -C "${path.dirname(stage)}" passkey-site`);
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); f.isDirectory() ? walk(p) : files.push(path.relative(stage, p).replace(/\\/g, '/')); } })(stage);
fs.rmSync(path.dirname(stage), { recursive: true, force: true });

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const show = (rel) => `<details><summary><code>${rel}</code></summary><pre>${esc(fs.readFileSync(path.join(ROOT, rel), 'utf8'))}</pre></details>`;
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>과제 8 소스</title>
<style>body{font-family:system-ui,"Malgun Gothic",sans-serif;max-width:900px;margin:0 auto;padding:24px 16px 64px;line-height:1.7;color:#1f2937}
pre{background:#f1f5f9;padding:12px;border-radius:8px;overflow:auto;font-size:12px}code{background:#f1f5f9;padding:1px 5px;border-radius:4px}
details{margin:8px 0;border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px}summary{cursor:pointer}
a.btn{display:inline-block;background:#7c3aed;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700}
td,th{border:1px solid #d1d5db;padding:6px 8px;text-align:left;font-size:14px}table{border-collapse:collapse;width:100%}</style></head><body>
<h1>과제 8 소스 — 소개 페이지에 패스키 달기</h1>
<p>로그인 없이 볼 수 있는 소스 안내입니다. 아래 버튼으로 전체 소스를 받을 수 있습니다.</p>
<p><a class="btn" href="/source.zip">전체 소스 ZIP 받기 (source.zip)</a></p>
<h2>어디를 보면 되나요</h2>
<table><thead><tr><th>파일</th><th>역할</th></tr></thead><tbody>
<tr><td><code>src/worker.mjs</code></td><td>서버 전부: 등록·로그인·로그아웃, 질문(challenge) 보관·1회 소모, 세션, 패스키 목록·삭제, 계정별 비공개 자료 차단</td></tr>
<tr><td><code>public/app.js</code></td><td>브라우저 쪽: 기기에 패스키 만들기·서명 시키기, 화면 갱신</td></tr>
<tr><td><code>source/intro-original.html</code></td><td>1번 과제 소개 페이지 원본(그대로 보관)</td></tr>
<tr><td><code>source/private-section.html</code>, <code>private-style.css</code></td><td>이번에 붙인 비공개 영역의 화면과 스타일</td></tr>
<tr><td><code>tests/build-index.mjs</code></td><td>원본 + 비공개 영역을 합쳐 <code>public/index.html</code> 생성(원본 글자 그대로인지 확인)</td></tr>
<tr><td><code>tests/verify.mjs</code></td><td>실제 Chrome 가상 인증기로 전체 시험 38개 실행</td></tr>
<tr><td><code>wrangler.jsonc</code>, <code>DEPLOY.md</code></td><td>Cloudflare 설정과 배포 순서</td></tr>
</tbody></table>
<p>사용한 라이브러리: <code>@simplewebauthn/server</code> (패스키 검증), 시험용 <code>playwright-core</code>, 배포용 <code>wrangler</code>. 비밀번호 저장·외부 로그인 서비스는 없습니다.</p>
<h2>ZIP에 들어 있는 파일 (${files.length}개)</h2>
<pre>${esc(files.join('\n'))}</pre>
<h2>핵심 코드 보기</h2>
${show('src/worker.mjs')}
${show('public/app.js')}
${show('wrangler.jsonc')}
</body></html>`;
fs.writeFileSync(path.join(ROOT, 'public/source.html'), html);
console.log('source.zip', (fs.statSync(zip).size / 1024).toFixed(0) + 'KB, 파일', files.length, '개');
