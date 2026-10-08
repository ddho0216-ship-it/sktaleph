// evidence/evidence.json 과 스크린샷으로 제출용 인증 구현 설명서(제출설명.html)를 만든다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ev = JSON.parse(fs.readFileSync(path.join(ROOT, 'evidence/evidence.json'), 'utf8'));
const R = Object.fromEntries(ev.results.map((r) => [r.id, r]));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const img = (f, cap) => `<figure><img alt="${esc(cap)}" src="data:image/png;base64,${fs.readFileSync(path.join(ROOT, 'evidence', f)).toString('base64')}"><figcaption>${esc(cap)}</figcaption></figure>`;
const row = (id) => R[id] ? `<tr><td>${id}</td><td>${esc(R[id].name)}</td><td class="${R[id].pass ? 'ok' : 'bad'}">${R[id].pass ? '통과' : '실패'}</td><td><pre>${esc(R[id].detail)}</pre></td></tr>` : '';
const table = (ids) => `<table><thead><tr><th>번호</th><th>확인한 것</th><th>결과</th><th>실제 요청·응답 기록</th></tr></thead><tbody>${ids.map(row).join('')}</tbody></table>`;
const pass = ev.results.filter((r) => r.pass).length;
const skPath = path.join(ROOT, 'evidence/storage-kinds.json');
const sk = fs.existsSync(skPath) ? JSON.parse(fs.readFileSync(skPath, 'utf8')) : null;
const storageTable = sk ? `<table><thead><tr><th>만든 방식</th><th>기기가 알려 준 값</th><th>화면에 보인 저장 위치 문구</th><th>결과</th></tr></thead><tbody>${sk.results.map((o) =>
  `<tr><td>${esc(o.kind)}</td><td>종류 ${esc(o.deviceType)}, 백업됨 ${o.backedUp}, 연결 ${esc(o.attachment || '없음')}</td><td>${esc(o.shown)}</td><td class="${o.pass ? 'ok' : 'bad'}">${o.pass ? '통과' : '실패'}</td></tr>`).join('')}</tbody></table>` : '<p>(저장 위치 시험 결과 없음)</p>';

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>과제 8 인증 구현 설명서</title>
<style>
body{font-family:system-ui,"Malgun Gothic",sans-serif;max-width:960px;margin:0 auto;padding:24px 16px 80px;line-height:1.7;color:#1f2937}
h1{font-size:26px} h2{margin-top:40px;border-bottom:2px solid #7c3aed;padding-bottom:6px} h3{margin-top:24px}
table{border-collapse:collapse;width:100%;font-size:14px;margin:10px 0} th,td{border:1px solid #d1d5db;padding:6px 8px;vertical-align:top;text-align:left} th{background:#f3f4f6}
pre{white-space:pre-wrap;word-break:break-all;margin:0;font-size:12px;font-family:ui-monospace,Consolas,monospace}
.ok{color:#15803d;font-weight:700}.bad{color:#b91c1c;font-weight:700}
code{background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:13px}
figure{margin:12px 0}img{max-width:100%;border:1px solid #d1d5db;border-radius:8px}figcaption{font-size:13px;color:#6b7280}
.box{background:#faf5ff;border:1px solid #ddd6fe;border-radius:10px;padding:12px 16px;margin:10px 0}
.edit{background:#fef9c3;border:2px dashed #ca8a04;border-radius:8px;padding:10px;min-height:64px;white-space:pre-wrap}
.sum{background:#ecfdf5;border:1px solid #6ee7b7;border-radius:10px;padding:12px 16px}
</style></head><body>
<h1>과제 8 — 소개 페이지에 패스키 달기 · 인증 구현 설명서</h1>
<div class="sum"><strong>시험 요약</strong>: 시험 ${ev.results.length}개 중 ${pass}개 통과. 실행 ${esc(ev.runAt)}, ${esc(ev.browser)}, 인증기: ${esc(ev.authenticator)}.<br>
결과물: ${esc(ev.origin)}/ · 소스: ${esc(ev.origin)}/source.html (전체 ZIP: ${esc(ev.origin)}/source.zip)<br>시험 계정·메모는 모두 만들어 넣은 가짜 내용입니다. 이 제출물에는 실제 연락처, 신분증 번호, 비밀번호가 없습니다(비밀번호 자체를 만들지 않습니다).</div>

<h2>짧은 확인 방법 (4개)</h2>
<table><thead><tr><th>#</th><th>① 어디로 가나요</th><th>② 세 단계 안에 무엇을 하나요</th><th>③ 무엇이 보이면 통과인가요</th><th>④ 안 될 때는 무엇이 보이나요</th></tr></thead><tbody>
<tr><td>1 잠금 확인</td><td>결과물 주소의 첫 화면</td><td>① 주소를 연다 ② 아무것도 누르지 않고 보라색 점선 칸을 본다 ③ 주소창에 <code>/api/private/items</code>를 붙여 열어 본다</td><td>소개 내용은 보이고 점선 칸은 "잠겨 있습니다"만 보인다. 주소를 열면 401 오류 글이 나온다</td><td>점선 칸에 메모가 보이거나 401이 아니라 메모 목록이 나오면 실패</td></tr>
<tr><td>2 패스키 만들기·들어가기</td><td>첫 화면의 점선 칸</td><td>① 이름을 적고 "패스키 만들기"를 누른다 ② 기기의 지문·PIN 안내를 따른다 ③ 로그아웃 후 "패스키로 들어가기"를 누른다</td><td>"서버에 저장된 값(공개키)" 설명이 나오고, 다시 들어가면 내 메모가 열린다</td><td>취소하면 "저장되지 않았습니다" 안내가 나온다. 패스키를 지원하지 않는 브라우저는 안내 글이 나온다</td></tr>
<tr><td>3 두 번째 패스키와 삭제</td><td>들어간 뒤 "내 패스키 목록"</td><td>① 다른 기기에서 "패스키 하나 더 등록"을 한다 ② 목록에 두 개(이름·날짜)가 보이는지 본다 ③ 하나를 지우고 남은 것으로 다시 들어간다</td><td>지우기 전 두 개, 지운 뒤 하나가 보이고 남은 패스키로 들어가진다</td><td>마지막 한 개를 지우려 하면 "마지막 패스키는 지울 수 없습니다" 안내가 나온다. 지운 패스키로는 "등록되지 않았거나 이미 지운 패스키" 오류가 난다</td></tr>
<tr><td>4 남의 자료 차단</td><td>같은 화면, 계정 두 개</td><td>① 계정 A, B를 각각 만들고 메모를 쓴다 ② A로 들어가 개발자도구 콘솔에서 <code>fetch('/api/users/B의ID/items')</code>를 실행한다 ③ B 쪽도 똑같이 해 본다</td><td>양쪽 모두 403 "다른 사람의 비공개 자료는 읽을 수 없습니다"</td><td>상대 메모가 응답에 보이면 실패. (이 시험은 <code>npm run verify</code>가 자동으로 돌립니다)</td></tr>
</tbody></table>

<h2>① 무엇을 붙였나</h2>
<p>1번 과제의 소개 페이지는 그대로 두고, 같은 페이지 안에 <strong>패스키로 잠긴 나만의 비공개 자리</strong>를 하나 붙였습니다. 비공개 자리에는 프로젝트 메모, 지원하려는 곳, 스스로 쓰는 회고를 적습니다. 비밀번호는 만들지 않습니다.</p>
<ul>
<li><strong>공개 영역</strong>(1번 과제 소개 페이지 그대로): 로그인 없이 누구나 봅니다.</li>
<li><strong>비공개 영역</strong>(보라색 점선 칸): 패스키로 들어가야 열립니다. 잠긴 동안에는 내용을 서버가 보내 주지 않습니다.</li>
<li>패스키 만들기, 패스키로 들어가기, 로그아웃, 패스키 목록 보기·추가·삭제.</li>
</ul>
${img('01-잠긴-첫화면.png', '잠긴 첫 화면: 공개 영역(1번 소개 페이지)과 비공개 영역(보라 점선 칸)이 구분선 문구로 나뉘어 있고 비공개 내용은 보이지 않는다')}
<p><strong>실제 개인정보 없음</strong>: 비공개 자리의 내용은 만들어 넣은 것입니다. 실제 연락처나 신분증 번호는 넣지 않았습니다.</p>
${table(['C10', 'C11', 'C13', 'C14', 'C15', 'C18'])}

<h2>② 왜 그걸 골랐나</h2>
<ul>
<li><strong>패스키(WebAuthn)</strong>: 비밀번호 대신 기기의 열쇠 한 쌍을 씁니다. 개인키는 기기 밖으로 나가지 않고 서버는 공개키만 가집니다. 서버가 털려도 로그인에 쓸 비밀번호가 없고, 가짜 사이트에서는 작동하지 않습니다.</li>
<li><strong>매번 새 질문(challenge)</strong>: 로그인과 등록 때마다 서버가 무작위 질문을 만들고, 한 번 쓰면 폐기하며 5분 뒤 만료됩니다. 같은 서명을 가로채 다시 보내도 통하지 않게 하려는 장치입니다.</li>
<li><strong>세션 쿠키</strong>: 로그인 뒤 사람을 알아보는 수단은 <strong>세션</strong>입니다. 난수 32바이트 쿠키(<code>pk_session</code>, HttpOnly, SameSite=Lax, 8시간 만료)를 주고, 서버 DB에는 그 해시만 저장합니다.</li>
<li><strong>소유자는 세션에서만</strong>: 누구의 자료를 줄지는 주소나 요청 본문이 아니라 세션에서만 정합니다. 그래서 다른 계정을 적어 보내도 내 자료만 돌아옵니다.</li>
<li><strong>마지막 패스키는 못 지우게</strong>: 지우면 그 계정에 들어올 방법이 사라지기 때문입니다.</li>
</ul>
${table(['C32', 'C35'])}

<h2>③ 어디를 어떻게 고쳤나</h2>
<h3>직접 구현한 것과 쓴 라이브러리</h3>
<table><thead><tr><th>구분</th><th>이름</th><th>어디에 쓰였나</th></tr></thead><tbody>
<tr><td>라이브러리(서버)</td><td><code>@simplewebauthn/server</code> 14.0.3</td><td>등록 질문·로그인 질문 생성, 등록 응답과 로그인 서명 <strong>검증</strong> (<code>src/worker.mjs</code>)</td></tr>
<tr><td>브라우저 내장 기능</td><td>WebAuthn (<code>navigator.credentials.create / get</code>)</td><td>기기에게 패스키 만들기·서명 시키기 (<code>public/app.js</code>)</td></tr>
<tr><td>실행 환경(Cloudflare)</td><td>Cloudflare Workers, D1(SQLite 기반 저장소), Web Crypto</td><td>서버 실행, 공개키·세션·메모 저장, 세션 난수·해시 (<code>wrangler.jsonc</code>)</td></tr>
<tr><td>직접 구현</td><td>세션 발급·만료·폐기, 질문 보관·1회 소모·만료, 계정별 자료 차단, 패스키 목록·삭제, 화면 전체</td><td><code>src/worker.mjs</code>, <code>public/</code></td></tr>
<tr><td>사용하지 않은 것</td><td>외부 로그인 서비스(OAuth), 비밀번호, CAPTCHA</td><td>—</td></tr>
</tbody></table>
<p>시험 도구: Playwright(Chrome 조종)와 Chrome 가상 인증기. 서비스 코드에는 포함되지 않습니다.</p>

<h3>등록·로그인·로그아웃·비공개 조회가 소스를 지나는 길</h3>
<table><thead><tr><th>흐름</th><th>화면(<code>public/app.js</code>)</th><th>서버(<code>src/worker.mjs</code>)</th></tr></thead><tbody>
<tr><td>등록</td><td><code>doRegister()</code> → <code>createPasskey()</code></td><td><code>POST /api/register/options</code>(질문 생성·저장) → <code>POST /api/register/verify</code>(<code>consumeChallenge()</code>로 1회 소모 → <code>verifyRegistrationResponse()</code> → 공개키 저장)</td></tr>
<tr><td>로그인</td><td><code>doLogin()</code> → <code>signWithPasskey()</code></td><td><code>POST /api/login/options</code>(새 질문) → <code>POST /api/login/verify</code>(<code>consumeChallenge()</code> → 저장된 공개키로 <code>verifyAuthenticationResponse()</code> → <code>createSession()</code>)</td></tr>
<tr><td>로그아웃</td><td><code>btn-logout</code></td><td><code>POST /api/logout</code>: 세션 해시 삭제, 쿠키 만료</td></tr>
<tr><td>비공개 자료 조회</td><td><code>renderOpen()</code></td><td><code>GET /api/private/items</code>: <code>requireUser()</code>(세션 없으면 401) → <code>WHERE user_id = 세션 사용자</code></td></tr>
<tr><td>다른 계정 차단</td><td>—</td><td><code>GET /api/users/:id/items</code>: <code>mm[1] !== me.id</code> 이면 403. 자료 삭제는 <code>WHERE id=? AND user_id=?</code>라 남의 것은 404</td></tr>
</tbody></table>

<h3>등록 — 서버에 무엇이 저장되나</h3>
${img('03-등록-직후-서버저장값.png', '등록 직후 화면: 서버에 저장된 값은 공개키이며 비밀번호가 아니라는 설명, 패스키 이름, 저장 위치 추정')}
<ul><li>패스키 저장 위치는 기기가 알려 주는 정보(동기화 여부, 내장/외부 인증기)로 추정해 화면에 구분해 보여 줍니다: 보안 키 / 비밀번호 관리자 동기화 / 이 기기 자체. 시험은 가상 인증기라 "이 기기 자체"로 나왔습니다. 실제 기기 결과는 직접 확인해 적어 주세요.</li></ul>
${table(['C19', 'C20', 'C21', 'C22', 'C23', 'C24', 'C25', 'C26'])}
<h3>패스키를 어디에 저장했는지 구분해 보여 주는 방식 (C26)</h3>
<p>패스키가 어디에 저장되는지는 사용자가 기기에서 고른 방식에 따라 달라집니다. 기기가 알려 주는 정보(동기화 여부, 내장/외부)로 앱이 화면에 구분해 보여 줍니다. 아래는 세 종류를 공개 주소에서 각각 만들어 본 결과입니다. <strong>크롬 가상 인증기로 각 방식의 표시를 흉내 낸 것이며, 실제 구글·윈도우 서비스에 저장한 결과는 아닙니다.</strong></p>
${storageTable}
${img('02-등록-취소-안내.png', '등록을 취소했을 때: 안내가 나오고 계정·패스키는 저장되지 않는다')}

<h3>로그인 — 질문, 서명 확인, 세션</h3>
${table(['C27', 'C28', 'C29', 'C30', 'C31', 'C32', 'C33', 'C34', 'C35'])}

<h3>패스키 두 개, 삭제, 마지막 패스키</h3>
${img('06-패스키-두개-목록.png', '한 계정에 패스키 두 개: 이름과 등록 날짜가 보이는 목록')}
${img('09-마지막-패스키-삭제-거절.png', '마지막 패스키를 지우려 할 때의 거절 안내')}
<p><strong>패스키가 하나도 남지 않으면?</strong> 이 앱은 마지막 패스키 삭제를 서버에서 거절(409)하고 화면에 이유를 보여 줍니다. 그래서 "패스키가 0개인 계정"은 만들어지지 않습니다. 다만 모든 기기를 잃어버린 경우의 복구 수단은 없습니다(⑥ 참고).</p>
${table(['C42', 'C42a', 'C43', 'C44', 'C45', 'C46'])}

<h2>④ 안 열리는 것을 확인한 기록 (막은 요청과 통과한 요청 나란히)</h2>
<h3>확인 1. 패스키 없이 비공개 주소 열기</h3>
<ul><li><strong>통과한 요청</strong>: 공개 소개 페이지 <code>GET /</code> → 200</li><li><strong>막힌 요청</strong>: 로그인 없이 <code>GET /api/private/items</code>, <code>/api/users/…/items</code>, <code>/api/passkeys</code> → 401</li></ul>
${table(['C10', 'C16', 'C17', 'C15', 'C18'])}
<h3>확인 2. 남의 패스키로 열기 (계정 두 개)</h3>
<ul><li><strong>통과한 요청</strong>: 각자 자기 자료 조회, 주소에 상대를 적어도 내 자료만 응답</li><li><strong>막힌 요청</strong>: A→B, B→A 모두 403, 상대 메모 삭제 시도 404</li></ul>
${table(['C36', 'C37', 'C38', 'C39', 'C40', 'C41'])}
<h3>확인 3. 이미 쓴 질문 재사용</h3>
<ul><li><strong>통과한 요청</strong>: 새 질문으로 서명한 로그인 → 200</li><li><strong>막힌 요청</strong>: 이미 쓴 질문 재전송 → 400, 서명을 변조한 요청 → 401</li></ul>
${table(['C28', 'C29', 'C30', 'C31', 'C33'])}
<h3>확인 4. 패스키를 지운 뒤 로그인</h3>
<ul><li><strong>통과한 요청</strong>: 남은 패스키로 로그인 → 200</li><li><strong>막힌 요청</strong>: 지운 패스키로 로그인 → 401</li></ul>
${table(['C45', 'C44', 'C46'])}
${img('08-남은-패스키로-로그인-성공.png', '지운 뒤 남은 패스키로 로그인에 성공한 화면')}

<h2>⑤ AI와 나</h2>
<div class="box">아래 노란 칸은 <strong>직접 쓰는 칸</strong>입니다. 클릭해서 고쳐 쓸 수 있습니다. 셋째 칸이 "없었다"라면 왜 없었는지 이유를 함께 적어 주세요.</div>
<h3>AI에게 맡긴 일</h3>
<div class="edit" contenteditable="true">AI(Claude)에게 서버·화면 코드 작성, 자동 시험 스크립트 작성과 실행, 이 설명서 초안 생성을 맡겼습니다. (사실 초안입니다. 고쳐 쓰세요.)</div>
<h3>내가 직접 판단한 일</h3>
<div class="edit" contenteditable="true"></div>
<h3>AI 제안을 따르지 않은 일 (없다면 왜 없었는지)</h3>
<div class="edit" contenteditable="true"></div>

<div class="box"><button id="save-doc" style="font:inherit;padding:8px 14px;border-radius:8px;border:1px solid #7c3aed;background:#7c3aed;color:#fff;cursor:pointer">⑤ 작성 후 HTML 저장</button>
<span style="font-size:13px;color:#6b7280"> 노란 칸에 다 쓴 뒤 누르면 지금 화면 그대로 <code>제출설명_작성완료.html</code>이 내려받아집니다. 이 파일을 제출하세요.</span></div>
<script>
document.getElementById('save-doc').onclick = () => {
  const html = '<!doctype html>\\n' + document.documentElement.outerHTML;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  a.download = '제출설명_작성완료.html'; a.click();
};
</script>

<h2>⑥ 아직 못 막은 것</h2>
<ol>
<li><strong>실제 지문·휴대폰 인증은 이번 자동 시험에서 쓰지 않았습니다.</strong> 시험은 Chrome 가상 인증기로 했습니다. 서버 검증 코드는 같지만 실제 기기·비밀번호 관리자 동기화는 직접 확인해야 합니다.</li>
<li><strong>모든 기기를 잃어버렸을 때의 복구 수단이 없습니다.</strong> 패스키를 두 개 이상 등록해 두는 것으로만 대비합니다.</li>
<li><strong>로그인·등록 시도 횟수 제한이 없습니다.</strong> 누군가 계속 시도해도 서버가 속도를 늦추지 않습니다.</li>
<li><strong>누구나 계정을 만들 수 있습니다.</strong> 심사자가 시험 계정을 만들 수 있게 열어 둔 것이며, 스팸 계정 방지 장치는 없습니다.</li>
<li><strong>세션 8시간 만료는 코드로만 확인했고 실제로 8시간을 기다려 시험하지 않았습니다.</strong></li>
<li><strong>복사·동기화된 패스키의 복제 감지가 약합니다.</strong> 동기화 패스키는 사용 횟수 카운터가 0으로 보고되는 경우가 있어 복제 여부를 이 값으로 알 수 없습니다.</li>
<li>만료된 질문·세션 기록은 새 질문이 만들어질 때 함께 지우는 방식이라, 접속이 오래 없으면 그동안은 남아 있습니다.</li><li><strong>시험 대상은 배포된 공개 주소(${esc(ev.origin)})입니다.</strong> 시험이 만든 가짜 시험 계정은 시험 뒤 지웠습니다. 같은 시험은 <code>BASE_URL=주소 npm run verify</code>로 반복할 수 있습니다.</li>
</ol>
<p>계정과 자료를 지우는 화면은 없습니다. 이 앱에서 삭제할 수 있는 것은 메모와 (마지막 하나를 제외한) 패스키입니다.</p>

<h2>시험 방법과 재현</h2>
<pre>npm install
npm run verify   # Chrome으로 전체 시험을 돌리고 evidence/ 를 새로 만듭니다
npm start        # 로컬 실행 (http://localhost:8787)
npm run deploy  # Cloudflare 에 배포 (계정 로그인 필요, DEPLOY.md 참고)</pre>
</body></html>`;
fs.writeFileSync(path.join(ROOT, '제출설명.html'), html);
console.log('제출설명.html 작성', (html.length / 1024).toFixed(0) + 'KB');



