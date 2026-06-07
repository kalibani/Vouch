import type { Metadata } from "next";
import { HandoverView } from "./HandoverView";
import { SAMPLE } from "./sample";

export const metadata: Metadata = {
  title: "Night-Shift Handover · Vouch Orchard",
  description: "Action-first, grounded night-shift handover for the morning manager.",
};

export default function HandoverPage() {
  // TODO: replace fixture with POST /api/handover output once the pipeline lands.
  return <HandoverView handover={SAMPLE} />;
}
