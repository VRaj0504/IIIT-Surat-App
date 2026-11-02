import {onDocumentCreated} from "firebase-functions/v2/firestore";

export const normalizeComplaint = onDocumentCreated("complaints/{complaintId}", async (event) => {
  const data = event.data?.data();
  if (!data) return;
  const patch: Record<string, unknown> = {};
  if (!("facultyEmail" in data)) patch.facultyEmail = null;
  if (!data.type) patch.type = "complaint";
  if (Object.keys(patch).length) await event.data?.ref.update(patch);
});
