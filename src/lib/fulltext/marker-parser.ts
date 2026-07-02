const MARKER_API_BASE = "https://www.datalab.to/api/v1/marker";
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 60;

interface MarkerPollResponse {
  status?: string;
  markdown?: string;
  error?: string;
}

/** 上傳 PDF buffer 給 Marker API（datalab.to），輪詢直到完成，回傳 markdown 全文。 */
export async function parsePdfToMarkdown(buffer: Buffer): Promise<string> {
  const apiKey = process.env.MARKER_API_KEY;
  if (!apiKey) throw new Error("MARKER_API_KEY 未設定");

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: "application/pdf" }), "document.pdf");
  form.append("output_format", "markdown");

  const startRes = await fetch(MARKER_API_BASE, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: form,
  });
  if (!startRes.ok) throw new Error(`Marker API 提交失敗: ${startRes.status}`);

  const { request_id } = (await startRes.json()) as { request_id?: string };
  if (!request_id) throw new Error("Marker API: 缺少 request_id");

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const pollRes = await fetch(`${MARKER_API_BASE}/${request_id}`, {
      headers: { "X-API-Key": apiKey },
    });
    if (!pollRes.ok) throw new Error(`Marker API 查詢失敗: ${pollRes.status}`);
    const data = (await pollRes.json()) as MarkerPollResponse;
    if (data.status === "complete") return data.markdown ?? "";
    if (data.status === "failed") throw new Error(data.error ?? "Marker API 解析失敗");
  }
  throw new Error("Marker API 輪詢逾時");
}
