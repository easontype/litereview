import fs from "node:fs";
import path from "node:path";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

/** 把使用者上傳的 PDF 存到本機磁碟，供之後「找重點」延遲讀取（避免要求使用者重複上傳同一份檔案）。 */
export function saveUploadedPdf(paperId: string, buffer: Buffer) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, `${paperId}.pdf`), buffer);
}

export function getUploadedPdf(paperId: string): Buffer | null {
  const filePath = path.join(UPLOAD_DIR, `${paperId}.pdf`);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
}

/** 是否有本機 PDF 可供閱覽（上傳或 Unpaywall 落地的都放同一路徑）。 */
export function hasStoredPdf(paperId: string): boolean {
  return fs.existsSync(path.join(UPLOAD_DIR, `${paperId}.pdf`));
}
