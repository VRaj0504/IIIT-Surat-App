#!/usr/bin/env node
// CollegeGo admin menu. Run from the project folder:
//   npm run cg        (or: node scripts/cg.js)
// Pick a task with ↑ ↓ and Enter. It shows the exact command and asks before running.
// To add a task: add one entry to MENU below (see scripts/README.md).

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DOMAIN = "@iiitsurat.ac.in";
const YEARS = ["2022", "2023", "2024", "2025", "2026"];
const BRANCHES = ["CSE", "ECE", "MCS"];
const SECTIONS = ["CSE", "CSE1", "CSE2", "ECE", "DSAI", "VLSI", "DASE"];
const DEPTS = ["UGCSE", "UGECE", "UGMCS", "UGPAS", "ADMIN", "TNP"];

let P; // @inquirer/prompts, loaded in main()

const email = (message = "Email") =>
  P.input({
    message,
    validate: (v) => (/^\S+@\S+\.\S+$/.test(v.trim()) ? true : "Enter a full email"),
  }).then((v) => v.trim().toLowerCase());
const collegeEmail = (message = "College email") =>
  P.input({
    message,
    validate: (v) => (v.trim().toLowerCase().endsWith(DOMAIN) ? true : `Must end with ${DOMAIN}`),
  }).then((v) => v.trim().toLowerCase());
const emails = (message = "Emails (separate with spaces)") =>
  P.input({ message, validate: (v) => (v.trim() ? true : "Enter at least one") }).then((v) =>
    v.trim().toLowerCase().split(/[\s,]+/),
  );
const text = (message, def) =>
  P.input({ message, default: def, validate: (v) => (v.trim() ? true : "Required") }).then((v) => v.trim());
const pick = (message, choices) =>
  P.select({ message, choices: choices.map((c) => (typeof c === "string" ? { name: c, value: c } : c)) });
const mode = (message, preview, apply) =>
  pick(message, [
    { name: "Preview (changes nothing)", value: preview },
    { name: "Apply (changes live data)", value: apply },
  ]);
const inFile = (file) => ({ note: `Uses the list written inside scripts/${file}. Edit that list first.`, args: [] });

