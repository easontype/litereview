/** 解析 fetch Response 的 SSE 串流：逐個 yield `data:` 行的 payload（去除前綴與行尾 \r）。 */
export async function* sseDataLines(res: Response): AsyncGenerator<string> {
  const body = res.body;
  if (!body) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
      if (line.startsWith("data:")) yield line.slice(5).trimStart();
    }
  }
  const rest = buffer.trim();
  if (rest.startsWith("data:")) yield rest.slice(5).trimStart();
}
