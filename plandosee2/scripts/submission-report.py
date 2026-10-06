"""Generate a reproducible report from masked tests and the verified actual observation."""
import datetime as dt, html, json, pathlib, re
from zoneinfo import ZoneInfo

root=pathlib.Path('.')
def load(path): return json.loads(pathlib.Path(path).read_text())
ob=load('docs/evidence/observation.json'); ev=load('outputs/auth-evidence.json'); pw=load('outputs/password-evidence.json')
prod_path=pathlib.Path('outputs/auth-production-evidence.json')
prod=load(prod_path) if prod_path.exists() else None
def localtime(value): return dt.datetime.fromisoformat(value.replace('Z','+00:00')).astimezone(ZoneInfo('Asia/Seoul')).strftime('%Y.%m.%d %H:%M:%S')
base='https://planloop-study.ddho0216.chatgpt.site'
text=f'''# 플랜두씨 다이어리 2 — 인증 구현 설명서

작성: 2026.10.06 · 과제 7 · 실제 관찰 기간: 2026.10.01~2026.10.05 (Asia/Seoul)

결과물: {base}/
소스: {base}/source.html
설명서: {base}/submission.html
실제 관찰 증거: {base}/observation-evidence.json

인증·자료 접근 구현과 실제 5일 관찰을 마쳤습니다. ⑤ AI와 나의 세 줄은 작성자가 직접 기입할 부분입니다.

## ① 무엇으로 붙였나

직접 구현한 서버 인증을 과제 6의 React / vinext 플랜두씨에 붙였습니다. 비밀번호의 암호 계산은 표준 Web Crypto API의 PBKDF2-HMAC-SHA512에 맡기고, 사람을 기억하는 방식은 DB 서버 세션으로 선택했습니다. 자체 암호 알고리즘은 만들지 않았습니다.

React 19.2.6, vinext 1.0.0-beta.5, Vite 8.0.13, Wrangler 4.92.0을 사용합니다. 외부 인증 라이브러리·서비스를 선택하지 않았으며 Web Crypto는 런타임 표준 API라 별도 npm 버전이 없습니다. 정확한 의존성은 pnpm-lock.yaml에 고정돼 있습니다.

과제 6 최종 결과물은 같은 주소의 플랜두씨, 당시 Sites 저장 버전 19입니다. 당시 최종 commit은 393348c896948d800ef650b7510870a63e48a7f1입니다. 이번 제출 ZIP에 T06-최종소스.zip과 그 소스로 다시 빌드한 T06-최종결과물.zip을 함께 넣었습니다. 현재 공개 주소는 인증을 붙인 과제 7로 갱신되었습니다. Git 이력 source-history.bundle에서 이 commit의 조상 관계를 재현할 수 있습니다.

## ② 왜 그걸 골랐나

기존 Cloudflare Workers + D1 환경을 유지하고 인증과 자료 권한을 같은 서버에서 확인하기 위해서입니다. 표준 PBKDF2 연산, 무작위 16바이트 salt, 100,000회 SHA-512 반복으로 되돌릴 수 없는 값을 저장합니다. 계정마다 salt가 달라 같은 비밀번호도 다른 값이 됩니다.

Supabase Auth는 별도 서비스 연결·키 설정이 필요해 선택하지 않았습니다. JWT는 로그아웃 뒤 회수 목록 처리가 필요해 이번에는 서버 세션 삭제 방식으로 정했습니다. 반복 비용 강화나 Argon2id로의 전환은 이후 개선 사항이며 모든 실서비스에 충분하다고 주장하지 않습니다.

## ③ 어디를 어떻게 고쳤나

| 흐름 | 위치 | 처리 |
|---|---|---|
| 가입·로그인 화면 | app/auth-form.tsx, app/login/page.tsx | 비밀번호 입력 마스킹, 가입 후 로그인 |
| 가입 | app/api/auth/route.ts register | 중복 검사·유일 인덱스, 해시 저장 |
| 로그인 | app/api/auth/route.ts login; lib/auth.ts verify | 해시 검증, 없는 ID와 오답에 같은 401 안내 |
| 자료 화면 | app/page.tsx, app/diary/page.tsx | 서버 세션 확인, 비로그인은 /login |
| 세션 발급·확인 | lib/auth.ts session, userFromCookie, requireUser | 난수 쿠키·DB 해시·만료 확인 |
| 로그아웃 | app/api/auth/route.ts logout | DB 세션 제거·쿠키 만료 |
| 목록·읽기·수정·삭제 | app/api/state/route.ts GET, POST, load; lib/diary.ts find, ownedPlan | 확인된 세션 user_id만 사용, 외부 ID는 저장 전 404 |
| 동시 저장 | app/api/state/route.ts UPDATE | user_id와 revision 조건으로 충돌 시 409 |
| 비밀번호 변경 | app/api/auth/route.ts change_password | 현재 비밀번호 확인·해시 교체·모든 세션 회수 |
| 계정 삭제 | app/api/auth/route.ts delete_account | 해당 계정의 자료·세션·계정 삭제 |
| 내보내기·이전 | app/account-tools.tsx; lib/diary.ts importState | 본인 JSON 내보내기, 빈 계정에 기존 기록 변환 |
| 5일 관찰 | app/study-panel.tsx; lib/diary.ts save_study, change_rule | 서울 날짜 기록, 날짜 중복 처리, 변경 순서·근거 날짜 저장 |

세션은 32바이트 난수이며 DB에는 원문 대신 SHA-256 결과를 저장합니다. 쿠키는 HttpOnly, SameSite=Lax, HTTPS에서 Secure이고 발급 후 8시간에 절대 만료됩니다. 서버가 expires_at을 검사하며 세션 값을 URL에 넣지 않습니다. JWT 서명키는 필요하지 않습니다. 비밀번호 변경은 모든 기존 세션을 삭제합니다. 외부 Origin 요청은 거절하고 인증 시도는 IP 해시별 10분 30회로 제한합니다.

기존 계정 이전도 원본과 대조했습니다. 할 일 14개, 실행 7개, 수정 이력 4개의 내용·연결 관계가 현재 계정 자료에 남아 있습니다. 신규 할 일 2개와 실행 2개도 보존돼 있습니다. 에너지 패널을 제외하면서 원래 에너지 기록은 이전 공개 원본 보관본에 남으며 계정의 관찰 기록으로 바꾸지 않았습니다.

## ④ 안 열리는 것을 확인한 기록

시험 A·B는 무작위 검증 계정입니다. 비밀번호·세션 원문은 가렸으며 실제 5일 관찰로 간주하지 않습니다. 실제 빌드한 Worker + 로컬 D1의 HTTP 검증은 {ev['testCount']}건 통과했습니다. 서버 응답을 흉내 낸 테스트가 아닙니다.
'''
if prod: text+=f"\n공개 배포 주소에서도 같은 시험을 실행해 {prod['testCount']}건 통과했습니다. 시각은 {localtime(prod['runAt'])} (서울)입니다. 시험에서 만든 계정은 정리했고 본인 계정은 수정하지 않았습니다.\n"
else: text+='\n공개 배포 API 시험은 진행 중이거나 완결 증거가 아직 없으므로 완료로 적지 않습니다.\n'
text+='''
### 확인 1 — 가입·로그인·비로그인 차단

가입 201, 로그인 200, 중복 가입 409입니다. 비로그인 같은 /api/state 요청은 401이고 첫 화면 /는 /login으로 이동합니다. 본인 자료 요청 성공과 비로그인 거절을 대조했습니다.

### 확인 2 — 비밀번호 저장과 검증

동일한 시험 비밀번호 두 계정의 실제 DB 저장값은 아래처럼 다릅니다. 정상 비밀번호 로그인 200, 잘못된 비밀번호·없는 ID 로그인은 동일 401·동일 문구입니다. 원문은 제출하지 않습니다.
'''
for r in pw['rows']: text+=f"\n- 계정 {r['account']}: `{r['storedValue']}`\n"
text+='''
### 확인 3 — 세션 회수와 만료

같은 GET /api/state가 로그아웃 전 200, 로그아웃 뒤 같은 이전 쿠키로 401입니다. 비밀번호 변경 전 두 세션도 변경 후 모두 401입니다. 로컬 DB에서 시험 세션의 expires_at만 과거로 만든 뒤 요청해 만료 거절 401을 확인했습니다. 이는 만료 경계 검사이며 실제 8시간을 기다린 증거는 아닙니다.

### 확인 4 — 남의 자료 읽기·수정·삭제

본인 ID의 읽기·수정·삭제는 성공하고 A→B와 B→A의 외부 자료 ID 읽기·수정·삭제는 모두 404입니다. 거절 전후 상대 계정 자료 건수 1→1 및 payload 전체 동일을 대조했습니다.

### 확인 5 — 소유자 위조·목록 분리·계정 정리

URL·헤더의 타인 계정 값은 무시되어 본인 목록만 반환됩니다. 본문에 외부 계획 ID를 넣으면 404이고 본인 ID에 타인 owner를 적어도 본인 자료에서만 처리됩니다. 양쪽 목록에 상대 ID는 없습니다. 본인 내보내기는 200, 계정 삭제 뒤 이전 요청은 401이며 로컬 DB에서 계정 및 자료 행 제거도 확인했습니다.

### 성공·거절 요청과 응답

다음은 실제 로컬 시험 기록입니다. 각 HTTP 작업의 요청 방식·주소·소유자 관계와 응답을 보관했습니다. 전체 응답 및 시각은 첨부 JSON과 공개 소스 안 docs/auth-evidence.json에 있습니다.

| 검사 | 요청 | 응답 |
|---|---|---|
'''
for c in ev['checks']:
    req=json.dumps(c['request'],ensure_ascii=False,separators=(',',':')).replace('|','\\|')
    body=json.dumps(c['response']['body'],ensure_ascii=False,separators=(',',':')).replace('|','\\|')
    text+=f"| {c['name']} | `{req}` | {c['response']['status']} · `{body}` |\n"
