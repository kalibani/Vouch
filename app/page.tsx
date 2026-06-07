import Link from "next/link";

const SAMPLE_CURL = `curl -X POST https://your-deployment.vercel.app/api/handover \\
  -H "Content-Type: application/json" \\
  -d '{
    "hotel": { "id": "hotel_vouch_orchard", "name": "Vouch Orchard" },
    "events": [
      {
        "id": "evt_0205_pms_status",
        "timestamp": "2026-05-29T15:10:00+08:00",
        "type": "occupancy",
        "room": "205",
        "guest": "Tan, W.",
        "description": "PMS status set to in-house at check-in.",
        "status": "in-house"
      }
    ],
    "freeText": [
      {
        "label": "Night of Thu 29 May",
        "text": "02:40 floor walk: room 205 found empty, keycard deactivated."
      }
    ],
    "asOf": "2026-05-30"
  }'`;

export default function Home() {
  return (
    <main className="container">
      <p className="eyebrow">Vouch · Front Desk Operations</p>
      <h1>Night-Shift Handover</h1>
      <p className="lede">
        Turns a week of messy, multi-format, multi-language front-desk events into an action-first
        handover a morning manager can trust in 60 seconds. Every line is grounded in a source
        event, contradictions and incomplete entries are flagged rather than smoothed over, and any
        instruction hidden in guest data is surfaced for review — never obeyed.
      </p>

      <p style={{ margin: "1.5rem 0" }}>
        <Link
          href="/handover"
          style={{
            display: "inline-block",
            background: "var(--navy-900)",
            color: "#fff",
            padding: "0.6rem 1.1rem",
            borderRadius: "0.5rem",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          View a sample handover →
        </Link>
      </p>

      <p className="eyebrow" style={{ marginTop: "2.5rem" }}>
        Sample request
      </p>
      <p className="muted" style={{ marginTop: 0 }}>
        POST <code>/api/handover</code> with the hotel, structured <code>events</code>, free-text
        night logs (<code>freeText</code>), and the morning date (<code>asOf</code>). Returns the
        grounded handover as JSON or HTML.
      </p>
      <pre
        style={{
          background: "var(--navy-900)",
          color: "#e6edf3",
          padding: "1.25rem",
          borderRadius: "0.6rem",
          overflowX: "auto",
          fontSize: "0.82rem",
          lineHeight: 1.6,
        }}
      >
        <code>{SAMPLE_CURL}</code>
      </pre>
    </main>
  );
}
