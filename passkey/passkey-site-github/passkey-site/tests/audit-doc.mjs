import fs from 'node:fs';
const h = fs.readFileSync('제출설명.html','utf8');
const sec = (a,b)=>{ const i=h.indexOf(a); const j=b?h.indexOf(b,i+1):h.length; return h.slice(i,j); };
const s3 = sec('<h2>③','<h2>④'), s4 = sec('<h2>④','<h2>⑤'), s5 = sec('<h2>⑤','<h2>⑥'), s6 = sec('<h2>⑥','<h2>시험 방법');
const quick = sec('<h2>짧은 확인 방법','<h2>①');
const edits = [...s5.matchAll(/<div class="edit" contenteditable="true">([\s\S]*?)<\/div>/g)].map(m=>m[1].trim());
const out = [];
const t=(id,ok,note)=>out.push(`${ok?'OK  ':'미완'} ${id} ${note}`);
t('C47', ['①','②','③','④','⑤','⑥'].every(c=>h.includes('<h2>'+c)), '여섯 항목 ①~⑥ 제목 존재');
t('C48', /직접 구현/.test(s3) && s3.includes('@simplewebauthn/server') && /사용하지 않은 것/.test(s3), '③에 직접 구현·라이브러리·인증 서비스 이름');
t('C49', ['등록','로그인','로그아웃','비공개 자료 조회'].every(k=>s3.includes('<td>'+k)), '③에 등록·로그인·로그아웃·비공개 조회 흐름');
t('C50', (s4.match(/<h3>확인 \d/g)||[]).length===4 && (s4.match(/<strong>통과한 요청/g)||[]).length===4 && (s4.match(/<strong>막힌 요청/g)||[]).length===4, '④ 확인 네 가지 각각 통과/거절 요청');
t('C51', (s6.match(/<li>/g)||[]).length>=1, `⑥ 못 막은 것 ${(s6.match(/<li>/g)||[]).length}개`);
t('C52', (quick.match(/<tr><td>\d /g)||[]).length===4 && ['어디로 가나요','세 단계 안에','무엇이 보이면 통과','안 될 때'].every(k=>quick.includes(k)), '짧은 확인 방법 4개, 칸 4가지');
t('C53', edits.length===3 && edits.every(e=>e.length>0), `⑤ 세 칸 중 채워진 칸 ${edits.filter(e=>e.length>0).length}/3 (AI에게 맡긴 일은 초안, 나머지는 본인 작성 필요)`);
t('C12', /실제 연락처|개인정보/.test(h) && h.includes('만들어 넣은 가짜 내용'), '가짜 내용이라는 문구 존재');
console.log(out.join('\n'));

