export type LlmFeedback = {
  analysis: string;
  suggested_actions: string[];
};

type ProviderErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

function extractProviderErrorPayload(error: unknown): ProviderErrorPayload | null {
  const rawMessage = error instanceof Error ? error.message : String(error);

  // Use regex to safely find JSON object, avoiding indexOf/lastIndexOf injection
  const jsonMatch = rawMessage.match(/\{[^{}]*(?:"error"[^{}]*)*\}/i);
  if (!jsonMatch) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as ProviderErrorPayload;
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function toFriendlyErrorFeedback(error: unknown): LlmFeedback {
  const payload = extractProviderErrorPayload(error);
  const providerCode = payload?.error?.code;
  const providerStatus = payload?.error?.status;
  const providerMessage = payload?.error?.message;

  if (providerCode === 503 || providerStatus === "UNAVAILABLE") {
    return {
      analysis: "AI analysis is temporarily unavailable due to high demand. Please try again shortly.",
      suggested_actions: [
        "Retry in 30-60 seconds",
        "If the issue continues, try again later",
      ],
    };
  }

  return {
    analysis: providerMessage || "An error occurred while analyzing the configuration.",
    suggested_actions: ["Please try again."],
  };
}
