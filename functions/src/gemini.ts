// One place that talks to Google's Gemini API, used by both the exam date
// sheet reader (examSheetExtraction.ts) and the email classifier in
// ingestFacultyEmail.ts.
//
// Model: the one this project's email pipeline already moved to when
// gemini-2.0-flash was retired. Google retires model names from time to
// time — if a call ever fails with "model not found" / 404, this constant
// is the only thing to change.
export const GEMINI_MODEL = "gemini-3.6-flash";

export type GeminiPart =
  | {text: string}
  | {inline_data: {mime_type: string; data: string}};

type GeminiResponse = {
  candidates?: {
    finishReason?: string;
    content?: {parts?: {text?: string}[]};
  }[];
  promptFeedback?: {blockReason?: string};
};

// Sends one request and returns the model's reply parsed as JSON.
// responseMimeType makes Gemini emit bare JSON; the fence-stripping below
// is only a safety net. maxOutputTokens is deliberately generous — on
// "thinking" models the reasoning tokens can count toward the cap, and a
// reply cut off mid-JSON is worse than a slightly larger allowance.
export async function geminiJson(options: {
  apiKey: string;
  parts: GeminiPart[];
  systemInstruction?: string;
  maxOutputTokens: number;
}): Promise<unknown> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {"Content-Type": "application/json", "x-goog-api-key": options.apiKey},
    body: JSON.stringify({
      ...(options.systemInstruction ? {systemInstruction: {parts: [{text: options.systemInstruction}]}} : {}),
      contents: [{role: "user", parts: options.parts}],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        maxOutputTokens: options.maxOutputTokens,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as GeminiResponse;
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) {
    throw new Error(`Gemini returned no text (${data.promptFeedback?.blockReason ?? candidate?.finishReason ?? "unknown reason"})`);
  }

  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Gemini returned invalid JSON (finishReason: ${candidate?.finishReason ?? "unknown"})`);
  }
}