text+='''
## ⑤ AI와 나

- AI에게 맡긴 일: [본인이 작성]
- 내가 직접 판단한 일: [본인이 작성]
- AI 제안을 따르지 않은 일과 이유(없다면 없었던 이유): [본인이 작성]

## ⑥ 아직 못 막은 것

| 남은 한계 | 위험·범위 |
|---|---|
| 비밀번호 재설정·두 번째 인증 수단 없음 | 잊은 비밀번호를 복구할 수 없고 노출 시 추가 방어가 없음 |
| IP 단위 인증 제한 | 분산 시도와 공유 IP 영향을 모두 막지 못함 |
| PBKDF2 비용·메모리 기반 해시 개선 | 현재 실행 환경을 고려한 비용이며 추가 강화 필요 |
| 원래 공개 자료와 외부 사본 | 새 계정 삭제는 계정 자료·세션·계정을 제거함. 과거 공개 원본 보관본과 내려받은 사본은 삭제 범위에 포함되지 않는다고 화면에 안내 |
| 전체 플랫폼 로그 감사 | 소스·제출 증거에 원문을 남기지 않음. 플랫폼 내부 로그 전수 감사는 수행하지 않음 |
| JSON 전체 문서 저장 | 동시 변경은 revision으로 보호. 대용량 확장은 행 단위 모델이 더 적합 |
| 실제 관찰 해석 | 5일의 공부 시간 변화가 규칙만의 영향이라고 단정할 수 없음 |

## 실제 5일 관찰과 직접 계산 대조

1일차부터 질문: 작은 할 일부터 시작하면 하루 실제 공부 시간을 늘릴 수 있을까요?
지표: 하루 실제 공부 시간. 단위: 분. 계산: 합계는 유효한 날짜별 분의 합, 평균은 합계÷유효 날짜 수이며 소수점 첫째 자리 반올림입니다.

결측은 입력 전까지 제외합니다. 쉬는 날은 실제 0분과 이유를 남기고 평균 분모에 포함합니다. 같은 서울 날짜는 한 건으로 수정하며 규칙 변경 근거인 1·2일차는 고정합니다. 0~1440의 유한한 숫자만 유효하고 빈 값·NaN·범위 밖은 거절합니다. 주 시작은 월요일입니다.

| 일차 | 서울 날짜 | 공부 시간 | 실제 메모 | 저장된 규칙 | 저장 시각(서울) |
|---|---|---|---|---|---|
'''
for i,l in enumerate(ob['logs'],1): text+=f"| {i}일차 | {l['date'].replace('-','.')} | {l['minutes']}분 | {l['note']} | {l['rule']} | {localtime(l['recordedAt'])} |\n"
c=ob['ruleChange']
text+=f'''
규칙은 ‘{c['oldRule']}’에서 ‘{c['newRule']}’로 바꿨습니다. 변경 시각은 {localtime(c['changedAt'])} (서울)입니다. 2일차 저장은 {localtime(ob['logs'][1]['recordedAt'])}, 3일차 저장은 {localtime(ob['logs'][2]['recordedAt'])}으로 그 사이에 변경이 있습니다.

근거는 1일차 2026.10.01의 120분·‘{ob['logs'][0]['note']}’, 2일차 2026.10.02의 180분·‘{ob['logs'][1]['note']}’입니다. 서버 변경 기록의 baselineDates가 이 두 날짜를 정확히 가리킵니다. 작성자가 남긴 이유 원문: ‘{c['reason']}’.

| 계산 | 손계산 | 화면 값 | 대조 |
|---|---|---|---|
| 전체 합계 | 120+180+300+270+120 = 990 | 990분 | 일치 |
| 전체 평균 | 990÷5 = 198 | 198분/일 | 일치 |
| 변경 전 평균 | (120+180)÷2 = 150 | 150분/일 | 일치 |
| 변경 후 평균 | (300+270+120)÷3 = 230 | 230분/일 | 일치 |
| 전후 평균 차이 | 230−150 = 80 | 위 두 평균에서 계산 | 80분/일 증가 |

날짜 5개·서버 저장 시각·변경 순서·원본 이전 관계를 scripts/verify-observation.py로 재검증했습니다. 제출받은 실제 화면 캡처와 위 네 표시값도 직접 대조했습니다. 입력 파일은 수정하지 않았습니다.

처음 질문의 ‘작은 할 일 먼저’와 실제 변경 규칙 ‘너무 조급해하지 않기’는 다릅니다. 질문을 뒤늦게 바꾸거나 실제 규칙을 바꿔 적지 않았습니다. 따라서 작은 할 일 먼저의 효과를 입증한 관찰이라고 주장할 수 없으며, 실제로 채택한 규칙 전후의 공부 시간 변화만 기록합니다. 이 판단은 관찰 해석의 한계이며 기록·단위·계산식은 동일합니다.

## 짧은 확인 방법 4줄

어디로 가나요: {base}/ (로그인 첫 화면), 소스는 {base}/source.html입니다.
세 단계 안에 무엇을 하나요: 새 시험 계정 가입 → 로그인 → 본인 할 일 추가.
무엇이 보이면 통과인가요: 본인 자료가 보이고 로그아웃 후 자료 주소는 로그인으로 이동합니다.
안 될 때는 무엇이 보이나요: 비로그인 API는 401, 다른 계정 자료 ID는 404입니다. 심사자는 제출자의 계정에 로그인할 필요가 없습니다.

## 과제 6 연결 자료

최종 T06 결과물은 위 사이트의 당시 버전 19입니다. 공개 원래 소스: {base}/t06-source.zip, 당시 최종 소스로 다시 빌드한 결과물: {base}/t06-result.zip. T07 제출 패키지에 두 파일과 원래 제출 주소·commit·버전 정보, 실제 부모를 포함한 Git bundle을 함께 넣습니다.

시점 확인의 범위: 3일차 관찰 저장 전 변경이라는 기록 순서는 충족합니다. 다만 같은 날 180분 공부 실행의 종료 시각(2026.10.03 20:14:11)은 규칙 변경(20:15:44)보다 빠릅니다. 이 자료만으로 3일차 공부 시작 전에 규칙을 바꾸고 공부 전체에 적용했다고 입증할 수는 없습니다. 채점에서 실제 사용 시작 전 변경을 요구하면 이 부분은 추가 설명 또는 새 관찰이 필요합니다. 날짜·시각을 소급 수정하지 않았습니다.

본인 판단 세 줄을 작성한 뒤 제출하세요. 인증 코드·공개 URL·실제 5일 증거·계산 대조는 위 자료에 정리했습니다.
'''
pathlib.Path('docs/인증구현설명서.md').write_text(text)
pathlib.Path('docs/auth-evidence.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n')
pathlib.Path('docs/password-evidence.json').write_text(json.dumps(pw,ensure_ascii=False,indent=2)+'\n')
if prod: pathlib.Path('docs/evidence/auth-production.json').write_text(json.dumps(prod,ensure_ascii=False,indent=2)+'\n')

