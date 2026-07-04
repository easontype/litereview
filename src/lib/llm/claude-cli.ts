import { execFile, spawn } from "node:child_process";

export interface ClaudeCliOptions {
  model?: string;
  timeoutMs?: number;
}

const DEFAULT_MODEL = "claude-sonnet-5";
const DEFAULT_TIMEOUT_MS = 600_000;

function buildEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.ANTHROPIC_API_KEY;
  return env;
}

/**
 * 呼叫本機 `claude` CLI（走使用者登入的訂閱 token，不吃 ANTHROPIC_API_KEY）。
 * prompt 走 stdin，避免 Windows shell 引號逃脫問題。
 */
export function runClaude(prompt: string, options: ClaudeCliOptions = {}): Promise<string> {
  const model = options.model ?? DEFAULT_MODEL;
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const child = execFile(
      "claude",
      ["--print", "--output-format", "json", "--no-session-persistence", "--tools", "", "--model", model],
      {
        env: buildEnv(),
        timeout,
        maxBuffer: 1024 * 1024 * 64,
        shell: process.platform === "win32", // Windows 上 claude 是 .cmd shim，需要透過 shell 解析
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`claude CLI 執行失敗: ${stderr || error.message}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          resolve(typeof parsed.result === "string" ? parsed.result : stdout);
        } catch {
          resolve(stdout.trim());
        }
      }
    );

    child.stdin?.write(prompt);
    child.stdin?.end();
  });
}

/**
 * 逐字串流版：`--output-format stream-json --include-partial-messages` 逐行解析
 * content_block_delta 的 text_delta。CLI 版本不支援 partial 事件時退回一次 yield 完整結果。
 */
export async function* runClaudeStream(
  prompt: string,
  options: ClaudeCliOptions = {}
): AsyncGenerator<string> {
  const model = options.model ?? DEFAULT_MODEL;
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const child = spawn(
    "claude",
    [
      "--print",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--no-session-persistence",
      "--tools",
      "",
      "--model",
      model,
    ],
    { env: buildEnv(), shell: process.platform === "win32" }
  );

  const killTimer = setTimeout(() => child.kill(), timeout);
  const spawnError: { current: Error | null } = { current: null };
  child.on("error", (err) => {
    spawnError.current = err;
  });
  let stderr = "";
  child.stderr?.on("data", (d: Buffer) => {
    stderr += d.toString();
  });
  child.stdin?.write(prompt);
  child.stdin?.end();

  let buffer = "";
  let sawDelta = false;
  let finalResult: string | null = null;

  try {
    for await (const chunk of child.stdout ?? []) {
      buffer += chunk.toString();
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let evt: { type?: string; result?: unknown; event?: { type?: string; delta?: { type?: string; text?: unknown } } };
        try {
          evt = JSON.parse(line);
        } catch {
          continue;
        }
        if (evt.type === "stream_event") {
          const e = evt.event;
          if (e?.type === "content_block_delta" && e.delta?.type === "text_delta" && typeof e.delta.text === "string") {
            sawDelta = true;
            yield e.delta.text;
          }
        } else if (evt.type === "result" && typeof evt.result === "string") {
          finalResult = evt.result;
        }
      }
    }

    const code: number | null = await new Promise((res) => child.on("close", res));
    if (spawnError.current) throw new Error(`claude CLI 執行失敗: ${spawnError.current.message}`);
    if (code !== 0 && !sawDelta && finalResult === null) {
      throw new Error(`claude CLI 執行失敗: ${stderr || `exit code ${code}`}`);
    }
    if (!sawDelta && finalResult !== null) yield finalResult;
  } finally {
    clearTimeout(killTimer);
    if (child.exitCode === null) child.kill();
  }
}
