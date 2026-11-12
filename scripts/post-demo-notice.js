// Posts one Club notice that explains Report and Block, so App Review (and students) have a post to try them on.
// No push is sent: the notice is created without a title (sendNoticePush skips it), then the title is added.
//   node scripts/post-demo-notice.js           -> post it
//   node scripts/post-demo-notice.js --remove  -> delete it
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
initializeApp({ credential: cert(require("./serviceAccountKey.json")) });

const ID = "collegego-report-block-demo";
const TITLE = "New: report or block a post";
const BODY =
  "If a club post is spam, abusive or breaks the community guidelines, tap ⋯ on it and choose Report post. " +
  "An admin reviews every report within 24 hours.\n\n" +
  "To stop seeing posts from someone, tap ⋯ and choose Block. You can unblock them any time from Profile → Blocked people.\n\n" +
  "Try it on this post.";

async function main() {
  const ref = getFirestore().collection("notices").doc(ID);
  if (process.argv.includes("--remove")) {
    await ref.delete();
    console.log("Demo notice removed.");
    return;
  }
  await ref.set({
    title: "",
    description: BODY,
    category: "Club",
    clubId: null,
    clubName: null,
    link: null,
    pinned: false,
    createdBy: "collegego-team",
    createdByName: "CollegeGo Team",
    createdAt: FieldValue.serverTimestamp(),
  });
  await new Promise((r) => setTimeout(r, 3000));
  await ref.update({ title: TITLE });
  console.log(`Posted "${TITLE}" (no notification sent). It shows under Notices → Club.`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
