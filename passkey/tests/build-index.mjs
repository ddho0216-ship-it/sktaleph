// 1번 과제 원본(source/intro-original.html)은 한 글자도 바꾸지 않고, 세 군데에 추가분만 끼워 넣어 public/index.html 을 만든다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const orig = rd('source/intro-original.html');
const css = rd('source/private-style.css');
const sec = rd('source/private-section.html');

const once = (s, needle) => { if (s.split(needle).length !== 2) throw new Error('끼워 넣을 자리가 하나가 아닙니다: ' + needle); };
['</style>\n</head>', '</main>', '</body>'].forEach((n) => once(orig, n));
const out = orig
  .replace('</style>\n</head>', `\n${css}</style>\n</head>`)
  .replace('</main>', `\n${sec}</main>`)
  .replace('</body>', '<script src="/app.js"></script>\n</body>');
fs.writeFileSync(path.join(ROOT, 'public/index.html'), out);

// 원본이 그대로 남아 있는지 확인: 추가분을 빼면 원본과 같아야 한다
const restored = out.replace(`\n${css}`, '').replace(`\n${sec}`, '').replace('<script src="/app.js"></script>\n', '');
const same = restored === orig;
console.log('원본 SHA-256', crypto.createHash('sha256').update(orig).digest('hex'));
console.log('추가분을 빼면 원본과 동일:', same);
if (!same) process.exit(1);
