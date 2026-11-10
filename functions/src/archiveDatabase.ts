import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {v1} from "@google-cloud/firestore";

const BUCKET = "gs://iiit-surat-app-6643d-archive";

export const archiveDatabase = onSchedule(
  {schedule: "0 3 1 * *", timeZone: "Asia/Kolkata", region: "asia-south1", retryCount: 3},
  async () => {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
    if (!projectId) throw new Error("No project id");
    const client = new v1.FirestoreAdminClient();
    const now = new Date(Date.now() + 5.5 * 3600000);
    const stamp = now.toISOString().slice(0, 10);
    const [op] = await client.exportDocuments({
      name: client.databasePath(projectId, "(default)"),
      outputUriPrefix: `${BUCKET}/monthly/${stamp}`,
      collectionIds: [],
    });
    logger.info(`archiveDatabase: export started to ${BUCKET}/monthly/${stamp}`, {operation: op.name});
  },
);

/**
 * A full export every night at 02:00, kept under daily/. Set a lifecycle rule on the bucket to delete
 * daily/ after 14 days (see RUNBOOK.md) so storage does not grow for ever.
 */
export const archiveDatabaseDaily = onSchedule(
  {schedule: "0 2 * * *", timeZone: "Asia/Kolkata", region: "asia-south1", retryCount: 3},
  async () => {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
    if (!projectId) throw new Error("No project id");
    const client = new v1.FirestoreAdminClient();
    const stamp = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
    const [op] = await client.exportDocuments({
      name: client.databasePath(projectId, "(default)"),
      outputUriPrefix: `${BUCKET}/daily/${stamp}`,
      collectionIds: [],
    });
    logger.info(`archiveDatabaseDaily: export started to ${BUCKET}/daily/${stamp}`, {operation: op.name});
  },
);