// Each task: label, script, and ask() → returns args array, or { args, note, env }.
const MENU = {
  "People & roles": [
    { label: "Make or remove an admin", script: "make-admin.js",
      ask: async () => [await collegeEmail(), ...(await pick("Action", [{ name: "Make admin", value: [] }, { name: "Remove admin", value: ["--remove"] }]))] },
    { label: "Add a faculty member", script: "add-faculty.js",
      ask: async () => [await collegeEmail(), await text("Full name (e.g. Dr. A. Sharma)"), await pick("Department", DEPTS)] },
    { label: "Remove a faculty member (allowlist only)", script: "remove-faculty.js", ask: async () => [await collegeEmail()] },
    { label: "Offboard faculty (list in file)", script: "offboard-faculty.js", ask: async () => inFile("offboard-faculty.js") },
    { label: "Leadership (Director's office)", script: "set-leadership.js",
      ask: async () => {
        const a = await pick("Action", ["list", "add", "remove"]);
        if (a === "list") return ["list"];
        return a === "add" ? ["add", ...(await emails())] : ["remove", await collegeEmail()];
      } },
    { label: "Exam cell members", script: "seed-exam-cell.js",
      ask: async () => [...(await emails()), ...(await pick("Action", [{ name: "Add", value: [] }, { name: "Remove", value: ["--remove"] }]))] },
    { label: "Complaint committee (replaces the list)", script: "set-complaint-committee.js", ask: async () => emails() },
    { label: "Mark as non-teaching staff", script: "set-non-teaching.js",
      ask: async () => [await collegeEmail(), ...(await pick("Action", [{ name: "Mark non-teaching", value: [] }, { name: "Undo", value: ["--undo"] }]))] },
    { label: "Grant faculty portal access", script: "grant-portal-access.js", ask: async () => [await email("Email or UID")] },
    { label: "Hide / show in directory", script: "hide-from-directory.js",
      ask: async () => [await collegeEmail(), ...(await pick("Action", [{ name: "Hide", value: [] }, { name: "Show again", value: ["--show"] }]))] },
  ],
  Students: [
    { label: "Sync user accounts from roster", script: "sync-users-from-roster.js",
      ask: async () => mode("Mode", ["--dry"], []) },
    { label: "Fill missing section for a batch", script: "fill-section.js",
      ask: async () => [await pick("Branch", BRANCHES), await pick("Admission year", YEARS), await pick("Section to set", SECTIONS), ...(await mode("Mode", [], ["--apply"]))] },
    { label: "Why can't a student see resources?", script: "why-resources-hidden.js", ask: async () => [await collegeEmail("Student email")] },
  ],
  Clubs: [
    { label: "Create / update clubs (list in file)", script: "manage-clubs.js", ask: async () => inFile("manage-clubs.js") },
    { label: "Rename a club everywhere", script: "rename-club.js",
      ask: async () => [await text("Current name"), await text("New name"), ...(await mode("Mode", [], ["--apply"]))] },
  ],
  "Prep website": [
    { label: "Reviewers (TnP coordinators)", script: "prep-admin.js",
      ask: async () => {
        const a = await pick("Action", ["list", "grant", "revoke"]);
        return a === "list" ? ["reviewer", "list"] : ["reviewer", a, await collegeEmail()];
      } },
    { label: "Add starter company list", script: "prep-admin.js", ask: async () => ["seed-companies"] },
    { label: "Plus gate for campus questions", script: "prep-admin.js",
      ask: async () => ["gate", await pick("Gate", [{ name: "On (Plus needed beyond 3 free)", value: "on" }, { name: "Off (all free)", value: "off" }])] },
  ],
  "Plus & mess": [
    { label: "Plus access", script: "plus-access.js",
      ask: async () => {
        const a = await pick("Action", ["list", "grant", "revoke", "all on", "all off"]);
        if (a === "list") return ["list"];
        if (a.startsWith("all")) return a.split(" ");
        return [a, await email()];
      } },
    { label: "Mess counter staff", script: "mess-counter.js",
      ask: async () => {
        const a = await pick("Action", ["list", "on", "off"]);
        return a === "list" ? ["list"] : [await email(), a];
      } },
  ],
  Notifications: [
    { label: "Send 'no classes today' now", script: "send-day-status-now.js",
      ask: async () => {
        const reason = await text("Holiday name");
        const who = await pick("Send to", [{ name: "Everyone", value: [] }, { name: "Only one email (test)", value: "one" }]);
        return who === "one" ? [reason, await email()] : [reason];
      } },
    { label: "Send me every notification type (test)", script: "test-notifications.js",
      ask: async () => [await email("Your email"), "all"] },
  ],
  "Testing & Apple review": [
    { label: "Test mode", script: "test-mode.js",
      ask: async () => {
        const a = await pick("Action", ["status", "on", "off"]);
        return a === "on" ? ["on", await collegeEmail("Approver email"), await text("Your phone (10 digits)")] : [a];
      } },
    { label: "Medical leave test mode", script: "medical-test-mode.js",
      ask: async () => (await pick("Action", ["turn on", "restore"])) === "restore" ? ["--restore"] : [await collegeEmail("Test faculty email")] },
    { label: "Preview tester (new features early)", script: "preview-tester.js",
      ask: async () => {
        const a = await pick("Action", ["list", "on", "off"]);
        return a === "list" ? ["list"] : [await email(), a];
      } },
    { label: "Report/Block demo notice", script: "post-demo-notice.js",
      ask: async () => pick("Action", [{ name: "Post it", value: [] }, { name: "Remove it", value: ["--remove"] }]) },
    { label: "Create / reset App Review account", script: "create-reviewer.js",
      ask: async () => [await P.password({ message: "Password (10+ characters)", mask: "*", validate: (v) => (v.length >= 10 ? true : "At least 10 characters") })] },
    { label: "Clear a test account's data", script: "clear-test-data.js",
      ask: async () => [await email("Test account email"), ...(await mode("Mode", [], ["--yes"]))] },
    { label: "Wipe test activity", script: "wipe-test-activity.js", ask: async () => mode("Mode", [], ["--yes"]) },
    { label: "Event excusal end-to-end test", script: "test-excusal.js",
      ask: async () => ({ env: true, args: [await collegeEmail("Student email"), await collegeEmail("Faculty email")] }) },
  ],
  Reports: [
    { label: "Most-used screens", script: "usage-report.js", ask: async () => [await pick("Period", [{ name: "Last 7 days", value: "7" }, { name: "Last 30 days", value: "30" }, { name: "Last 90 days", value: "90" }])] },
    { label: "Faculty activity", script: "faculty-activity.js", ask: async () => pick("Output", [{ name: "Show here", value: [] }, { name: "Save CSV", value: ["--csv"] }]) },
    { label: "Uploads by one person", script: "my-uploads.js", ask: async () => [await email("Email or UID")] },
  ],
  "New semester setup": [
    { label: "Roster (list in file)", script: "seed-roster.js", ask: async () => inFile("seed-roster.js") },
    { label: "Faculty allowlist (list in file)", script: "seed-allowlist.js", ask: async () => inFile("seed-allowlist.js") },
    { label: "Timetable (list in file, needs .env)", script: "seed-timetable.mjs", ask: async () => ({ ...inFile("seed-timetable.mjs"), env: true }) },
    { label: "Mess items (list in file, needs .env)", script: "seed-mess-items.mjs", ask: async () => ({ ...inFile("seed-mess-items.mjs"), env: true }) },
    { label: "Upload past papers (PYQs)", script: "bulk-upload-pyqs.mjs",
      ask: async () => ({ env: true, args: [await text("Folder path (e.g. scripts/CSE/SEM 3)"), await pick("Exam year", YEARS), ...(await mode("Mode", [], ["--confirm"]))] }) },
    { label: "SOS settings (in file)", script: "seed-sos-config.js", ask: async () => inFile("seed-sos-config.js") },
    { label: "Counsellors (list in file)", script: "seed-counsellors.js", ask: async () => inFile("seed-counsellors.js") },
    { label: "Event coordinators (list in file)", script: "seed-event-coordinators.js", ask: async () => inFile("seed-event-coordinators.js") },
    { label: "TnP coordinators (list in file)", script: "seed-tnp-coordinators.js", ask: async () => inFile("seed-tnp-coordinators.js") },
    { label: "Medical leave approvers (in file)", script: "seed-medical-leave.js", ask: async () => inFile("seed-medical-leave.js") },
  ],
};

