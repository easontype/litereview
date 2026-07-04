/**
 * Tier 2 可選外掛：使用者在設定頁提供外部 PDF→Markdown 轉換命令
 * （如 Docling、本機 Marker），以 subprocess 執行，不進 npm 依賴。
 *
 * 命令中 `{input}` 會替換成暫存 PDF 路徑（必填）；`{output}` 替換成暫存 .md 檔路徑、
 * `{outdir}` 替換成暫存資料夾（執行後撈其中第一個 .md，適合 Marker 這類輸出到資料夾的工具）；
 * 兩者都沒有時收 stdout。
 */
import { exec } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getSetting } from "@/lib/db";

const TIMEOUT_MS = 10 * 60 * 1000;
const MAX_BUFFER = 64 * 1024 * 1024;

export function getPdf2mdCommand(): string | null {
  const value = getSetting("pdf2md_command");
  return value?.trim() ? value.trim() : null;
}

export async function convertViaExternalCommand(buffer: Buffer, command: string): Promise<string> {
  if (!command.includes("{input}")) {
    throw new Error("外部轉換命令必須包含 {input} placeholder");
  }

  const dir = await mkdtemp(path.join(tmpdir(), "litereview-pdf2md-"));
  const inputPath = path.join(dir, "input.pdf");
  const outputPath = path.join(dir, "output.md");
  const outDirPath = path.join(dir, "out");
  const useOutputFile = command.includes("{output}");
  const useOutDir = command.includes("{outdir}");

  try {
    await writeFile(inputPath, buffer);
    if (useOutDir) await mkdir(outDirPath);
    const cmd = command
      .replaceAll("{input}", `"${inputPath}"`)
      .replaceAll("{output}", `"${outputPath}"`)
      .replaceAll("{outdir}", `"${outDirPath}"`);

    const stdout = await new Promise<string>((resolve, reject) => {
      exec(cmd, { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER, windowsHide: true }, (err, stdout, stderr) => {
        if (err) {
          const detail = (stderr || stdout || err.message).trim().slice(0, 400);
          reject(new Error(`外部轉換命令失敗: ${detail}`));
        } else {
          resolve(stdout);
        }
      });
    });

    let text: string;
    if (useOutDir) {
      const entries = await readdir(outDirPath, { recursive: true, withFileTypes: true });
      const mdFile = entries.find((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"));
      if (!mdFile) throw new Error("外部轉換命令沒有在 {outdir} 產出 .md 檔");
      text = await readFile(path.join(mdFile.parentPath, mdFile.name), "utf-8");
    } else if (useOutputFile) {
      text = await readFile(outputPath, "utf-8");
    } else {
      text = stdout;
    }
    if (!text.trim()) throw new Error("外部轉換命令沒有產出內容");
    return text;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
