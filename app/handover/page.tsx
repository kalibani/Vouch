import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { runPipeline } from "@/lib/pipeline";
import { sampleRequest } from "@/lib/sample";
import type { Handover } from "@/lib/schema";
import { HandoverView } from "./HandoverView";
import { SAMPLE } from "./sample";

export const metadata: Metadata = {
  title: "Night-Shift Handover · Vouch",
  description: "Action-first, grounded night-shift handover for the morning manager.",
};

// Render per request — so `next build` never fires the model (no per-deploy cost),
// and the page always reflects the latest cached run.
export const dynamic = "force-dynamic";

// ...but cache the actual pipeline run for an hour: visiting the page costs a real
// Haiku+Sonnet pass at most once per hour, not once per visitor. The first request
// after the cache expires runs the live pipeline (~30s); the rest are instant.
const getCachedHandover = unstable_cache(
  async (): Promise<Handover> => runPipeline(sampleRequest()),
  ["handover-sample"],
  { revalidate: 3600 },
);

export default async function HandoverPage() {
  let handover: Handover;
  let live = true;
  try {
    handover = await getCachedHandover();
  } catch {
    // If the model/DB is unavailable, fall back to the representative fixture so
    // the page always renders. The live grounded handover remains the API.
    handover = SAMPLE;
    live = false;
  }

  return (
    <>
      <div
        className="px-6 py-1.5 text-center font-mono text-[0.68rem] tracking-wide"
        style={
          live
            ? { backgroundColor: "var(--resolved-tint)", color: "var(--resolved)" }
            : { backgroundColor: "var(--pending-tint)", color: "var(--navy-900)" }
        }
      >
        {live
          ? "● live pipeline output — real Haiku + Sonnet pass, cached hourly"
          : "○ representative sample — live pipeline unavailable right now (the API is the live path)"}
      </div>
      <HandoverView handover={handover} />
    </>
  );
}