const quote = (a) => (/^[\w@.\/:=-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`);

async function main() {
  try {
    P = await import("@inquirer/prompts");
  } catch {
    console.error("Run this once first:  npm i -D @inquirer/prompts");
    process.exit(1);
  }
  if (!fs.existsSync(path.join(__dirname, "serviceAccountKey.json"))) {
    console.error("Missing scripts/serviceAccountKey.json");
    process.exit(1);
  }

  for (;;) {
    const group = await pick("What do you want to do?", [...Object.keys(MENU), { name: "Exit", value: null }]);
    if (!group) return;
    const task = await pick(group, [...MENU[group].map((t) => ({ name: t.label, value: t })), { name: "← Back", value: null }]);
    if (!task) continue;

    let out = await task.ask();
    if (Array.isArray(out)) out = { args: out };
    const args = out.args.flat();
    const env = !!out.env;
    if (out.note) console.log(`\n  Note: ${out.note}`);
    if (env && !fs.existsSync(path.join(ROOT, ".env"))) console.log("  Note: this needs the .env file in the project folder.");

    const nodeArgs = [...(env ? ["--env-file=.env"] : []), path.join("scripts", task.script), ...args];
    const secret = task.script === "create-reviewer.js";
    const shown = ["node", ...nodeArgs].map((a) => (secret && args.includes(a) ? "******" : quote(a))).join(" ");
    console.log(`\n  ${shown}\n`);
    if (!(await P.confirm({ message: "Run this?", default: false }))) continue;

    const r = spawnSync(process.execPath, nodeArgs, { cwd: ROOT, stdio: "inherit" });
    console.log(r.status === 0 ? "\n✔ Done\n" : `\n✖ Exited with code ${r.status}\n`);
    if (!(await P.confirm({ message: "Do something else?", default: true }))) return;
  }
}

main().catch((e) => {
  if (e?.name === "ExitPromptError") return; // Ctrl+C
  console.error(e.message);
  process.exit(1);
});
