import {defineSecret} from "firebase-functions/params";

export const smsKey = defineSecret("FAST2SMS_API_KEY");

export function cleanIndianMobile(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "").slice(-10);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export async function sendSms(numbers: string[], message: string, logTag: string): Promise<{sent: number; error?: string}> {
  const key = smsKey.value();
  const list = Array.from(new Set(numbers.map(cleanIndianMobile).filter(Boolean))) as string[];
  if (!key || key === "none" || list.length === 0) return {sent: 0, error: !key || key === "none" ? "sms-off" : "no-numbers"};
  try {
    const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: {"authorization": key, "Content-Type": "application/json"},
      body: JSON.stringify({route: "q", message, language: "english", flash: 0, numbers: list.join(",")}),
    });
    const body = (await res.json().catch(() => ({}))) as {return?: boolean; message?: unknown};
    if (!res.ok || body.return === false) {
      // eslint-disable-next-line no-console
      console.error(`[${logTag}] SMS failed:`, res.status, body);
      return {sent: 0, error: `gateway: ${JSON.stringify(body.message ?? res.status)}`};
    }
    return {sent: list.length};
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[${logTag}] SMS error:`, err);
    return {sent: 0, error: String(err)};
  }
}
