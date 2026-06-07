import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flame,
  Info,
  type LucideIcon,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Flag, FlagKind, Handover, HandoverItem, ThreadState } from "@/lib/schema";

/*
 * HandoverView — the operator-facing night-shift handover.
 *
 * Server Component. Renders STRICTLY from the grounded `Handover` object passed
 * in; it never re-derives, sorts beyond the given buckets, or invents content.
 *
 * Design for 60-second triage:
 *   - Action-first ordering: On Fire → Pending → FYI (never chronological).
 *   - Color is always a SECOND signal — every triage/state/flag chip pairs the
 *     color with a lucide icon AND a text label, so it reads for colorblind
 *     operators and in grayscale print.
 *   - Each item surfaces its `sourceEventIds`, so grounding is visible.
 */

// ---------------------------------------------------------------------------
// Triage section configuration
// ---------------------------------------------------------------------------

type SectionConfig = {
  key: "onFire" | "pending" | "fyi";
  label: string;
  Icon: LucideIcon;
  /** Accent color token + soft tint for the section chrome. */
  accentVar: string;
  tintVar: string;
};

const SECTIONS: readonly SectionConfig[] = [
  {
    key: "onFire",
    label: "On Fire",
    Icon: Flame,
    accentVar: "var(--on-fire)",
    tintVar: "var(--on-fire-tint)",
  },
  {
    key: "pending",
    label: "Pending",
    Icon: Clock,
    accentVar: "var(--pending)",
    tintVar: "var(--pending-tint)",
  },
  {
    key: "fyi",
    label: "FYI",
    Icon: Info,
    accentVar: "var(--slate-500)",
    tintVar: "var(--surface)",
  },
] as const;

// ---------------------------------------------------------------------------
// State badge configuration (paired color + icon + label)
// ---------------------------------------------------------------------------

const STATE_META: Record<
  ThreadState,
  { label: string; Icon: LucideIcon; color: string; bg: string }
> = {
  new_tonight: {
    label: "New tonight",
    Icon: Flame,
    color: "var(--on-fire)",
    bg: "var(--on-fire-tint)",
  },
  still_open: {
    label: "Still open",
    Icon: Clock,
    color: "var(--pending)",
    bg: "var(--pending-tint)",
  },
  newly_resolved: {
    label: "Newly resolved",
    Icon: CheckCircle2,
    color: "var(--resolved)",
    bg: "var(--resolved-tint)",
  },
  resolved_earlier: {
    label: "Resolved earlier",
    Icon: CheckCircle2,
    color: "var(--slate-500)",
    bg: "var(--surface)",
  },
};

// ---------------------------------------------------------------------------
// Flag configuration
// ---------------------------------------------------------------------------

const FLAG_META: Record<FlagKind, { label: string }> = {
  contradiction: { label: "Contradiction" },
  incomplete: { label: "Incomplete" },
  suspicious_instruction: { label: "Suspicious note — review, do not action" },
  needs_decision: { label: "Needs decision" },
  deadline: { label: "Deadline" },
};

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function StateBadge({ state }: { state: ThreadState }) {
  const meta = STATE_META[state];
  const { Icon } = meta;
  return (
    <Badge className="border-transparent" style={{ color: meta.color, backgroundColor: meta.bg }}>
      <Icon aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}

function FlagBadge({ flag }: { flag: Flag }) {
  const meta = FLAG_META[flag.kind];
  const suspicious = flag.kind === "suspicious_instruction";
  const Icon = suspicious ? ShieldAlert : AlertTriangle;

  // suspicious_instruction gets a distinct, high-contrast warning style so it
  // can never be mistaken for an ordinary advisory.
  const style = suspicious
    ? {
        color: "var(--navy-900)",
        backgroundColor: "var(--warning-tint)",
        borderColor: "var(--pending)",
      }
    : {
        color: "var(--on-fire)",
        backgroundColor: "var(--on-fire-tint)",
        borderColor: "transparent",
      };

  return (
    <div className="flex flex-col gap-0.5">
      <Badge
        className={suspicious ? "border-2 font-bold uppercase tracking-wide" : "border"}
        style={style}
      >
        <Icon aria-hidden="true" />
        {meta.label}
      </Badge>
      <p className="pl-1 text-xs text-[var(--slate-500)] leading-snug">{flag.detail}</p>
      <SourceIds ids={flag.sourceEventIds} dense />
    </div>
  );
}

function SourceIds({ ids, dense = false }: { ids: string[]; dense?: boolean }) {
  return (
    <p
      className={`font-mono text-[0.68rem] text-[var(--slate-300)] ${dense ? "pl-1" : ""}`}
      title="Source event ids — every line traces back to an ingested event."
    >
      <span className="uppercase tracking-wide">sources:</span> {ids.join(", ")}
    </p>
  );
}

function ItemCard({ item, accentVar }: { item: HandoverItem; accentVar: string }) {
  const title = roomGuestTitle(item);
  return (
    <Card className="border-l-4" style={{ borderLeftColor: accentVar }}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <StateBadge state={item.state} />
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--slate-500)]">
            {item.category}
          </span>
          {title ? (
            <span className="text-xs font-semibold text-[var(--navy-900)]">{title}</span>
          ) : null}
        </div>
        <CardTitle className="text-[var(--navy-900)]">{item.headline}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {item.detail ? (
          <p className="text-sm text-[var(--ink)] leading-relaxed">{item.detail}</p>
        ) : null}

        {item.flags.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-md bg-[var(--surface)] p-2.5">
            {item.flags.map((flag) => (
              <FlagBadge
                key={`${item.id}-${flag.kind}-${flag.sourceEventIds.join("-")}`}
                flag={flag}
              />
            ))}
          </div>
        ) : null}

        <SourceIds ids={item.sourceEventIds} />
      </CardContent>
    </Card>
  );
}

