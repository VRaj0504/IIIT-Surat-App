// Web replacement for "add to calendar": downloads a standard .ics file,
// which Google Calendar / Outlook / Apple Calendar all open directly.
function fmt(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function esc(s: string): string {
  return s.replace(/[\\;,]/g, (m) => "\\" + m).replace(/\r?\n/g, "\\n");
}

export function downloadIcs(params: {
  title: string;
  start: Date;
  end: Date;
  location?: string;
  notes?: string;
}): void {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//IIIT Surat App//EN",
    "BEGIN:VEVENT",
    `UID:${Date.now()}@iiit-surat-app`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(params.start)}`,
    `DTEND:${fmt(params.end)}`,
    `SUMMARY:${esc(params.title)}`,
    ...(params.location ? [`LOCATION:${esc(params.location)}`] : []),
    ...(params.notes ? [`DESCRIPTION:${esc(params.notes)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const g = globalThis as any;
  const blob = new g.Blob([lines.join("\r\n")], { type: "text/calendar" });
  const url = g.URL.createObjectURL(blob);
  const a = g.document.createElement("a");
  a.href = url;
  a.download = "event.ics";
  g.document.body.appendChild(a);
  a.click();
  g.document.body.removeChild(a);
  g.URL.revokeObjectURL(url);
}
