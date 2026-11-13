# Admin scripts

These scripts change live Firebase data with full admin rights. They run from your Mac and use `scripts/serviceAccountKey.json`, which is git-ignored and must never be shared or committed.

## The easy way: the menu

```bash
npm run cg
```

Pick a task with ↑ ↓ and Enter, then answer the questions. Before anything runs, the menu shows the exact command and asks **Run this?**

## All scripts

**People & roles**

| Script | What it does | Example |
|---|---|---|
| make-admin.js | Make someone an admin, or remove them | `node scripts/make-admin.js x@iiitsurat.ac.in [--remove]` |
| add-faculty.js | Add one faculty member to the allowlist | `node scripts/add-faculty.js x@iiitsurat.ac.in "Name" UGCSE` |
| remove-faculty.js | Remove one faculty member from the allowlist | `node scripts/remove-faculty.js x@iiitsurat.ac.in` |
| offboard-faculty.js | Fully offboard the faculty listed in the file | Edit the list, then `node scripts/offboard-faculty.js` |
| set-leadership.js | Manage the Director's office accounts | `node scripts/set-leadership.js list \| add … \| remove …` |
| seed-exam-cell.js | Add or remove exam cell members | `node scripts/seed-exam-cell.js a@… b@… [--remove]` |
| set-complaint-committee.js | Replace the complaint committee with these people | `node scripts/set-complaint-committee.js a@… b@…` |
| set-non-teaching.js | Mark someone as non-teaching staff | `node scripts/set-non-teaching.js x@… [--undo]` |
| grant-portal-access.js | Give someone faculty portal access | `node scripts/grant-portal-access.js x@…` |
| hide-from-directory.js | Hide someone from the directory, or show them again | `node scripts/hide-from-directory.js x@… [--show]` |

**Students**

| Script | What it does | Example |
|---|---|---|
| sync-users-from-roster.js | Update student accounts from the roster | `node scripts/sync-users-from-roster.js [--dry]` |
| fill-section.js | Set the section for students in a batch who have none | `node scripts/fill-section.js CSE 2025 CSE2 [--apply]` |
| why-resources-hidden.js | Explain why a student can't see resources | `node scripts/why-resources-hidden.js s@…` |

**Clubs**

| Script | What it does | Example |
|---|---|---|
| manage-clubs.js | Create or update the clubs listed in the file | Edit the list, then run |
| rename-club.js | Rename a club everywhere it appears | `node scripts/rename-club.js "Old" "New" [--apply]` |

**Prep, Plus and mess**

| Script | What it does | Example |
|---|---|---|
| prep-admin.js | Prep reviewers, the starter company list, and the Plus gate | `node scripts/prep-admin.js reviewer list` |
| plus-access.js | Give or take away Plus | `node scripts/plus-access.js grant x@…` |
| mess-counter.js | Manage mess counter staff | `node scripts/mess-counter.js x@… on` |

**Notifications**

| Script | What it does | Example |
|---|---|---|
| send-day-status-now.js | Send "no classes today" right away | `node scripts/send-day-status-now.js "Diwali" [x@…]` |
| test-notifications.js | Send yourself every notification type | `node scripts/test-notifications.js you@… all` |

**Testing and App Review**

| Script | What it does | Example |
|---|---|---|
| test-mode.js | Turn test mode on or off, or check its status | `node scripts/test-mode.js status` |
| medical-test-mode.js | Turn medical leave test mode on, or restore normal | `node scripts/medical-test-mode.js x@… \| --restore` |
| preview-tester.js | Let someone see new features early | `node scripts/preview-tester.js x@… on` |
| post-demo-notice.js | Post or remove the Report/Block demo notice | `node scripts/post-demo-notice.js [--remove]` |
| create-reviewer.js | Create or reset the App Review account | `node scripts/create-reviewer.js "password"` |
| clear-test-data.js | Clear the data of one test account | `node scripts/clear-test-data.js t@… [--yes]` |
| wipe-test-activity.js | Wipe all test activity | `node scripts/wipe-test-activity.js [--yes]` |
| test-excusal.js | Test the event excusal flow end to end | `node --env-file=.env scripts/test-excusal.js s@… f@…` |

**Reports**

| Script | What it does | Example |
|---|---|---|
| usage-report.js | Show the most-used screens | `node scripts/usage-report.js 30` |
| faculty-activity.js | Show what each faculty member has done | `node scripts/faculty-activity.js [--csv]` |
| my-uploads.js | List one person's uploads | `node scripts/my-uploads.js x@…` |

**New semester setup** (most of these use a list inside the file, so edit it first)

| Script | What it does |
|---|---|
| seed-roster.js | Load the student roster |
| seed-allowlist.js | Load the faculty allowlist |
| seed-timetable.mjs | Load the timetable (run with `--env-file=.env`) |
| seed-mess-items.mjs | Load the mess items (run with `--env-file=.env`) |
| bulk-upload-pyqs.mjs | Upload past papers: `node --env-file=.env scripts/bulk-upload-pyqs.mjs "scripts/CSE/SEM 3" 2025 [--confirm]` |
| seed-sos-config.js | Load the SOS settings |
| seed-counsellors.js | Load the counsellors |
| seed-event-coordinators.js | Load the event coordinators |
| seed-tnp-coordinators.js | Load the TnP coordinators |
| seed-medical-leave.js | Load the medical leave approvers |

**Build**

| Script | What it does |
|---|---|
| fix-web-assets.js | Runs automatically as part of `npm run build:web`. Don't move it. |

`archive/` holds one-time fixes that have already run, plus two dangerous wipes. They still work if you ever need one, but you shouldn't need to.

## Write a new script

1. Copy the template:
   ```bash
   cp scripts/_template.js scripts/my-task.js
   ```
2. Change the query and the update. The template **previews** by default and only changes data when you add `--apply`.
3. Run a preview first, check the output, then run it again with `--apply`.
4. Add it to the menu by putting one entry in `MENU` in `scripts/cg.js`:
   ```js
   { label: "My task", script: "my-task.js",
     ask: async () => [await collegeEmail(), ...(await mode("Mode", [], ["--apply"]))] },
   ```
   Helpers you can use in `ask`:
   - `email()` and `collegeEmail()` for typed emails
   - `emails()` for several emails
   - `text()` for any other typed answer
   - `pick(message, [choices])` for a dropdown
   - `mode()` for preview or apply

Or ask Claude: *"Make a script in scripts/ from _template.js that <does X>. Preview first, --apply to change. Add it to the cg menu."*
