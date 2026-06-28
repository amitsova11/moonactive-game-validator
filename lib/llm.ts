import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { toFriendlyErrorFeedback, type LlmFeedback } from "./error";

type LlmProvider = "gemini" | "openai" | "local";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_LOCAL_MODEL = "llama3.1";
const DEFAULT_LOCAL_BASE_URL = "http://localhost:11434/v1";

function resolveProvider(): LlmProvider {
  const configuredProvider = process.env.LLM_PROVIDER?.toLowerCase();

  // Explicit provider configuration takes precedence
  if (configuredProvider === "local") {
    if (!process.env.LOCAL_LLM_BASE_URL) {
      throw new Error(
        "LOCAL_LLM_BASE_URL is not configured but LLM_PROVIDER is set to 'local'.",
      );
    }
    return "local";
  }

  if (configuredProvider === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OPENAI_API_KEY is not configured but LLM_PROVIDER is set to 'openai'.",
      );
    }
    return "openai";
  }

  if (configuredProvider === "gemini") {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error(
        "GEMINI_API_KEY is not configured but LLM_PROVIDER is set to 'gemini'.",
      );
    }
    return "gemini";
  }

  // Fallback: auto-detect based on available keys
    if (process.env.GEMINI_API_KEY) {
    return "gemini";
  }
  
  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }

  if (process.env.LOCAL_LLM_BASE_URL) {
    return "local";
  }

  throw new Error(
    "No LLM provider is configured. Set LLM_PROVIDER env var or provide API keys for OpenAI/Gemini or LOCAL_LLM_BASE_URL.",
  );
}

async function generateWithGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Gemini request timed out after 30 seconds")), 30000);
  });

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
        contents: prompt,
      }),
      timeoutPromise,
    ]);
    return response.text ?? "{}";
  } catch (error) {
    if (error instanceof Error && error.message.includes("timed out")) {
      throw error;
    }
    throw error;
  }
}

async function generateWithOpenAI(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const client = new OpenAI({ apiKey, timeout: 30000 });
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI response did not include content.");
  }

  return content;
}

async function generateWithLocalModel(prompt: string): Promise<string> {
  const client = new OpenAI({
    apiKey: process.env.LOCAL_LLM_API_KEY || "local-model",
    baseURL: process.env.LOCAL_LLM_BASE_URL || DEFAULT_LOCAL_BASE_URL,
    timeout: 30000,
  });

  const completion = await client.chat.completions.create({
    model: process.env.LOCAL_LLM_MODEL || DEFAULT_LOCAL_MODEL,
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Local model response did not include content.");
  }

  return content;
}

function parseJsonObject(text: string): unknown {
  const fencedJson = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedJson?.[1]) {
    return JSON.parse(fencedJson[1].trim());
  }

  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");

  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  }

  return JSON.parse(text);
}

function toLlmFeedback(payload: unknown): LlmFeedback {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "analysis" in payload &&
    "suggested_actions" in payload &&
    typeof (payload as { analysis: unknown }).analysis === "string" &&
    Array.isArray((payload as { suggested_actions: unknown }).suggested_actions)
  ) {
    const suggestedActions = (payload as { suggested_actions: unknown[] }).suggested_actions
      .filter((item): item is string => typeof item === "string");

    return {
      analysis: (payload as { analysis: string }).analysis,
      suggested_actions: suggestedActions,
    };
  }

  return {
    analysis: "Could not generate structured feedback.",
    suggested_actions: [],
  };
}

export async function analyzeGameConfig(config: object): Promise<LlmFeedback> {
  const prompt = `
    You are a senior game economy and level design analyst.

    Your task is to evaluate whether a game config's level, difficulty, reward, and time limit are well balanced relative to each other and to typical design patterns.

    You must reason comparatively, not apply strict numeric rules.

    You will receive a config object of type:

    {
      "level": number,
      "difficulty": "easy | medium | hard",
      "reward": number,
      "time_limit": number
    }

    - Fields:
      - level — the game level number, representing progression (higher levels are harder).
      - difficulty — a string indicating the level's difficulty, e.g., “easy”, “medium”, or “hard”.
      - reward — the amount of in-game currency or points granted for completing the level.
      - time_limit — the time (in seconds) allocated to complete the level. This controls pacing and challenge.


    - Design Principles (Reference Patterns Only)

      Use these as soft expectations, not hard rules:

      Easy:
        Lower levels
        Lower reward (100–500)
        More generous time (at least 30 seconds)
        Low pressure gameplay

      Medium:
        Moderate levels
        Moderate reward
        Balanced time pressure
        Some constraint but fair

      Hard:
        Higher levels
        High reward (2000–5000)
        Tight time constraints
        High pressure 

      Key relationships:
        Higher level → higher difficulty, lower time, higher reward
        Lower level → lower difficulty, higher time, lower reward
        Higher difficulty → reward should generally increase
        Higher difficulty → time limit should generally decrease
        Reward and time should jointly reflect “effort vs payoff”

    - Evaluation Tasks

    For each level, you must:

      1. Internal Consistency Check

          Assess whether:
          Reward, time limit, and difficulty are coherent with the level number.
          Reward matches difficulty expectation
          Time pressure matches difficulty expectation
          Reward/time ratio feels coherent

      2. Relative Reasoning

          Compare the level against expected patterns for the level's number and difficulty. Ask yourself:

          Is it under-rewarded or over-rewarded?
          Is time too forgiving or too strict?
          Does it weaken or exaggerate intended difficulty?

      3. Imbalance Detection

          Identify specific issues such as:
          Under-rewarded hard level
          Over-rewarded easy level
          Too much time reducing difficulty
          Too little time making medium feel unfair
          Reward/time mismatch (e.g. high reward + very generous time on hard level)
          A high level with low difficulty or low reward or high time limit
          A lower level with high difficulty or high reward or low time limit
          
    - Output Format

      Provide your analysis and suggest any adjustments to improve the game experience.

      Return ONLY valid JSON:

      {
        "analysis": "...",
        "suggested_actions": [
          "..."
        ]
      }

      where analysis is one sentence of your evaluation, and suggested_actions is an array of up to 3 specific recommendations for improving the level's balance.

      If you think the configuration is well balanced, return "no actions needed" in the suggested_actions array.

    Configuration:
    ${JSON.stringify(config, null, 2)}
  `;

  try {
    const provider = resolveProvider();
    const rawText = provider === "openai"
      ? await generateWithOpenAI(prompt)
      : provider === "local"
        ? await generateWithLocalModel(prompt)
        : await generateWithGemini(prompt);

    try {
      return toLlmFeedback(parseJsonObject(rawText));
    } catch {
      return {
        analysis: "Could not parse model response.",
        suggested_actions: [],
      };
    }
  } catch (error) {
    console.error("Error during LLM analysis:", error);
    return toFriendlyErrorFeedback(error);
  }
}