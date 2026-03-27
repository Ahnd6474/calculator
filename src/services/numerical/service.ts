import type {
  NumericalRequest,
  NumericalResult,
  NumericalToolsService,
  ResultEnvelope
} from "@core/contracts";
import { runNumericalAnalysis } from "@core/numerical";
import {
  createDecimalRuntime,
  createFloat64Runtime,
  normalizeNumericSettings,
  type NumericRuntime
} from "@core/precision";

export function createNumericalToolsService(): NumericalToolsService {
  return {
    run(request) {
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
  request: NumericalRequest,
  runtime: NumericRuntime<TValue>,
  startedAt: number
): ResultEnvelope<NumericalResult> {
  const outcome = runNumericalAnalysis(request, runtime);

  if (!outcome.ok) {
    return {
      ok: false,
      issues: outcome.issues,
      metadata: {
        backend: runtime.backend,
        elapsedMs: now() - startedAt
      }
    };
  }

  return {
    ok: true,
    value: {
      tool: outcome.value.tool,
      method: outcome.value.method,
      canonicalExpression: outcome.value.canonicalExpression,
      formattedValue: runtime.toDisplayString(
        outcome.value.value,
        request.settings.numeric.displayMode,
        request.settings.numeric.displayPrecision
      ),
      approximateValue: outcome.value.approximateValue,
      sampleCount: outcome.value.sampleCount,
      ...(outcome.value.errorEstimate !== undefined ? { errorEstimate: outcome.value.errorEstimate } : {}),
      ...(outcome.value.stepSize !== undefined ? { stepSize: outcome.value.stepSize } : {})
    },
    issues: outcome.issues,
    metadata: {
      backend: runtime.backend,
      elapsedMs: now() - startedAt
    }
  };
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}
