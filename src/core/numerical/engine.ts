import type {
  ComputationIssue,
  DifferentiationMethod,
  IntegrationMethod,
  NumericalRequest
} from "@core/contracts";
import type { NumericRuntime } from "@core/precision";
import { prepareExpression } from "@core/expression";
import { toComputationIssue } from "@core/expression/compiler";

const SUPPORTED_NUMERICAL_TOOLS = new Set(["differentiate", "integrate"]);

export interface NumericalEngineResult<TValue> {
  tool: "differentiate" | "integrate";
  method: DifferentiationMethod | IntegrationMethod;
  canonicalExpression: string;
  value: TValue;
  approximateValue: number;
  errorEstimate?: number;
  sampleCount: number;
  stepSize?: number;
}

export type NumericalEngineOutcome<TValue> =
  | {
      ok: true;
      value: NumericalEngineResult<TValue>;
      issues: ComputationIssue[];
    }
  | {
      ok: false;
      issues: ComputationIssue[];
    };

class NumericalComputationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly field = "expression"
  ) {
    super(message);
  }
}

interface CompiledFunction<TValue> {
  canonicalExpression: string;
  evaluateAt(point: number): TValue;
}

export function runNumericalAnalysis<TValue>(
  request: NumericalRequest,
  runtime: NumericRuntime<TValue>
): NumericalEngineOutcome<TValue> {
  if (!SUPPORTED_NUMERICAL_TOOLS.has(request.tool)) {
    return {
      ok: false,
      issues: [
        {
          code: "numerical.unsupported_tool",
          message: `Unsupported numerical tool '${request.tool}'.`,
          severity: "error",
          field: "tool"
        }
      ]
    };
  }

  const compiled = compileNumericalExpression(request, runtime);
  if (!compiled.ok) {
    return compiled;
  }

  try {
    return request.tool === "differentiate"
      ? differentiate(request, compiled.value, runtime)
      : integrate(request, compiled.value, runtime);
  } catch (error) {
    return {
      ok: false,
      issues: [toNumericalIssue(error)]
    };
  }
}

function compileNumericalExpression<TValue>(
  request: NumericalRequest,
  runtime: NumericRuntime<TValue>
): { ok: true; value: CompiledFunction<TValue> } | { ok: false; issues: ComputationIssue[] } {
  const variables: Record<string, number> = {
    x: request.point ?? request.interval?.[0] ?? 0
  };
  const prepared = prepareExpression(
    {
      expression: request.expression,
      settings: request.settings,
      variables
    },
    runtime
  );

  if (!prepared.evaluate) {
    return {
      ok: false,
      issues: prepared.issues
    };
  }
  const evaluate = prepared.evaluate;

  return {
    ok: true,
    value: {
      canonicalExpression: prepared.canonicalExpression,
      evaluateAt(point) {
        variables.x = point;
        const value = evaluate();
        if (!runtime.isFinite(value)) {
          throw new NumericalComputationError(
            "numerical.non_finite_evaluation",
            `Function evaluation became non-finite near x = ${formatNumber(point)}.`
          );
        }
        return value;
      }
    }
  };
}

function differentiate<TValue>(
  request: NumericalRequest,
  compiled: CompiledFunction<TValue>,
  runtime: NumericRuntime<TValue>
): NumericalEngineOutcome<TValue> {
  const point = requirePoint(request.point);
  const method = request.differentiationMethod ?? "central";
  const tolerance = normalizeTolerance(request.settings.numeric.solverTolerance);
  const maxRefinements = Math.max(2, Math.min(request.settings.numeric.maxIterations, 16));
  let step = initialDerivativeStep(point, tolerance, runtime, method);
  let previousApproximation: number | undefined;
  let best:
    | {
        value: TValue;
        approximateValue: number;
        errorEstimate?: number;
        stepSize: number;
      }
    | undefined;
  let samples = 0;

  for (let refinement = 0; refinement < maxRefinements; refinement += 1) {
    const estimate =
      method === "five-point"
        ? fivePointDerivative(compiled, point, step, runtime)
        : centralDerivative(compiled, point, step, runtime);
    const approximateValue = runtime.toNumber(estimate.value);
    const errorEstimate =
      previousApproximation === undefined
        ? undefined
        : Math.abs(approximateValue - previousApproximation) / (method === "five-point" ? 15 : 3);

    samples += estimate.sampleCount;
    best = {
      value: estimate.value,
      approximateValue,
      stepSize: step
    };
    if (errorEstimate !== undefined) {
      best.errorEstimate = errorEstimate;
    }

    if (errorEstimate !== undefined && errorEstimate <= scaledTolerance(tolerance, approximateValue)) {
      break;
    }

    previousApproximation = approximateValue;
    step /= 2;
  }

  if (!best) {
    throw new NumericalComputationError(
      "numerical.derivative_failed",
      "Derivative estimate could not be computed."
    );
  }

  const issues = buildDerivativeWarnings(compiled, point, best, tolerance, runtime);

  return {
    ok: true,
    value: {
      tool: "differentiate",
      method,
      canonicalExpression: compiled.canonicalExpression,
      value: best.value,
      approximateValue: best.approximateValue,
      sampleCount: samples,
      stepSize: best.stepSize,
      ...(best.errorEstimate !== undefined ? { errorEstimate: best.errorEstimate } : {})
    },
    issues
  };
}

