

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
