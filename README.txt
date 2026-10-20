iiit-surat-app: drop-in fixes (9 files)

1. Unzip this OVER your project root (same folder as package.json). Let it overwrite.
2. Optional cleanup:  npm uninstall expo-blur      (nothing imports it)
3. Deploy, in this order:
     firebase deploy --only firestore:rules,storage
     cd functions && npm run build && firebase deploy --only functions
     (then make a new EAS build of the app)
4. app.json: add iosUrlScheme (REVERSED_CLIENT_ID from GoogleService-Info.plist) to the google-signin plugin before an iOS build.

Files: App.tsx, app.json, firestore.rules, storage.rules,
src/context/AuthContext.tsx,
functions/src/{extractPosterInfo,extractTimetableInfo,ingestFacultyEmail,sendClassReminderPush}.ts
No secrets (.env, serviceAccountKey.json) are included.
