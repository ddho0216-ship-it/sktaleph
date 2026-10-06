import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import {globSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const base=process.env.TEST_ORIGIN||'http://127.0.0.1:8787';
const report=[], suffix=randomBytes(5).toString('hex'), password=randomBytes(22).toString('base64url');
function record(name,response,request){report.push({name,request,response:{status:response.status,body:response.body},checkedAt:new Date().toISOString()});}
async function call(path,body,cookie='',headers={}){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...headers},...(body?{body:JSON.stringify(body)}:{}) ,redirect:'manual',signal:AbortSignal.timeout(20000)});const raw=await r.text();let b;try{b=JSON.parse(raw)}catch{b=raw.slice(0,120)}return {status:r.status,body:b,cookie:r.headers.get('set-cookie')?.split(';')[0]||'',headers:r.headers};}
const users=[];
const anon=await call('/api/state');assert.equal(anon.status,401);record('비로그인 직접 목록 요청 거절',anon,{method:'GET',path:'/api/state'});
const root=await call('/');assert.ok([302,303,307].includes(root.status));assert.equal(root.headers.get('location'),'/login');record('비로그인 자료 화면은 로그인으로 이동',root,{method:'GET',path:'/'});
for(const label of ['A','B']){
 const username=`audit_${label.toLowerCase()}_${suffix}`;
 const reg=await call('/api/auth',{action:'register',username,password});assert.equal(reg.status,201);record(`계정 ${label} 가입`,reg,{method:'POST',path:'/api/auth',action:'register',username:label,password:'[가림]'});
 const login=await call('/api/auth',{action:'login',username,password});assert.equal(login.status,200);assert.ok(login.cookie);assert.match(login.headers.get('set-cookie'),/HttpOnly/);assert.match(login.headers.get('set-cookie'),/SameSite=Lax/);if(base.startsWith('https:'))assert.match(login.headers.get('set-cookie'),/Secure/);record(`계정 ${label} 로그인`,login,{action:'login',username:label,password:'[가림]'});
 const state=await call('/api/state',null,login.cookie);assert.equal(state.status,200);assert.equal(state.body.tasks.length,0);
 const planId=state.body.plan.id;
 const add=await call('/api/state',{action:'add_task',planId,title:`계정 ${label} 전용 검증 자료`,plannedDate:'2026-10-01',estimatedMinutes:20,priority:2},login.cookie);assert.equal(add.status,200);
 const updated=await call('/api/state',null,login.cookie);const taskId=updated.body.tasks[0].id;users.push({label,username,cookie:login.cookie,planId,taskId});
 record(`계정 ${label} 자료 등록`,add,{action:'add_task',planId,title:`계정 ${label} 전용 검증 자료`});
}
const duplicate=await call('/api/auth',{action:'register',username:users[0].username,password});assert.equal(duplicate.status,409);record('같은 아이디 중복 가입 거절',duplicate,{action:'register',username:'A',password:'[가림]'});
const correct=await call('/api/auth',{action:'login',username:users[0].username,password});assert.equal(correct.status,200);record('올바른 비밀번호 성공',correct,{action:'login',username:'A',password:'[가림]'});
const sqlitePath=globSync('.wrangler/state/v3/d1/**/*.sqlite')[0];
if(sqlitePath&&base.startsWith("http://127.0.0.1")){const database=new DatabaseSync(sqlitePath,{readOnly:true});const rows=database.prepare('SELECT username,password_hash FROM auth_users WHERE username IN (?,?)').all(users[0].username,users[1].username);assert.equal(rows.length,2);assert.notEqual(rows[0].password_hash,rows[1].password_hash);await writeFile('outputs/password-evidence.json',JSON.stringify({algorithm:'PBKDF2-HMAC-SHA512',iterations:100000,sameInputPassword:true,differentStoredValues:true,rows:rows.map((r,i)=>({account:i?'B':'A',storedValue:r.password_hash})),rawPassword:'[가림]'},null,2));database.close();}
if(sqlitePath&&base.startsWith('http://127.0.0.1')){const expiredLogin=await call('/api/auth',{action:'login',username:users[0].username,password});assert.equal(expiredLogin.status,200);const database=new DatabaseSync(sqlitePath);const hash=createHash('sha256').update(expiredLogin.cookie.split('=')[1]).digest('hex');database.prepare('UPDATE auth_sessions SET expires_at=? WHERE token_hash=?').run(Date.now()-1,hash);database.close();const expired=await call('/api/state',null,expiredLogin.cookie);assert.equal(expired.status,401);record('로컬 만료 세션 요청 거절',expired,{method:'GET',path:'/api/state',session:'[가림]',fixture:'LOCAL_DB_EXPIRES_AT_IN_PAST'});}
for(const [actor,target] of [[users[0],users[1]],[users[1],users[0]]]){
 const original=await call('/api/state',null,target.cookie);
 const ok=await call('/api/state?id='+actor.taskId,null,actor.cookie);assert.equal(ok.status,200);record(`${actor.label} 본인 자료 읽기 성공`,ok,{method:'GET',path:'/api/state?id='+actor.taskId,session:'[가림]'});
 const read=await call('/api/state?id='+target.taskId,null,actor.cookie);assert.equal(read.status,404);record(`${actor.label}→${target.label} 읽기 거절`,read,{method:'GET',path:'/api/state?id='+target.taskId,session:'[가림]'});
 for(const action of ['update_task','delete_task']){const body={action,id:target.taskId,title:'허용되면 안 되는 변경',plannedDate:'2026-10-01',estimatedMinutes:20,priority:2};const denied=await call('/api/state',body,actor.cookie);assert.equal(denied.status,404);record(`${actor.label}→${target.label} ${action} 거절`,denied,{method:'POST',path:'/api/state',...body,session:'[가림]'});}
 const spoof=await call('/api/state?userId='+target.username+'&owner='+target.username,null,actor.cookie,{'x-user-id':target.username});assert.equal(spoof.status,200);assert.deepEqual(spoof.body.tasks.map(t=>t.id),[actor.taskId]);record(`${actor.label} 주소·헤더 소유자 위조는 무시됨`,{...spoof,body:{taskIds:spoof.body.tasks.map(t=>t.id)}},{path:'/api/state?userId='+target.username,headers:{'x-user-id':target.username},session:'[가림]'});
 const after=await call('/api/state',null,target.cookie);assert.deepEqual(after.body,original.body);record(`${target.label} 거절 전후 자료 건수·내용 동일`,{status:200,body:{beforeCount:original.body.tasks.length,afterCount:after.body.tasks.length,payloadUnchanged:true}},{actor:actor.label,target:target.label});
 const list=await call('/api/state',null,actor.cookie);assert.equal(list.body.tasks.some(t=>t.id===target.taskId),false);record(`${actor.label} 목록에 ${target.label} 자료 없음`,{...list,body:{taskIds:list.body.tasks.map(t=>t.id)}},{method:'GET',path:'/api/state',session:'[가림]'});
 const ownUpdate=await call('/api/state',{action:'update_task',id:actor.taskId,title:`계정 ${actor.label} 전용 검증 자료 수정`,plannedDate:'2026-10-01',estimatedMinutes:20,priority:2},actor.cookie);assert.equal(ownUpdate.status,200);record(`${actor.label} 본인 자료 수정 성공`,ownUpdate,{action:'update_task',id:actor.taskId});
}
const A=users[0], B=users[1];
const bodySpoof=await call('/api/state',{action:'add_task',planId:B.planId,userId:B.username,owner:B.username,title:'외부 소유자 위조',plannedDate:'2026-10-01',estimatedMinutes:20},A.cookie);assert.equal(bodySpoof.status,404);record('본문 소유자 위조와 외부 계획 추가 거절',bodySpoof,{action:'add_task',planId:B.planId,userId:B.username,owner:B.username});
const ownSpoof=await call('/api/state',{action:'update_task',id:A.taskId,planId:A.planId,userId:B.username,owner:B.username,title:'계정 A 전용 검증 자료 수정',plannedDate:'2026-10-01',estimatedMinutes:20,priority:2},A.cookie);assert.equal(ownSpoof.status,200);const ownerAfter=await call('/api/state',null,A.cookie);assert.equal(ownerAfter.body.tasks[0].id,A.taskId);record('본문 타인 소유자 값은 본인 자료 소유권을 바꾸지 않음',ownSpoof,{action:'update_task',id:A.taskId,userId:'B',owner:'B'});
const wrong=await call('/api/auth',{action:'login',username:A.username,password:randomBytes(20).toString('hex')});
const missing=await call('/api/auth',{action:'login',username:'missing_'+suffix,password:randomBytes(20).toString('hex')});assert.equal(wrong.status,401);assert.equal(missing.status,401);assert.deepEqual(wrong.body,missing.body);record('잘못된 비밀번호 안내',wrong,{action:'login',username:'A',password:'[가림]'});record('없는 아이디 안내',missing,{action:'login',username:'없는 시험 아이디',password:'[가림]'});
const csrf=await call('/api/state',{action:'delete_task',id:A.taskId},A.cookie,{origin:'https://unrelated.example'});assert.equal(csrf.status,403);record('외부 Origin 변경 요청 거절',csrf,{origin:'https://unrelated.example',action:'delete_task'});
for(const invalid of ['',null,'NaN',-1,1441]){const r=await call('/api/state',{action:'save_study',minutes:invalid,note:'검증용 입력'},A.cookie);assert.equal(r.status,400);record('유효하지 않은 공부 시간 거절',r,{minutes:invalid});}
const premature=await call('/api/state',{action:'change_rule',newRule:'짧은 일 먼저',reason:'검증'},A.cookie);assert.equal(premature.status,409);record('2일차 이전 규칙 변경 거절',premature,{action:'change_rule'});
const exportData=await call('/api/state?export=1',null,A.cookie);assert.equal(exportData.status,200);assert.ok(exportData.body.plan);assert.ok(!JSON.stringify(exportData.body).includes('password_hash'));record('전체 자료 내보내기에 인증 값 없음',{...exportData,body:{plan:true,tasks:exportData.body.tasks.length,authFields:false}},{method:'GET',path:'/api/state?export=1'});
const second=await call('/api/auth',{action:'login',username:A.username,password});assert.equal(second.status,200);
const changed=await call('/api/auth',{action:'change_password',password,newPassword:(globalThis.changedPassword=randomBytes(22).toString('base64url'))},A.cookie);assert.equal(changed.status,200);record('비밀번호 변경 성공',changed,{action:'change_password',password:'[가림]',newPassword:'[가림]'});
for(const oldCookie of [A.cookie,second.cookie]){const expired=await call('/api/state',null,oldCookie);assert.equal(expired.status,401);record('비밀번호 변경 후 기존 세션 거절',expired,{path:'/api/state',session:'[가림]'});}
const relogin=await call('/api/auth',{action:'login',username:A.username,password:globalThis.changedPassword});assert.equal(relogin.status,200);
const deleteAccount=await call('/api/auth',{action:'delete_account',password:globalThis.changedPassword},relogin.cookie);assert.equal(deleteAccount.status,200);record('계정 삭제 성공',deleteAccount,{action:'delete_account',password:'[가림]'});
if(sqlitePath&&base.startsWith('http://127.0.0.1')){const database=new DatabaseSync(sqlitePath,{readOnly:true});assert.equal(database.prepare('SELECT COUNT(*) AS n FROM auth_users WHERE username=?').get(A.username).n,0);assert.equal(database.prepare('SELECT COUNT(*) AS n FROM private_diaries WHERE user_id NOT IN (SELECT id FROM auth_users)').get().n,0);database.close();record('로컬 계정 삭제 후 계정·자료 행 제거 확인',{status:200,body:{accountRows:0,orphanDiaryRows:0}},{fixture:'LOCAL_DB_READ_ONLY'});}
const deletedSession=await call('/api/state',null,relogin.cookie);assert.equal(deletedSession.status,401);record('계정 삭제 후 세션 거절',deletedSession,{session:'[가림]'});
const deleteOwn=await call('/api/state',{action:'delete_task',id:B.taskId},B.cookie);assert.equal(deleteOwn.status,200);record('본인 자료 삭제 성공',deleteOwn,{action:'delete_task',id:B.taskId});
const beforeLogout=await call('/api/state',null,B.cookie);record('로그아웃 전 동일 요청 성공',{...beforeLogout,body:{taskCount:beforeLogout.body.tasks.length}},{method:'GET',path:'/api/state',session:'[가림]'});
const logout=await call('/api/auth',{action:'logout'},B.cookie);assert.equal(logout.status,200);record('로그아웃',logout,{action:'logout',session:'[가림]'});
const replay=await call('/api/state',null,B.cookie);assert.equal(replay.status,401);record('로그아웃 후 같은 세션 같은 요청 거절',replay,{method:'GET',path:'/api/state',session:'[가림]'});
const cleanupLogin=await call('/api/auth',{action:'login',username:B.username,password});assert.equal(cleanupLogin.status,200);const cleanup=await call('/api/auth',{action:'delete_account',password},cleanupLogin.cookie);assert.equal(cleanup.status,200);record('시험 B 계정·자료 정리',cleanup,{action:'delete_account',password:'[가림]'});
const serialized=JSON.stringify(report);assert.equal(serialized.includes(password),false);assert.equal(serialized.includes(A.cookie),false);assert.equal(serialized.includes(B.cookie),false);
await writeFile(process.env.EVIDENCE_FILE||'outputs/auth-evidence.json',JSON.stringify({origin:base,runAt:new Date().toISOString(),testCount:report.length,checks:report},null,2));
console.log(JSON.stringify({passed:report.length,origin:base,credentials:'omitted'}));
