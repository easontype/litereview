import { NextRequest } from "next/server";
import { getJob, subscribe } from "@/lib/jobs/store";

export const dynamic = "force-dynamic";

/** SSE：重播任務既有事件後持續推送，任務結束（done/failed 事件）即關閉串流。 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) {
    return new Response("job not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: { type: string; data: unknown }) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        if (event.type === "done" || event.type === "failed") {
          closed = true;
          unsubscribe();
          controller.close();
        }
      };

      const unsubscribe = subscribe(id, send);
      for (const event of job.events) send(event);
      if (!closed && job.status !== "running") {
        // events 重播完但沒有終態事件（理論上不會發生），保險關閉
        closed = true;
        unsubscribe();
        controller.close();
      }

      req.signal.addEventListener("abort", () => {
        if (!closed) {
          closed = true;
          unsubscribe();
          controller.close();
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