function integrate<TValue>(
  request: NumericalRequest,
  compiled: CompiledFunction<TValue>,
  runtime: NumericRuntime<TValue>
): NumericalEngineOutcome<TValue> {
  const [start, end] = requireInterval(request.interval);
  const method = request.integrationMethod ?? "simpson";
  const tolerance = normalizeTolerance(request.settings.numeric.solverTolerance);

  if (start === end) {
    return {
      ok: true,
      value: {
        tool: "integrate",
        method,
        canonicalExpression: compiled.canonicalExpression,
        value: runtime.zero,
        approximateValue: 0,
        errorEstimate: 0,
        sampleCount: 2,
        stepSize: 0
      },
      issues: []
    };
  }

  const initialPanels = method === "simpson" ? 4 : 2;
  const maxPanels = normalizeMaximumPanels(method, request.settings.numeric.maxIterations);
  let panels = initialPanels;
  let previousApproximation: number | undefined;
  let best:
    | {
        value: TValue;
        approximateValue: number;
        errorEstimate?: number;
        panels: number;
      }
    | undefined;

  while (panels <= maxPanels) {
    const value =
      method === "simpson"
        ? compositeSimpson(compiled, start, end, panels, runtime)
        : compositeTrapezoid(compiled, start, end, panels, runtime);
    const approximateValue = runtime.toNumber(value);
    const errorEstimate =
      previousApproximation === undefined
        ? undefined
        : Math.abs(approximateValue - previousApproximation) / (method === "simpson" ? 15 : 3);

    best = {
      value,
      approximateValue,
      panels
    };
    if (errorEstimate !== undefined) {
      best.errorEstimate = errorEstimate;
    }

    if (errorEstimate !== undefined && errorEstimate <= scaledTolerance(tolerance, approximateValue)) {
      break;
    }

    previousApproximation = approximateValue;
    panels *= 2;
  }

  if (!best) {
    throw new NumericalComputationError(
      "numerical.integration_failed",
      "Integral estimate could not be computed."
    );
  }

  const issues = buildIntegrationWarnings(best, tolerance, maxPanels);

  return {
    ok: true,
    value: {
      tool: "integrate",
      method,
      canonicalExpression: compiled.canonicalExpression,
      value: best.value,
      approximateValue: best.approximateValue,
      sampleCount: best.panels + 1,
      stepSize: Math.abs(end - start) / best.panels,
      ...(best.errorEstimate !== undefined ? { errorEstimate: best.errorEstimate } : {})
    },
    issues
  };
}

function centralDerivative<TValue>(
  compiled: CompiledFunction<TValue>,
  point: number,
  step: number,
  runtime: NumericRuntime<TValue>
): { value: TValue; sampleCount: number } {
  const plus = compiled.evaluateAt(point + step);
  const minus = compiled.evaluateAt(point - step);
  return {
    value: runtime.divide(runtime.subtract(plus, minus), runtime.fromNumber(2 * step)),
    sampleCount: 2
  };
}

function fivePointDerivative<TValue>(
  compiled: CompiledFunction<TValue>,
  point: number,
  step: number,
  runtime: NumericRuntime<TValue>
): { value: TValue; sampleCount: number } {
  const plusTwo = compiled.evaluateAt(point + 2 * step);
  const plusOne = compiled.evaluateAt(point + step);
  const minusOne = compiled.evaluateAt(point - step);
  const minusTwo = compiled.evaluateAt(point - 2 * step);
  const numerator = runtime.add(
    runtime.subtract(runtime.multiply(runtime.fromNumber(8), plusOne), runtime.multiply(runtime.fromNumber(8), minusOne)),
    runtime.subtract(minusTwo, plusTwo)
  );

  return {
    value: runtime.divide(numerator, runtime.fromNumber(12 * step)),
    sampleCount: 4
  };
}

function compositeTrapezoid<TValue>(
  compiled: CompiledFunction<TValue>,
  start: number,
  end: number,
  panels: number,
  runtime: NumericRuntime<TValue>
): TValue {
  const step = (end - start) / panels;
  let total = runtime.add(compiled.evaluateAt(start), compiled.evaluateAt(end));

  for (let index = 1; index < panels; index += 1) {
    total = runtime.add(total, runtime.multiply(runtime.fromNumber(2), compiled.evaluateAt(start + index * step)));
  }

  return runtime.multiply(runtime.divide(runtime.fromNumber(step), runtime.fromNumber(2)), total);
}

