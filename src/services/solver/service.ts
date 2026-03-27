import type {
  ComputationIssue,
  ResultEnvelope,
  SolverRequest,
  SolverResult,
  SolverService
} from "@core/contracts";
import { prepareExpression } from "@core/expression";
import { toComputationIssue } from "@core/expression/compiler";
import {
  createDecimalRuntime,
  createFloat64Runtime,
  normalizeNumericSettings,
  type NumericRuntime
} from "@core/precision";
import { SolverComputationError, solveRoot } from "@core/solver";

export function createSolverService(): SolverService {
  return {
    solve(request) {
      const startedAt = now();
      const normalizedRequest = {
        ...request,
        settings: {
          ...request.settings,
          numeric: normalizeNumericSettings(request.settings.numeric)
        }
      };

      if (normalizedRequest.settings.numeric.backend === "decimal") {
        return executeWithRuntime(normalizedRequest, createDecimalRuntime(normalizedRequest.settings.numeric), startedAt);
      }

      return executeWithRuntime(normalizedRequest, createFloat64Runtime(normalizedRequest.settings.numeric), startedAt);
    }
  };
}

function executeWithRuntime<TValue>(
  request: SolverRequest,
  runtime: NumericRuntime<TValue>,
  startedAt: number
): ResultEnvelope<SolverResult> {
  const normalizedEquation = normalizeEquationExpression(request.expression);
  if (!normalizedEquation.ok) {
    return fail(runtime.backend, startedAt, [normalizedEquation.issue]);
  }

  const variables: Record<string, string> = { x: "0" };
  const prepared = prepareExpression(
    {
      expression: normalizedEquation.expression,
      settings: request.settings,
      variables
    },
    runtime
  );

  if (!prepared.evaluate) {
    return fail(runtime.backend, startedAt, prepared.issues);
  }

  try {
    const solved = solveRoot({
      method: request.method,
      runtime,
      tolerance: request.settings.numeric.solverTolerance,
      maxIterations: request.settings.numeric.maxIterations,
      ...(request.initialGuess !== undefined ? { initialGuess: request.initialGuess } : {}),
      ...(request.bracket !== undefined ? { bracket: request.bracket } : {}),
      evaluate(value) {
        variables.x = String(value);
        return prepared.evaluate!();
      }
    });

    const issues = solved.converged ? [] : [buildNonConvergentIssue(solved.terminationReason)];

    return {
      ok: true,
      value: {
        method: request.method,
        canonicalExpression: prepared.canonicalExpression,
        root: runtime.toNumber(solved.root),
        formattedRoot: runtime.toDisplayString(
          solved.root,
          request.settings.numeric.displayMode,
          request.settings.numeric.displayPrecision
        ),
        residual: runtime.toNumber(solved.residual),
        formattedResidual: runtime.toScientificString(
          solved.residual,
          request.settings.numeric.displayPrecision
        ),
        iterations: solved.iterations,
        converged: solved.converged,
        tolerance: solved.tolerance,
        maxIterations: solved.maxIterations,
        terminationReason: solved.terminationReason,
        history: solved.history
      },
      issues,
      metadata: {
        backend: runtime.backend,
        elapsedMs: now() - startedAt
      }
    };
  } catch (error) {
    if (error instanceof SolverComputationError) {
      const issue: ComputationIssue = {
        code: error.code,
        message: error.message,
        severity: "error"
      };
      if (error.field !== undefined) {
        issue.field = error.field;
      }

      return fail(runtime.backend, startedAt, [
        issue
      ]);
    }

    return fail(runtime.backend, startedAt, [toComputationIssue(error)]);
  }
}

function normalizeEquationExpression(
  expression: string
): { ok: true; expression: string } | { ok: false; issue: ComputationIssue } {
  const trimmed = expression.trim();
  if (!trimmed) {
    return {
      ok: false,
      issue: {
        code: "solver_expression_required",
        message: "Enter an expression or equation in x before solving.",
        severity: "error",
        field: "expression"
      }
    };
  }

  const parts = trimmed.split("=");
  if (parts.length === 1) {
    return {
      ok: true,
      expression: trimmed
    };
  }

  if (parts.length !== 2 || parts.some((part) => part.trim().length === 0)) {
    return {
      ok: false,
      issue: {
        code: "solver_invalid_equation",
        message: "Use a single equation in the form left = right or an expression equal to zero.",
        severity: "error",
        field: "expression"
      }
    };
  }

  return {
    ok: true,
    expression: `(${parts[0]!.trim()}) - (${parts[1]!.trim()})`
  };
}

function buildNonConvergentIssue(reason: SolverResult["terminationReason"]): ComputationIssue {
  switch (reason) {
    case "zero_derivative":
      return {
        code: "solver_non_convergent",
        message: "Newton-Raphson stalled because the derivative became too small near the current estimate.",
        severity: "warning",
        field: "initialGuess"
      };
    case "max_iterations":
      return {
        code: "solver_non_convergent",
        message: "The solver reached the iteration limit before meeting the configured tolerance.",
        severity: "warning",
        field: "method"
      };
    case "interval_tolerance":
    case "residual_tolerance":
    case "exact_endpoint":
      return {
        code: "solver_non_convergent",
        message: "The solver stopped without reporting convergence.",
        severity: "warning"
      };
  }
}

function fail(
  backend: SolverRequest["settings"]["numeric"]["backend"],
  startedAt: number,
  issues: ComputationIssue[]
): ResultEnvelope<SolverResult> {
  return {
    ok: false,
    issues,
    metadata: {
      backend,
      elapsedMs: now() - startedAt
    }
  };
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}
