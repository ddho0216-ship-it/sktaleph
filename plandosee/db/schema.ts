import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const plans = sqliteTable("plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  successCriteria: text("success_criteria").notNull(),
  estimatedMinutes: integer("estimated_minutes").notNull(),
  priority: text("priority").notNull(),
  priorityLevel: integer("priority_level").notNull().default(2),
  nextAdjustment: text("next_adjustment").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const planVersions = sqliteTable("plan_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  planId: integer("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  snapshot: text("snapshot").notNull(),
  createdAt: text("created_at").notNull(),
});

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  planId: integer("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: text("status").notNull(),
  estimatedMinutes: integer("estimated_minutes").notNull(),
  priority: integer("priority").notNull(),
  tags: text("tags").notNull().default(""),
  plannedDate: text("planned_date").notNull().default("2026-09-21"),
  dueDate: text("due_date"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const executions = sqliteTable("executions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  reason: text("reason").notNull().default(""),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("uq_executions_task_id").on(table.taskId)]);

export const energyLogs = sqliteTable("energy_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  logDate: text("log_date").notNull(),
  percent: integer("percent").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("uq_energy_logs_log_date").on(table.logDate)]);
