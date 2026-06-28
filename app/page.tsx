"use client";

import { useState } from "react";

const DEFAULT_CONFIG = `{
  "level": 1,
  "difficulty": "easy",
  "reward": 100,
  "time_limit": 60
}`;

type ApiResponse = {
  schema_validation: {
    valid: boolean;
    errors: string[];
  };
  llm_feedback: {
    analysis: string;
    suggested_actions: string[];
  } | string | null;
};

export default function Home() {
  const [input, setInput] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const parsed = JSON.parse(input);

      const res = await fetch("/api/config-validator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsed),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Request failed");
        return;
      }

      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON format");
    } finally {
      setLoading(false);
    }
  }

  // Type guard to check if llm_feedback is a valid feedback object
  const isValidFeedback = (fb: unknown): fb is { analysis: string; suggested_actions: string[] } => {
    return (
      typeof fb === "object" &&
      fb !== null &&
      "analysis" in fb &&
      "suggested_actions" in fb &&
      typeof (fb as { analysis: unknown }).analysis === "string" &&
      Array.isArray((fb as { suggested_actions: unknown }).suggested_actions)
    );
  };

  return (
    <main className="homePage">
      <h1 className="homeTitle">Game Config Validator</h1>

      <p className="homeSubtitle">
        Paste a configuration JSON and analyze balance & design risks.
      </p>

      <div className="homeGrid">
        <div className="homeCard homeCardConfig">
          <h2>Configuration</h2>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="homeTextarea"
          />

          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="homeButton"
          >
            {loading ? "Validating..." : "Validate"}
          </button>

          {error && <p className="homeError">{error}</p>}
        </div>

        <div className="homeCard">
          <h2>Result</h2>

          {!result && <p className="homeEmptyState">No result yet</p>}

          {result && (
            <pre className="homeAnalysisOutput">
              <code>{JSON.stringify(result, null, 2)}</code>
            </pre>
          )}
        </div>
      </div>
    </main>
  );
}