# Minimal renderer with safe text and explicit links. The three author fields alone are editable.
out=[]; table=False; listing=False
def inline(s):
    value=html.escape(s)
    return re.sub(r'https://[A-Za-z0-9._~:/?#%&=+-]+',lambda m:'<a href="'+m.group(0).rstrip('.')+'">'+m.group(0).rstrip('.')+'</a>',value)
for line in text.splitlines():
    if line.startswith('|'):
        if not table: out.append('<div class="table-wrap"><table>'); table=True
        if set(line.replace('|','').replace(' ','').replace('-','').replace(':','')) == set(): continue
        out.append('<tr>'+''.join('<td>'+html.escape(x.strip())+'</td>' for x in line.strip('|').split(' | '))+'</tr>');continue
    if table: out.append('</table></div>');table=False
    if line.startswith('- '):
        if not listing: out.append('<ul>');listing=True
        if '[본인이 작성]' in line: out.append('<li>'+html.escape(line[2:].split('[본인이 작성]')[0])+'<span class="author-field" contenteditable="true" aria-label="본인 판단 작성">[본인이 작성]</span></li>')
        else: out.append('<li>'+inline(line[2:])+'</li>')
        continue
    if listing: out.append('</ul>');listing=False
    if line.startswith('#'):
        n=len(line)-len(line.lstrip('#'));out.append(f'<h{n}>'+html.escape(line[n:].strip())+f'</h{n}>')
    elif line: out.append('<p>'+inline(line)+'</p>')
