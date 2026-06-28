import { analyzeGameConfig } from "@/lib/llm";
import { validateConfig } from "@/lib/validator";
import type { LlmFeedback } from "@/lib/error";

const MAX_PAYLOAD_SIZE = 1 * 1024 * 1024; // 1 MB

export async function POST(req: Request) {
  // Validate content length
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_SIZE) {
    return Response.json(
      {
        schema_validation: {
          valid: false,
          errors: ["Payload size exceeds 1 MB limit"],
        },
        llm_feedback: null,
      },
      { status: 413 },
    );
  }

  // Optional: Add basic authentication via header
  const authToken = req.headers.get("x-api-key");
  if (process.env.API_KEY_REQUIRED === "true" && !authToken) {
    return Response.json(
      {
        schema_validation: {
          valid: false,
          errors: ["Missing authentication token"],
        },
        llm_feedback: null,
      },
      { status: 401 },
    );
  }

  if (process.env.API_KEY_REQUIRED === "true" && authToken !== process.env.API_KEY) {
    return Response.json(
      {
        schema_validation: {
          valid: false,
          errors: ["Invalid authentication token"],
        },
        llm_feedback: null,
      },
      { status: 403 },
    );
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return Response.json(
      {
        schema_validation: {
          valid: false,
          errors: ["Invalid JSON body"],
        },
        llm_feedback: null,
      },
      { status: 400 },
    );
  }

  const validation = validateConfig(body);

  if (!validation.valid) {
    return Response.json(
      {
        schema_validation: {
          valid: false,
          errors: validation.errorMessages,
        },
        llm_feedback: null,
      },
    );
  }

  let llmFeedback: LlmFeedback;
  try {
    llmFeedback = await analyzeGameConfig(body as object);
  } catch (error) {
    console.error("LLM analysis error:", error);
    return Response.json(
      {
        schema_validation: {
          valid: true,
          errors: [],
        },
        llm_feedback: {
          analysis: "LLM analysis failed. Schema validation passed, but AI feedback is unavailable.",
          suggested_actions: [],
        },
      },
      { status: 200 },
    );
  }

  return Response.json({
    schema_validation: {
      valid: true,
      errors: [],
    },
    llm_feedback: llmFeedback,
  });
}