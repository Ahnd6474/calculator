import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type {
  CalculatorSettings,
  ResultEnvelope,
  SolverDraft,
  SolverResult
} from "@core/contracts";
import { createDefaultWorkspaceState } from "../../app/workspaceDrafts";
import { createSolverService } from "../../services/solver";
import {
  buildSolverRequest,
  formatMethodLabel,
  formatTerminationReason
} from "./model";
import "./solver.css";

interface SolverWorkbenchProps {
  settings: CalculatorSettings;
  draft: SolverDraft;
  onDraftChange(recipe: (current: SolverDraft) => SolverDraft): void;
  onResultChange: Dispatch<SetStateAction<ResultEnvelope<SolverResult> | null>>;
}

const solverService = createSolverService();
const defaultDraft = createDefaultWorkspaceState().solver;

export function SolverWorkbench({
  settings,
  draft,
  onDraftChange,
  onResultChange
}: SolverWorkbenchProps) {
  const [result, setResult] = useState<ResultEnvelope<SolverResult> | null>(null);

  useEffect(() => {
    onResultChange(result);
  }, [onResultChange, result]);

  useEffect(() => {
    setResult(null);
  }, [
    draft.bracketLower,
    draft.bracketUpper,
    draft.expression,
    draft.initialGuess,
    draft.method,
    settings
  ]);

  function submit() {
    const parsed = buildSolverRequest(draft, settings);
    if (!parsed.ok) {
      setResult({
        ok: false,
        issues: parsed.issues,
        metadata: {
          backend: settings.numeric.backend
        }
      });
      return;
    }

    void Promise.resolve(solverService.solve(parsed.value)).then((nextResult) => setResult(nextResult));
  }

  function resetDraft() {
    onDraftChange(() => defaultDraft);
    setResult(null);
  }

  return (
    <section className="solver-workbench">
      <header className="solver-toolbar">
        <div>
          <p className="eyebrow">Solver mode</p>
          <h3>One-variable root finder</h3>
          <p className="solver-caption">
            Solve equations in x with Newton-Raphson or bisection. Enter either a zero-form expression such
            as `cos(x) - x` or an explicit equation such as `x^2 = 2`.
          </p>
        </div>
        <div className="solver-toolbar-actions">
          <button type="button" className="secondary-button" onClick={resetDraft}>
            Reset draft
          </button>
          <button type="button" className="primary-button" onClick={submit}>
            Solve equation
          </button>
        </div>
      </header>

      <div className="solver-meta-strip">
        <span>Backend: {settings.numeric.backend}</span>
        <span>Tolerance: {settings.numeric.solverTolerance}</span>
        <span>Max iterations: {settings.numeric.maxIterations}</span>
        <span>Display: {settings.numeric.displayMode}</span>
      </div>

      <div className="solver-pane-grid">
        <article className="solver-pane">
          <div className="form-grid">
            <label className="field field-wide">
              <span>Expression or equation</span>
              <textarea
                rows={5}
                value={draft.expression}
                onChange={(event) =>
                  onDraftChange((current) => ({
                    ...current,
                    expression: event.target.value
                  }))
                }
                placeholder="cos(x) - x"
              />
            </label>
            <label className="field">
              <span>Method</span>
              <select
                value={draft.method}
                onChange={(event) =>
                  onDraftChange((current) => ({
                    ...current,
                    method: event.target.value === "bisection" ? "bisection" : "newton"
                  }))
                }
              >
                <option value="newton">Newton-Raphson</option>
                <option value="bisection">Bisection</option>
              </select>
            </label>
            <label className="field">
              <span>Initial guess</span>
              <input
                type="text"
                inputMode="decimal"
                disabled={draft.method !== "newton"}
                value={draft.initialGuess}
                onChange={(event) =>
                  onDraftChange((current) => ({
                    ...current,
                    initialGuess: event.target.value
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Bracket lower</span>
              <input
                type="text"
                inputMode="decimal"
                disabled={draft.method !== "bisection"}
                value={draft.bracketLower}
                onChange={(event) =>
                  onDraftChange((current) => ({
                    ...current,
                    bracketLower: event.target.value
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Bracket upper</span>
              <input
                type="text"
                inputMode="decimal"
                disabled={draft.method !== "bisection"}
                value={draft.bracketUpper}
                onChange={(event) =>
                  onDraftChange((current) => ({
                    ...current,
                    bracketUpper: event.target.value
                  }))
                }
              />
            </label>
          </div>
        </article>

        <article className="solver-pane solver-note-pane">
          <h4>{formatMethodLabel(draft.method)}</h4>
          <p className="solver-caption">
            {draft.method === "newton"
              ? "Newton-Raphson uses the initial guess and a numerical derivative built on the shared expression runtime."
              : "Bisection requires an interval whose endpoints evaluate with opposite signs."}
          </p>
        </article>
      </div>

      <SolverResultPanel result={result} />
    </section>
  );
}

function SolverResultPanel({ result }: { result: ResultEnvelope<SolverResult> | null }) {
  if (!result) {
    return (
      <article className="solver-result-panel">
        <h4>Result</h4>
        <p className="solver-caption">
          Run the solver to inspect the root estimate, residual, termination reason, and iteration history.
        </p>
      </article>
    );
  }

  return (
    <article className="solver-result-panel">
      <header className="solver-pane-header">
        <h4>Result</h4>
        <span className={result.ok ? "status-badge status-ok" : "status-badge status-error"}>
          {result.ok ? "Computed" : "Blocked"}
        </span>
      </header>

      {result.issues.length > 0 ? (
        <div className="issue-stack">
          {result.issues.map((issue) => (
            <div
              key={`${issue.code}-${issue.field ?? "general"}`}
              className={issue.severity === "warning" ? "issue-chip issue-warning" : "issue-chip issue-error"}
            >
              <strong>{issue.code}</strong>
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      ) : null}

      {result.ok ? (
        <>
          <div className="solver-summary-grid">
            <div>
              <dt>Root</dt>
              <dd>{result.value.formattedRoot}</dd>
            </div>
            <div>
              <dt>Residual</dt>
              <dd>{result.value.formattedResidual}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{result.value.converged ? "Converged" : "Not converged"}</dd>
            </div>
            <div>
              <dt>Stop reason</dt>
              <dd>{formatTerminationReason(result.value.terminationReason)}</dd>
            </div>
            <div>
              <dt>Iterations</dt>
              <dd>{result.value.iterations}</dd>
            </div>
            <div>
              <dt>Tolerance</dt>
              <dd>{result.value.tolerance}</dd>
            </div>
          </div>

          <div className="solver-history">
            <div className="solver-history-header">
              <strong>Iteration history</strong>
              <span>{result.value.history.length} samples</span>
            </div>
            <div className="solver-history-table" role="table" aria-label="Solver iteration history">
              <div className="solver-history-row solver-history-head" role="row">
                <span>Iter</span>
                <span>Estimate</span>
                <span>Residual</span>
                <span>Step</span>
              </div>
              {result.value.history.map((entry) => (
                <div className="solver-history-row" key={`${entry.iteration}-${entry.estimate}`} role="row">
                  <span>{entry.iteration}</span>
                  <span>{entry.estimate}</span>
                  <span>{entry.residual}</span>
                  <span>{entry.step ?? "n/a"}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="solver-caption">Fix the flagged input or interval issue and run the solver again.</p>
      )}
    </article>
  );
}
