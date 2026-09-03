const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Excludes the Cloud Functions folder from Metro's watched/bundled files.
// Without this, Metro's default project-wide file crawler can end up
// pulling functions/lib/*.js (the compiled Cloud Functions output) into
// the app's own bundle graph — and that code imports Node-only modules
// like `crypto` (see functions/src/razorpayWebhook.ts), which don't
// exist in React Native's JS runtime and crash the bundle. The functions
// folder is a completely separate deployable (deployed via `firebase
// deploy --only functions`, never bundled into the app itself), so it
// has no business being anywhere near Metro's dependency graph.
//
// Anchored to this project's OWN functions/ directory specifically
// (via __dirname) — a bare /functions\// pattern would also match
// node_modules/firebase/functions/, which is the legitimate client-side
// Firebase Functions SDK the app actually imports and needs.
const escapedDirname = __dirname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]
  ).filter(Boolean),
  new RegExp(`^${escapedDirname}/functions/.*`),
];

module.exports = config;
