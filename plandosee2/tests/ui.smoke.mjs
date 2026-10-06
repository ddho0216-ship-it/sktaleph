import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const username='ui_'+randomBytes(4).toString('hex'),password=randomBytes(22).toString('base64url');
try{
 await mkdir('outputs',{recursive:true});await page.goto('http://127.0.0.1:8787/');await page.waitForURL('**/login');await page.getByRole('heading',{name:'다시 만나 반가워요'}).waitFor();await page.screenshot({path:'outputs/login-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'회원가입',exact:true}).click();await page.locator('input[name=username]').fill(username);await page.locator('input[name=password]').fill(password);await page.locator('input[name=confirmation]').fill(password);await page.getByRole('button',{name:'회원가입',exact:true}).last().click();await page.getByText('가입되었습니다. 로그인해 주세요.').waitFor();await page.locator('input[name=password]').fill(password);await page.getByRole('button',{name:'내 다이어리 열기'}).click();await page.waitForURL('http://127.0.0.1:8787/');await page.getByRole('heading',{name:'나의 공부 계획'}).waitFor();
 const close=page.getByRole('button',{name:'오늘 하루 안 보기'});if(await close.count())await close.click();
 await page.screenshot({path:'outputs/diary-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'할 일 추가',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.locator('input').first().fill('브라우저 검증용 공부');await dialog.getByRole('button',{name:'할 일 추가',exact:true}).click();await page.getByText('브라우저 검증용 공부',{exact:true}).waitFor();
 await page.getByRole('button',{name:'로그아웃',exact:true}).click();await page.waitForURL('**/login');await page.goto('http://127.0.0.1:8787/diary');await page.waitForURL('**/login');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'outputs/login-mobile.png',fullPage:true});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);assert.deepEqual(errors,[]);console.log(JSON.stringify({ui:'passed',errors,overflow}));
 await writeFile('outputs/ui-evidence.json',JSON.stringify({ui:'passed',errors,overflow,checks:['root redirect','register','login','protected planner','task add','logout','diary direct redirect','mobile overflow']},null,2));
}finally{await browser.close();}
