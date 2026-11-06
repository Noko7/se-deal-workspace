"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

type LlmDiagnostics = {
  ok: boolean;
  model: string | null;
  baseUrl: string | null;
  insecureTls: boolean;
  steps: Array<{
    step: string;
    ok: boolean;
    detail: string;
    elapsedMs?: number;
    statusCode?: number;
    raw?: unknown;
  }>;
};

type State = {
  testing: boolean;
  error: string | null;
  result: LlmDiagnostics | null;
};

export function NaiTestPanel() {
  const [state, setState] = useState<State>({
    testing: false,
    error: null,
    result: null,
  });

  async function runTest() {
    setState({ testing: true, error: null, result: null });
    try {
      const response = await fetch("/api/integrations/nai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as LlmDiagnostics;
      setState({ testing: false, error: null, result: payload });
    } catch (error) {
      setState({
        testing: false,
        error: `Could not run NAI test: ${(error as Error).message}`,
        result: null,
      });
    }
  }

  return (
    <div className="rounded-lg border border-charcoal-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-charcoal-900">Live NAI Connection Test</h3>
          <p className="text-xs text-charcoal-500">Runs /models and /chat/completions checks using your saved or env-backed LLM credentials.</p>
        </div>
        <Button type="button" tone="secondary" onClick={runTest} disabled={state.testing}>
          {state.testing ? "Testing..." : "Run Live Test"}
        </Button>
      </div>

      {state.error ? (
        <div className="mt-3 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{state.error}</div>
      ) : null}

      {state.result ? (
        <div className="mt-3 space-y-3">
          <div
            className={`rounded-md border p-3 text-sm ${
              state.result.ok
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-amber-300 bg-amber-50 text-amber-900"
            }`}
          >
            {state.result.ok ? "NAI test succeeded." : "NAI test failed. Review the failing step below."}
          </div>
          <ol className="space-y-2">
            {state.result.steps.map((step, idx) => (
              <li
                key={`${step.step}-${idx}`}
                className={`rounded-md border p-3 text-sm ${
                  step.ok ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${step.ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                    {step.ok ? "PASS" : "FAIL"}
                  </span>
                  <span className="font-medium text-charcoal-900">{step.step}</span>
                  {typeof step.statusCode === "number" ? <span className="text-xs text-charcoal-600">HTTP {step.statusCode}</span> : null}
                  {typeof step.elapsedMs === "number" ? <span className="text-xs text-charcoal-600">{step.elapsedMs} ms</span> : null}
                </div>
                <p className="mt-1 text-charcoal-700">{step.detail}</p>
                {step.raw ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-charcoal-700">Raw JSON (copy/paste)</summary>
                    <pre className="mt-2 max-h-56 overflow-auto rounded border border-charcoal-300 bg-white p-2 text-xs text-charcoal-950">
                      {JSON.stringify(step.raw, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
