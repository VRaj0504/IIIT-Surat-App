# Graph Report - iiit-surat-app-2-3  (2026-11-09)

## Corpus Check
- 331 files · ~176,447 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: (none) 5, .rules 2, .patch 1)

## Summary
- 2404 nodes · 6640 edges · 154 communities (126 shown, 28 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 34 edges (avg confidence: 0.85)
- Token cost: 98,922 input · 0 output

## Community Hubs (Navigation)
- App Shell & Auth UI
- Clubs & Notices
- Medical Request PDF (Functions)
- Brand & Shared Widgets
- Complaints & Profile Editing
- Leave Approval Service
- Admin Cloud Functions
- Resources & Downloads
- Theme & Profile
- Home Screen & Day Status
- Web Desktop Home
- Expo Push Delivery
- Expo App Config
- Resource Folders & Academic Year
- Timetable & Class Changes
- Event Excusal Submission
- Medical Apply Form
- Medical Review Cards
- SOS Emergency
- Functions Dependencies
- Excusal Signing Flow (Functions)
- Attendance Marking
- Push Audience Targeting
- PYQ Upload & Ops Scripts
- Firestore Rules Tests
- Attendance Views
- Leave Planner
- Exam Events & Status
- Faculty Directory
- Counselling & Crisis Help
- Privacy, Deletion & Deploy Docs
- Exam Schedule Screen
- Room Availability
- Gemini Email Ingestion
- Auth Context & Push Registration
- Web Shell & Inbox
- Class Reminder Push
- Clay Cards & Notice Posting
- Exam Grade Rules
- Firestore Client & Live Cache
- Plus Subscription (Client)
- Excusal Review Steps
- Exam Period Logic (Functions)
- Exam Sheet Extraction
- Medical Leave Workflow & Holidays
- App Expo Dependencies
- Event Posting & Desktop Header
- Announcements & Audience
- Excusal Test Script
- CGPA Planner
- Account Creation & OTP Reset
- Plus Subscription (Razorpay)
- Faculty Roster Scripts
- Mess Subscription
- App Core Dependencies
- Security Migration Script
- Firebase Client Config
- Grades Service
- Medical Leave Teacher Tasks
- Functions TS Config
- Meetings
- Shared UI Pickers
- Placements
- Seed Medical Leave Script
- Academic Calendar
- Class Change Sets (Functions)
- Timetable Image Extraction
- Signature Pad & Stamp
- Script: clear-lost-found
- Script: test-mode
- Script: wipe-test-activity
- Important Contacts
- Grade & Low-Attendance Push
- Poster Info Extraction
- Faculty Legend (Functions)
- Script: medical-test-mode
- Script: seed-sos-config
- Script: why-resources-hidden
- Faculty Legend (Client)
- Functions npm Scripts
- Meeting Push
- Script: clear-test-data
- Script: fix-faculty-profiles
- Script: fix-resource-sections
- Script: fix-timetable-names
- Script: manage-clubs
- Script: offboard-faculty
- Script: wipe-resources
- Date Field
- Inbox Capture
- Script: compare-ece-roster
- Script: reset-user-data-grades-complaints
- App Icon & Brand Images
- App npm Scripts
- Script: fill-section
- Script: find-ece-students
- Script: fix-roster-years
- Script: plus-access
- Script: seed-counsellors
- Script: seed-event-coordinators
- Script: seed-tnp-coordinators
- Roll Call
- Roster Cache
- Publication Lookup
- Metro Config
- App TS Config
- Script: create-reviewer
- Script: fix-incomplete-profiles
- Script: imagine-club
- Script: my-uploads
- Script: remove-faculty
- Script: set-leadership
- Script: test-notifications
- Marks Service
- Web Download History
- Script: grant-portal-access
- Script: make-admin
- Script: mess-counter
- Script: preview-tester
- Script: seed-exam-cell
- Script: send-day-status-now
- Script: set-complaint-committee
- Script: set-non-teaching
- Medical Queue Subscriptions
- Notification Preferences
- Script: fix-oot-subject
- Script: seed-mess-items
- ICS Download
- Script: create-razorpay-plans
- Monochrome Icons
- Imagine Club Logo
- Dependency: expo-build-properties
- Dependency: expo-calendar
- Dependency: expo-camera
- Dependency: expo-constants
- Dependency: expo-device
- Dependency: expo-document-picker
- Dependency: expo-font
- Dependency: expo-haptics
- Dependency: expo-intent-launcher
- Dependency: expo-status-bar
- Dependency: expo-system-ui
- Dependency: expo-updates
- Dependency: firebase
- Dependency: react-dom
- Dependency: react-native-qrcode-svg
- Dependency: react-native-screens
- Dependency: react-native-svg
- Dependency: react-native-web
- Dependency: react-native-webview
- Dependency: react-native-worklets
- Dependency: typescript

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 102 edges
2. `react-native` - 101 edges
3. `react` - 98 edges
4. `colors` - 81 edges
5. `@expo/vector-icons` - 69 edges
6. `LoadingSpinner()` - 69 edges
7. `spacing` - 60 edges
8. `sendExpoPush()` - 59 edges
9. `firebase-functions` - 51 edges
10. `radius` - 48 edges

## Surprising Connections (you probably didn't know these)
- `Gate()` --calls--> `LoadingSpinner()`  [EXTRACTED]
  App.tsx → src/components/LoadingSpinner.tsx
- `Gate()` --calls--> `useAuth()`  [EXTRACTED]
  App.tsx → src/context/AuthContext.tsx
- `App()` --calls--> `AuthProvider()`  [EXTRACTED]
  App.tsx → src/context/AuthContext.tsx
- `App()` --indirect_call--> `formatDocumentTitle()`  [INFERRED]
  App.tsx → src/navigation/linking.ts
- `Cloud Functions (extractPosterInfo, extractTimetableInfo, ingestFacultyEmail, sendClassReminderPush)` --implements--> `Push Notifications (announcements, class reminders, results, SOS)`  [INFERRED]
  README.txt → public/privacy.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Account deletion and data retention flow** — public_delete_account_in_app_deletion, public_delete_account_email_deletion, public_delete_account_what_stays, public_privacy_retention_and_deletion [EXTRACTED 1.00]
- **Medical leave approval process** — public_forms_iiits_medical_leave_form, public_forms_iiits_medical_leave_form_approval_chain, public_forms_iiits_medical_leave_form_four_day_rule, public_forms_iiits_medical_leave_form_enclosures [EXTRACTED 1.00]
- **Firebase deploy bundle (rules, storage, functions)** — readme_deploy_order, readme_firestore_rules, readme_storage_rules, readme_cloud_functions [EXTRACTED 1.00]
- **Android Adaptive Icon Layers** — assets_android_icon_background_android_icon_background, assets_android_icon_foreground_android_icon_foreground, assets_android_icon_monochrome_android_icon_monochrome [INFERRED 0.95]
- **CollegeGo G-mark variants** — assets_icon_app_icon, assets_favicon_favicon, assets_splash_icon_splash_icon [INFERRED 0.85]

## Communities (154 total, 28 thin omitted)

### Community 0 - "App Shell & Auth UI"
Cohesion: 0.08
Nodes (69): App(), Gate(), hideSplash(), navigationRef, navTheme, react-native-reanimated, PortalHost(), WebShell() (+61 more)

### Community 1 - "Clubs & Notices"
Cohesion: 0.06
Nodes (70): @expo/vector-icons, ClubCoreTeam(), initials(), styles, ClubGlyph(), GlassCard(), CLUB_ICON_MAP, ClubIconEntry (+62 more)

### Community 2 - "Medical Request PDF (Functions)"
Cohesion: 0.06
Nodes (70): A4, AuditRow, clean(), daysBetween(), drawLines(), drawSignature(), drawStamp(), fmtDateTime() (+62 more)

### Community 3 - "Brand & Shared Widgets"
Cohesion: 0.08
Nodes (42): expo-linear-gradient, react, BRAND, BrandMark(), DOT_CENTER, DOT_RADIUS, Dots(), LoadingSpinner() (+34 more)

### Community 4 - "Complaints & Profile Editing"
Cohesion: 0.08
Nodes (40): expo-image-picker, ComplaintPhotos(), styles, KeyboardAwareFlatList, KeyboardAwareFlatListInner(), KeyboardAwareScrollView, useKeyboardAware(), withBottomRoom() (+32 more)

### Community 5 - "Leave Approval Service"
Cohesion: 0.09
Nodes (41): StatusPill(), Timeline(), applyForMedicalLeave(), approvalChain(), APPROVER_ROLES, APPROVER_SHORT, approverName(), ApproverRole (+33 more)

### Community 6 - "Admin Cloud Functions"
Cohesion: 0.10
Nodes (27): archiveDatabase, backfillRoleClaims, cleanupResolvedDoubts, deleteMyAccount, avg(), CATEGORIES, getDirectorOverview, round1() (+19 more)

### Community 7 - "Resources & Downloads"
Cohesion: 0.10
Nodes (34): expo-file-system, expo-sharing, react-native-safe-area-context, ScreenHeader(), ScreenHeaderProps, styles, deleteResource(), FileViewerScreen() (+26 more)

### Community 8 - "Theme & Profile"
Cohesion: 0.08
Nodes (30): react-native, @react-navigation/native, Boot(), styles, TapCardProps, computeTranscript(), usePlusAccess(), GROUPS (+22 more)

### Community 9 - "Home Screen & Day Status"
Cohesion: 0.07
Nodes (36): Api, Portal(), PortalContext, TapCard(), ExamSchedule, FacultyScheduleEntry, BadgeKey, Bento (+28 more)

### Community 10 - "Web Desktop Home"
Cohesion: 0.09
Nodes (35): ago(), Card(), CardHead(), daysUntil(), DesktopHome(), isoToday(), mins(), pointer (+27 more)

### Community 11 - "Expo Push Delivery"
Cohesion: 0.13
Nodes (29): studentsFor(), tokensFor(), expoAuthHeader(), pruneDeadTokens(), sendExpoPush(), Ticket, sendAnnouncementPush, Change (+21 more)

### Community 12 - "Expo App Config"
Cohesion: 0.06
Nodes (37): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, googleServicesFile, package, permissions (+29 more)

### Community 13 - "Resource Folders & Academic Year"
Cohesion: 0.09
Nodes (35): Resource, academicYearFor(), academicYearOptions(), academicYearStartFor(), batchChoices(), currentAcademicYear(), formatAcademicYear(), isResourceVisibleThisYear() (+27 more)

### Community 14 - "Timetable & Class Changes"
Cohesion: 0.12
Nodes (33): clock(), Day, DesktopWeek(), label(), lanes(), s, Slot, ClassChange (+25 more)

### Community 15 - "Event Excusal Submission"
Cohesion: 0.10
Nodes (34): cleanError(), clubsLedBy(), EXCUSAL_CATEGORIES, ExcusalCategory, excusalCovers(), ExcusalEvent, ExcusalInput, ExcusalRange (+26 more)

### Community 16 - "Medical Apply Form"
Cohesion: 0.11
Nodes (32): addDays(), Info(), MedicalApplyForm(), ORD, prettyIso(), s, semesterOn(), sizeLabel() (+24 more)

### Community 17 - "Medical Review Cards"
Cohesion: 0.14
Nodes (33): Head(), MedicalReviewCard(), MedicalTrackCard(), s, Toggle(), Attachments(), Downloads(), Flags() (+25 more)

### Community 18 - "SOS Emergency"
Cohesion: 0.13
Nodes (31): EmergencyContact, getSosConfig(), loadEmergencyContacts(), mapsUrl(), raiseSos(), saveEmergencyContacts(), setSosStatus(), SOS_TYPES (+23 more)

### Community 19 - "Functions Dependencies"
Cohesion: 0.08
Nodes (32): dependencies, firebase-admin@^14.5.0, firebase-functions@^7.3.2, @google-cloud/firestore@^9.4.0, @google-cloud/vision@^4.3.3, nodemailer@^10.2.1, pdf-lib@^1.17.1, devDependencies (+24 more)

### Community 20 - "Excusal Signing Flow (Functions)"
Cohesion: 0.12
Nodes (32): currentSemester(), Caller, caller(), Cfg, checkSignature(), datesBetween(), EXCUSAL_CATEGORIES, excusalAct (+24 more)

### Community 21 - "Attendance Marking"
Cohesion: 0.12
Nodes (31): FieldLabel(), SelectField(), AttendanceDay, AttendanceSession, classExcusals(), ClassStanding, getClassAttendanceSummary(), getExistingSession() (+23 more)

### Community 22 - "Push Audience Targeting"
Cohesion: 0.12
Nodes (23): normSection(), PrefKey, Recipient, sameBranch(), squash(), Target, tokensOf(), UserDoc (+15 more)

### Community 23 - "PYQ Upload & Ops Scripts"
Cohesion: 0.08
Nodes (24): CONFIRMED, EXAM_YEAR, examTypeLabel(), extractCode(), FILE_EXTENSIONS, findBestMatch(), firebaseConfig, listDirs() (+16 more)

### Community 24 - "Firestore Rules Tests"
Cohesion: 0.07
Nodes (21): @firebase/rules-unit-testing, firebase-tools, devDependencies, firebase@^13.0.0, @firebase/rules-unit-testing@^6.0.0, firebase-tools@^14.0.0, firebase, name (+13 more)

### Community 25 - "Attendance Views"
Cohesion: 0.14
Nodes (24): DesktopAttendance(), pctOf(), pointer, Props, s, Stat(), ATTENDANCE_TARGET, fetchMySessions() (+16 more)

### Community 26 - "Leave Planner"
Cohesion: 0.16
Nodes (25): PlusGate(), subscribeToHolidayOverrides(), subscribeToTimetable(), LeavePlannerScreen(), Planner(), pretty(), styles, tone() (+17 more)

### Community 27 - "Exam Events & Status"
Cohesion: 0.13
Nodes (25): CurriculumSubject, eventAppliesTo(), EXAM_EVENT_LABELS, ExamEvent, ExamEventType, ExamRegistration, isRegistrationOpen(), RegisteredSubject (+17 more)

### Community 28 - "Faculty Directory"
Cohesion: 0.15
Nodes (24): FacultyMember, StudentCoordinator, Actions(), Avatar(), CabinPill(), compareFaculty(), CoordinatorCard, DEPARTMENT_LABELS (+16 more)

### Community 29 - "Counselling & Crisis Help"
Cohesion: 0.14
Nodes (22): CAMPUS_CONTACT, CrisisResource, EXTERNAL_SUPPORT, LinkResource, NATIONAL_HELPLINES, CONCERN_CATEGORIES, ConcernCategory, CounsellingRequest (+14 more)

### Community 30 - "Privacy, Deletion & Deploy Docs"
Cohesion: 0.11
Nodes (22): Delete your CollegeGo account page, Deletion by email (within 7 days), In-app account deletion (Profile > Privacy & account > Delete account), Institute academic records retained, IIIT Surat Medical Leave Form (Absenteeism due to Medical Reasons), Medical Leave Approval Chain (Medical Officer, HoD, Assoc. Dean Academics, Joint Registrar), Enclosures: verified medical certificate + email intimation copy, CollegeGo Privacy Policy (+14 more)

### Community 31 - "Exam Schedule Screen"
Cohesion: 0.17
Nodes (22): entriesFor(), EXAM_TYPE_ORDER, ExamEntry, isMnc(), isRestricted(), subscribeToExamSchedules(), Quiz, countdownLabel() (+14 more)

### Community 32 - "Room Availability"
Cohesion: 0.20
Nodes (23): Timetable, currentWeekdayOrFirst(), formatSlotLabel(), isWeekend(), RoomAvailabilityScreen(), styles, WEEKDAYS, freeUntil() (+15 more)

### Community 33 - "Gemini Email Ingestion"
Cohesion: 0.12
Nodes (21): GEMINI_MODEL, geminiJson(), GeminiPart, GeminiResponse, ClassificationResult, classifyEmail(), EXAM_SHEET_MIME_TYPES, findExamSheetAttachment() (+13 more)

### Community 34 - "Auth Context & Push Registration"
Cohesion: 0.14
Nodes (21): expo-notifications, authCode(), AuthContext, AuthContextValue, AuthProvider(), Branch, buildGatedProfile(), canPreviewRoles() (+13 more)

### Community 35 - "Web Shell & Inbox"
Cohesion: 0.16
Nodes (20): FACULTY_NAV, Group, IconName, Item, pointer, Props, STUDENT_NAV, styles (+12 more)

### Community 36 - "Class Reminder Push"
Cohesion: 0.16
Nodes (22): changeFor(), ClassChange, classLabel(), FacultyClass, FacultyQueueEntry, getCurrentSemester(), getStudentsForSection(), istWeekdayAndTimePlusMinutes() (+14 more)

### Community 37 - "Clay Cards & Notice Posting"
Cohesion: 0.12
Nodes (18): ClayCard(), ClayCardProps, LAYOUT_KEYS, splitLayoutStyle(), styles, ClubIconTile(), ClubIconTileProps, styles (+10 more)

### Community 38 - "Exam Grade Rules"
Cohesion: 0.15
Nodes (21): academicYearStart(), ALL_GRADES, attemptsOf(), backlogAction(), BacklogKind, backlogKind(), computeCgpa(), countsInGpa() (+13 more)

### Community 39 - "Firestore Client & Live Cache"
Cohesion: 0.24
Nodes (10): db, memory, pendingWrites, persisted(), toJson(), QuizRoom, resolveTimetableBranch(), TimetableDay (+2 more)

### Community 40 - "Plus Subscription (Client)"
Cohesion: 0.20
Nodes (19): Segmented(), cancelPlus(), isEntitled(), loadRazorpay(), openRazorpay(), PLUS_ENABLED, PLUS_PERKS, PLUS_PRICES (+11 more)

### Community 41 - "Excusal Review Steps"
Cohesion: 0.18
Nodes (19): ExcusalSteps(), s, PrimaryButton(), actOnExcusal(), canSignNow(), EventExcusal, respondToExcusal(), SIGN_STEPS (+11 more)

### Community 42 - "Exam Period Logic (Functions)"
Cohesion: 0.18
Nodes (16): activeSheet(), CLASS_SUSPENDING_TYPES, currentSemester(), examDayMessage(), ExamDoc, ExamDocEntry, isInExamPeriod(), loadExamDocs() (+8 more)

### Community 43 - "Exam Sheet Extraction"
Cohesion: 0.16
Nodes (18): BASE_EXAM_TYPES, BaseExamType, EXAM_TYPE_LABELS, ExamEntry, ExamGroup, extractRawExamRows(), normalizeCode(), NormalizedExtraction (+10 more)

### Community 44 - "Medical Leave Workflow & Holidays"
Cohesion: 0.15
Nodes (16): HOLIDAY_NAMES_IST, isNoClassDay(), NO_CLASS_REASONS, datesInRange(), excusedSessionKeys(), semesterOn(), AckDoc, ApproverStage (+8 more)

### Community 45 - "App Expo Dependencies"
Cohesion: 0.10
Nodes (20): dependencies, expo-blur@~58.0.5, expo-file-system@~58.0.13, expo-image-picker@~58.0.10, expo-linear-gradient@~58.0.3, expo-location@~58.0.20, expo-notifications@~58.1.7, expo-sharing@~58.0.21 (+12 more)

### Community 46 - "Event Posting & Desktop Header"
Cohesion: 0.15
Nodes (17): @react-navigation/native-stack, DESKTOP_CONTENT_MAX, DesktopPageHeader(), pointer, s, createEvent(), EVENT_CATEGORIES, updateEvent() (+9 more)

### Community 47 - "Announcements & Audience"
Cohesion: 0.17
Nodes (17): Announcement, classLabel(), deleteAnnouncement(), getAdmissionYears(), getClassOptionsForYear(), postAnnouncement(), subscribeToAnnouncements(), yearOfStudyLabel() (+9 more)

### Community 48 - "Excusal Test Script"
Cohesion: 0.13
Nodes (15): bad(), created, db, expectDenied(), expectError(), { getAuth: adminAuth }, { getAuth, signInWithCustomToken, signOut }, { getFirestore: adminDb } (+7 more)

### Community 49 - "CGPA Planner"
Cohesion: 0.19
Nodes (17): subscribeToMyGrades(), CGPA_CHOICES, CgpaPlannerScreen(), CREDIT_CHOICES, norm(), Planner(), styles, TARGETS (+9 more)

### Community 50 - "Account Creation & OTP Reset"
Cohesion: 0.25
Nodes (15): createAccount, norm(), onApprovedList(), onFacultyList(), ALLOWED(), confirmPasswordResetOtp, docIdFor(), hashCode() (+7 more)

### Community 51 - "Plus Subscription (Razorpay)"
Cohesion: 0.19
Nodes (16): cancelPlusSubscription, createPlusSubscription, keyId, keySecret, PlanKey, planMonthly, planPatch(), planYearly (+8 more)

### Community 52 - "Faculty Roster Scripts"
Cohesion: 0.12
Nodes (11): db, { getFirestore }, { initializeApp, cert }, db, { getFirestore }, { initializeApp, cert }, db, dry (+3 more)

### Community 53 - "Mess Subscription"
Cohesion: 0.20
Nodes (16): checkMySubscription(), currentDateKey(), currentMonthKey(), currentTermKey(), getCurrentMealSlot(), getTodaysMealStatus(), MEAL_WINDOWS, MealSlot (+8 more)

### Community 54 - "App Core Dependencies"
Cohesion: 0.15
Nodes (15): @react-native-google-signin/google-signin@^16.1.5, @react-navigation/bottom-tabs@^7.18.7, devDependencies, @expo/ngrok@^4.1.3, firebase-admin@^14.2.0, @types/react@~19.3.0, firebase-admin, main (+7 more)

### Community 55 - "Security Migration Script"
Cohesion: 0.24
Nodes (15): backfillComplaints(), backfillGrades(), backfillMedicalExcusals(), checkEnrollmentClaims(), checkExcusals(), checkFacultyAllowlist(), commitAll(), db (+7 more)

### Community 56 - "Firebase Client Config"
Cohesion: 0.20
Nodes (8): auth, firebaseApp, firebaseConfig, functions, BUCKET, PosterExtraction, subscribeToResources(), storage

### Community 57 - "Grades Service"
Cohesion: 0.15
Nodes (14): getExistingGrades(), gradeDocId(), GRADES, RosterStudent, SemesterResult, setGrade(), Transcript, ATTEMPT_LABELS (+6 more)

### Community 58 - "Medical Leave Teacher Tasks"
Cohesion: 0.20
Nodes (13): buildFacultyResolver(), computeTeacherTasks(), FacultyRef, initialsKey(), nameKey(), sameDay(), splitFaculty(), TeacherSubject (+5 more)

### Community 59 - "Functions TS Config"
Cohesion: 0.14
Nodes (13): compileOnSave, compilerOptions, esModuleInterop, module, moduleResolution, noImplicitReturns, noUnusedLocals, outDir (+5 more)

### Community 60 - "Meetings"
Cohesion: 0.32
Nodes (11): HomeMeetings(), styles, MeetingCard(), meetingEnded(), styles, acknowledgeMeeting(), localIso(), Meeting (+3 more)

### Community 61 - "Shared UI Pickers"
Cohesion: 0.20
Nodes (13): Section(), SheetPicker(), TimelineStep, ui, liveFacultyDirectory(), subscribeToFacultyDirectory(), applyForLeave(), APPROVER_LABEL (+5 more)

### Community 62 - "Placements"
Cohesion: 0.26
Nodes (11): BranchStat, branchStats, PlacementHighlights, placementHighlights, DEFAULT_PLACEMENT_STATS, PlacementStats, subscribeToPlacementStats(), HighlightCard() (+3 more)

### Community 63 - "Seed Medical Leave Script"
Cohesion: 0.19
Nodes (12): db, DEAN, ensureFaculty(), { getFirestore }, HODS, { initializeApp, cert }, isSet(), JOINT_REGISTRAR (+4 more)

### Community 64 - "Academic Calendar"
Cohesion: 0.23
Nodes (11): AcademicCalendar, academicCalendars, CalendarEvent, AcademicCalendarScreen(), dayDiff(), Kind, kindOf(), MONTHS (+3 more)

### Community 65 - "Class Change Sets (Functions)"
Cohesion: 0.30
Nodes (11): sameSection(), changeId(), classChangeSet, isIso(), normSection(), Slot, squash(), Timetable (+3 more)

### Community 66 - "Timetable Image Extraction"
Cohesion: 0.23
Nodes (10): DAY_PATTERNS, ExtractedSlot, extractTimetableInfo, ExtractTimetableRequest, ExtractTimetableResponse, extractWords(), normalizeTime(), visionClient (+2 more)

### Community 67 - "Signature Pad & Stamp"
Cohesion: 0.24
Nodes (10): r1(), s, SignaturePad(), SignatureView(), s, SignedBlock(), Stamp(), fmtStamp() (+2 more)

### Community 68 - "Script: clear-lost-found"
Cohesion: 0.20
Nodes (8): beforeArg, db, { getFirestore }, { getStorage }, { initializeApp, cert }, keep(), really, when()

### Community 69 - "Script: test-mode"
Cohesion: 0.29
Nodes (9): cfg(), db, { getFirestore }, { initializeApp, cert }, [mode, emailArg, phoneArg], off(), on(), status() (+1 more)

### Community 70 - "Script: wipe-test-activity"
Cohesion: 0.18
Nodes (8): db, { getFirestore }, { getStorage }, { initializeApp, cert }, NEVER, really, WIPE, WIPE_FILES

### Community 71 - "Important Contacts"
Cohesion: 0.22
Nodes (10): Contact, ContactCard(), EMERGENCY_CONTACTS, Group, GROUPS, HOSTEL_CONTACTS, ImportantContactsScreen(), MEDICAL_CONTACTS (+2 more)

### Community 72 - "Grade & Low-Attendance Push"
Cohesion: 0.31
Nodes (8): tokensByEnrollment(), sendGradePush, excusalsFor(), Excused, pct(), sendLowAttendancePush, Session, tally()

### Community 73 - "Poster Info Extraction"
Cohesion: 0.29
Nodes (9): extractDate(), extractPosterInfo, ExtractPosterInfoRequest, ExtractPosterInfoResponse, extractTime(), guessTitle(), MONTH_NAMES, monthIndexFromToken() (+1 more)

### Community 74 - "Faculty Legend (Functions)"
Cohesion: 0.33
Nodes (9): BY_EXACT, BY_LOOSE, expandFaculty(), FACULTY_LEGEND, facultyNameKey(), initialsKey(), lookupFacultyInitials(), slotTaughtBy() (+1 more)

### Community 75 - "Script: medical-test-mode"
Cohesion: 0.20
Nodes (8): args, backup, db, email, { getFirestore }, { initializeApp, cert }, live, restore

### Community 76 - "Script: seed-sos-config"
Cohesion: 0.20
Nodes (8): db, DOCTOR, { getFirestore }, HELPLINES, HOSTEL_COMMITTEE, { initializeApp, cert }, MEDICAL_COMMITTEE, WARDENS

### Community 77 - "Script: why-resources-hidden"
Cohesion: 0.31
Nodes (9): ayStart(), currentAY(), db, email, { getFirestore }, { initializeApp, cert }, main(), resYear() (+1 more)

### Community 78 - "Faculty Legend (Client)"
Cohesion: 0.33
Nodes (9): BY_EXACT, BY_LOOSE, expandFaculty(), FACULTY_LEGEND, facultyNameKey(), initialsKey(), lookupFacultyInitials(), slotTaughtBy() (+1 more)

### Community 79 - "Functions npm Scripts"
Cohesion: 0.22
Nodes (9): scripts, build, build:watch, deploy, lint, logs, serve, shell (+1 more)

### Community 80 - "Meeting Push"
Cohesion: 0.33
Nodes (8): FacultyAudience, Meeting, prettyWhen(), resolveRecipients(), sendMeetingPush, squash(), StudentAudience, tokensForUids()

### Community 81 - "Script: clear-test-data"
Cohesion: 0.22
Nodes (7): db, { getFirestore }, { getStorage }, { initializeApp, cert }, really, testEmail, [testEmailArg]

### Community 82 - "Script: fix-faculty-profiles"
Cohesion: 0.25
Nodes (8): auth, { cert }, db, { getAuth }, { getFirestore }, { initializeApp }, listAllAuthUsers(), main()

### Community 83 - "Script: fix-resource-sections"
Cohesion: 0.28
Nodes (8): apply, db, { getFirestore }, { initializeApp, cert }, main(), setArg, startOf(), yearFor()

### Community 84 - "Script: fix-timetable-names"
Cohesion: 0.22
Nodes (7): APPLY, db, { getFirestore }, { initializeApp, cert }, NAMES, SEM5, SEM7

### Community 85 - "Script: manage-clubs"
Cohesion: 0.28
Nodes (8): { cert }, CLUBS, db, findByName(), { getFirestore, FieldValue }, { initializeApp }, main(), resolveLeadUid()

### Community 86 - "Script: offboard-faculty"
Cohesion: 0.22
Nodes (7): auth, { cert }, db, EMAILS_TO_OFFBOARD, { getAuth }, { getFirestore }, { initializeApp }

### Community 87 - "Script: wipe-resources"
Cohesion: 0.22
Nodes (7): bucket, { cert }, CONFIRMED, db, { getFirestore }, { getStorage }, { initializeApp }

### Community 88 - "Date Field"
Cohesion: 0.36
Nodes (8): DateField(), DAYS, MONTHS, pad(), pretty(), s, todayIso(), toIso()

### Community 89 - "Inbox Capture"
Cohesion: 0.29
Nodes (4): original, ownersOf(), PushMessage, saveToInbox()

### Community 90 - "Script: compare-ece-roster"
Cohesion: 0.32
Nodes (7): db, { getFirestore }, { initializeApp, cert }, main(), REGISTER, same(), words()

### Community 91 - "Script: reset-user-data-grades-complaints"
Cohesion: 0.29
Nodes (7): CONFIRMED, db, deleteCollection(), FIRESTORE_COLLECTIONS, { getFirestore }, { initializeApp, cert }, main()

### Community 92 - "App Icon & Brand Images"
Cohesion: 0.29
Nodes (7): Android Adaptive Icon Background (blue-to-violet gradient), Android Adaptive Icon Foreground (white G glyph with teal dot), Web Favicon (rounded-square G app mark), App Icon (white G with teal dot on blue-violet gradient), Splash Icon (centered rounded G app mark on white), CollegeGo Brand, collegego Wordmark (navy 'college' + gradient 'go')

### Community 93 - "App npm Scripts"
Cohesion: 0.29
Nodes (7): scripts, android, build:web, deploy:web, ios, start, web

### Community 94 - "Script: fill-section"
Cohesion: 0.29
Nodes (5): apply, [branch, year, section], db, { getFirestore }, { initializeApp, cert }

### Community 95 - "Script: find-ece-students"
Cohesion: 0.33
Nodes (6): db, { getFirestore }, { initializeApp, cert }, key(), main(), REGISTER

### Community 96 - "Script: fix-roster-years"
Cohesion: 0.33
Nodes (6): APPLY, db, { getFirestore }, { initializeApp, cert }, main(), yearOf()

### Community 97 - "Script: plus-access"
Cohesion: 0.29
Nodes (5): [cmd, arg], db, { getAuth }, { getFirestore }, { initializeApp, cert }

### Community 98 - "Script: seed-counsellors"
Cohesion: 0.29
Nodes (5): { cert }, counsellors, db, { getFirestore }, { initializeApp }

### Community 99 - "Script: seed-event-coordinators"
Cohesion: 0.29
Nodes (5): { cert }, coordinators, db, { getFirestore }, { initializeApp }

### Community 100 - "Script: seed-tnp-coordinators"
Cohesion: 0.29
Nodes (5): { cert }, coordinators, db, { getFirestore }, { initializeApp }

### Community 101 - "Roll Call"
Cohesion: 0.38
Nodes (6): buzz(), initials(), Mark, RollCallCard, RollStudent, st

### Community 102 - "Roster Cache"
Cohesion: 0.38
Nodes (6): readCached(), revive(), writeCached(), byYear, RosterDoc, rosterYears()

### Community 103 - "Publication Lookup"
Cohesion: 0.52
Nodes (6): delay(), fetchJson(), PublicationCandidate, searchDblp(), searchPublications(), searchSemanticScholar()

### Community 104 - "Metro Config"
Cohesion: 0.33
Nodes (5): config, escapedDirname, { getDefaultConfig }, expo@^58.0.0, expo

### Community 105 - "App TS Config"
Cohesion: 0.33
Nodes (5): expo/tsconfig.base, compilerOptions, strict, exclude, extends

### Community 106 - "Script: create-reviewer"
Cohesion: 0.33
Nodes (4): { getAuth }, { getFirestore, FieldValue }, { initializeApp, cert }, STUDENT

### Community 107 - "Script: fix-incomplete-profiles"
Cohesion: 0.33
Nodes (4): APPLY, db, { getFirestore }, { initializeApp, cert }

### Community 108 - "Script: imagine-club"
Cohesion: 0.33
Nodes (5): db, { getFirestore, FieldValue }, { initializeApp, cert }, MOVE, really

### Community 109 - "Script: my-uploads"
Cohesion: 0.33
Nodes (4): db, { getFirestore }, { initializeApp, cert }, who

### Community 110 - "Script: remove-faculty"
Cohesion: 0.33
Nodes (4): db, { getAuth }, { getFirestore }, { initializeApp, cert }

### Community 111 - "Script: set-leadership"
Cohesion: 0.40
Nodes (5): db, { getFirestore, FieldValue }, { initializeApp, cert }, main(), usage()

### Community 112 - "Script: test-notifications"
Cohesion: 0.33
Nodes (4): db, { getFirestore }, { initializeApp, cert }, T

### Community 113 - "Marks Service"
Cohesion: 0.40
Nodes (5): MarkComponent, ORDER, orderedComponents(), rank(), SubjectMarks

### Community 114 - "Web Download History"
Cohesion: 0.50
Nodes (4): @react-native-async-storage/async-storage, addToWebDownloadHistory(), getWebDownloadHistory(), WebDownloadEntry

### Community 115 - "Script: grant-portal-access"
Cohesion: 0.40
Nodes (3): db, { getFirestore }, { initializeApp, cert }

### Community 116 - "Script: make-admin"
Cohesion: 0.40
Nodes (3): db, { getFirestore }, { initializeApp, cert }

### Community 117 - "Script: mess-counter"
Cohesion: 0.40
Nodes (4): db, [emailArg, mode], { getFirestore }, { initializeApp, cert }

### Community 118 - "Script: preview-tester"
Cohesion: 0.40
Nodes (4): db, [emailArg, mode], { getFirestore }, { initializeApp, cert }

### Community 119 - "Script: seed-exam-cell"
Cohesion: 0.40
Nodes (3): db, { getFirestore, FieldValue }, { initializeApp, cert }

### Community 120 - "Script: send-day-status-now"
Cohesion: 0.40
Nodes (3): db, { getFirestore }, { initializeApp, cert }

### Community 121 - "Script: set-complaint-committee"
Cohesion: 0.40
Nodes (3): db, { getFirestore }, { initializeApp, cert }

### Community 122 - "Script: set-non-teaching"
Cohesion: 0.40
Nodes (3): db, { getFirestore }, { initializeApp, cert }

### Community 123 - "Medical Queue Subscriptions"
Cohesion: 0.60
Nodes (5): isFlow2(), newest(), subscribeMedicalQueue(), subscribeMedicalRecords(), toReq()

### Community 124 - "Notification Preferences"
Cohesion: 0.50
Nodes (4): DEFAULTS, getNotificationPreferences(), NotificationPreferences, updateNotificationPreference()

### Community 127 - "ICS Download"
Cohesion: 0.83
Nodes (3): downloadIcs(), esc(), fmt()

## Ambiguous Edges - Review These
- `Android Adaptive Icon Monochrome (white G silhouette)` → `Notification Icon (white monochrome glyph)`  [AMBIGUOUS]
  assets/notification-icon.png · relation: semantically_similar_to

## Knowledge Gaps
- **14 isolated node(s):** `expo/tsconfig.base`, `Optional expo-blur uninstall`, `storage.rules`, `Medical Leave Approval Chain (Medical Officer, HoD, Assoc. Dean Academics, Joint Registrar)`, `Enclosures: verified medical certificate + email intimation copy` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 862 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react-native` connect `Theme & Profile` to `App Shell & Auth UI`, `Clubs & Notices`, `Brand & Shared Widgets`, `Complaints & Profile Editing`, `Leave Approval Service`, `Resources & Downloads`, `Home Screen & Day Status`, `Web Desktop Home`, `Timetable & Class Changes`, `Event Excusal Submission`, `Medical Apply Form`, `Medical Review Cards`, `SOS Emergency`, `Attendance Marking`, `Attendance Views`, `Leave Planner`, `Exam Events & Status`, `Faculty Directory`, `Counselling & Crisis Help`, `Exam Schedule Screen`, `Room Availability`, `Auth Context & Push Registration`, `Web Shell & Inbox`, `Clay Cards & Notice Posting`, `Plus Subscription (Client)`, `Excusal Review Steps`, `App Expo Dependencies`, `Event Posting & Desktop Header`, `CGPA Planner`, `App Core Dependencies`, `Firebase Client Config`, `Meetings`, `Shared UI Pickers`, `Placements`, `Academic Calendar`, `Signature Pad & Stamp`, `Important Contacts`, `Date Field`, `Roll Call`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **What connects `expo/tsconfig.base`, `Optional expo-blur uninstall`, `storage.rules` to the rest of the system?**
  _14 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Shell & Auth UI` be split into smaller, more focused modules?**
  _Cohesion score 0.07703081232492998 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Brand & Shared Widgets` to `App Shell & Auth UI`, `Clubs & Notices`, `Complaints & Profile Editing`, `Leave Approval Service`, `Resources & Downloads`, `Theme & Profile`, `Home Screen & Day Status`, `Web Desktop Home`, `Timetable & Class Changes`, `Event Excusal Submission`, `Medical Apply Form`, `Medical Review Cards`, `SOS Emergency`, `Attendance Marking`, `Attendance Views`, `Leave Planner`, `Exam Events & Status`, `Faculty Directory`, `Counselling & Crisis Help`, `Exam Schedule Screen`, `Room Availability`, `Auth Context & Push Registration`, `Web Shell & Inbox`, `Clay Cards & Notice Posting`, `Plus Subscription (Client)`, `Excusal Review Steps`, `App Expo Dependencies`, `Event Posting & Desktop Header`, `CGPA Planner`, `App Core Dependencies`, `Meetings`, `Shared UI Pickers`, `Placements`, `Academic Calendar`, `Signature Pad & Stamp`, `Important Contacts`, `Date Field`, `Roll Call`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Should `Clubs & Notices` be split into smaller, more focused modules?**
  _Cohesion score 0.05617283950617284 - nodes in this community are weakly interconnected._
- **Why does `colors` connect `Clay Cards & Notice Posting` to `App Shell & Auth UI`, `Clubs & Notices`, `Brand & Shared Widgets`, `Complaints & Profile Editing`, `Leave Approval Service`, `Resources & Downloads`, `Theme & Profile`, `Home Screen & Day Status`, `Web Desktop Home`, `Timetable & Class Changes`, `Event Excusal Submission`, `Medical Apply Form`, `Medical Review Cards`, `SOS Emergency`, `Attendance Marking`, `Attendance Views`, `Leave Planner`, `Exam Events & Status`, `Faculty Directory`, `Counselling & Crisis Help`, `Exam Schedule Screen`, `Room Availability`, `Web Shell & Inbox`, `Plus Subscription (Client)`, `Excusal Review Steps`, `Event Posting & Desktop Header`, `CGPA Planner`, `Meetings`, `Shared UI Pickers`, `Placements`, `Academic Calendar`, `Signature Pad & Stamp`, `Important Contacts`, `Date Field`, `Roll Call`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Android Adaptive Icon Monochrome (white G silhouette)` and `Notification Icon (white monochrome glyph)`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._