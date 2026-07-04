/**
 * 產生最小合法單頁 PDF（Helvetica 純文字、含正確 xref），
 * 供「PDF 轉換測試按鈕」與 e2e 測試使用，免除對外部測試檔案的依賴。
 * 只支援 ASCII 文字（WinAnsi 編碼範圍外的字元不保證顯示）。
 */
export function buildSamplePdf(lines: string[]): Buffer {
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const content =
    "BT /F1 12 Tf 72 720 Td 16 TL\n" +
    lines.map((line, i) => `${i > 0 ? "T* " : ""}(${escape(line)}) Tj\n`).join("") +
    "ET\n";

  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>",
    `<</Length ${Buffer.byteLength(content)}>>stream\n${content}endstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    body += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(body, "latin1");
}
