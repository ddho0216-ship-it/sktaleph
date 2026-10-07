"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BatteryCharging, CalendarDays, Check, ChevronLeft, ChevronRight, Cloud, Feather, History, ListChecks, Pencil, RefreshCcw, Search, Sparkles, Target, Trash2 } from "lucide-react";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";

type Plan = { id:number; title:string; startDate:string; endDate:string; successCriteria:string; estimatedMinutes:number; priority:string; priorityLevel:number; nextAdjustment:string; createdAt:string; updatedAt:string };
type Task = { id:number; planId:number; title:string; status:"todo"|"progress"|"done"; estimatedMinutes:number; priority:number; tags:string; plannedDate:string; dueDate:string|null; createdAt:string; updatedAt:string };
type Execution = { id:number; taskId:number; taskTitle:string; startedAt:string; endedAt:string; durationMinutes:number; reason:string; createdAt:string };
type Version = { id:number; planId:number; snapshot:string; createdAt:string };
type EnergyLog = { id:number; logDate:string; percent:number; createdAt:string; updatedAt:string };
type State = { plan:Plan|null; tasks:Task[]; executions:Execution[]; versions:Version[]; energyLogs:EnergyLog[] };

const statusText = { todo:"할 일", progress:"진행 중", done:"완료" };
const statusTone = { todo:"bg-slate-100 text-slate-700", progress:"bg-amber-100 text-amber-800", done:"bg-emerald-100 text-emerald-800" };
const priorityText = ["", "높음", "보통", "낮음"];
const fmt = (iso:string) => new Intl.DateTimeFormat("ko-KR", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" }).format(new Date(iso));
const minutes = (value:number) => value >= 60 ? `${Math.floor(value/60)}시간 ${value%60 ? `${value%60}분` : ""}` : `${value}분`;
const DAY_MS = 24 * 60 * 60 * 1000;
const localDate = (value:string) => { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); };
const localDayKey = () => { const value = new Date(); return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`; };
const dateKey = (value:Date) => `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`;
const shiftDay = (value:string, amount:number) => { const date=localDate(value); date.setDate(date.getDate()+amount); return dateKey(date); };
const dayTitle = (value:string) => new Intl.DateTimeFormat("ko-KR", { year:"numeric", month:"long", day:"numeric", weekday:"short" }).format(localDate(value));
const dayRelation = (value:string) => value===localDayKey() ? "오늘" : value===shiftDay(localDayKey(),1) ? "내일" : value<localDayKey() ? "지난 날짜" : "예정";
const energyMessage = (value:number) => value < 10 ? "오늘은 쉬는 것도 좋아요. 회복도 계획의 일부예요." : value < 30 ? "조금만 힘내서 가장 작은 일 하나만 해볼까요?" : value < 50 ? "가벼운 일부터 시작하면 흐름이 생길 거예요." : value < 70 ? "집중할 일 하나와 짧은 일 하나면 충분해요." : value < 90 ? "좋은 에너지예요. 중요한 일을 먼저 잡아볼까요?" : value < 100 ? "오늘의 기세가 좋아요. 계획을 시원하게 밀어봐요." : "정말 럭키한 하루네요. 오늘을 더 재미있게 보내볼까요?";

async function request(body?:Record<string, unknown>) {
  const response = await fetch("/api/state", body ? { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body) } : { cache:"no-store" });
  const data = await response.json() as State & { error?:string };
  if (!response.ok) throw new Error(data.error ?? "요청을 처리하지 못했습니다.");
  return data;
}

export function Planner() {
  const [data, setData] = useState<State|null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("priority");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [completeTask, setCompleteTask] = useState<Task|null>(null);
  const [editTask, setEditTask] = useState<Task|null>(null);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("tasks");
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [energy, setEnergy] = useState(50);
  const [selectedTaskDate, setSelectedTaskDate] = useState(localDayKey);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const load = useCallback(async () => {
    try { setError(""); setData(await request()); }
    catch (e) { setError(e instanceof Error ? e.message : "자료를 불러오지 못했습니다."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!data?.plan) return;
    setEnergy(data.energyLogs.find(item=>item.logDate===localDayKey())?.percent ?? 50);
    if (localStorage.getItem("planloop-welcome-dismissed") !== localDayKey()) setWelcomeOpen(true);
  }, [data?.plan?.id]);

  const mutate = useCallback(async (body:Record<string, unknown>, success:string) => {
    setBusy(true);
    try { await request(body); await load(); toast.success(success); return true; }
    catch (e) { toast.error(e instanceof Error ? e.message : "저장하지 못했습니다."); return false; }
    finally { setBusy(false); }
  }, [load]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool:(tool:unknown, options?:{signal?:AbortSignal})=>void|Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool({ name:"list_plan_tasks", title:"계획의 할 일 보기", description:"현재 계획과 할 일 목록을 읽습니다.", inputSchema:{type:"object",properties:{},additionalProperties:false}, annotations:{readOnlyHint:true,untrustedContentHint:false}, execute:async()=>await request() }, {signal:lifecycle.signal});
      await context.registerTool({ name:"add_plan_task", title:"할 일 추가", description:"현재 계획의 특정 날짜에 새 할 일을 추가합니다.", inputSchema:{type:"object",properties:{title:{type:"string"},estimatedMinutes:{type:"number"},priority:{type:"number",minimum:1,maximum:3},tags:{type:"string"},plannedDate:{type:"string",description:"할 일 시작일(YYYY-MM-DD)"},dueDate:{type:"string",description:"선택 사항인 마감일(YYYY-MM-DD)"}},required:["title","estimatedMinutes","priority"],additionalProperties:false}, annotations:{readOnlyHint:false,untrustedContentHint:false}, execute:async(input:unknown)=>{ const value=input as Record<string,unknown>; if(!data?.plan?.id) throw new Error("계획이 없습니다."); await request({action:"add_task",planId:data.plan.id,plannedDate:localDayKey(),...value}); await load(); return {ok:true}; } }, {signal:lifecycle.signal});
    };
    void register().catch(()=>undefined);
    return () => lifecycle.abort();
  }, [data?.plan?.id, load]);

  const stats = useMemo(() => {
    const tasks = data?.tasks ?? []; const done = tasks.filter(t=>t.status==="done").length; const progress = tasks.filter(t=>t.status==="progress").length;
    const executions=data?.executions ?? []; const expected = tasks.reduce((sum,t)=>sum+t.estimatedMinutes,0); const actual = executions.reduce((sum,e)=>sum+e.durationMinutes,0);
    const blocked=new Set(executions.filter(item=>item.reason.trim()).map(item=>item.taskId)).size;
    return { total:tasks.length, done, progress, todo:tasks.length-done-progress, blocked, expected, actual, percent:tasks.length ? Math.round(done/tasks.length*100) : 0 };
  }, [data]);
  const visibleTasks = useMemo(() => {
    const rows = [...(data?.tasks ?? [])].filter(t => t.plannedDate===selectedTaskDate && (filter==="all" || t.status===filter) && `${t.title} ${t.tags}`.toLowerCase().includes(query.toLowerCase()));
    rows.sort((a,b)=> sort==="latest" ? b.id-a.id : sort==="time" ? a.estimatedMinutes-b.estimatedMinutes : a.priority-b.priority || b.id-a.id);
    return rows;
  }, [data,filter,sort,query,selectedTaskDate]);

  if (!data && !error) return <Loading />;
  if (error) return <main className="min-h-screen grid place-items-center bg-[#f5f7fb] p-6"><div className="surface max-w-md p-7 text-center"><h1 className="text-xl font-bold">자료를 불러오지 못했습니다</h1><p className="mt-2 text-slate-600">{error}</p><Button className="mt-5" onClick={()=>void load()}><RefreshCcw/>다시 시도</Button></div></main>;
  if (!data?.plan) return null;
  const plan = data.plan;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const startDate = localDate(plan.startDate); const endDate = localDate(plan.endDate);
  const totalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / DAY_MS));
  const elapsedDays = Math.min(totalDays, Math.max(0, Math.floor((today.getTime() - startDate.getTime()) / DAY_MS)));
  const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / DAY_MS);
  const dateProgress = Math.round(elapsedDays / totalDays * 100);
  const dDay = daysLeft > 0 ? `D-${daysLeft}` : daysLeft === 0 ? "D-DAY" : `D+${Math.abs(daysLeft)}`;
  const remainingText = daysLeft > 0 ? `${daysLeft}일 남았습니다` : daysLeft === 0 ? "오늘이 목표일입니다" : `목표일이 ${Math.abs(daysLeft)}일 지났습니다`;
  const pendingTasks = [...data.tasks].filter(task=>task.status!=="done" && task.plannedDate===localDayKey()).sort((a,b)=>a.priority-b.priority || a.estimatedMinutes-b.estimatedMinutes);
  const popupTasks = pendingTasks.slice(0, 3);
  const selectedDayTasks = data.tasks.filter(task=>task.plannedDate===selectedTaskDate);
  const dismissToday = () => { localStorage.setItem("planloop-welcome-dismissed", localDayKey()); setWelcomeOpen(false); };

  return <main className="app-shell min-h-screen text-slate-800">
    <Toaster position="top-center" richColors />
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-7">
        <div className="flex items-center gap-3"><div className="logo-mark"><img src="/wish-wing-favicon-v2.svg" alt=""/></div><div><p className="text-lg font-black tracking-[-.04em]">플랜두씨</p><p className="text-xs text-sky-500">Plan · Do · See</p></div></div>
        <Badge className="rounded-full border border-sky-200 bg-white/75 px-3 py-1 text-sky-700 shadow-sm hover:bg-white/75"><Cloud className="mr-1 size-3.5"/>서버에 자동 저장</Badge>
      </div>
    </header>
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-7 sm:py-8">
      <section className="public-note"><Cloud/><p><strong>공개 플래너입니다.</strong><small>지금은 로그인 없이 링크를 아는 사람은 누구나 볼 수 있습니다. 남이 봐도 괜찮은 내용만 넣으세요!</small></p></section>
      <section className="mt-5 grid gap-4 lg:grid-cols-[1.6fr_.9fr]">
        <div className="hero-card">
          <div className="hero-heading"><div><p className="eyebrow">현재 계획</p><div className="plan-title-row"><h1 className="text-2xl font-black tracking-[-.035em] sm:text-3xl">{plan.title}</h1><span className={`plan-priority priority-${plan.priorityLevel}`}>우선순위 {priorityText[plan.priorityLevel] ?? "보통"}</span></div></div><div className="important-note"><span>지금 나에게 중요한 것</span><strong>{plan.priority || "나를 위한 한마디를 적어 보세요"}</strong></div></div>
          <div className="hero-schedule"><Metric icon={<CalendarDays/>} label="기간" value={`${plan.startDate.slice(5).replace("-",".")} — ${plan.endDate.slice(5).replace("-",".")}`} /><div className="dday-card"><span>목표일까지</span><strong>{dDay}</strong><small>{remainingText}</small></div></div>
          <div className="dday-track"><div className="dday-labels"><span>{plan.startDate.replaceAll("-", ".")}</span><strong>{dDay}</strong><span>{plan.endDate.replaceAll("-", ".")}</span></div><Progress value={dateProgress} className="h-3 bg-white/70 [&>div]:bg-gradient-to-r [&>div]:from-sky-300 [&>div]:to-sky-500"/><p><span>{dateProgress}% 지남</span><strong>{remainingText}</strong></p></div>
        </div>
        <div className="surface grid grid-cols-2 gap-3 p-5"><Stat label="전체 할 일" value={stats.total} tone="slate"/><Stat label="완료" value={stats.done} tone="green"/><Stat label="진행 중" value={stats.progress} tone="amber"/><Stat label="남은 일" value={stats.todo} tone="indigo"/></div>
      </section>

      <EnergyPanel energy={energy} onEnergy={setEnergy} logs={data.energyLogs} tasks={pendingTasks} busy={busy} onSave={()=>mutate({action:"save_energy",logDate:localDayKey(),percent:energy},"오늘의 에너지를 저장했습니다.")}/>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <TabsList variant="line" className="planner-tabs w-full border-b border-slate-200 px-0 pb-0">
          <TabsTrigger value="plan" className="px-4 py-3">계획 세우기</TabsTrigger><TabsTrigger value="tasks" className="px-4 py-3">할 일 다루기</TabsTrigger><TabsTrigger value="records" className="px-4 py-3">실제로 한 일</TabsTrigger><TabsTrigger value="review" className="px-4 py-3">돌아보기</TabsTrigger>
        </TabsList>

        <TabsContent value="plan" className="mt-5"><PlanEditor plan={plan} versions={data.versions} busy={busy} onSave={mutate}/></TabsContent>
        <TabsContent value="tasks" className="workspace-tab mt-5">
          <div className="surface workspace-panel">
            <div className="task-day-header">
              <div><p className="eyebrow">{dayRelation(selectedTaskDate)}</p><h2>{dayTitle(selectedTaskDate)}</h2><p>{selectedDayTasks.length}개의 할 일 · {selectedDayTasks.filter(task=>task.status==="done").length}개 완료</p></div>
              <div className="task-day-actions"><div className="day-stepper"><Button variant="ghost" size="icon-sm" aria-label="이전 날짜" onClick={()=>setSelectedTaskDate(value=>shiftDay(value,-1))}><ChevronLeft/></Button><Button variant="ghost" size="sm" onClick={()=>setSelectedTaskDate(localDayKey())}>오늘</Button><Button variant="ghost" size="icon-sm" aria-label="다음 날짜" onClick={()=>setSelectedTaskDate(value=>shiftDay(value,1))}><ChevronRight/></Button></div><Button variant="outline" onClick={()=>setCalendarOpen(true)}><CalendarDays/>지난 할 일 보기</Button></div>
            </div>
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center">
              <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"/><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="할 일이나 태그 검색" className="pl-9"/></div>
              <div className="flex gap-2"><Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-[120px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">모든 상태</SelectItem><SelectItem value="todo">할 일</SelectItem><SelectItem value="progress">진행 중</SelectItem><SelectItem value="done">완료</SelectItem></SelectContent></Select><Select value={sort} onValueChange={setSort}><SelectTrigger className="w-[130px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="priority">우선순위순</SelectItem><SelectItem value="latest">최근 등록순</SelectItem><SelectItem value="time">예상 시간순</SelectItem></SelectContent></Select></div>
              <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogTrigger asChild><Button><Cloud/>할 일 추가</Button></DialogTrigger><TaskDialog key={selectedTaskDate} planId={plan.id} plannedDate={selectedTaskDate} busy={busy} onSubmit={async body=>{if(await mutate(body,"할 일을 추가했습니다.")) setAddOpen(false);}}/></Dialog>
            </div>
            <div className="task-list divide-y divide-slate-100">{selectedDayTasks.length===0 ? <EmptyWorkspace title={selectedTaskDate<localDayKey()?"이 날에는 적어 둔 할 일이 없어요":selectedTaskDate===localDayKey()?"오늘 할 일을 정해 볼까요?":"미리 할 일을 적어 둘까요?"} description={selectedTaskDate<localDayKey()?"다른 날짜를 눌러 그날의 계획과 완료 기록을 확인해 보세요.":"선택한 날짜에 할 일을 넣어 두면 그날 목록에서 바로 확인할 수 있어요."} actionLabel="이 날짜에 할 일 추가" onAction={()=>setAddOpen(true)}/> : visibleTasks.length ? visibleTasks.map(task=><TaskRow key={task.id} task={task} busy={busy} onComplete={()=>setCompleteTask(task)} onEdit={()=>setEditTask(task)} onMutate={mutate}/>) : <EmptyWorkspace title="찾는 할 일이 없어요" description="검색어나 상태 조건을 바꾸면 다시 볼 수 있어요."/>}</div>
          </div>
        </TabsContent>
        <TabsContent value="records" className="workspace-tab mt-5"><Records executions={data.executions} onGoTasks={()=>setActiveTab("tasks")}/></TabsContent>
        <TabsContent value="review" className="mt-5"><Review plan={plan} tasks={data.tasks} executions={data.executions} stats={stats} busy={busy} onSave={mutate} onReplan={()=>setActiveTab("plan")}/></TabsContent>
      </Tabs>
    </div>
    <Dialog open={!!completeTask} onOpenChange={open=>!open&&setCompleteTask(null)}>{completeTask && <CompleteDialog task={completeTask} busy={busy} onSubmit={async body=>{if(await mutate(body,"완료 기록을 저장했습니다.")) setCompleteTask(null);}}/>}</Dialog>
    <Dialog open={!!editTask} onOpenChange={open=>!open&&setEditTask(null)}>{editTask && <EditTaskDialog task={editTask} busy={busy} onSubmit={async body=>{if(await mutate(body,"할 일을 수정했습니다.")){setSelectedTaskDate(String(body.plannedDate));setEditTask(null);}}}/>}</Dialog>
    <TaskCalendarDialog open={calendarOpen} onOpenChange={setCalendarOpen} tasks={data.tasks} selectedDate={selectedTaskDate} onSelectDate={setSelectedTaskDate} onAdd={()=>{setCalendarOpen(false);setAddOpen(true);}}/>
    <Dialog open={welcomeOpen} onOpenChange={setWelcomeOpen}>
      <DialogContent className="welcome-dialog" aria-describedby="welcome-description">
        <div className="welcome-content">
          <p className="eyebrow">TODAY&apos;S CLOUD</p>
          <DialogTitle>오늘도 구름을 타고 왔어요</DialogTitle>
          <DialogDescription id="welcome-description">시험일까지 남은 시간과 오늘 먼저 볼 일을 가볍게 정리해 드릴게요.</DialogDescription>
          <div className="welcome-summary">
            <div className="welcome-dday"><span>시험 D-day</span><strong>{dDay}</strong><small>{remainingText}</small></div>
          </div>
          <div className="welcome-tasks"><span>오늘 먼저 볼 할 일</span>{popupTasks.length ? <ul>{popupTasks.map(task=><li key={task.id}><Check/>{task.title}<small>{task.estimatedMinutes}분</small></li>)}</ul> : <p>남은 할 일이 없어요. 오늘은 가볍게 쉬어도 좋아요.</p>}</div>
          <div className="welcome-actions"><Button variant="outline" onClick={dismissToday}>오늘 하루 안 보기</Button><DialogClose asChild><Button>닫기</Button></DialogClose></div>
        </div>
      </DialogContent>
    </Dialog>
  </main>;
}

function Metric({icon,label,value}:{icon:React.ReactNode;label:string;value:string}) { return <div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-[55%_45%_58%_42%] bg-white/70 text-sky-600 shadow-sm [&>svg]:size-4">{icon}</span><div><p className="text-xs font-semibold text-sky-700">{label}</p><p className="mt-1 font-bold text-sky-950">{value}</p></div></div>; }
function Stat({label,value,tone}:{label:string;value:number;tone:string}) { return <div className={`stat ${tone}`}><p className="text-sm text-slate-500">{label}</p><strong>{value}</strong></div>; }

function EnergyPanel({energy,onEnergy,logs,tasks,busy,onSave}:{energy:number;onEnergy:(value:number)=>void;logs:EnergyLog[];tasks:Task[];busy:boolean;onSave:()=>Promise<boolean>}) {
  const [editing, setEditing] = useState(false);
  const todayLog = logs.find(log=>log.logDate===localDayKey());
  const count = energy < 10 ? 0 : energy < 40 ? 1 : energy < 70 ? 2 : 3;
  const doable = tasks.slice(0, count);
  if (todayLog && !editing) return <section className="energy-collapsed surface">
    <span className="energy-collapsed-icon"><BatteryCharging/></span>
    <div><p>오늘의 에너지 기록</p><strong>{todayLog.percent}%</strong><small>{energyMessage(todayLog.percent)}</small></div>
    <Button variant="ghost" size="sm" onClick={()=>{onEnergy(todayLog.percent);setEditing(true);}}>오늘 기록 수정</Button>
  </section>;
  return <section className="energy-panel surface">
    <div className="energy-main">
      <div className="section-heading"><div><p className="eyebrow">ENERGY CHECK</p><h2>오늘의 에너지는 몇 퍼센트인가요?</h2></div><BatteryCharging/></div>
      <div className="energy-value"><strong>{energy}</strong><span>%</span></div>
      <input className="energy-range" style={{background:`linear-gradient(90deg,#8ddcf6 0 ${energy}%,rgba(198,231,242,.6) ${energy}% 100%)`}} type="range" min="0" max="100" step="1" value={energy} onChange={event=>onEnergy(Number(event.target.value))} aria-label="오늘의 에너지 퍼센트"/>
      <div className="energy-quick">{[10,30,50,70,100].map(value=><button key={value} type="button" className={energy===value?"active":""} onClick={()=>onEnergy(value)}>{value}%</button>)}</div>
      <div className="energy-message"><Sparkles/><p>{energyMessage(energy)}</p></div>
      <div className="energy-doable"><span>이 에너지로 해볼 수 있는 일</span>{doable.length ? <ul>{doable.map(task=><li key={task.id}>{task.title}<small>{task.estimatedMinutes}분</small></li>)}</ul> : <p>오늘은 할 일을 억지로 잡지 말고 충분히 쉬어 주세요.</p>}</div>
      <Button disabled={busy} onClick={async()=>{if(await onSave()) setEditing(false);}}>{busy?"저장 중…":"오늘의 에너지 저장"}</Button>
    </div>
    <aside className="energy-history">
      <span>최근 에너지 기록</span>
      {logs.length ? <div>{logs.slice(0,7).map(log=><p key={log.id}><time>{log.logDate.slice(5).replace("-",".")}</time><span><i style={{width:`${log.percent}%`}}/></span><strong>{log.percent}%</strong></p>)}</div> : <p className="energy-empty">오늘부터 하나씩 기록해 보세요.</p>}
    </aside>
  </section>;
}

function TaskRow({task,busy,onComplete,onEdit,onMutate}:{task:Task;busy:boolean;onComplete:()=>void;onEdit:()=>void;onMutate:(body:Record<string,unknown>,message:string)=>Promise<boolean>}) {
  return <article className="group flex flex-col gap-3 p-4 transition hover:bg-slate-50/70 sm:flex-row sm:items-center">
    <button aria-label={task.status==="done"?"완료됨":"완료 기록"} onClick={task.status==="done"?undefined:onComplete} className={`task-cloud-toggle ${task.status==="done"?"done":""}`}><Cloud fill={task.status==="done"?"currentColor":"none"}/></button>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className={`font-bold ${task.status==="done"?"text-slate-400 line-through":""}`}>{task.title}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone[task.status]}`}>{statusText[task.status]}</span></div><div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500"><span>예상 {task.estimatedMinutes}분</span>{task.dueDate&&<span className="task-due">마감일 {task.dueDate.replaceAll("-",".")}</span>}<span>우선순위 {priorityText[task.priority]}</span>{task.tags && <span>#{task.tags.split(",").join(" #")}</span>}</div></div>
    <div className="flex gap-2 self-end sm:self-auto">{task.status==="done"?<Button variant="outline" size="sm" disabled={busy} onClick={()=>void onMutate({action:"reopen_task",id:task.id},"진행 중으로 되돌렸습니다.")}><RefreshCcw/>되돌리기</Button>:<Button size="sm" disabled={busy} onClick={onComplete}>완료</Button>}<Button aria-label="할 일 전체 수정" variant="ghost" size="icon-sm" disabled={busy} onClick={onEdit}><Pencil/></Button><Button aria-label="삭제" variant="ghost" size="icon-sm" disabled={busy} onClick={()=>{if(confirm("이 할 일을 삭제할까요?")) void onMutate({action:"delete_task",id:task.id},"할 일을 삭제했습니다.");}}><Trash2/></Button></div>
  </article>;
}

function TaskDialog({planId,plannedDate,busy,onSubmit}:{planId:number;plannedDate:string;busy:boolean;onSubmit:(body:Record<string,unknown>)=>void}) {
  const [hasDueDate,setHasDueDate]=useState(false);
  return <DialogContent><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);onSubmit({action:"add_task",planId,title:f.get("title"),plannedDate:f.get("plannedDate"),dueDate:hasDueDate?f.get("dueDate"):"",estimatedMinutes:Number(f.get("minutes")),priority:Number(f.get("priority")),tags:f.get("tags"),status:"todo"});}}><DialogHeader><DialogTitle>새 할 일</DialogTitle><DialogDescription>{dayTitle(plannedDate)}에 할 일을 추가합니다.</DialogDescription></DialogHeader><div className="mt-5 grid gap-4"><label className="field">할 일<Input name="title" required placeholder="예: SQL JOIN 문제 10개"/></label><label className="field">시작일<Input name="plannedDate" type="date" defaultValue={plannedDate} required/></label>{hasDueDate?<div className="due-date-field"><label className="field">마감일<Input name="dueDate" type="date" defaultValue={plannedDate} required/></label><Button type="button" variant="ghost" size="sm" onClick={()=>setHasDueDate(false)}>마감일 없애기</Button></div>:<Button type="button" variant="outline" className="due-date-add" onClick={()=>setHasDueDate(true)}><CalendarDays/>마감일 추가</Button>}<div className="grid grid-cols-2 gap-3"><label className="field">예상 시간(분)<Input name="minutes" type="number" min="1" defaultValue="30" required/></label><label className="field">우선순위<select name="priority" defaultValue="2" className="native-select"><option value="1">높음</option><option value="2">보통</option><option value="3">낮음</option></select></label></div><label className="field">태그<Input name="tags" placeholder="DB, 오답"/></label></div><DialogFooter className="mt-6"><Button type="submit" disabled={busy}>{busy?"저장 중…":"추가하기"}</Button></DialogFooter></form></DialogContent>;
}

function EditTaskDialog({task,busy,onSubmit}:{task:Task;busy:boolean;onSubmit:(body:Record<string,unknown>)=>void}) {
  return <DialogContent><form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);onSubmit({action:"update_task",id:task.id,title:form.get("title"),plannedDate:form.get("plannedDate"),dueDate:form.get("dueDate"),estimatedMinutes:Number(form.get("minutes")),priority:Number(form.get("priority")),tags:form.get("tags"),status:task.status});}}><DialogHeader><DialogTitle>할 일 수정</DialogTitle><DialogDescription>내용뿐 아니라 시작일, 마감일, 예상 시간, 우선순위와 태그까지 함께 바꿀 수 있습니다.</DialogDescription></DialogHeader><div className="mt-5 grid gap-4"><label className="field">할 일<Input name="title" defaultValue={task.title} required/></label><label className="field">시작일<Input name="plannedDate" type="date" defaultValue={task.plannedDate} required/></label><label className="field"><span>마감일 <em className="field-optional">선택</em></span><Input name="dueDate" type="date" defaultValue={task.dueDate??""}/></label><div className="grid grid-cols-2 gap-3"><label className="field">예상 시간(분)<Input name="minutes" type="number" min="1" defaultValue={task.estimatedMinutes} required/></label><label className="field">우선순위<select name="priority" defaultValue={String(task.priority)} className="native-select"><option value="1">높음</option><option value="2">보통</option><option value="3">낮음</option></select></label></div><label className="field">태그<Input name="tags" defaultValue={task.tags} placeholder="DB, 오답"/></label></div><DialogFooter className="mt-6"><DialogClose asChild><Button type="button" variant="outline">취소</Button></DialogClose><Button type="submit" disabled={busy}>{busy?"저장 중…":"수정 저장"}</Button></DialogFooter></form></DialogContent>;
}

function TaskCalendarDialog({open,onOpenChange,tasks,selectedDate,onSelectDate,onAdd}:{open:boolean;onOpenChange:(open:boolean)=>void;tasks:Task[];selectedDate:string;onSelectDate:(date:string)=>void;onAdd:()=>void}) {
  const dayTasks=tasks.filter(task=>task.plannedDate===selectedDate);
  const datesWithTasks=[...new Set(tasks.map(task=>task.plannedDate))].map(localDate);
  const completedDates=[...new Set(tasks.filter(task=>task.status==="done").map(task=>task.plannedDate))].map(localDate);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="task-calendar-dialog"><DialogHeader><DialogTitle>날짜별 할 일</DialogTitle><DialogDescription>지난 기록을 확인하거나, 내일 이후의 할 일을 미리 적어 두세요.</DialogDescription></DialogHeader><div className="task-calendar-layout"><Calendar mode="single" locale={ko} selected={localDate(selectedDate)} onSelect={date=>date&&onSelectDate(dateKey(date))} modifiers={{hasTasks:datesWithTasks,hasCompleted:completedDates}} modifiersClassNames={{hasTasks:"calendar-has-tasks",hasCompleted:"calendar-has-completed"}}/><aside className="calendar-day-summary"><div><p className="eyebrow">{dayRelation(selectedDate)}</p><h3>{dayTitle(selectedDate)}</h3><p>{dayTasks.length}개 중 {dayTasks.filter(task=>task.status==="done").length}개 완료</p></div>{dayTasks.length?<ul>{dayTasks.map(task=><li key={task.id} className={task.status==="done"?"done":""}><Cloud fill={task.status==="done"?"currentColor":"none"}/><span>{task.title}</span><small>{statusText[task.status]}</small></li>)}</ul>:<div className="calendar-empty"><Cloud/><p>이 날짜에는 아직 할 일이 없어요.</p></div>}<Button onClick={onAdd}><Cloud/>이 날짜에 할 일 추가</Button></aside></div><DialogFooter><DialogClose asChild><Button variant="outline">선택한 날짜 보기</Button></DialogClose></DialogFooter></DialogContent></Dialog>;
}

function CompleteDialog({task,busy,onSubmit}:{task:Task;busy:boolean;onSubmit:(body:Record<string,unknown>)=>void}) {
  return <DialogContent><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const duration=Number(f.get("duration"));const endedAt=new Date().toISOString();onSubmit({action:"complete_task",id:task.id,durationMinutes:duration,endedAt,startedAt:new Date(Date.now()-duration*60000).toISOString(),reason:f.get("reason")});}}><DialogHeader><DialogTitle>실행 기록 남기기</DialogTitle><DialogDescription>{task.title}을(를) 완료한 기록은 이 할 일에 한 번만 연결됩니다.</DialogDescription></DialogHeader><div className="mt-5 grid gap-4"><label className="field">실제로 걸린 시간(분)<Input name="duration" type="number" min="1" defaultValue={task.estimatedMinutes} required/></label><label className="field">예상과 달랐던 이유<Textarea name="reason" placeholder="예: 개념을 다시 확인하느라 10분 더 걸렸다."/></label></div><DialogFooter className="mt-6"><Button type="submit" disabled={busy}>{busy?"저장 중…":"완료 기록 저장"}</Button></DialogFooter></form></DialogContent>;
}

function PlanEditor({plan,versions,busy,onSave}:{plan:Plan;versions:Version[];busy:boolean;onSave:(body:Record<string,unknown>,message:string)=>Promise<boolean>}) {
  const [selectedHistory,setSelectedHistory] = useState<{label:string;createdAt:string;snapshot:Partial<Plan>}|null>(null);
  return <>
    <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
      <form className="surface p-5 sm:p-7" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void onSave({action:"save_plan",id:plan.id,title:f.get("title"),startDate:f.get("startDate"),endDate:f.get("endDate"),successCriteria:f.get("successCriteria"),estimatedMinutes:Number(f.get("estimatedMinutes")),priority:f.get("priority"),priorityLevel:Number(f.get("priorityLevel")),nextAdjustment:f.get("nextAdjustment")},"계획과 수정 이력을 저장했습니다.");}}>
        <div className="section-heading"><div><p className="eyebrow text-indigo-600">PLAN</p><h2>계획 다듬기</h2></div><Feather className="plan-quill"/></div>
        <div className="mt-6 grid gap-4"><label className="field">계획 이름<Input name="title" defaultValue={plan.title} required/></label><div className="grid gap-3 sm:grid-cols-3"><label className="field">시작일<Input name="startDate" type="date" defaultValue={plan.startDate} required/></label><label className="field">종료일<Input name="endDate" type="date" defaultValue={plan.endDate} required/></label><label className="field">우선순위<select name="priorityLevel" defaultValue={String(plan.priorityLevel ?? 2)} className="native-select"><option value="1">높음</option><option value="2">보통</option><option value="3">낮음</option></select></label></div><label className="field">성공 기준<Textarea name="successCriteria" defaultValue={plan.successCriteria} required/></label><div className="grid grid-cols-2 gap-3"><label className="field">총 예상 시간(분)<Input name="estimatedMinutes" type="number" min="1" defaultValue={plan.estimatedMinutes} required/></label><label className="field">나를 위한 한마디<Input name="priority" defaultValue={plan.priority} placeholder="예: 오늘의 한 걸음이면 충분해"/></label></div><label className="field">지키지 못했지만 다음에는 꼭 지킬 것<Textarea name="nextAdjustment" defaultValue={plan.nextAdjustment}/></label><Button className="mt-1" disabled={busy}>{busy?"저장 중…":"계획 저장"}</Button></div>
      </form>
      <aside className="surface p-5 sm:p-7"><div className="section-heading"><div><p className="eyebrow text-indigo-600">HISTORY</p><h2>수정 이력</h2></div><History/></div><div className="mt-5 space-y-3">{versions.map((version,index)=>{const snap=JSON.parse(version.snapshot) as Partial<Plan>;const label=`버전 ${versions.length-index}`;return <button type="button" key={version.id} className="history-item" onClick={()=>setSelectedHistory({label,createdAt:version.createdAt,snapshot:snap})}><div><strong>{label}</strong><p>{snap.title}</p></div><time>{fmt(version.createdAt)}</time></button>})}</div></aside>
    </div>
    <Dialog open={!!selectedHistory} onOpenChange={open=>!open&&setSelectedHistory(null)}>
      {selectedHistory&&<DialogContent className="history-dialog"><DialogHeader><DialogTitle>{selectedHistory.label}에 적었던 내용</DialogTitle><DialogDescription>{fmt(selectedHistory.createdAt)}에 저장한 계획입니다.</DialogDescription></DialogHeader><div className="history-detail"><div><span>계획 이름</span><p>{selectedHistory.snapshot.title||"-"}</p></div><div className="history-detail-grid"><div><span>시작일</span><p>{selectedHistory.snapshot.startDate||"-"}</p></div><div><span>종료일</span><p>{selectedHistory.snapshot.endDate||"-"}</p></div></div><div><span>우선순위</span><p>{selectedHistory.snapshot.priorityLevel ? priorityText[selectedHistory.snapshot.priorityLevel] : "이전 기록에는 없음"}</p></div><div><span>성공 기준</span><p>{selectedHistory.snapshot.successCriteria||"-"}</p></div><div><span>총 예상 시간</span><p>{selectedHistory.snapshot.estimatedMinutes ? `${selectedHistory.snapshot.estimatedMinutes}분` : "-"}</p></div><div><span>나를 위한 한마디</span><p>{selectedHistory.snapshot.priority||"-"}</p></div><div><span>지키지 못했지만 다음에는 꼭 지킬 것</span><p>{selectedHistory.snapshot.nextAdjustment||"-"}</p></div></div><DialogFooter><DialogClose asChild><Button>닫기</Button></DialogClose></DialogFooter></DialogContent>}
    </Dialog>
  </>;
}

function EmptyWorkspace({title,description,actionLabel,onAction}:{title:string;description:string;actionLabel?:string;onAction?:()=>void}) {
  return <div className="empty-workspace"><span className="empty-cloud"><Cloud/></span><h3>{title}</h3><p>{description}</p>{actionLabel&&onAction&&<Button className="mt-5" onClick={onAction}><Feather/>{actionLabel}</Button>}</div>;
}

function Records({executions,onGoTasks}:{executions:Execution[];onGoTasks:()=>void}) {
  return <section className="surface workspace-panel p-5 sm:p-7"><div className="section-heading"><div><p className="eyebrow text-indigo-600">DO</p><h2>실제로 한 일</h2></div><ListChecks/></div><div className="record-list mt-6 space-y-4">{executions.length ? executions.map(item=><article key={item.id} className="record"><div className="record-time"><strong>{item.durationMinutes}</strong><span>분</span></div><div className="min-w-0 flex-1"><h3>{item.taskTitle}</h3><p className="mt-1 text-sm text-slate-500">{fmt(item.startedAt)} 시작 · {fmt(item.endedAt)} 종료</p>{item.reason && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><strong>차이 이유</strong> · {item.reason}</p>}</div></article>) : <EmptyWorkspace title="아직 실제로 한 일이 없어요" description="할 일을 완료하면 걸린 시간과 차이 이유가 여기에 차곡차곡 쌓여요." actionLabel="할 일 보러 가기" onAction={onGoTasks}/>}</div></section>;
}

function Review({plan,tasks,executions,stats,busy,onSave,onReplan}:{plan:Plan;tasks:Task[];executions:Execution[];stats:{total:number;done:number;progress:number;todo:number;blocked:number;expected:number;actual:number;percent:number};busy:boolean;onSave:(body:Record<string,unknown>,message:string)=>Promise<boolean>;onReplan:()=>void}) {
  const [recordsOpen,setRecordsOpen]=useState(false);
  const taskIds=new Set(tasks.map(task=>task.id));
  const planExecutions=executions.filter(item=>taskIds.has(item.taskId));
  const completedExpected=tasks.filter(t=>t.status==="done").reduce((s,t)=>s+t.estimatedMinutes,0); const diff=stats.actual-completedExpected;
  return <>
    <div className="grid gap-5 lg:grid-cols-[2fr_1fr]"><section className="surface p-5 sm:p-7"><div className="section-heading"><div><p className="eyebrow text-indigo-600">SEE</p><h2>숫자로 돌아보기</h2></div><Target/></div><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="계획" value={stats.total} tone="slate"/><Stat label="완료" value={stats.done} tone="green"/><Stat label="미완료" value={stats.total-stats.done} tone="amber"/><div className="stat indigo"><p className="text-sm text-slate-500">막힌 수</p><strong>{stats.blocked}</strong><small>이유를 적은 할 일</small></div></div><div className="comparison mt-5"><div><span>완료한 일의 예상 시간</span><strong>{minutes(completedExpected)}</strong></div><ChevronRight/><div><span>실제 시간</span><button type="button" className="actual-time-button" onClick={()=>setRecordsOpen(true)}>{minutes(stats.actual)}<small>기록 보기</small></button></div></div><p className="mt-4 text-sm text-slate-600">실제 시간은 완료한 일의 예상보다 <strong className={diff>0?"text-rose-600":"text-emerald-700"}>{Math.abs(diff)}분 {diff>0?"더":"덜"}</strong> 걸렸습니다. {executions.some(e=>e.reason.trim()) ? "차이 이유도 기록되어 있습니다." : "차이 이유를 실행 기록에 남겨 보세요."}</p></section><form className="surface p-5 sm:p-6" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(await onSave({action:"save_reflection",id:plan.id,nextAdjustment:f.get("nextAdjustment")},"다음에 지킬 내용을 저장했습니다.")) onReplan();}}><div className="section-heading"><div><p className="eyebrow text-indigo-600">NEXT PLAN</p><h2>지키지 못했지만 다음에는 꼭 지킬 것</h2></div><Sparkles/></div><label className="field mt-5">다음 계획에서 지킬 한 가지<Textarea name="nextAdjustment" defaultValue={plan.nextAdjustment} className="min-h-24" required/></label><p className="mt-3 text-sm text-slate-500">저장하면 계획 세우기로 이동해 같은 내용을 이어서 다듬을 수 있습니다.</p><Button className="mt-5 w-full" disabled={busy}>{busy?"저장 중…":"저장하고 다시 한 번 계획해보기"}</Button></form></div>
    <Dialog open={recordsOpen} onOpenChange={setRecordsOpen}><DialogContent className="execution-evidence-dialog"><DialogHeader><DialogTitle>실제 시간의 근거 기록</DialogTitle><DialogDescription>현재 계획에서 완료한 일마다 언제 시작했고 얼마나 걸렸는지 모아 보여드립니다.</DialogDescription></DialogHeader><div className="record-list mt-4 space-y-3">{planExecutions.length ? planExecutions.map(item=>{const task=tasks.find(candidate=>candidate.id===item.taskId);const timeDiff=item.durationMinutes-(task?.estimatedMinutes??0);return <article key={item.id} className="record"><div className="record-time"><strong>{item.durationMinutes}</strong><span>분</span></div><div className="min-w-0 flex-1"><h3>{item.taskTitle}</h3><p className="mt-1 text-sm text-slate-500">{fmt(item.startedAt)} 시작 · {fmt(item.endedAt)} 종료</p><p className="mt-2 text-sm text-slate-600">예상 {task?.estimatedMinutes??0}분 · {timeDiff===0?"예상과 같음":`예상보다 ${Math.abs(timeDiff)}분 ${timeDiff>0?"더":"덜"} 걸림`}</p>{item.reason ? <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><strong>차이 이유</strong> · {item.reason}</p> : <p className="mt-3 text-sm text-slate-400">기록한 차이 이유 없음</p>}</div></article>}) : <EmptyWorkspace title="아직 실제 시간 기록이 없어요" description="할 일을 완료하면 실제 시간의 근거가 여기에 표시됩니다."/>}</div><DialogFooter><DialogClose asChild><Button>닫기</Button></DialogClose></DialogFooter></DialogContent></Dialog>
  </>;
}

function Loading() { return <main className="app-shell min-h-screen p-6"><div className="mx-auto max-w-7xl space-y-5"><Skeleton className="h-14 w-full"/><Skeleton className="h-56 w-full rounded-3xl"/><Skeleton className="h-96 w-full rounded-3xl"/></div></main>; }
