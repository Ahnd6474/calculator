import type {
  CalculationService,
  ExpressionRequest,
  ExpressionResult,
  ResultEnvelope
} from "@core/contracts";
import { prepareExpression } from "@core/expression";
import {
  createDecimalRuntime,
  createFloat64Runtime,
  normalizeNumericSettings,
  type NumericRuntime
} from "@core/precision";
import { toComputationIssue } from "@core/expression/compiler";

export function createCalculationService(): CalculationService {
  return {
    calculate(request) {
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
  request: ExpressionRequest,
  runtime: NumericRuntime<TValue>,
  startedAt: number
): ResultEnvelope<ExpressionResult> {
  const prepared = prepareExpression(request, runtime);

  if (!prepared.evaluate) {
    return {
      ok: false,
      issues: prepared.issues,
      metadata: {
        backend: runtime.backend,
        elapsedMs: now() - startedAt
      }
    };
  }

  try {
    const value = prepared.evaluate();

    if (!runtime.isFinite(value)) {
      return {
        ok: false,
        issues: [
          {
            code: "math.non_finite",
            message: "The expression evaluated to a non-finite number.",
            severity: "error",
            field: "expression"
          }
        ],
        metadata: {
          backend: runtime.backend,
          elapsedMs: now() - startedAt
        }
      };
    }

    return {
      ok: true,
      value: {
        canonicalExpression: prepared.canonicalExpression,
        formattedValue: runtime.toDisplayString(
          value,
          request.settings.numeric.displayMode,
          request.settings.numeric.displayPrecision
        ),
        approximateValue: runtime.toNumber(value)
      },
      issues: [],
      metadata: {
        backend: runtime.backend,
        elapsedMs: now() - startedAt
      }
    };
  } catch (error) {
    return {
      ok: false,
      issues: [toComputationIssue(error)],
      metadata: {
        backend: runtime.backend,
        elapsedMs: now() - startedAt
      }
    };
  }
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}
