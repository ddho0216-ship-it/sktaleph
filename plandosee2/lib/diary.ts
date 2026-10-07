import { HttpError } from './auth';
// Stored JSON is validated at the import boundary and at each mutation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type Diary = {plan:Row;tasks:Row[];executions:Row[];versions:Row[];energyLogs:Row[];studyLogs:Row[];ruleChanges:Row[];observation:Row};
export const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const id=()=>Number(BigInt('0x'+crypto.randomUUID().replaceAll('-','').slice(0,13)));
export function empty():Diary {
  const now=new Date().toISOString(),today=day();
  const plan={id:id(),title:'나의 공부 계획',startDate:today,endDate:today>'2026-10-24'?today:'2026-10-24',successCriteria:'매일 작은 공부 한 가지를 실행하고 돌아보기',estimatedMinutes:60,priority:'오늘 해낼 수 있는 한 가지',priorityLevel:2,nextAdjustment:'',createdAt:now,updatedAt:now};
  return {plan,tasks:[],executions:[],versions:[{id:id(),planId:plan.id,snapshot:JSON.stringify(plan),createdAt:now}],energyLogs:[],studyLogs:[],ruleChanges:[],observation:{question:'작은 할 일부터 시작하면 하루 실제 공부 시간을 늘릴 수 있을까요?',metric:'하루 실제 공부 시간',unit:'분',calculation:'합계 = 유효한 날짜의 분 합. 평균 = 합계 ÷ 유효한 날짜 수. 소수점 첫째 자리 반올림.',initialRule:'예상 시간이 긴 할 일부터 시작하기'}};
}
export function text(value:unknown,max=2000){return String(value??'').trim().slice(0,max);}
export function numeric(value:unknown,max=1440,min=0){const n=Number(value);if(!Number.isFinite(n)||n<min||n>max)throw new HttpError(400,'시간은 범위 안의 숫자로 입력해 주세요.');return n;}
export function date(value:unknown){const s=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw new HttpError(400,'날짜를 확인해 주세요.');return s;}
export function find(rows:Row[],value:unknown){const row=rows.find(r=>r.id===Number(value));if(!row)throw new HttpError(404,'자료를 찾을 수 없습니다.');return row;}
export function ownedPlan(d:Diary,value:unknown){if(d.plan.id!==Number(value))throw new HttpError(404,'자료를 찾을 수 없습니다.');}
export function importState(raw:unknown):Diary {
  if(!raw||typeof raw!=='object')throw new HttpError(400,'플랜두씨 JSON 파일을 확인해 주세요.');
  const s=raw as Diary;if(!s.plan||!Array.isArray(s.tasks)||!Array.isArray(s.executions)||!Array.isArray(s.versions))throw new HttpError(400,'플랜두씨 JSON 파일을 확인해 주세요.');
  if(s.tasks.length>2000||s.executions.length>2000||s.versions.length>2000)throw new HttpError(400,'자료가 너무 많습니다.');
  const now=new Date().toISOString(),base=empty(),plan={...base.plan,id:id(),title:text(s.plan.title,160),startDate:date(s.plan.startDate),endDate:date(s.plan.endDate),successCriteria:text(s.plan.successCriteria),estimatedMinutes:numeric(s.plan.estimatedMinutes,1000000,1),priority:text(s.plan.priority),priorityLevel:2,nextAdjustment:text(s.plan.nextAdjustment),createdAt:now,updatedAt:now};
  const mapped=new Map<number,number>();
  const tasks=s.tasks.map(t=>{const taskId=id();mapped.set(Number(t.id),taskId);return {id:taskId,planId:plan.id,title:text(t.title,160),status:['todo','progress','done'].includes(t.status)?t.status:'todo',estimatedMinutes:numeric(t.estimatedMinutes,1440,1),priority:[1,2,3].includes(t.priority)?t.priority:2,tags:text(t.tags,200),plannedDate:date(t.plannedDate),dueDate:t.dueDate?date(t.dueDate):null,createdAt:now,updatedAt:now};});
  const executions=s.executions.filter(e=>mapped.has(Number(e.taskId))).map(e=>({id:id(),taskId:mapped.get(Number(e.taskId)),taskTitle:tasks.find(t=>t.id===mapped.get(Number(e.taskId)))?.title||'',startedAt:new Date(e.startedAt).toISOString(),endedAt:new Date(e.endedAt).toISOString(),durationMinutes:numeric(e.durationMinutes,1440,1),reason:text(e.reason),createdAt:now}));
  return {...base,plan,tasks,executions,versions:s.versions.map(v=>({id:id(),planId:plan.id,snapshot:JSON.stringify(JSON.parse(v.snapshot)),createdAt:new Date(v.createdAt).toISOString()}))};
}
export function mutate(d:Diary,b:Row){
  const now=new Date().toISOString(),action=b.action;
  if(action==='save_plan'){
    ownedPlan(d,b.id);const snapshot={title:text(b.title,160),startDate:date(b.startDate),endDate:date(b.endDate),successCriteria:text(b.successCriteria),estimatedMinutes:numeric(b.estimatedMinutes,1000000,1),priority:text(b.priority),priorityLevel:numeric(b.priorityLevel||2,3,1),nextAdjustment:text(b.nextAdjustment)};
    if(!snapshot.title||!snapshot.successCriteria||snapshot.startDate>snapshot.endDate)throw new HttpError(400,'계획의 제목·기간·성공 기준을 확인해 주세요.');Object.assign(d.plan,snapshot,{updatedAt:now});d.versions.push({id:id(),planId:d.plan.id,snapshot:JSON.stringify(snapshot),createdAt:now});
  }else if(action==='add_task'||action==='update_task'){
    if(action==='add_task')ownedPlan(d,b.planId);const target=action==='update_task'?find(d.tasks,b.id):{id:id(),planId:d.plan.id,createdAt:now};
    const value={title:text(b.title,160),status:b.status||'todo',estimatedMinutes:numeric(b.estimatedMinutes,1440,1),priority:numeric(b.priority||2,3,1),tags:text(b.tags,200),plannedDate:date(b.plannedDate),dueDate:b.dueDate?date(b.dueDate):null,updatedAt:now};
    if(!value.title||!['todo','progress','done'].includes(value.status)||value.dueDate&&value.dueDate<value.plannedDate)throw new HttpError(400,'할 일의 제목·상태·날짜를 확인해 주세요.');Object.assign(target,value);if(action==='add_task')d.tasks.push(target);
  }else if(action==='delete_task'){const task=find(d.tasks,b.id);d.tasks=d.tasks.filter(t=>t!==task);d.executions=d.executions.filter(e=>e.taskId!==task.id);}
  else if(action==='complete_task'){
    const task=find(d.tasks,b.id),duration=numeric(b.durationMinutes,1440,1),endedAt=new Date(b.endedAt||now).toISOString(),startedAt=new Date(b.startedAt||Date.parse(endedAt)-duration*60000).toISOString();
    if(startedAt>endedAt)throw new HttpError(400,'시작과 종료 시간을 확인해 주세요.');task.status='done';task.updatedAt=now;const old=d.executions.find(e=>e.taskId===task.id),value={taskId:task.id,taskTitle:task.title,startedAt,endedAt,durationMinutes:duration,reason:text(b.reason),createdAt:now};if(old)Object.assign(old,value);else d.executions.push({id:id(),...value});
  }else if(action==='reopen_task'){find(d.tasks,b.id).status='progress';}
  else if(action==='save_reflection'){ownedPlan(d,b.id);d.plan.nextAdjustment=text(b.nextAdjustment);d.plan.updatedAt=now;}
  else if(action==='save_energy'){throw new HttpError(400,'에너지 기록 기능은 사용하지 않습니다.');}
  else if(action==='save_study'){
    if(b.minutes===undefined||b.minutes===null||b.minutes==='')throw new HttpError(400,'공부 시간을 입력해 주세요.');
    const today=day(),value=numeric(b.minutes,1440),note=text(b.note);if(!note)throw new HttpError(400,'오늘 실제로 한 공부를 한 줄 적어 주세요.');
    if(d.studyLogs.length>=5&&!d.studyLogs.some(l=>l.date===today))throw new HttpError(400,'5일 관찰이 끝났습니다. 결과를 내보내 주세요.');
    if(d.studyLogs.length===2&&!d.ruleChanges.length&&!d.studyLogs.some(l=>l.date===today))throw new HttpError(409,'3일차 기록 전에 계획 규칙을 하나 바꿔 주세요.');
    const old=d.studyLogs.find(l=>l.date===today);if(old&&d.ruleChanges.some(r=>r.baselineDates.includes(today)))throw new HttpError(409,'규칙 변경에 사용한 1·2일차 기록은 고정됩니다.');
    const item={date:today,minutes:value,note,recordedAt:old?.recordedAt||now,updatedAt:now,rule:d.ruleChanges[0]?.newRule||d.observation.initialRule};if(old)Object.assign(old,item);else d.studyLogs.push(item);d.studyLogs.sort((a,b)=>a.date.localeCompare(b.date));
  }else if(action==='change_rule'){
    if(d.studyLogs.length!==2||d.ruleChanges.length||day()<=d.studyLogs[1].date)throw new HttpError(409,'2일차 기록 다음 날, 3일차 기록을 넣기 전에 바꿔 주세요.');
    const reason=text(b.reason),newRule=text(b.newRule,200);if(!reason||!newRule||newRule===d.observation.initialRule)throw new HttpError(400,'바꿀 규칙과 이유를 입력해 주세요.');
    d.ruleChanges.push({id:id(),changedAt:now,oldRule:d.observation.initialRule,newRule,reason,baselineDates:d.studyLogs.map(l=>l.date)});
  }else throw new HttpError(400,'알 수 없는 요청입니다.');
}
