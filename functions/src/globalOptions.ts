import {setGlobalOptions} from "firebase-functions/v2";
import {defineSecret} from "firebase-functions/params";

export const expoAccessToken = defineSecret("EXPO_ACCESS_TOKEN");

setGlobalOptions({secrets: [expoAccessToken]});
