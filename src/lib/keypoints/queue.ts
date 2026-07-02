let tail: Promise<unknown> = Promise.resolve();

/** 簡單 in-memory 序列化佇列，確保同時間只有一個 claude -p 分析行程在跑。 */
export function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
