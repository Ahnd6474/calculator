import type {
  CalculatorSettings,
  ComputationIssue,
  ResultEnvelope,
  SolverDraft,
  SolverRequest,
  SolverResult
} from "@core/contracts";

export interface SolverPresentation {
  title: string;
  detail: string;
  value: string;
  issues: ComputationIssue[];
}

export function buildSolverRequest(
  draft: SolverDraft,
  settings: CalculatorSettings
): { ok: true; value: SolverRequest } | { ok: false; issues: ComputationIssue[] } {
  const expression = draft.expression.trim();
  if (!expression) {
    return {
      ok: false,
      issues: [
        {
          code: "solver_expression_required",
          message: "Enter an expression or equation in x before solving.",
          severity: "error",
          field: "expression"
        }
      ]
    };
  }

  if (draft.method === "newton") {
    const initialGuess = parseFiniteNumber(draft.initialGuess, "initialGuess", "Provide a finite initial guess for Newton-Raphson.");
    if (!initialGuess.ok) {
      return {
        ok: false,
        issues: [initialGuess.issue]
      };
    }

    return {
      ok: true,
      value: {
        method: draft.method,
        expression,
        initialGuess: initialGuess.value,
        settings
      }
    };
  }

  const lower = parseFiniteNumber(draft.bracketLower, "bracketLower", "Provide a finite lower bound for bisection.");
  const upper = parseFiniteNumber(draft.bracketUpper, "bracketUpper", "Provide a finite upper bound for bisection.");

  if (!lower.ok || !upper.ok) {
    return {
      ok: false,
      issues: [lower, upper]
        .filter((candidate): candidate is { ok: false; issue: ComputationIssue } => !candidate.ok)
        .map((candidate) => candidate.issue)
    };
  }

  if (lower.value >= upper.value) {
    return {
      ok: false,
      issues: [
        {
          code: "solver_invalid_bracket",
          message: "Lower bound must stay below the upper bound for bisection.",
          severity: "error",
          field: "bracket"
        }
      ]
    };
  }

  return {
    ok: true,
    value: {
      method: draft.method,
      expression,
      bracket: [lower.value, upper.value],
      settings
    }
  };
}

export function summarizeSolver(
  draft: SolverDraft,
  result: ResultEnvelope<SolverResult> | null
): SolverPresentation {
  const expression = draft.expression.trim();

  if (!expression) {
    return {
      title: "Solver Draft",
      detail: "No solver expression drafted yet.",
      value: `${formatMethodLabel(draft.method)} ready`,
      issues: [
        {
          code: "empty-solver-expression",
          message: "Add an expression or equation in x before capturing a solver snapshot.",
          severity: "warning"
        }
      ]
    };
  }

  if (!result) {
    return {
      title: "Solver Draft",
      detail: expression,
      value: `${formatMethodLabel(draft.method)} pending`,
      issues: []
    };
  }

  if (!result.ok) {
    return {
      title: "Solver Blocked",
      detail: expression,
      value: "Input blocked",
      issues: result.issues
    };
  }

  return {
    title: result.value.converged ? "Solver Result" : "Solver Diagnostic",
    detail: `${result.value.canonicalExpression} = 0 | ${formatTerminationReason(result.value.terminationReason)}`,
    value: `x = ${result.value.formattedRoot}`,
    issues: result.issues
  };
}

export function formatMethodLabel(method: SolverDraft["method"]): string {
  return method === "bisection" ? "Bisection" : "Newton-Raphson";
}

export function formatTerminationReason(reason: SolverResult["terminationReason"]): string {
  switch (reason) {
    case "residual_tolerance":
      return "Residual met tolerance";
    case "interval_tolerance":
      return "Interval width met tolerance";
    case "exact_endpoint":
      return "Endpoint already satisfied the equation";
    case "zero_derivative":
      return "Derivative stalled near zero";
    case "max_iterations":
      return "Iteration limit reached";
  }
}

function parseFiniteNumber(
  rawValue: string,
  field: string,
  message: string
): { ok: true; value: number } | { ok: false; issue: ComputationIssue } {
  const normalized = rawValue.trim();
  if (!normalized) {
    return {
      ok: false,
      issue: {
        code: "solver_input_required",
        message,
        severity: "error",
        field
      }
    };
  }

  const numericValue = Number(normalized);
  if (!Number.isFinite(numericValue)) {
    return {
      ok: false,
      issue: {
        code: "solver_invalid_value",
        message: "Solver inputs must parse as finite numbers.",
        severity: "error",
        field
      }
    };
  }

  return {
    ok: true,
    value: numericValue
  };
}
