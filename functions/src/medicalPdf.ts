import {PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, degrees} from "pdf-lib";
import {LATE_LIMIT_DAYS, MedicalAttachment, MedicalRequest, MedicalSign, SignatureVector} from "./medicalTypes";

const A4: [number, number] = [595.28, 841.89];
const M = 40;
const INK = rgb(0.06, 0.09, 0.18);
const SOFT = rgb(0.36, 0.39, 0.47);
const LINE = rgb(0.2, 0.2, 0.2);
const GREEN = rgb(0.08, 0.5, 0.24);
const RED = rgb(0.76, 0.16, 0.12);

export function clean(s: unknown): string {
  return String(s ?? "")
    .replace(/[→⇒]/g, "->")
    .replace(/[·•]/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/₹/g, "Rs.")
    .replace(/…/g, "...")
    .replace(/[\r\t]/g, " ")
    .split("")
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255);
    })
    .join("");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtIso(iso?: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
}

export function fmtDateTime(d?: Date | null): string {
  if (!d) return "";
  const ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
  const hh = ist.getUTCHours();
  const mm = String(ist.getUTCMinutes()).padStart(2, "0");
  return `${String(ist.getUTCDate()).padStart(2, "0")} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}, ` +
    `${hh % 12 === 0 ? 12 : hh % 12}:${mm} ${hh >= 12 ? "PM" : "AM"}`;
}

export function isoToUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((isoToUtc(toIso) - isoToUtc(fromIso)) / 86400000);
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of clean(text).split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
      } else {
        if (line) out.push(line);
        let piece = w;
        while (font.widthOfTextAtSize(piece, size) > width && piece.length > 1) {
          let cut = piece.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(piece.slice(0, cut), size) > width) cut--;
          out.push(piece.slice(0, cut));
          piece = piece.slice(cut);
        }
        line = piece;
      }
    }
    out.push(line);
  }
  return out;
}

type Fonts = {reg: PDFFont; bold: PDFFont; ital: PDFFont};

function drawLines(page: PDFPage, lines: string[], x: number, yTop: number, font: PDFFont, size: number, color = INK, lead = 1.3) {
  lines.forEach((l, i) => page.drawText(l, {x, y: yTop - size - i * size * lead, size, font, color}));
}

