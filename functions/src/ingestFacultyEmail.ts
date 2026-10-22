import {onRequest} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import {extractRawExamRows, normalizeExtraction} from "./examSheetExtraction";
import {geminiJson} from "./gemini";

const ingestSecret = defineSecret("INGEST_SHARED_SECRET");

const geminiKey = defineSecret("GEMINI_API_KEY");

type IncomingAttachment = {
  filename: string;
  mimeType: string;
  dataBase64: string;
};

type IngestBody = {
  messageId: string;

  from: string;
  to: string;
  cc: string;
  subject: string;
  bodyText: string;
  attachments: IncomingAttachment[];

  authResults?: string;
};

function senderIsAuthenticated(authResults: string | undefined, fromEmail: string): boolean {
  if (!authResults) return false;
  const domain = fromEmail.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  const ar = authResults.toLowerCase();
  const d = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const dmarcPass = new RegExp(`dmarc=pass[^;]*header\\.from=${d}(?![\\w.-])`).test(ar);
  const dkimPass = new RegExp(`dkim=pass[^;]*header\\.(?:i=@|d=)${d}(?![\\w.-])`).test(ar);
  const spfPass = new RegExp(`spf=pass[^;]*smtp\\.mailfrom=[^;\\s]*@${d}(?![\\w.-])`).test(ar);
  return dmarcPass || dkimPass || spfPass;
}

type TargetScope = {
  scope: "all" | "branch" | "section";
  branch: "CSE" | "ECE" | "MNC" | null;
  semester: number | null;
  section: string | null;
  admissionYear: number | null;
  specialization: string | null;
};

type ClassificationResult = {
  contentType: "resource" | "timetable" | "notice" | "unclear";
  confidence: "high" | "medium" | "low";
  title: string;
  targetScope: TargetScope;
  resourceType: "Notes" | "PYQ" | "Slides" | null;
  resourceSubject: string | null;
  noticeCategory: "Academic" | "Placement" | "Event" | "General" | null;
  noticeDescription: string | null;
  reasoning: string;
};

const STRUCTURED_TAG_PATTERN = /^\[(R|N)-(CSE|ECE|MNC|ALL)(?:-(\d))?(?:-([A-Za-z0-9]+))?\]\s*(.*)$/i;

function resolveRosterSection(branch: string, rawSection: string): string {
  if (/^\d+$/.test(rawSection)) {
    return `${branch.toUpperCase()}${rawSection}`;
  }
  const letterBranch = branch.toUpperCase() === "MNC" ? "CSE" : branch.toUpperCase();
  return `${letterBranch} ${rawSection.toUpperCase()}`;
}

type StructuredTagResult = {
  contentType: "resource" | "notice";
  targetScope: TargetScope;
  title: string;
};

function parseStructuredTag(subject: string): StructuredTagResult | null {
  const match = subject.trim().match(STRUCTURED_TAG_PATTERN);
  if (!match) return null;

  const [, typeLetter, branchRaw, semRaw, sectionRaw, restOfSubject] = match;
  const branch = branchRaw.toUpperCase();
  const semester = semRaw ? parseInt(semRaw, 10) : null;
  const section = sectionRaw ? resolveRosterSection(branch, sectionRaw) : null;

  const targetScope: TargetScope =
    branch === "ALL"
      ? {scope: "all", branch: null, semester: null, section: null, admissionYear: null, specialization: null}
      : section
        ? {
            scope: "section",
            branch: branch as "CSE" | "ECE" | "MNC",
            semester,
            section,
            admissionYear: null,
            specialization: null,
          }
        : {
            scope: "branch",
            branch: branch as "CSE" | "ECE" | "MNC",
            semester,
            section: null,
            admissionYear: null,
            specialization: null,
          };

  return {
    contentType: typeLetter.toUpperCase() === "R" ? "resource" : "notice",
    targetScope,
    title: restOfSubject.trim() || subject,
  };
}

const SECTION_LIST_PATTERN = /^(?:iiits_)?(cse|ece|mnc)_([a-z])_(\d{4})$/i;
const BRANCH_YEAR_LIST_PATTERN = /^(?:iiits_)?(cse|ece|mnc)_(\d{4})$/i;