if listing:out.append('</ul>')
if table:out.append('</table></div>')
styles='body{font:15px/1.8 system-ui;color:#334c60;background:#f1f8fc;margin:0}main{max-width:1100px;margin:32px auto;padding:32px;background:white;border-radius:22px}h1{font-size:28px;line-height:1.5}h2{font-size:22px;color:#377a9e;margin-top:36px;border-bottom:1px solid #dfedf5}h3{font-size:17px}p,li,td{overflow-wrap:anywhere}.table-wrap{overflow:auto}table{border-collapse:collapse;font-size:12px;width:100%;margin:16px 0}td{border:1px solid #dbe8ef;padding:10px;vertical-align:top}tr:first-child{background:#eaf5fb;font-weight:bold}a{color:#3283ad}.author-field{display:inline-block;min-width:250px;padding:6px;background:#fff7d6;border:1px dashed #bca35f}.toolbar{position:sticky;top:0;background:white;padding:12px;border-bottom:1px solid #dbe8ef}button{padding:10px;margin-right:10px;border-radius:8px;border:1px solid #b9d5e8;background:#eaf5fb;cursor:pointer}.screen{max-width:100%;height:auto}@media(max-width:640px){main{margin:0;padding:20px;border-radius:0}}@media print{.toolbar{display:none}body{background:white}main{margin:0;padding:0}.author-field{background:none;border:none}table{font-size:10px}h2{break-after:avoid}}'
js="""document.getElementById('save').addEventListener('click',()=>{if([...document.querySelectorAll('.author-field')].some(el=>!el.textContent.trim()||el.textContent.includes('[본인이 작성]'))){alert('⑤의 세 줄을 직접 작성해 주세요.');return;}const source='<!doctype html>\\n'+document.documentElement.outerHTML;const url=URL.createObjectURL(new Blob([source],{type:'text/html;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='플랜두씨_과제7_인증구현설명서_작성완료.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});document.getElementById('print').addEventListener('click',()=>window.print());"""
doc='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>플랜두씨 과제7 인증 구현 설명서</title><style>'+styles+'</style></head><body><div class="toolbar"><button id="save">⑤ 작성 후 HTML 저장</button><button id="print">인쇄 / PDF</button><span>⑤의 노란 칸만 직접 작성할 수 있습니다. 입력 후 HTML을 저장하세요.</span></div><main><a href="'+base+'/source.html">소스</a> · <a href="'+base+'/">다이어리</a>'+''.join(out)+'<h2>실제 관찰 화면 증거</h2><img class="screen" alt="실제 5일 관찰 기록 및 합계·평균 화면" src="'+base+'/observation-screen.png"></main><script>'+js+'</script></body></html>'
pathlib.Path('public/submission.html').write_text(doc)
print(json.dumps({'localChecks':ev['testCount'],'productionChecks':prod['testCount'] if prod else None,'report':'public/submission.html'},ensure_ascii=False))