function drawSignature(page: PDFPage, sig: SignatureVector, x: number, yTop: number, boxW: number, boxH: number, img?: PDFImage | null) {
  if (img) {
    const s = Math.min(boxW / img.width, boxH / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    page.drawImage(img, {x: x + (boxW - dw) / 2, y: yTop - boxH + (boxH - dh) / 2, width: dw, height: dh});
    return;
  }
  if (!sig?.paths?.length || !sig.w || !sig.h) return;
  const scale = Math.min(boxW / sig.w, boxH / sig.h);
  const offX = x + (boxW - sig.w * scale) / 2;
  const offY = yTop - (boxH - sig.h * scale) / 2;
  for (const p of sig.paths) {
    if (!p) continue;
    try {
      page.drawSvgPath(p, {x: offX, y: offY, scale, borderColor: rgb(0.05, 0.1, 0.45), borderWidth: 1.6 / scale});
    } catch {
      continue;
    }
  }
}

function drawStamp(page: PDFPage, f: Fonts, sign: MedicalSign, cx: number, cy: number) {
  const ok = sign.decision === "approved";
  const label = ok ? "APPROVED" : "NOT APPROVED";
  const color = ok ? GREEN : RED;
  const size = 12;
  const w = f.bold.widthOfTextAtSize(label, size) + 22;
  const h = 28;
  const rot = degrees(-7);
  const rad = (-7 * Math.PI) / 180;
  const ox = cx - (w / 2) * Math.cos(rad) + (h / 2) * Math.sin(rad);
  const oy = cy - (w / 2) * Math.sin(rad) - (h / 2) * Math.cos(rad);
  page.drawRectangle({x: ox, y: oy, width: w, height: h, borderColor: color, borderWidth: 1.8, rotate: rot, opacity: 0, borderOpacity: 0.9});
  const tx = (dx: number, dy: number) => ({
    x: ox + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: oy + dx * Math.sin(rad) + dy * Math.cos(rad),
  });
  page.drawText(label, {...tx(11, 12.5), size, font: f.bold, color, rotate: rot, opacity: 0.95});
  const when = sign.at ? fmtDateTime(sign.at.toDate()) : "";
  page.drawText(clean(when), {...tx(11, 4), size: 6, font: f.reg, color, rotate: rot, opacity: 0.95});
}

function signBlock(
  page: PDFPage,
  f: Fonts,
  x: number,
  yTop: number,
  w: number,
  h: number,
  caption: string,
  sign: MedicalSign | null | undefined,
  note?: string,
  img?: PDFImage | null,
) {
  const pad = 6;
  const noteLines = note ? wrap(note, f.reg, 7.5, w * 0.42) : [];
  const decY = yTop - h + pad + 1;
  const room = h - pad - 12 - (decY - (yTop - h)) - 12 - noteLines.length * 9.4;
  page.drawText("Comment:", {x: x + pad, y: yTop - pad - 9, size: 9, font: f.reg, color: INK});
  if (sign?.comment) {
    const lines = wrap(sign.comment, f.ital, 8.5, w - 2 * pad - 222).slice(0, Math.max(1, Math.floor(room / 10.6)));
    drawLines(page, lines, x + pad, yTop - pad - 12, f.ital, 8.5, INK, 1.25);
  }
  const opts: {t: string; on: boolean; color: ReturnType<typeof rgb>}[] = [
    {t: "Approved", on: sign?.decision === "approved", color: GREEN},
    {t: "Not Approved", on: sign?.decision === "not_approved", color: RED},
  ];
  let dx = x + pad;
  opts.forEach((o, i) => {
    const font = o.on ? f.bold : f.reg;
    const size = 8.5;
    const tw = font.widthOfTextAtSize(o.t, size);
    const color = sign ? (o.on ? o.color : SOFT) : INK;
    page.drawText(o.t, {x: dx, y: decY, size, font, color});
    if (sign && !o.on) page.drawLine({start: {x: dx - 1, y: decY + 3}, end: {x: dx + tw + 1, y: decY + 3}, thickness: 0.8, color: SOFT});
    if (o.on) page.drawRectangle({x: dx - 3, y: decY - 3, width: tw + 6, height: 12, borderColor: o.color, borderWidth: 0.9, opacity: 0, borderOpacity: 1});
    dx += tw;
    if (i === 0) {
      page.drawText("  /  ", {x: dx, y: decY, size, font: f.reg, color: SOFT});
      dx += f.reg.widthOfTextAtSize("  /  ", size);
    }
  });
  if (sign) {
    drawStamp(page, f, sign, x + w - 170, yTop - 19);
    drawSignature(page, sign.signature, x + w - 108, yTop - 6, 100, h - 38, img);
    const who = clean(`${sign.byName}${sign.designation ? `, ${sign.designation}` : ""}`);
    const whoSize = 7.5;
    const ww = f.reg.widthOfTextAtSize(who, whoSize);
    page.drawRectangle({x: x + w - pad - ww - 2, y: yTop - h + pad + 9, width: ww + 4, height: 9, color: rgb(1, 1, 1), opacity: 0.85});
    page.drawText(who, {x: x + w - pad - ww, y: yTop - h + pad + 11, size: whoSize, font: f.reg, color: SOFT});
  }
  const cap = clean(caption);
  page.drawText(cap, {x: x + w - pad - f.reg.widthOfTextAtSize(cap, 9), y: yTop - h + pad + 1, size: 9, font: f.reg, color: INK});
  if (noteLines.length) {
    drawLines(page, noteLines, x + pad, decY + 21 + (noteLines.length - 1) * 9.4, f.reg, 7.5, SOFT, 1.25);
  }
}

export type FormOptions = {generatedAt?: Date; blank?: boolean};

export async function renderMedicalForm(req: MedicalRequest | null, opts: FormOptions = {}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(req?.refNo ? `Medical absence request ${req.refNo}` : "Request for considering absenteeism due to medical reasons");
  pdf.setAuthor("IIIT Surat");
  pdf.setCreator("CollegeGo");
  const f: Fonts = {
    reg: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    ital: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };
  let page = pdf.addPage(A4);
  const W = A4[0] - 2 * M;
  let y = A4[1] - M;
  const form = req ? null : pdf.getForm();
  const field = (name: string, x: number, yb: number, w: number, h: number, multi = false) => {
    if (!form) return;
    const t = form.createTextField(name);
    if (multi) t.enableMultiline();
    t.addToPage(page, {x, y: yb, width: w, height: h, borderWidth: 0, backgroundColor: rgb(0.96, 0.97, 1)});
    t.setFontSize(multi ? 9.5 : 10);
  };

  const center = (t: string, size: number, font: PDFFont, color = INK) => {
    const s = clean(t);
    page.drawText(s, {x: (A4[0] - font.widthOfTextAtSize(s, size)) / 2, y, size, font, color});
  };
  y -= 16;
  center("Indian Institute of Information Technology Surat", 16, f.bold);
  y -= 14;
  center("(An Institute of National Importance under the Act of Parliament)", 9.5, f.reg, SOFT);
  y -= 12;
  center("Kholvad Campus, Kamrej, Surat, Gujarat - 394190", 9.5, f.reg, SOFT);
  y -= 10;
  page.drawLine({start: {x: M, y}, end: {x: A4[0] - M, y}, thickness: 0.8, color: LINE});
  y -= 22;
  center("REQUEST FOR CONSIDERING ABSENTEEISM DUE TO MEDICAL REASONS", 11, f.bold);
  y -= 14;
  center("(Exams/Academics)", 10.5, f.bold);
  y -= 22;

  const appDate = req?.submittedAt?.toDate?.() ?? req?.createdAt?.toDate?.() ?? null;
  page.drawText("Date of Application (Must be within four days of rejoining):", {x: M, y, size: 9.5, font: f.bold, color: INK});
  if (appDate) page.drawText(clean(fmtDateTime(appDate)), {x: M + 290, y, size: 9.5, font: f.reg, color: INK});
  field("applicationDate", M + 288, y - 4, W - 288, 15);
  if (req?.refNo) {
    const ref = clean(`Ref. No. ${req.refNo}`);
    page.drawText(ref, {x: A4[0] - M - f.bold.widthOfTextAtSize(ref, 9), y: y + 14, size: 9, font: f.bold, color: INK});
  }
  y -= 6;
  if (req && req.daysAfterRejoining != null) {
    y -= 10;
    const late = (req.daysAfterRejoining ?? 0) > LATE_LIMIT_DAYS;
    const t = late ?
      `LATE: submitted ${req.daysAfterRejoining} days after rejoining (limit ${LATE_LIMIT_DAYS} days).` :
      `Submitted ${req.daysAfterRejoining} day${req.daysAfterRejoining === 1 ? "" : "s"} after rejoining (within the ${LATE_LIMIT_DAYS}-day limit).`;
    page.drawText(clean(t), {x: M, y, size: 8.5, font: late ? f.bold : f.reg, color: late ? RED : SOFT});
  }
  y -= 10;

  const c1 = 150;
  const x0 = M;
  const xV = M + c1;
  const wV = W - c1;
  const row = (h: number, label: string, draw: (yTop: number) => void) => {
    page.drawRectangle({x: x0, y: y - h, width: W, height: h, borderColor: LINE, borderWidth: 0.8});
    page.drawLine({start: {x: xV, y}, end: {x: xV, y: y - h}, thickness: 0.8, color: LINE});
    drawLines(page, wrap(label, f.reg, 9.5, c1 - 12), x0 + 6, y - 5, f.reg, 9.5, INK, 1.2);
    draw(y);
    y -= h;
  };
  const split = (h: number, l1: string, v1: string, l2: string, v2: string, n1 = "", n2 = "") => {
    row(h, l1, (top) => {
      field(n1, xV + 3, top - h + 3, 0.5 * wV - 6, h - 6);
      field(n2, xV + 0.5 * wV + 88, top - h + 3, wV - 0.5 * wV - 91, h - 6);
      const s1 = 0.5 * wV;
      page.drawLine({start: {x: xV + s1, y: top}, end: {x: xV + s1, y: top - h}, thickness: 0.8, color: LINE});
      page.drawLine({start: {x: xV + s1 + 85, y: top}, end: {x: xV + s1 + 85, y: top - h}, thickness: 0.8, color: LINE});
      drawLines(page, wrap(v1, f.bold, 10, s1 - 12), xV + 6, top - 6, f.bold, 10);
      drawLines(page, wrap(l2, f.reg, 9.5, 75), xV + s1 + 6, top - 5, f.reg, 9.5);
      drawLines(page, wrap(v2, f.bold, 10, wV - s1 - 97), xV + s1 + 91, top - 6, f.bold, 10);
    });
  };
  const value = (h: number, label: string, v: string, name = "", multi = false) =>
    row(h, label, (top) => {
      field(name, xV + 3, top - h + 3, wV - 6, h - 6, multi);
      drawLines(page, wrap(v, f.reg, 10, wV - 12).slice(0, Math.floor((h - 8) / 12.5)), xV + 6, top - 6, f.reg, 10, INK, 1.25);
    });

  const yearLabel = req?.yearOfStudy ? `${["", "1st", "2nd", "3rd", "4th", "5th"][req.yearOfStudy] ?? `${req.yearOfStudy}th`} Year` : "";
  split(26, "Name of the Student:", req?.studentName ?? "", "Reg. No.:", req?.studentEnrollmentNumber ?? "", "studentName", "regNo");
  split(26, "Branch & Year:", [req?.branch, yearLabel].filter(Boolean).join(", "), "Semester:", req?.semester ? String(req.semester) : "", "branchYear", "semester");
  value(22, "CGPA:", req?.cgpa ?? "", "cgpa");
  const reasonLines = req ? wrap(req.reason, f.reg, 10, wV - 12) : [];
  value(req ? Math.max(40, Math.min(100, 12 + reasonLines.length * 12.5)) : 52, "Medical Reason (to be indicated by the student)", req?.reason ?? "", "medicalReason", true);
  const nDays = req ? daysBetween(req.fromDate, req.toDate) + 1 : 0;
  value(
    38,
    "Period of ABSENTEEISM due to Medical Reasons:",
    req ? `${fmtIso(req.fromDate)} to ${fmtIso(req.toDate)} (${nDays} day${nDays === 1 ? "" : "s"}). Rejoined on ${fmtIso(req.rejoinedOn)}.` : "",
    "period",
    true,
  );
  const embed = async (s?: MedicalSign | null) => {
    if (!s?.signature?.png) return null;
    try {
      return await pdf.embedPng(Buffer.from(s.signature.png, "base64"));
    } catch {
      return null;
    }
  };
  const [imMo, imHod, imDean, imJr] = await Promise.all([embed(req?.medicalSign), embed(req?.hodSign), embed(req?.deanSign), embed(req?.jrSign)]);
  row(86, "The recommendation of IIIT Surat Medical Officer based on the medical reports shown by the student.", (top) =>
    signBlock(page, f, xV, top, wV, 86, "(Signature of IIIT Surat Medical Officer)", req?.medicalSign, "Note: Certificate verified by the IIIT Surat Medical Officer is to be attached", imMo),
  );
  row(70, "Recommendation of HOD:", (top) => signBlock(page, f, xV, top, wV, 70, "(Signature of HoD)", req?.hodSign, undefined, imHod));
  row(70, "Approval of Coordinator/Dean (Academics):", (top) => signBlock(page, f, xV, top, wV, 70, "Associate Dean (Academics)", req?.deanSign, undefined, imDean));
  row(70, "Approval from Office", (top) => signBlock(page, f, xV, top, wV, 70, "Joint Registrar", req?.jrSign, undefined, imJr));

  const encl = [
    "1. Verified Medical Certificate from IIIT Surat Medical Officer.",
    "2. A copy of the email intimation sent to the Course Coordinator, HoD, Academic Coordinator, and Chief Warden within 24 hrs. of the proceeding of medical leave.",
  ];
  const att = req?.attachments ?? [];
  const enclLines = [...encl.flatMap((e) => wrap(e, f.reg, 9, wV - 12))];
  if (att.length) {
    enclLines.push("Attached in this record:");
    att.forEach((a, i) => enclLines.push(...wrap(`  (${String.fromCharCode(97 + i)}) ${KIND_LABEL[a.kind]}: ${a.name}`, f.reg, 9, wV - 12)));
  }
  row(Math.max(48, 10 + enclLines.length * 11.5), "Enclosures:", (top) => drawLines(page, enclLines, xV + 6, top - 5, f.reg, 9, INK, 1.25));

  const instr = [
    {t: "INSTRUCTIONS", b: true, c: true},
    {t: "The student is expected to comply with the following steps for consideration of absenteeism due to medical reasons:"},
    {t: "- The student must send an email informing the Course Coordinator, Office, HoD, Coordinator/Dean Academics, and Chief Warden (if staying in a hostel) about the medical emergency within 24 hours of the beginning of medical leave.", b: true},
    {t: "- On returning to the institute/hostel after medical leave, the student must complete the leave approval process within FOUR days.", b: true},
    {t: "Note: After FOUR days of the rejoining, none of the requests for medical leave will be considered."},
  ];
  const needed = instr.reduce((n, i) => n + wrap(i.t, i.b ? f.bold : f.reg, 8.5, W - 10).length * 11 + 4, 14);
  if (y - needed < 30) {
    page = pdf.addPage(A4);
    y = A4[1] - M;
  } else {
    y -= 12;
  }
  for (const i of instr) {
    const font = i.b ? f.bold : f.reg;
    const lines = wrap(i.t, font, 8.5, W - (i.c ? 0 : 10));
    lines.forEach((l, k) => {
      const x = i.c ? (A4[0] - font.widthOfTextAtSize(l, 9)) / 2 : M + (k > 0 && i.t.startsWith("-") ? 8 : 0);
      page.drawText(l, {x, y: y - 9 - k * 11, size: i.c ? 9 : 8.5, font, color: INK});
    });
    y -= lines.length * 11 + 4;
  }

  if (form) form.updateFieldAppearances(f.reg);
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const foot = clean(
      `${req?.refNo ? `${req.refNo} - ` : ""}Generated by CollegeGo for IIIT Surat${opts.generatedAt ? ` on ${fmtDateTime(opts.generatedAt)}` : ""} - Page ${i + 1} of ${pages.length}`,
    );
    p.drawText(foot, {x: M, y: 20, size: 7, font: f.reg, color: SOFT});
  });
  return pdf.save();
}

