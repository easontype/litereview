import { execFile } from "node:child_process";

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
