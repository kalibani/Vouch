/**
 * POST /api/handover — generate a night-shift handover.
 *
 * Body: { hotel, events[], freeText[], asOf? } (see lib/schema HandoverRequest).
 * With no body, falls back to the bundled sample so the deployed service is
 * hittable with a bare `curl`. GET does the same for convenience.
 *
 * Runs on the Node.js runtime (Anthropic + Supabase SDKs); maxDuration is raised
 * for model latency.
 */
import { runPipeline } from "@/lib/pipeline";
import { sampleRequest } from "@/lib/sample";
import { HandoverRequestSchema } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 60;
// The GET convenience runs the full pipeline (model + DB). Force dynamic so it
// never serves a cached/stale handover or wastes model spend on a build render.
export const dynamic = "force-dynamic";

function isNonEmptyObject(v: unknown): boolean {
  return Boolean(v) && typeof v === "object" && Object.keys(v as object).length > 0;
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = undefined;
  }

  const parsed = HandoverRequestSchema.safeParse(isNonEmptyObject(body) ? body : sampleRequest());
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    return Response.json(await runPipeline(parsed.data));
  } catch (err) {
    return Response.json(
      { error: "pipeline_failed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<Response> {
  try {
    return Response.json(await runPipeline(sampleRequest()));
  } catch (err) {
    return Response.json(
      { error: "pipeline_failed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
