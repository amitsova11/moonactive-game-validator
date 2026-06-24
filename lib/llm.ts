import { GoogleGenAI } from "@google/genai";
import { toFriendlyErrorFeedback, type LlmFeedback } from "./error";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

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

    Your task is to evaluate whether a game level's difficulty, reward, and time limit are well balanced relative to each other and to typical design patterns.

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
        Lower reward
        More generous time
        Low pressure gameplay

      Medium:
        Moderate reward
        Balanced time pressure
        Some constraint but fair

      Hard:
        High reward
        Tight time constraints
        High pressure / optimization required

      Key relationships:
        Higher difficulty → reward should generally increase
        Higher difficulty → time limit should generally decrease
        Reward and time should jointly reflect “effort vs payoff”

    - Evaluation Tasks

    For each level, you must:

    1. Internal Consistency Check

      Assess whether:

      Reward matches difficulty expectation
      Time pressure matches difficulty expectation
      Reward/time ratio feels coherent

    2. Relative Reasoning

      Compare the level against expected patterns for its difficulty tier:

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

      Provide your analysis and suggest any adjustments to improve the game experience.

      Return ONLY valid JSON:

      {
        "analysis": "...",
        "suggested_actions": [
          "..."
        ]
      }

      where analysis is a one sentence of your evaluation, and suggested_actions is an array of up to 3 specific recommendations for improving the level's balance.


      If you think the configuration is well balanced, return "no actions needed" in the suggested_actions array.


    Configuration:
    ${JSON.stringify(config, null, 2)}
  `;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const rawText = response.text ?? "{}";

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