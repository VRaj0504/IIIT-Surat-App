

export async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
  logTag: string,
  data?: Record<string, unknown>,
  channelId?: string,
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
          chunk.map((token) => ({to: token, title, body, sound: "default", priority: "high", ...(data ? {data} : {}), ...(channelId ? {channelId} : {})})),
        ),
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[${logTag}] Expo push API call failed:`, err);
      }),
    ),
  );
}
