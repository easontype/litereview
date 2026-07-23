import { spawn } from "node:child_process";

export interface CodexCliOptions {
  model?: string;
  timeoutMs?: number;
}

const DEFAULT_MODEL = "gpt-5.6-sol";
const DEFAULT_TIMEOUT_MS = 600_000;

/**
 * 呼叫本機 `codex` CLI（走使用者 ChatGPT 訂閱登入，不吃 OPENAI_API_KEY）。
 * 契約（codex-cli 0.144.x 實測）：`codex exec` 不帶 prompt 參數時從 stdin 讀入，
 * 最終回答輸出到 stdout（進度與 banner 走 stderr）。
 * `--sandbox read-only` 禁止寫檔——這裡只做純文字生成，不需要任何檔案權限。
 * prompt 走 stdin，避免 Windows argv 長度上限與引號逃脫問題（同 claude-cli 的作法）。
 */
export function runCodex(prompt: string, options: CodexCliOptions = {}): Promise<string> {
  const model = options.model ?? DEFAULT_MODEL;
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const child = spawn(
      "codex",
      ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "-m", model],
      {
        env: { ...process.env },
        shell: process.platform === "win32", // Windows 上讓 PATH 解析 codex.exe / shim 一致
      }
    );

    const killTimer = setTimeout(() => {
      child.kill();
      reject(new Error(`codex CLI 逾時（${timeout}ms）`));
    }, timeout);

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(killTimer);
      reject(new Error(`codex CLI 執行失敗: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(killTimer);
      const text = stdout.trim();
      if (code !== 0 || !text) {
        reject(new Error(`codex CLI 執行失敗: ${stderr.trim() || `exit code ${code}`}`));
        return;
      }
      resolve(text);
    });

    child.stdin?.write(prompt);
    child.stdin?.end();
  });
}