function getCurrentSemester(admissionYear: number, today: Date): number {
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const isOddSemesterPeriod = currentMonth >= 7;
  const academicYearIndex = isOddSemesterPeriod
    ? currentYear - admissionYear
    : currentYear - admissionYear - 1;
  return academicYearIndex * 2 + 1 + (isOddSemesterPeriod ? 0 : 1);
}

function parseDistributionListTarget(toAndCc: string): TargetScope | null {

  const addresses = toAndCc
    .split(",")
    .map((entry) => {
      const emailMatch = entry.match(/[\w.+-]+@[\w.-]+/);
      const address = (emailMatch ? emailMatch[0] : entry).trim().toLowerCase();
      return address.split("@")[0];
    })
    .filter(Boolean);

  const matches: TargetScope[] = [];
  for (const localPart of addresses) {
    if (localPart.startsWith("mtech_") || localPart.startsWith("mtech")) continue;

    const sectionMatch = localPart.match(SECTION_LIST_PATTERN);
    if (sectionMatch) {
      const [, branch, section, yearStr] = sectionMatch;
      const admissionYear = parseInt(yearStr, 10);
      matches.push({
        scope: "section",
        branch: branch.toUpperCase() as "CSE" | "ECE" | "MNC",
        semester: getCurrentSemester(admissionYear, new Date()),
        section: resolveRosterSection(branch, section),
        admissionYear,
        specialization: null,
      });
      continue;
    }

    const branchYearMatch = localPart.match(BRANCH_YEAR_LIST_PATTERN);
    if (branchYearMatch) {
      const [, branch, yearStr] = branchYearMatch;
      const admissionYear = parseInt(yearStr, 10);
      matches.push({
        scope: "branch",
        branch: branch.toUpperCase() as "CSE" | "ECE" | "MNC",
        semester: getCurrentSemester(admissionYear, new Date()),
        section: null,
        admissionYear,
        specialization: null,
      });
    }
  }

  if (matches.length === 0) return null;

  const first = JSON.stringify(matches[0]);
  const allAgree = matches.every((m) => JSON.stringify(m) === first);
  return allAgree ? matches[0] : null;
}

async function matchCurriculumSubject(
  db: FirebaseFirestore.Firestore,
  branch: string,
  semester: number,
  candidateText: string,
): Promise<string | null> {
  if (!candidateText) return null;
  const snap = await db.collection("curriculum").where("branch", "==", branch).where("semester", "==", semester).get();
  if (snap.empty) return null;

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const text = normalize(candidateText);
  const subjects = snap.docs.map((d) => d.data() as {code: string; name: string});

  for (const s of subjects) {
    const code = normalize(s.code);
    if (code && new RegExp(`\\b${code}\\b`).test(text)) return s.name;
  }

  for (const s of subjects) {
    const name = normalize(s.name);
    if (name && (text.includes(name) || name.includes(text))) return s.name;
  }

  const stopwords = new Set(["and", "of", "the", "for", "to", "in", "with"]);
  const matches = subjects.filter((s) => {
    const words = normalize(s.name).split(" ").filter((w) => w.length >= 4 && !stopwords.has(w));
    return words.length > 0 && words.every((w) => text.includes(w));
  });
  if (matches.length === 1) return matches[0].name;

  const KNOWN_ABBREVIATIONS: Record<string, string[]> = {
    dbms: ["database", "management"],
    oop: ["object", "oriented"],
    oops: ["object", "oriented"],
    os: ["operating", "system"],
    ds: ["data", "structure"],
    cn: ["computer", "network"],
    daa: ["design", "analysis", "algorithm"],
    toc: ["theory", "computation"],
    ai: ["artificial", "intelligence"],
    ml: ["machine", "learning"],
    dsa: ["data", "structure"],
    coa: ["computer", "organization", "architecture"],
    se: ["software", "engineering"],
  };
  const abbrevMatches = subjects.filter((s) => {
    const nameWords = normalize(s.name).split(" ");
    return Object.entries(KNOWN_ABBREVIATIONS).some(
      ([abbrev, requiredWords]) =>
        new RegExp(`\\b${abbrev}\\b`).test(text) && requiredWords.every((w) => nameWords.includes(w)),
    );
  });
  return abbrevMatches.length === 1 ? abbrevMatches[0].name : null;
}

