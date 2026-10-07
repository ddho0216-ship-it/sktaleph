import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function database() {
  if (!env.DB) throw new Error("데이터베이스 연결을 사용할 수 없습니다.");
  return env.DB;
}

async function seedIfEmpty() {
  const db = database();
  const row = await db.prepare("SELECT COUNT(*) AS count FROM plans").first<{ count: number }>();
  if ((row?.count ?? 0) > 0) return;
  const now = "2026-09-21T09:00:00.000Z";
  const plan = {
    title: "정보처리기사 실기 합격 프로젝트",
    startDate: "2026-09-21",
    endDate: "2026-10-31",
    successCriteria: "핵심 개념 3회독, SQL·프로그래밍 문제 100개 풀이, 모의고사 3회 평균 70점 이상",
    estimatedMinutes: 2400,
    priority: "합격에 직결되는 취약 파트부터",
    priorityLevel: 1,
    nextAdjustment: "오답이 많은 DB·프로그래밍에 다음 주 시간을 20% 더 배정한다.",
  };
  await db.batch([
    db.prepare("INSERT INTO plans (id, title, start_date, end_date, success_criteria, estimated_minutes, priority, priority_level, next_adjustment, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(plan.title, plan.startDate, plan.endDate, plan.successCriteria, plan.estimatedMinutes, plan.priority, plan.priorityLevel, plan.nextAdjustment, now, now),
    db.prepare("INSERT INTO plan_versions (plan_id, snapshot, created_at) VALUES (1, ?, ?)").bind(JSON.stringify(plan), now),
    db.prepare("INSERT INTO tasks (id, plan_id, title, status, estimated_minutes, priority, tags, planned_date, created_at, updated_at) VALUES (1, 1, ?, 'done', 20, 1, '접수,준비', '2026-09-21', ?, ?)").bind("실기 접수 일정과 준비물 확인", now, now),
    db.prepare("INSERT INTO tasks (id, plan_id, title, status, estimated_minutes, priority, tags, planned_date, created_at, updated_at) VALUES (2, 1, ?, 'done', 45, 1, 'DB,핵심', '2026-09-21', ?, ?)").bind("DB 스키마·키·무결성 복습", now, now),
    db.prepare("INSERT INTO tasks (id, plan_id, title, status, estimated_minutes, priority, tags, planned_date, created_at, updated_at) VALUES (3, 1, ?, 'done', 35, 1, 'C언어,포인터', '2026-09-21', ?, ?)").bind("C 포인터 기초 문제 풀이", now, now),
    db.prepare("INSERT INTO tasks (id, plan_id, title, status, estimated_minutes, priority, tags, planned_date, created_at, updated_at) VALUES (4, 1, ?, 'progress', 60, 2, '네트워크,OSI', '2026-09-21', ?, ?)").bind("OSI 7계층 역할 암기", now, now),
    db.prepare("INSERT INTO tasks (id, plan_id, title, status, estimated_minutes, priority, tags, planned_date, created_at, updated_at) VALUES (5, 1, ?, 'todo', 50, 2, 'SQL,문제풀이', '2026-09-21', ?, ?)").bind("SQL SELECT·JOIN 문제 10개", now, now),
    db.prepare("INSERT INTO executions (task_id, started_at, ended_at, duration_minutes, reason, created_at) VALUES (1, '2026-09-21T08:10:00.000Z', '2026-09-21T08:32:00.000Z', 22, '접수 사이트 확인까지 함께 진행해 예상보다 2분 더 걸렸다.', ?)").bind(now),
    db.prepare("INSERT INTO executions (task_id, started_at, ended_at, duration_minutes, reason, created_at) VALUES (2, '2026-09-20T12:00:00.000Z', '2026-09-20T12:50:00.000Z', 50, '정규화 단계 구분에서 다시 확인할 부분이 생겼다.', ?)").bind(now),
    db.prepare("INSERT INTO executions (task_id, started_at, ended_at, duration_minutes, reason, created_at) VALUES (3, '2026-09-19T10:00:00.000Z', '2026-09-19T10:40:00.000Z', 40, '이중 포인터 예제를 추가로 풀었다.', ?)").bind(now),
  ]);
}

export async function GET() {
  try {
    await seedIfEmpty();
    const db = database();
    const [plans, tasks, executions, versions, energyLogs] = await Promise.all([
      db.prepare("SELECT id, title, start_date AS startDate, end_date AS endDate, success_criteria AS successCriteria, estimated_minutes AS estimatedMinutes, priority, priority_level AS priorityLevel, next_adjustment AS nextAdjustment, created_at AS createdAt, updated_at AS updatedAt FROM plans ORDER BY id DESC LIMIT 1").all(),
      db.prepare("SELECT id, plan_id AS planId, title, status, estimated_minutes AS estimatedMinutes, priority, tags, planned_date AS plannedDate, due_date AS dueDate, created_at AS createdAt, updated_at AS updatedAt FROM tasks ORDER BY planned_date DESC, id DESC").all(),
      db.prepare("SELECT e.id, e.task_id AS taskId, e.started_at AS startedAt, e.ended_at AS endedAt, e.duration_minutes AS durationMinutes, e.reason, e.created_at AS createdAt, t.title AS taskTitle FROM executions e JOIN tasks t ON t.id = e.task_id ORDER BY e.ended_at DESC").all(),
      db.prepare("SELECT id, plan_id AS planId, snapshot, created_at AS createdAt FROM plan_versions ORDER BY id DESC LIMIT 10").all(),
      db.prepare("SELECT id, log_date AS logDate, percent, created_at AS createdAt, updated_at AS updatedAt FROM energy_logs ORDER BY log_date DESC LIMIT 30").all(),
    ]);
    return NextResponse.json({ plan: plans.results[0] ?? null, tasks: tasks.results, executions: executions.results, versions: versions.results, energyLogs: energyLogs.results });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    const db = database();
    const now = new Date().toISOString();
    if (action === "save_plan") {
      const snapshot = {
        title: String(body.title ?? "").trim(), startDate: String(body.startDate ?? ""), endDate: String(body.endDate ?? ""),
        successCriteria: String(body.successCriteria ?? "").trim(), estimatedMinutes: Number(body.estimatedMinutes ?? 0),
        priority: String(body.priority ?? "").trim(), priorityLevel: Math.min(3, Math.max(1, Number(body.priorityLevel ?? 2))), nextAdjustment: String(body.nextAdjustment ?? "").trim(),
      };
      if (!snapshot.title || !snapshot.startDate || !snapshot.endDate || !snapshot.successCriteria || snapshot.estimatedMinutes < 1) throw new Error("계획의 필수 항목을 확인해 주세요.");
      await db.batch([
        db.prepare("UPDATE plans SET title = ?, start_date = ?, end_date = ?, success_criteria = ?, estimated_minutes = ?, priority = ?, priority_level = ?, next_adjustment = ?, updated_at = ? WHERE id = ?").bind(snapshot.title, snapshot.startDate, snapshot.endDate, snapshot.successCriteria, snapshot.estimatedMinutes, snapshot.priority, snapshot.priorityLevel, snapshot.nextAdjustment, now, Number(body.id)),
        db.prepare("INSERT INTO plan_versions (plan_id, snapshot, created_at) VALUES (?, ?, ?)").bind(Number(body.id), JSON.stringify(snapshot), now),
      ]);
    } else if (action === "add_task") {
      const title = String(body.title ?? "").trim();
      const plannedDate = String(body.plannedDate ?? "");
      const dueDate = String(body.dueDate ?? "").trim();
      if (!title) throw new Error("할 일을 입력해 주세요.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(plannedDate)) throw new Error("할 일 날짜를 확인해 주세요.");
      if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error("마감일을 확인해 주세요.");
      await db.prepare("INSERT INTO tasks (plan_id, title, status, estimated_minutes, priority, tags, planned_date, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(Number(body.planId), title, String(body.status ?? "todo"), Math.max(1, Number(body.estimatedMinutes ?? 30)), Number(body.priority ?? 2), String(body.tags ?? ""), plannedDate, dueDate || null, now, now).run();
    } else if (action === "update_task") {
      const plannedDate = String(body.plannedDate ?? "");
      const dueDate = String(body.dueDate ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(plannedDate)) throw new Error("할 일 날짜를 확인해 주세요.");
      if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error("마감일을 확인해 주세요.");
      await db.prepare("UPDATE tasks SET title = ?, status = ?, estimated_minutes = ?, priority = ?, tags = ?, planned_date = ?, due_date = ?, updated_at = ? WHERE id = ?")
        .bind(String(body.title ?? "").trim(), String(body.status ?? "todo"), Math.max(1, Number(body.estimatedMinutes ?? 30)), Number(body.priority ?? 2), String(body.tags ?? ""), plannedDate, dueDate || null, now, Number(body.id)).run();
    } else if (action === "delete_task") {
      await db.prepare("DELETE FROM tasks WHERE id = ?").bind(Number(body.id)).run();
    } else if (action === "complete_task") {
      const taskId = Number(body.id);
      const duration = Math.max(1, Number(body.durationMinutes ?? 1));
      const endedAt = String(body.endedAt ?? now);
      const startedAt = String(body.startedAt ?? new Date(Date.parse(endedAt) - duration * 60000).toISOString());
      await db.batch([
        db.prepare("UPDATE tasks SET status = 'done', updated_at = ? WHERE id = ?").bind(now, taskId),
        db.prepare("INSERT INTO executions (task_id, started_at, ended_at, duration_minutes, reason, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(task_id) DO UPDATE SET started_at = excluded.started_at, ended_at = excluded.ended_at, duration_minutes = excluded.duration_minutes, reason = excluded.reason")
          .bind(taskId, startedAt, endedAt, duration, String(body.reason ?? "").trim(), now),
      ]);
    } else if (action === "reopen_task") {
      await db.prepare("UPDATE tasks SET status = 'progress', updated_at = ? WHERE id = ?").bind(now, Number(body.id)).run();
    } else if (action === "save_reflection") {
      await db.prepare("UPDATE plans SET next_adjustment = ?, updated_at = ? WHERE id = ?").bind(String(body.nextAdjustment ?? "").trim(), now, Number(body.id)).run();
    } else if (action === "save_energy") {
      const logDate = String(body.logDate ?? "");
      const percent = Math.round(Number(body.percent));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate) || !Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error("에너지는 0%부터 100% 사이로 저장해 주세요.");
      await db.prepare("INSERT INTO energy_logs (log_date, percent, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(log_date) DO UPDATE SET percent = excluded.percent, updated_at = excluded.updated_at")
        .bind(logDate, percent, now, now).run();
    } else {
      return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "저장하지 못했습니다." }, { status: 400 });
  }
}