export const KIND_LABEL: Record<MedicalAttachment["kind"], string> = {
  report: "Medical report",
  intimation: "Email intimation",
  certificate: "Verified medical certificate",
  other: "Other document",
};

export type AuditRow = {at: Date | null; who: string; action: string; note?: string | null};

export async function renderBundle(
  formPdf: Uint8Array,
  req: MedicalRequest,
  audit: AuditRow[],
  files: {att: MedicalAttachment; bytes: Uint8Array}[],
  generatedAt: Date,
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.setTitle(`Medical absence record ${req.refNo ?? ""}`.trim());
  out.setAuthor("IIIT Surat");
  out.setCreator("CollegeGo");
  const reg = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);

  const form = await PDFDocument.load(formPdf);
  (await out.copyPages(form, form.getPageIndices())).forEach((p) => out.addPage(p));

  const order: Record<string, number> = {report: 0, certificate: 1, intimation: 2, other: 3};
  const sorted = files
    .map((f, i) => ({...f, i}))
    .sort((x, y) => (order[x.att.kind] ?? 9) - (order[y.att.kind] ?? 9) || x.i - y.i);
  const tag = (p: PDFPage, text: string) => {
    const t = clean(text);
    const size = 8;
    const w = bold.widthOfTextAtSize(t, size) + 12;
    const {width, height} = p.getSize();
    p.drawRectangle({x: width - w - 10, y: height - 22, width: w, height: 14, color: rgb(1, 1, 1), opacity: 0.9, borderColor: INK, borderWidth: 0.6});
    p.drawText(t, {x: width - w - 4, y: height - 18, size, font: bold, color: INK});
  };
  for (const [n, {att, bytes}] of sorted.entries()) {
    const label = `Enclosure ${String.fromCharCode(97 + n)} - ${KIND_LABEL[att.kind]}: ${att.name}`;
    const isPdf = att.contentType === "application/pdf" || /\.pdf$/i.test(att.name);
    try {
      if (isPdf) {
        const src = await PDFDocument.load(bytes, {ignoreEncryption: true});
        if (src.isEncrypted) throw new Error("encrypted");
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p, i) => {
          out.addPage(p);
          if (i === 0) tag(p, label);
        });
        continue;
      }
      const png = att.contentType === "image/png" || (bytes[0] === 0x89 && bytes[1] === 0x50);
      const img = png ? await out.embedPng(bytes) : await out.embedJpg(bytes);
      const p = out.addPage(A4);
      p.drawText(clean(label), {x: M, y: A4[1] - M + 6, size: 10, font: bold, color: INK});
      const maxW = A4[0] - 2 * M;
      const maxH = A4[1] - 2 * M - 20;
      const s = Math.min(maxW / img.width, maxH / img.height, 1.5);
      p.drawImage(img, {x: (A4[0] - img.width * s) / 2, y: A4[1] - M - 14 - img.height * s, width: img.width * s, height: img.height * s});
    } catch (e) {
      const p = out.addPage(A4);
      p.drawText(clean(label), {x: M, y: A4[1] - M, size: 10, font: bold, color: INK});
      const why = String((e as Error)?.message) === "encrypted" ?
        "This PDF is password-protected, so it can't be merged here. Open the original from the app or portal." :
        "This file could not be merged (unsupported format). Open the original from the app or portal.";
      p.drawText(why, {x: M, y: A4[1] - M - 16, size: 9, font: reg, color: RED});
    }
  }

  let page = out.addPage(A4);
  let y = A4[1] - M;
  const W = A4[0] - 2 * M;
  const title = (t: string) => {
    page.drawText(clean(t), {x: M, y: y - 14, size: 14, font: bold, color: INK});
    y -= 26;
  };
  title(`Record of processing - ${req.refNo ?? ""}`);
  const summary = [
    `Student: ${req.studentName} (${req.studentEnrollmentNumber ?? "-"})`,
    `Absence: ${fmtIso(req.fromDate)} to ${fmtIso(req.toDate)}; rejoined ${fmtIso(req.rejoinedOn)}`,
    `Final decision: ${req.finalDecision === "approved" ? "APPROVED" : req.finalDecision === "not_approved" ? "NOT APPROVED" : "Pending"}`,
    `Submitted ${req.daysAfterRejoining ?? "-"} day(s) after rejoining${req.late ? ` - LATE (limit ${LATE_LIMIT_DAYS} days)` : ""}`,
  ];
  summary.forEach((s) => {
    page.drawText(clean(s), {x: M, y: y - 10, size: 10, font: reg, color: INK});
    y -= 15;
  });
  y -= 8;
  const cols = [M, M + 120, M + 260, M + 360];
  const header = ["Date & time (IST)", "By", "Action", "Comment"];
  header.forEach((h, i) => page.drawText(h, {x: cols[i], y: y - 9, size: 9, font: bold, color: INK}));
  y -= 14;
  page.drawLine({start: {x: M, y}, end: {x: M + W, y}, thickness: 0.6, color: LINE});
  for (const r of audit) {
    const cells = [
      wrap(fmtDateTime(r.at), reg, 8.5, 115),
      wrap(r.who, reg, 8.5, 135),
      wrap(r.action, bold, 8.5, 95),
      wrap(r.note ?? "", reg, 8.5, M + W - cols[3]),
    ];
    const lines = Math.max(...cells.map((c) => c.length));
    if (y - lines * 11 - 8 < M + 20) {
      page = out.addPage(A4);
      y = A4[1] - M;
    }
    cells.forEach((c, i) => drawLines(page, c, cols[i], y - 3, i === 2 ? bold : reg, 8.5, INK, 1.25));
    y -= lines * 11 + 6;
    page.drawLine({start: {x: M, y: y + 2}, end: {x: M + W, y: y + 2}, thickness: 0.3, color: rgb(0.8, 0.8, 0.8)});
  }

  const total = out.getPageCount();
  out.getPages().forEach((p, i) => {
    p.drawText(clean(`${req.refNo ?? ""} - Complete record generated ${fmtDateTime(generatedAt)} - Page ${i + 1} of ${total}`), {
      x: A4[0] - M - 260,
      y: 10,
      size: 6.5,
      font: reg,
      color: SOFT,
    });
  });
  return out.save();
}
