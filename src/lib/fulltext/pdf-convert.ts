/**
 * PDF→文字統一入口（取代 v1.3 以前的 datalab.to Marker 雲端 API）：
 * 設定頁有掛外部轉換命令就先走 Tier 2，失敗或沒設定時退回內建 pdfjs 抽取（Tier 1）。
 */
import { convertViaExternalCommand, getPdf2mdCommand } from "./external-converter";
import { extractPdfText } from "./pdf-to-text";

export async function convertPdfToText(buffer: Buffer): Promise<string> {
  const command = getPdf2mdCommand();
  if (command) {
    try {
      return await convertViaExternalCommand(buffer, command);
    } catch {
      // 外掛失敗不擋路，退回內建轉換
    }
  }
  return extractPdfText(buffer);
}
