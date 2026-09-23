// Sends one Expo push message per token, 100 per request (Expo's batch
// limit). Shared by the exam-schedule and grade triggers; the older push
// functions each carry their own inline copy of this same loop.
export async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
  logTag: string,
): Promise<void> {
  if (tokens.length === 0) return;

  const CHUNK_SIZE = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += CHUNK_SIZE) chunks.push(tokens.slice(i, i + CHUNK_SIZE));

  await Promise.all(
    chunks.map((chunk) =>
      fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          chunk.map((token) => ({to: token, title, body, sound: "default", priority: "high"})),
        ),
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[${logTag}] Expo push API call failed:`, err);
      }),
    ),
  );
}
