# 배포 순서 (Cloudflare 무료, 카드 필요 없음)

목표: `https://….workers.dev` 로 시작하는 공개 주소 하나 얻기. 이 주소가 제출물의 "결과물 URL"(C01)입니다.

## 1. Cloudflare 무료 계정 만들기 (직접)
1. https://dash.cloudflare.com/sign-up 에서 이메일과 비밀번호로 가입합니다.
2. 메일로 온 인증 링크를 눌러 이메일을 확인합니다. (도메인 구입이나 카드 등록은 하지 않습니다.)

## 2. 터미널에서 로그인 (직접)
이 폴더(`passkey-site`)에서 터미널을 열고 한 줄씩 실행합니다.

```bash
npm install
```
```bash
npx wrangler login
```
브라우저가 열리면 "Allow(허용)"을 누릅니다.

## 3. 배포
```bash
npm run deploy
```
- 처음에는 "workers.dev 주소 이름을 정하세요"라고 물을 수 있습니다. 영문 소문자로 아무 이름이나 정합니다.
- 데이터 저장소(D1) `passkey-db`를 자동으로 만들겠느냐고 물으면 **Yes**.
- 끝나면 `https://passkey-intro.<내이름>.workers.dev` 같은 주소가 출력됩니다. 그 주소가 결과물 URL입니다.

> D1 자동 생성이 안 되고 오류가 나면:
> ```bash
> npx wrangler d1 create passkey-db
> ```
> 출력된 `database_id` 값을 `wrangler.jsonc`의 `d1_databases` 항목에 `"database_id": "붙여넣기"`로 추가한 뒤 다시 `npm run deploy`.

## 4. 열어서 확인
- 주소를 열면 로그인 없이 소개 페이지가 보여야 합니다.
- 맨 아래 보라색 점선 칸에서 "패스키 만들기"가 되는지 확인합니다. (폰이나 노트북의 지문·PIN 사용)
- 확인되면 주소를 알려 주세요. 같은 시험을 공개 주소에 대해 다시 돌려서 설명서에 반영합니다.

## 5. 소스 URL 만들기 (C02)
소스 주소도 HTTPS 주소 하나가 필요하고, 로그인 없이 열려야 합니다(C03). 가장 쉬운 방법은 **공개(Public) GitHub 저장소**에 이 폴더를 올리고 그 저장소 주소를 내는 것입니다. 저장소는 반드시 Public으로 만드세요. `node_modules`와 `.wrangler`는 `.gitignore`에 들어 있어 올라가지 않습니다.

## 제출 전 확인
- 결과물 URL, 소스 URL 모두 시크릿 창에서 로그인 없이 열리는지 확인
- `제출설명.html` 의 ⑤ 노란 칸(내가 직접 판단한 일 / AI 제안을 따르지 않은 일)을 직접 쓰고 "HTML 저장"