const EXAM_WORDS = /exam|mid.?sem|end.?sem|quiz|internal/i;
const SCHEDULE_WORDS = /date.?sheet|time.?table|schedule/i;
const EXAM_SHEET_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];

function findExamSheetAttachment(body: IngestBody): IncomingAttachment | null {
  const attachments = (body.attachments ?? []).filter((a) => EXAM_SHEET_MIME_TYPES.includes(a.mimeType));
  if (attachments.length === 0) return null;
  const haystack = `${body.subject ?? ""} ${attachments.map((a) => a.filename).join(" ")}`;
  if (!EXAM_WORDS.test(haystack) || !SCHEDULE_WORDS.test(haystack)) return null;

  return attachments.length === 1 ? attachments[0] : null;
}

const CLASSIFIER_SYSTEM_PROMPT = `You are sorting incoming faculty emails for a college app (IIIT Surat). Given an email's subject, body, and attachment filenames, decide:

1. contentType — one of:
   - "resource": a file to share with students (notes, PYQ, slides)
   - "timetable": a class schedule update
   - "notice": an announcement/notice with no file to distribute (or the file is incidental)
   - "unclear": you cannot confidently tell

2. confidence — "high", "medium", or "low", reflecting how sure you are about BOTH contentType and targetScope together. Use "low" whenever the email is ambiguous, informal, or could plausibly mean more than one thing — a human always reviews before anything goes live, so err toward "low"/"medium" rather than guessing confidently.

3. targetScope — who this is for:
   - scope "all": whole college
   - scope "branch": one branch (CSE/ECE/MNC), optionally one semester
   - scope "section": one specific branch+semester+section (e.g. "3rd sem CSE Section A")
   - Fill in branch/semester/section/admissionYear/specialization only where the email actually specifies or clearly implies them; leave others null. Never guess a section number if only a branch is mentioned.
   - IMPORTANT: the To/Cc recipients are often institutional mailing lists that directly encode the audience, e.g. "cse_b_2026@iiitsurat.ac.in" (CSE, section B, admitted 2026), "ece_2024@iiitsurat.ac.in" (all of ECE admitted 2024, no specific section), "iiits_cse_2023@iiitsurat.ac.in" (CSE admitted 2023). These conventions are NOT fully consistent — a bare number suffix like "cse_2025_1" may or may not mean section 1, and "mtech_..." lists are graduate-program lists outside this undergraduate app's scope and should be ignored. Treat the recipient list as a strong hint, not a guaranteed answer: when it clearly and unambiguously names a branch+admissionYear (and optionally a section), use it and raise your confidence; when it's genuinely unclear whether a suffix denotes a section, stay at low/medium confidence rather than guessing.

4. title — a short, human-readable title for this item (under 10 words).

5. If contentType is "resource": resourceType ("Notes", "PYQ", or "Slides" — best guess from context) and resourceSubject (the subject/course name, if mentioned).

6. If contentType is "notice": noticeCategory ("Academic", "Placement", "Event", or "General") and noticeDescription (a short 1-3 sentence summary of the notice body).

7. reasoning — one short sentence on why you classified it this way, shown to the human reviewer.

Respond with ONLY a single JSON object matching this shape, no markdown fences, no other text:
{"contentType": "...", "confidence": "...", "title": "...", "targetScope": {"scope": "...", "branch": null, "semester": null, "section": null, "admissionYear": null, "specialization": null}, "resourceType": null, "resourceSubject": null, "noticeCategory": null, "noticeDescription": null, "reasoning": "..."}`;

async function classifyEmail(
  apiKey: string,
  subject: string,
  bodyText: string,
  attachmentNames: string[],
  toRecipients: string,
  ccRecipients: string,
): Promise<ClassificationResult> {
  const userContent = [
    `Subject: ${subject}`,
    `To: ${toRecipients || "(none)"}`,
    `Cc: ${ccRecipients || "(none)"}`,
    `Attachments: ${attachmentNames.length > 0 ? attachmentNames.join(", ") : "(none)"}`,
    "Body:",
    bodyText.slice(0, 4000),

  ].join("\n");

  const result = await geminiJson({
    apiKey,
    systemInstruction: CLASSIFIER_SYSTEM_PROMPT,
    parts: [{text: userContent}],
    maxOutputTokens: 4096,
  });
  return result as ClassificationResult;
}