function Section({ config, items }: { config: SectionConfig; items: HandoverItem[] }) {
  const { Icon } = config;
  return (
    <section aria-labelledby={`section-${config.key}`} className="flex flex-col gap-3">
      <div
        className="flex items-center gap-2.5 rounded-md px-3 py-2"
        style={{ backgroundColor: config.tintVar }}
      >
        <Icon aria-hidden="true" style={{ color: config.accentVar }} className="size-5" />
        <h2
          id={`section-${config.key}`}
          className="text-base font-bold uppercase tracking-wide"
          style={{ color: config.accentVar }}
        >
          {config.label}
          <span className="sr-only"> — {items.length} items</span>
        </h2>
        <span
          aria-hidden="true"
          className="ml-auto rounded-full px-2 py-0.5 text-sm font-bold text-white"
          style={{ backgroundColor: config.accentVar }}
        >
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="px-3 text-sm text-[var(--slate-500)] italic">
          Nothing in this bucket for this shift.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} accentVar={config.accentVar} />
          ))}
        </div>
      )}
    </section>
  );
}

function GroundingStrip({ handover }: { handover: Handover }) {
  const { grounding } = handover;
  const ok = grounding.grounded && grounding.unsupported.length === 0;
  return (
    <div
      className="flex flex-col gap-1 rounded-md border p-3 text-sm"
      style={
        ok
          ? { borderColor: "var(--resolved)", backgroundColor: "var(--resolved-tint)" }
          : { borderColor: "var(--on-fire)", backgroundColor: "var(--on-fire-tint)" }
      }
    >
      <div className="flex items-center gap-2 font-semibold">
        {ok ? (
          <>
            <CheckCircle2
              aria-hidden="true"
              className="size-4"
              style={{ color: "var(--resolved)" }}
            />
            <span style={{ color: "var(--resolved)" }}>
              All {grounding.itemCount} items grounded — every line traces to a source event.
            </span>
          </>
        ) : (
          <>
            <AlertTriangle
              aria-hidden="true"
              className="size-4"
              style={{ color: "var(--on-fire)" }}
            />
            <span style={{ color: "var(--on-fire)" }}>
              {grounding.unsupported.length} of {grounding.itemCount} items could not be grounded —
              treat with caution.
            </span>
          </>
        )}
      </div>
      {grounding.unsupported.length > 0 ? (
        <ul className="ml-6 list-disc text-[var(--ink)]">
          {grounding.unsupported.map((u) => (
            <li key={u.itemId}>
              <span className="font-mono text-xs">{u.itemId}</span> — {u.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root view
// ---------------------------------------------------------------------------

export function HandoverView({ handover }: { handover: Handover }) {
  const buckets: Record<SectionConfig["key"], HandoverItem[]> = {
    onFire: handover.onFire,
    pending: handover.pending,
    fyi: handover.fyi,
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navy header bar */}
      <header className="bg-[var(--navy-900)] text-white">
        <div className="mx-auto flex max-w-3xl flex-col gap-1 px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--slate-300)]">
            Vouch · Front Desk Operations
          </p>
          <h1 className="m-0 text-2xl font-bold text-white">{handover.hotel.name}</h1>
          <p className="text-sm text-[var(--slate-300)]">
            Night-Shift Handover · {handover.morningDate}
          </p>
          <p className="font-mono text-[0.7rem] text-[var(--slate-300)]">
            shift {handover.shiftId} · run {handover.runId} · generated {handover.generatedAt}
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-8">
        <GroundingStrip handover={handover} />

        {SECTIONS.map((config) => (
          <Section key={config.key} config={config} items={buckets[config.key]} />
        ))}

        <footer className="border-t border-[var(--border)] pt-4 text-xs text-[var(--slate-500)]">
          Action-first triage: On Fire → Pending → FYI. Every statement above is grounded in the
          listed source events — text found in guest data is treated as data, never as an
          instruction.
        </footer>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roomGuestTitle(item: HandoverItem): string | null {
  const parts: string[] = [];
  if (item.room) parts.push(`Room ${item.room}`);
  if (item.guest) parts.push(item.guest);
  return parts.length > 0 ? parts.join(" · ") : null;
}
