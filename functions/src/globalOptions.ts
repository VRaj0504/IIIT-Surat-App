import {setGlobalOptions} from "firebase-functions/v2";
import {defineSecret} from "firebase-functions/params";

export const expoAccessToken = defineSecret("EXPO_ACCESS_TOKEN");

// maxInstances caps how far any one function can scale, so a bug or abuse cannot run up the bill.
// A function that sets its own maxInstances keeps it.
setGlobalOptions({secrets: [expoAccessToken], maxInstances: 20});
