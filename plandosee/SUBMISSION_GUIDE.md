# 플랜두씨 제출 안내

이 압축파일은 현재 공개 중인 플랜두씨 사이트의 전체 원본 소스입니다.

## 제출할 주소

- 결과물 URL: https://planloop-study.ddho0216.chatgpt.site/
- 소스 URL: 이 압축파일의 `planloop` 폴더 안 파일 전체를 올린 GitHub 저장소 주소

## GitHub에 올리는 방법

1. 압축파일을 풉니다.
2. `planloop` 폴더 안으로 들어갑니다.
3. 폴더 자체가 아니라, 그 안의 파일과 폴더 전체를 GitHub 저장소 최상단에 올립니다.
4. GitHub 저장소 주소를 과제의 소스 URL 칸에 제출합니다.

## 꼭 알아둘 점

이 프로젝트는 서버 데이터베이스(D1)를 사용하는 전체 웹 애플리케이션입니다. 따라서 GitHub Pages에서 그대로 실행되는 `index.html` 프로젝트가 아닙니다. GitHub는 소스 공개용으로 사용하고, 실제 동작 확인은 위 결과물 URL에서 합니다.

## 주요 소스 위치

- `app/planner.tsx`: 플래너 화면과 사용자 기능
- `app/globals.css`: 하늘·구름·날개 콘셉트 디자인
- `app/api/state/route.ts`: 계획, 할 일, 실행 기록, 에너지 저장 API
- `db/schema.ts`: 데이터베이스 구조
- `drizzle/`: 데이터베이스 변경 기록
- `public/`: 배경 이미지와 날개 아이콘
