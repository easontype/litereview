/**
 * In-memory 任務事件存放區：長任務（辯論，之後 v1.3 的找重點/比較）把進度事件寫進來，
 * SSE endpoint（/api/jobs/[id]/events）重播歷史事件並訂閱後續事件。
 * 純記憶體、單機工具夠用；server 重啟後任務狀態以 DB 為準。
 */

export interface JobEvent {
  type: string;
  data: unknown;
}

type Listener = (event: JobEvent) => void;

interface Job {
  id: string;
  status: "running" | "done" | "failed";
  events: JobEvent[];
  listeners: Set<Listener>;
}

const jobs = new Map<string, Job>();
const CLEANUP_DELAY_MS = 10 * 60 * 1000;

export function createJob(id: string): void {
  jobs.set(id, { id, status: "running", events: [], listeners: new Set() });
}

export function getJob(id: string): { status: Job["status"]; events: JobEvent[] } | undefined {
  const job = jobs.get(id);
  return job ? { status: job.status, events: job.events } : undefined;
}

export function emit(id: string, type: string, data: unknown): void {
  const job = jobs.get(id);
  if (!job) return;
  const event: JobEvent = { type, data };
  job.events.push(event);
  for (const listener of job.listeners) listener(event);
}

function finish(id: string, status: "done" | "failed", data: unknown) {
  const job = jobs.get(id);
  if (!job) return;
  job.status = status;
  emit(id, status, data);
  setTimeout(() => jobs.delete(id), CLEANUP_DELAY_MS).unref?.();
}

export function completeJob(id: string, data: unknown = null): void {
  finish(id, "done", data);
}

export function failJob(id: string, error: string): void {
  finish(id, "failed", { error });
}

/** 訂閱後續事件；回傳取消訂閱函式。任務已結束時不會再有新事件（用 getJob 重播歷史）。 */
export function subscribe(id: string, listener: Listener): () => void {
  const job = jobs.get(id);
  if (!job) return () => {};
  job.listeners.add(listener);
  return () => job.listeners.delete(listener);
}
