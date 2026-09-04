import {onRequest} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";

const ingestSecret = defineSecret("INGEST_SHARED_SECRET");
// Google AI Studio's free tier (aistudio.google.com) — no card required,
// ample quota for this volume (a handful of emails at a time, not a
// high-throughput pipeline). Swap back to a paid model later by changing
// only classifyEmail() below if the free tier's rate limit ever becomes
// the bottleneck.
const geminiKey = defineSecret("GEMINI_API_KEY");

// One attachment as the Apps Script bridge (see apps-script/Code.gs) sends
// it: base64-encoded bytes plus enough metadata to store and later render
// it, exactly like resourceService.ts's `storagePath` convention.
type IncomingAttachment = {
  filename: string;
  mimeType: string;
  dataBase64: string;
};

type IngestBody = {
  messageId: string; // Gmail message id — used as the pendingImports doc
  // id, so re-processing the same email (a retried Apps Script run, e.g.)
  // overwrites the same draft instead of creating a duplicate.
  from: string;
  to: string;
  cc: string;
  subject: string;
  bodyText: string;
  attachments: IncomingAttachment[];
};

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

// Structured subject-tag fast path — see the format documented in chat:
// "[R-CSE-3-A] title" etc. This is parsed with a plain regex, not
// inferred, so when it matches, the audience is CERTAIN rather than a
// probabilistic AI guess — that's the whole point of offering it. An
// unmatched or malformed tag (typo'd type letter, unrecognized branch,
// missing brackets) falls through to the normal AI classification path
// below rather than silently misparsing — this only ever activates when
// the format is followed exactly.
const STRUCTURED_TAG_PATTERN = /^\[(R|N)-(CSE|ECE|MNC|ALL)(?:-(\d))?(?:-([A-Za-z0-9]+))?\]\s*(.*)$/i;

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
  const section = sectionRaw ? sectionRaw.toUpperCase() : null;

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
    bodyText.slice(0, 4000), // plenty for a routine email; guards against
    // an unusually long forwarded thread blowing up the prompt.
  ].join("\n");

  // Gemini's responseMimeType: "application/json" makes it return a bare
  // JSON object directly (no markdown fences to strip, unlike the
  // Anthropic prompt-only approach this replaced) — one less thing that
  // can go wrong parsing the reply.
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        systemInstruction: {parts: [{text: CLASSIFIER_SYSTEM_PROMPT}]},
        contents: [{role: "user", parts: [{text: userContent}]}],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 500,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return JSON.parse(text) as ClassificationResult;
}

export const ingestFacultyEmail = onRequest(
  {
    secrets: [ingestSecret, geminiKey],
    region: "asia-south1",
    // Low-volume, bursty at most around exam/notice season — no need for
    // the throughput headroom placeOrderFn or razorpayWebhook carry.
    concurrency: 10,
    maxInstances: 5,
    // Attachments can be a few MB of base64; give this more room than the
    // 256MB default other functions here don't need to think about.
    memory: "512MiB",
    timeoutSeconds: 120,
  },
  async (req, res) => {
    const providedSecret = req.headers["x-ingest-secret"];
    if (providedSecret !== ingestSecret.value()) {
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

    // Sender must be a real, currently-allowlisted faculty member — this
    // is the actual security boundary here, independent of whatever the
    // Apps Script side already filtered. An unrecognized sender never
    // reaches pendingImports; it's flagged instead, same pattern as
    // razorpayWebhook's "payment with no uid" case: return 200 so nothing
    // retries forever, but leave a clear trail for staff.
    const allowlistSnap = await db.collection("allowlist").doc(fromEmail).get();
    if (!allowlistSnap.exists || allowlistSnap.data()?.role !== "faculty") {
      logger.warn("ingestFacultyEmail: sender not an allowlisted faculty member", {fromEmail});
      await db.collection("emailImportAlerts").doc(body.messageId).set({
        reason: "sender not an allowlisted faculty member",
        from: fromEmail,
        subject: body.subject,
        flaggedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      res.status(200).send("ok");
      return;
    }
    const facultyName = allowlistSnap.data()?.name ?? fromEmail;

    const structuredTag = parseStructuredTag(body.subject);

    let classification: ClassificationResult;
    if (structuredTag) {
      // The tag is a deterministic parse, not a guess — "high" here means
      // something different than the AI path's "high": it's certainty
      // about what the sender typed, not a probability estimate.
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
      // A classification failure shouldn't lose the email — file it as
      // "unclear" with low confidence so a human still sees it, rather
      // than silently dropping it or endlessly retrying on Apps Script's
      // side.
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

    // Store each attachment's bytes in Storage; a download token is set
    // on each so a client-compatible download URL can be built directly
    // (needed for auto-publish below — it can't rely on the reviewer's
    // browser calling getDownloadURL, since there may be no reviewer).
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

    // Auto-publish only when the model is confident AND it actually
    // resolved a concrete target — never when it's guessing. A "high"
    // confidence resource/notice with a real branch/section goes straight
    // into the collections the app reads from; anything else (including
    // every timetable email, which always needs the OCR/Excel review
    // step) still lands in pendingImports for a human glance. This is the
    // one place in the pipeline that can put something in front of
    // students unreviewed, so it stays deliberately narrow.
    const scope = classification.targetScope;
    const hasConcreteTarget = scope.scope === "all" || !!scope.branch;
    const eligibleForAutoPublish =
      classification.confidence === "high" &&
      hasConcreteTarget &&
      (classification.contentType === "resource" || classification.contentType === "notice");

    if (eligibleForAutoPublish) {
      // uploadedBy/createdBy needs a uid the way the web reviewer's
      // Firebase Auth session provides one — this function has no signed-
      // in user, so it looks up whichever `users` doc (if any) belongs to
      // this email. A faculty member who's never opened the app yet
      // simply gets uploadedBy: null, same as facultyService.ts already
      // treats not-yet-signed-up allowlist entries.
      const userSnap = await db.collection("users").where("email", "==", fromEmail).limit(1).get();
      const uploaderUid = userSnap.empty ? null : userSnap.docs[0].id;
      const branches: ("CSE" | "ECE" | "MNC")[] = scope.scope === "all" ? ["CSE", "ECE", "MNC"] : [scope.branch!];

      if (classification.contentType === "resource") {
        const attachment = storedAttachments[0];
        if (!attachment) {
          logger.warn("ingestFacultyEmail: high-confidence resource had no attachment, falling back to review", {messageId: body.messageId});
        } else {
          await Promise.all(
            branches.map((branch) =>
              db.collection("resources").add({
                title: classification.title,
                subject: classification.resourceSubject || classification.title,
                branch,
                semester: scope.semester ?? 1,
                type: classification.resourceType ?? "Notes",
                fileUrl: attachment.downloadUrl,
                storagePath: attachment.storagePath,
                uploadedBy: uploaderUid,
                uploadedByName: facultyName,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              }),
            ),
          );
          logger.info("ingestFacultyEmail: auto-published resource", {messageId: body.messageId});
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