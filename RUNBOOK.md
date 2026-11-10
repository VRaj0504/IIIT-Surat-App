# CollegeGo runbook

How to release, roll back, and what to check when something breaks. Keep this file up to date; it is
the only place these steps are written down.

Project: `iiit-surat-app-6643d` · Region: `asia-south1` (Mumbai)

| Part | Folder | Live at |
| --- | --- | --- |
| Student app (Android) | `iiit-surat-app-2-3` | Google Play, `com.vaibhav.iiitsuratapp` |
| Student web app | `iiit-surat-app-2-3` | collegego-iiitsurat.web.app |
| Faculty portal | `faculty-upload-web` | collegego-faculty.web.app |
| Functions and rules | `iiit-surat-app-2-3/functions`, `firestore.rules` | Firebase |

## 1. Releasing

Always in this order, and only when GitHub shows a green tick on the commit.

```
cd ~/Downloads/iiit-surat-app-2-3
git status                       # nothing unexpected
npx tsc --noEmit                 # 0 errors
firebase deploy --only firestore:rules
firebase deploy --only functions # or functions:name1,functions:name2
npm run deploy:web
eas update --channel production --environment production --message "What changed"

cd ~/Downloads/faculty-upload-web
npm run build && firebase deploy --only hosting
```

- Rules and functions go first, so the new app never talks to an old backend.
- `eas update` reaches phones on the same native build only. Adding or upgrading a native package
  needs a new Play build: `eas build --profile production --platform android`, then upload the `.aab`.
- The portal build is silent for a minute or two. Do not press Ctrl+C.

## 2. Rolling back

| What broke | How to go back |
| --- | --- |
| Web app or portal | Firebase Console → Hosting → the site → Release history → previous release → Rollback |
| Phone app after an OTA update | `eas update:republish --channel production` and pick the previous update |
| A function | `git checkout <last good commit> -- functions/src` then deploy that function again |
| Security rules | Firebase Console → Firestore → Rules → history → pick the previous version → Publish |
| Bad data written | Restore from backup, section 4 |

## 3. When something is wrong

1. **Portal → Staff → App health.** Crash reports from the app, and whether usage dropped.
2. **Firebase Console → Functions → Logs.** Filter by severity "Error".
3. **Play Console → Quality → Android vitals.** Crashes and ANRs from real phones.
4. **Firebase Console → Firestore → Usage.** A sudden jump in reads means a loop or abuse.

Common causes:

| Symptom | Likely cause |
| --- | --- |
| "Missing or insufficient permissions" | Rules deployed without the matching app, or the user has no `users` document |
| Push not arriving | `EXPO_ACCESS_TOKEN` secret expired or rotated without `firebase functions:secrets:set` |
| "Too many tries" | Rate limit hit. Counters clear on their own within the hour |
| Function fails after deploy | Missing secret, or `functions/node_modules` not installed before deploy |

## 4. Backups

- **Nightly export** at 02:00 to `gs://iiit-surat-app-6643d-archive/daily/YYYY-MM-DD`
  (`archiveDatabaseDaily`), and a **monthly export** on the 1st under `monthly/`.
- **Point-in-time recovery** keeps every version of every document for 7 days.

One-time setup (run once):

```
# Point-in-time recovery, 7 days
gcloud firestore databases update --database="(default)" --enable-pitr --project iiit-surat-app-6643d

# Delete nightly exports after 14 days so storage does not grow for ever
cat > /tmp/lifecycle.json <<'EOF'
{"rule":[{"action":{"type":"Delete"},"condition":{"age":14,"matchesPrefix":["daily/"]}}]}
EOF
gcloud storage buckets update gs://iiit-surat-app-6643d-archive --lifecycle-file=/tmp/lifecycle.json

# Crash reports delete themselves after 30 days
gcloud firestore fields ttls update expireAt --collection-group=clientErrors --enable-ttl --project iiit-surat-app-6643d
```

Restore a whole export (this overwrites documents with the same ids):

```
gcloud firestore import gs://iiit-surat-app-6643d-archive/daily/2026-11-10 --project iiit-surat-app-6643d
```

Restore only some collections: add `--collection-ids=attendanceSessions,marks`.

**Do a restore drill once**, into the staging project (section 6), so the first restore is not during an emergency.

## 5. Alerts to set up in the console (one time)

**Billing budget**
1. Google Cloud Console → Billing → Budgets & alerts → Create budget.
2. Scope: project `iiit-surat-app-6643d`. Amount: a little above a normal month.
3. Alerts at 50%, 90% and 100%, emailed to the billing admins.

**Function errors**
1. Google Cloud Console → Monitoring → Alerting → Create policy.
2. Metric: Cloud Run Revision → Request count, filter `response_code_class = 5xx`.
3. Condition: above 5 in 5 minutes. Notification channel: your email.

**Uptime**
1. Monitoring → Uptime checks → Create.
2. One check for `https://collegego-iiitsurat.web.app` and one for `https://collegego-faculty.web.app`, every 5 minutes.

## 6. Staging project

Test risky changes (rules, functions, data scripts) here, never on live data.

```
# Once: create a Firebase project in the console, e.g. collegego-staging, on the Blaze plan,
# with Firestore in asia-south1 and Email/Google sign-in enabled. Then:
cd ~/Downloads/iiit-surat-app-2-3
firebase use --add            # pick the staging project, alias it "staging"
firebase deploy --only firestore:rules,functions -P staging
```

- `firebase use default` switches back to production. Check which one is active with `firebase use`
  before every deploy.
- The app talks to whichever project its `.env` points at. Keep a second file, `.env.staging`, and copy
  it over `.env` when testing against staging. Never commit either file.
- Scripts in `scripts/` use `serviceAccountKey.json`. Use the staging project's key when testing a script.

## 7. Secrets and keys

| Secret | Where it lives | How to rotate |
| --- | --- | --- |
| `EXPO_ACCESS_TOKEN` | Firebase secret | New token at expo.dev → `firebase functions:secrets:set EXPO_ACCESS_TOKEN` → redeploy functions |
| `SMTP_USER`, `SMTP_PASS` | Firebase secrets | Same command with the new value |
| `scripts/serviceAccountKey.json` | Your Mac only, gitignored | Cloud Console → IAM → Service accounts → Keys → delete old, create new |
| `.env` | Your Mac and EAS environment | `eas env:list`, `eas env:update` |

Never put `serviceAccountKey.json` or `.env` in a zip, a chat, or a commit. To zip the project:

```
zip -r app.zip . -x "node_modules/*" "*/node_modules/*" "scripts/serviceAccountKey.json" ".env" ".git/*" "dist/*"
```

## 8. Limits built into the backend

| Limit | Value | Where |
| --- | --- | --- |
| Instances per function | 20 | `functions/src/globalOptions.ts` |
| Sign-up, password reset | per IP and per email | `createAccount.ts`, `passwordResetOtp.ts` |
| Excusal and medical submit | 15 an hour per user | `excusalFlow.ts`, `medicalRequest.ts` |
| Excusal and medical approve/reject | 200 an hour per user | same files |
| Class changes | 60 an hour per user | `classChange.ts` |
| AI scans (poster, timetable, exam sheet) | daily cap per user | `quota.ts` |

## 9. Routine checks

| When | What |
| --- | --- |
| Weekly | Portal → App health; Functions logs for errors; Play Console vitals |
| Monthly | Billing report; confirm last night's export exists in the archive bucket |
| Each semester | Roster, timetable, faculty allow-list, approvers (FIC, deans, HODs) |
| Yearly | Rotate the service account key and the Expo token |
