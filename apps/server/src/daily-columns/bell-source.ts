import type { BellWakeSource, BellWakeSourceRecord, BellWakeSourceTransition } from "../bell-service.js";
import type { BellWakeCancellationResult } from "../community-database.js";
import { DailyColumnStore, type ColumnTask } from "./store.js";

/** Uses Bell's existing replay and acknowledgement loop; no new timer or payload JSON. */
export class DailyColumnBellSource implements BellWakeSource {
  constructor(readonly store: DailyColumnStore, readonly expiredMaterialText: string, readonly now = Date.now) {}
  private project(task: ColumnTask): BellWakeSourceRecord {
    const materials = this.store.materialText(task.task_id, this.now()) ?? this.expiredMaterialText;
    return {wakeId: task.task_id, residentId: task.resident_id, reason: "reporter_newsroom_work",
      status: task.wake_status, createdAt: task.created_at, endedAt: task.wake_ended_at,
      blockReason: task.block_reason, errorCode: task.error_code, purchaseRequestId: null, letterId: null,
      payload: {text: `${task.instruction_text}\n${materials}`}};
  }
  listPending(residentId: string): BellWakeSourceRecord[] {
    const tasks = this.store.database.prepare(`SELECT * FROM lingye_daily_column_tasks
      WHERE resident_id=? AND wake_status='pending' ORDER BY created_at,task_id`).all(residentId) as ColumnTask[];
    return tasks.map(task => this.project(task));
  }
  get(residentId: string, wakeId: string): BellWakeSourceRecord | undefined {
    const task = this.store.task(wakeId);
    return task?.resident_id === residentId ? this.project(task) : undefined;
  }
  private transition(residentId: string, wakeId: string, now: number, status: "acked" | "blocked",
    blockReason: string | null, errorCode: string | null): BellWakeSourceTransition {
    return this.store.database.transaction(() => {
      const task = this.store.task(wakeId);
      if (!task || task.resident_id !== residentId) return "missing";
      if (task.wake_status === status) return "duplicate";
      if (task.wake_status !== "pending") return "conflict";
      this.store.database.prepare(`UPDATE lingye_daily_column_tasks
        SET wake_status=?,wake_ended_at=?,block_reason=?,error_code=? WHERE task_id=?`)
        .run(status, now, blockReason, errorCode, wakeId);
      return status;
    }).immediate();
  }
  acknowledge(residentId: string, wakeId: string, now: number) {
    return this.transition(residentId, wakeId, now, "acked", null, null);
  }
  block(residentId: string, wakeId: string, now: number, blockReason: string, errorCode: string) {
    return this.transition(residentId, wakeId, now, "blocked", blockReason, errorCode);
  }
  cancel(residentId: string, wakeId: string, now: number): BellWakeCancellationResult {
    const changed = this.store.database.prepare(`UPDATE lingye_daily_column_tasks
      SET wake_status='cancelled',wake_ended_at=? WHERE task_id=? AND resident_id=? AND wake_status='pending'`)
      .run(now, wakeId, residentId).changes > 0;
    return {residentId, cancelledWakeId: changed ? wakeId : null, cancelledWakeIds: changed ? [wakeId] : []};
  }
}