export const ingestFacultyEmail = onRequest(
  {
    secrets: [ingestSecret, geminiKey],
    region: "asia-south1",

    concurrency: 10,
    maxInstances: 5,

    memory: "512MiB",
    timeoutSeconds: 120,
  },
  async (req, res) => {
    const providedSecret = String(req.headers["x-ingest-secret"] ?? "");
    const expectedSecret = ingestSecret.value();
    const providedBuf = Buffer.from(providedSecret);
    const expectedBuf = Buffer.from(expectedSecret);
    if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
      res.status(401).send("unauthorized");
      return;
    }

    const body = req.body as IngestBody;
    if (!body?.messageId || !body?.from || !body?.subject) {
      res.status(400).send("missing messageId/from/subject");
      return;
    }

    const db = admin.firestore();
    const fromEmail = body.from.toLowerCase().trim();

    if (!senderIsAuthenticated(body.authResults, fromEmail)) {
      logger.warn("ingestFacultyEmail: sender could not be authenticated", {fromEmail});
      await db.collection("emailImportAlerts").doc(body.messageId).set({
        reason: "sender could not be authenticated (no passing SPF/DKIM/DMARC for the From domain)",
        from: fromEmail,
        subject: body.subject,
        flaggedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      res.status(200).send("ok");
      return;
    }

    const allowlistSnap = await db.collection("allowlist").doc(fromEmail).get();
    if (!allowlistSnap.exists || allowlistSnap.data()?.role !== "faculty") {

      const [byPrimaryLead, byAdditionalLead] = await Promise.all([
        db.collection("clubs").where("leadEmail", "==", fromEmail).get(),
        db.collection("clubs").where("additionalLeadEmails", "array-contains", fromEmail).get(),
      ]);
      const matchedClubDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      byPrimaryLead.docs.forEach((d) => matchedClubDocs.set(d.id, d));
      byAdditionalLead.docs.forEach((d) => matchedClubDocs.set(d.id, d));
      const clubMatches = Array.from(matchedClubDocs.values());

      if (clubMatches.length === 1) {
        const club = clubMatches[0];
        const clubData = club.data() as {name: string; leadName: string; leadUid: string | null};
        await db.collection("notices").add({
          title: body.subject,
          description: (body.bodyText ?? "").slice(0, 1000) || body.subject,
          category: "Event",
          clubId: club.id,
          clubName: clubData.name,
          createdBy: clubData.leadUid,
          createdByName: clubData.leadName,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          targetBranch: null,
          targetSection: null,
          targetAdmissionYear: null,
          targetSpecialization: null,
        });
        logger.info("ingestFacultyEmail: auto-published club notice", {messageId: body.messageId, clubId: club.id});
        res.status(200).send("ok");
        return;
      }

      if (clubMatches.length > 1) {

        logger.warn("ingestFacultyEmail: sender leads multiple clubs, ambiguous target", {fromEmail, clubCount: clubMatches.length});
        await db.collection("emailImportAlerts").doc(body.messageId).set({
          reason: `sender leads ${clubMatches.length} clubs — ambiguous which one this email is for`,
          from: fromEmail,
          subject: body.subject,
          flaggedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        res.status(200).send("ok");
        return;
      }

      logger.warn("ingestFacultyEmail: sender not an allowlisted faculty member or club lead", {fromEmail});
      await db.collection("emailImportAlerts").doc(body.messageId).set({
        reason: "sender not an allowlisted faculty member or club lead",
        from: fromEmail,
        subject: body.subject,
        flaggedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      res.status(200).send("ok");
      return;
    }
    const facultyName = allowlistSnap.data()?.name ?? fromEmail;

    const examAttachment = findExamSheetAttachment(body);
    if (examAttachment) {
      try {
        const raw = await extractRawExamRows(
          geminiKey.value(),
          Buffer.from(examAttachment.dataBase64, "base64"),
          examAttachment.mimeType,
        );
        const extraction = normalizeExtraction(raw);
        if (extraction.groups.length > 0) {
          const bucket = admin.storage().bucket();
          const storagePath = `pendingImports/${body.messageId}/${examAttachment.filename}`;
          const downloadToken = crypto.randomUUID();
          await bucket.file(storagePath).save(Buffer.from(examAttachment.dataBase64, "base64"), {
            contentType: examAttachment.mimeType,
            metadata: {metadata: {firebaseStorageDownloadTokens: downloadToken}},
          });
          const downloadUrl =
            `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
            `${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

          await db.collection("pendingImports").doc(body.messageId).set({
            fromEmail,
            fromName: facultyName,
            subject: body.subject,
            bodySnippet: (body.bodyText ?? "").slice(0, 500),
            attachments: [{filename: examAttachment.filename, storagePath, mimeType: examAttachment.mimeType, downloadUrl}],
            contentType: "examSchedule",

            confidence: "medium",
            title: body.subject,
            targetScope: {scope: "all", branch: null, semester: null, section: null, admissionYear: null, specialization: null},
            resourceType: null,
            resourceSubject: null,
            noticeCategory: null,
            noticeDescription: null,
            reasoning:
              `Read ${extraction.rowCount} exams into ${extraction.groups.length} class sheet(s) from the attached file` +
              (extraction.warnings.length ? ` — ${extraction.warnings.length} warning(s), see the review panel.` : ".") +
              " Check it against the PDF before publishing.",
            examGroups: extraction.groups,
            examWarnings: extraction.warnings,
            status: "pending",
            receivedAt: admin.firestore.FieldValue.serverTimestamp(),
            reviewedBy: null,
            reviewedAt: null,
            rejectionReason: null,
          });
          logger.info("ingestFacultyEmail: filed exam date sheet for review", {
            messageId: body.messageId,
            groups: extraction.groups.length,
            rows: extraction.rowCount,
          });
          res.status(200).send("ok");
          return;
        }
        logger.warn("ingestFacultyEmail: exam sheet read but no usable rows, falling back", {messageId: body.messageId});
      } catch (err: any) {
        logger.error("ingestFacultyEmail: exam sheet extraction failed, falling back", {messageId: body.messageId, error: err.message});
      }
    }

    const structuredTag = parseStructuredTag(body.subject);

    const distributionListTarget = structuredTag
      ? null
      : parseDistributionListTarget(`${body.to ?? ""},${body.cc ?? ""}`);

    const looksLikeTimetable = /timetable|time.?table|schedule/i.test(body.subject ?? "");

    let classification: ClassificationResult;
    if (structuredTag && !looksLikeTimetable) {

      classification = {
        contentType: structuredTag.contentType,
        confidence: "high",
        title: structuredTag.title,
        targetScope: structuredTag.targetScope,
        resourceType: null,
        resourceSubject: null,
        noticeCategory: structuredTag.contentType === "notice" ? "General" : null,
        noticeDescription: structuredTag.contentType === "notice" ? body.bodyText?.slice(0, 500) ?? "" : null,
        reasoning: `Parsed directly from the structured subject tag: "${body.subject}".`,
      };
    } else if (distributionListTarget && !looksLikeTimetable) {

      const hasAttachment = (body.attachments ?? []).length > 0;
      classification = {
        contentType: hasAttachment ? "resource" : "notice",
        confidence: "high",
        title: body.subject,
        targetScope: distributionListTarget,
        resourceType: hasAttachment ? "Notes" : null,
        resourceSubject: hasAttachment ? body.subject : null,
        noticeCategory: hasAttachment ? null : "General",
        noticeDescription: hasAttachment ? null : (body.bodyText ?? "").slice(0, 500) || body.subject,
        reasoning: `Audience resolved from the real class distribution list in To/Cc — no tag or AI guess needed.`,
      };
    } else {
      try {
        classification = await classifyEmail(
          geminiKey.value(),
          body.subject,
          body.bodyText ?? "",
          (body.attachments ?? []).map((a) => a.filename),
          body.to ?? "",
          body.cc ?? "",
        );
      } catch (err: any) {

      logger.error("ingestFacultyEmail: classification failed", {messageId: body.messageId, error: err.message});
      classification = {
        contentType: "unclear",
        confidence: "low",
        title: body.subject,
        targetScope: {scope: "all", branch: null, semester: null, section: null, admissionYear: null, specialization: null},
        resourceType: null,
        resourceSubject: null,
        noticeCategory: null,
        noticeDescription: null,
        reasoning: `Automatic classification failed: ${err.message}`,
      };
      }
    }

    const bucket = admin.storage().bucket();
    const storedAttachments: {filename: string; storagePath: string; mimeType: string; downloadUrl: string}[] = [];
    for (const attachment of body.attachments ?? []) {
      const storagePath = `pendingImports/${body.messageId}/${attachment.filename}`;
      const buffer = Buffer.from(attachment.dataBase64, "base64");
      const downloadToken = crypto.randomUUID();
      await bucket.file(storagePath).save(buffer, {
        contentType: attachment.mimeType,
        metadata: {metadata: {firebaseStorageDownloadTokens: downloadToken}},
      });
      const downloadUrl =
        `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
        `${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;
      storedAttachments.push({filename: attachment.filename, storagePath, mimeType: attachment.mimeType, downloadUrl});
    }

    const scope = classification.targetScope;
    const hasConcreteTarget = scope.scope === "all" || !!scope.branch;
    const eligibleForAutoPublish =
      classification.confidence === "high" &&
      hasConcreteTarget &&
      (classification.contentType === "resource" || classification.contentType === "notice");

    if (eligibleForAutoPublish) {

      const userSnap = await db.collection("users").where("email", "==", fromEmail).limit(1).get();
      const uploaderUid = userSnap.empty ? null : userSnap.docs[0].id;
      const branches: ("CSE" | "ECE" | "MNC")[] = scope.scope === "all" ? ["CSE", "ECE", "MNC"] : [scope.branch!];

      if (classification.contentType === "resource") {
        if (storedAttachments.length === 0) {
          logger.warn("ingestFacultyEmail: high-confidence resource had no attachment, falling back to review", {messageId: body.messageId});
        } else {

          const stripExtension = (filename: string) => filename.replace(/\.[^.]+$/, "");
          await Promise.all(
            branches.flatMap((branch) =>
              storedAttachments.map(async (attachment) => {
                const perFileTitle = storedAttachments.length > 1 ? stripExtension(attachment.filename) : classification.title;
                const matchedSubject = await matchCurriculumSubject(
                  db,
                  branch,
                  scope.semester ?? 1,
                  `${classification.resourceSubject ?? ""} ${perFileTitle}`,
                );
                return db.collection("resources").add({
                  title: perFileTitle,
                  subject: matchedSubject ?? classification.resourceSubject ?? perFileTitle,
                  branch,
                  semester: scope.semester ?? 1,

                  section: scope.section ?? null,
                  type: classification.resourceType ?? "Notes",
                  fileUrl: attachment.downloadUrl,
                  storagePath: attachment.storagePath,
                  uploadedBy: uploaderUid,
                  uploadedByName: facultyName,
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
              }),
            ),
          );
          logger.info(`ingestFacultyEmail: auto-published ${storedAttachments.length} resource(s) across ${branches.length} branch(es)`, {messageId: body.messageId});
          res.status(200).send("ok");
          return;
        }
      } else {
        await db.collection("notices").add({
          title: classification.title,
          description: classification.noticeDescription || body.subject,
          category: classification.noticeCategory ?? "General",
          clubId: null,
          clubName: null,
          createdBy: uploaderUid,
          createdByName: facultyName,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          targetBranch: scope.scope === "all" ? null : scope.branch,
          targetSection: scope.scope === "section" ? scope.section : null,
          targetAdmissionYear: scope.admissionYear,
          targetSpecialization: scope.specialization,
        });
        logger.info("ingestFacultyEmail: auto-published notice", {messageId: body.messageId});
        res.status(200).send("ok");
        return;
      }
    }

    await db.collection("pendingImports").doc(body.messageId).set({
      fromEmail,
      fromName: facultyName,
      subject: body.subject,
      bodySnippet: (body.bodyText ?? "").slice(0, 500),
      attachments: storedAttachments,
      ...classification,
      status: "pending",
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
    });

    res.status(200).send("ok");
  },
);