function compositeSimpson<TValue>(
  compiled: CompiledFunction<TValue>,
  start: number,
  end: number,
  panels: number,
  runtime: NumericRuntime<TValue>
): TValue {
  const step = (end - start) / panels;
  let total = runtime.add(compiled.evaluateAt(start), compiled.evaluateAt(end));

  for (let index = 1; index < panels; index += 1) {
    const weight = index % 2 === 0 ? 2 : 4;
    total = runtime.add(total, runtime.multiply(runtime.fromNumber(weight), compiled.evaluateAt(start + index * step)));
  }

  return runtime.multiply(runtime.divide(runtime.fromNumber(step), runtime.fromNumber(3)), total);
}

function buildDerivativeWarnings<TValue>(
  compiled: CompiledFunction<TValue>,
  point: number,
  best: {
    approximateValue: number;
    errorEstimate?: number;
    stepSize: number;
  },
  tolerance: number,
  runtime: NumericRuntime<TValue>
): ComputationIssue[] {
  const issues: ComputationIssue[] = [];
  const center = compiled.evaluateAt(point);
  const forward = runtime.toNumber(
    runtime.divide(runtime.subtract(compiled.evaluateAt(point + best.stepSize), center), runtime.fromNumber(best.stepSize))
  );
  const backward = runtime.toNumber(
    runtime.divide(runtime.subtract(center, compiled.evaluateAt(point - best.stepSize)), runtime.fromNumber(best.stepSize))
  );
  const asymmetry = Math.abs(forward - backward);
  const smoothnessThreshold = Math.max(
    10 * (best.errorEstimate ?? 0),
    5 * scaledTolerance(tolerance, best.approximateValue)
  );

  if (asymmetry > smoothnessThreshold) {
    issues.push({
      code: "numerical.point_nonsmooth",
      message: "One-sided derivative estimates disagree strongly near the evaluation point.",
      severity: "warning",
      field: "point"
    });
  }

  if (
    best.errorEstimate === undefined ||
    best.errorEstimate > scaledTolerance(tolerance, best.approximateValue)
  ) {
    issues.push({
      code: "numerical.derivative_unreliable",
      message: "Derivative estimate did not stabilize within the requested tolerance budget.",
      severity: "warning",
      field: "point"
    });
  }

  return issues;
}

function buildIntegrationWarnings(
  best: {
    approximateValue: number;
    errorEstimate?: number;
    panels: number;
  },
  tolerance: number,
  maxPanels: number
): ComputationIssue[] {
  if (
    best.errorEstimate !== undefined &&
    best.errorEstimate <= scaledTolerance(tolerance, best.approximateValue)
  ) {
    return [];
  }

  return [
    {
      code: best.panels >= maxPanels ? "numerical.integration_not_converged" : "numerical.integration_unreliable",
      message:
        best.panels >= maxPanels
          ? "Integral estimate hit the panel budget before meeting the requested tolerance."
          : "Integral estimate remains sensitive to panel refinement.",
      severity: "warning",
      field: "interval"
    }
  ];
}

function requirePoint(point: number | undefined): number {
  if (point === undefined || !Number.isFinite(point)) {
    throw new NumericalComputationError(
      "numerical.point_required",
      "A finite evaluation point is required for differentiation.",
      "point"
    );
  }

  return point;
}

function requireInterval(interval: [number, number] | undefined): [number, number] {
  if (!interval || interval.length !== 2 || !interval.every((value) => Number.isFinite(value))) {
    throw new NumericalComputationError(
      "numerical.interval_required",
      "A finite interval is required for integration.",
      "interval"
    );
  }

  return interval;
}

function initialDerivativeStep<TValue>(
  point: number,
  tolerance: number,
  runtime: NumericRuntime<TValue>,
  method: DifferentiationMethod
): number {
  const scale = Math.max(1, Math.abs(point));
  const orderExponent = method === "five-point" ? 1 / 5 : 1 / 3;
  const toleranceStep = Math.pow(tolerance, orderExponent) * scale;
  const precisionDigits = runtime.backend === "decimal" ? Math.min(runtime.internalPrecision, 48) : 15;
  const precisionFloor = Math.pow(10, -Math.max(3, Math.floor(precisionDigits / 2))) * scale;

  return Math.max(toleranceStep, precisionFloor, 1e-6 * scale);
}

function normalizeMaximumPanels(method: IntegrationMethod, maxIterations: number): number {
  const minimumPanels = method === "simpson" ? 4 : 2;
  const capped = Math.max(minimumPanels, Math.min(Math.trunc(maxIterations), 4096));
  let panels = minimumPanels;

  while (panels * 2 <= capped) {
    panels *= 2;
  }

  return panels;
}

function normalizeTolerance(tolerance: number): number {
  return Number.isFinite(tolerance) && tolerance > 0 ? tolerance : 1e-10;
}

function scaledTolerance(tolerance: number, magnitude: number): number {
  return tolerance * Math.max(1, Math.abs(magnitude));
}

function toNumericalIssue(error: unknown): ComputationIssue {
  if (error instanceof NumericalComputationError) {
    return {
      code: error.code,
      message: error.message,
      severity: "error",
      field: error.field
    };
  }

  return toComputationIssue(error);
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? Number.parseFloat(value.toPrecision(10)).toString() : String(value);
}
