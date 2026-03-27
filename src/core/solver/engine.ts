import type {
  SolverIteration,
  SolverMethod,
  SolverTerminationReason
} from "@core/contracts";
import type { NumericRuntime } from "@core/precision";

const DEFAULT_TOLERANCE = 1e-10;
const MIN_DERIVATIVE = 1e-14;

export class SolverComputationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly field?: string
  ) {
    super(message);
  }
}

export interface SolverEngineRequest<TValue> {
  method: SolverMethod;
  runtime: NumericRuntime<TValue>;
  evaluate(value: TValue): TValue;
  tolerance: number;
  maxIterations: number;
  initialGuess?: number;
  bracket?: [number, number];
}

export interface RootSolveResult<TValue> {
  root: TValue;
  residual: TValue;
  iterations: number;
  converged: boolean;
  tolerance: number;
  maxIterations: number;
  terminationReason: SolverTerminationReason;
  history: SolverIteration[];
}

export function solveRoot<TValue>(request: SolverEngineRequest<TValue>): RootSolveResult<TValue> {
  const normalized = {
    ...request,
    tolerance: normalizeTolerance(request.tolerance),
    maxIterations: normalizeMaxIterations(request.maxIterations)
  };

  switch (normalized.method) {
    case "newton":
      return solveWithNewton(normalized);
    case "bisection":
      return solveWithBisection(normalized);
  }
}

function solveWithNewton<TValue>(request: SolverEngineRequest<TValue>): RootSolveResult<TValue> {
  const { runtime } = request;
  const history: SolverIteration[] = [];
  const initialGuess = request.initialGuess;

  if (typeof initialGuess !== "number" || !Number.isFinite(initialGuess)) {
    throw new SolverComputationError(
      "solver_initial_guess_required",
      "Newton-Raphson requires a finite initial guess.",
      "initialGuess"
    );
  }

  let current = runtime.fromNumber(initialGuess);

  for (let iteration = 0; iteration < request.maxIterations; iteration += 1) {
    const value = evaluateFinite(request, current);
    const residual = runtime.abs(value);
    const residualNumber = toMagnitude(runtime, residual);

    if (residualNumber <= request.tolerance) {
      history.push({
        iteration,
        estimate: runtime.toNumber(current),
        residual: residualNumber,
        step: 0
      });

      return {
        root: current,
        residual,
        iterations: iteration,
        converged: true,
        tolerance: request.tolerance,
        maxIterations: request.maxIterations,
        terminationReason: "residual_tolerance",
        history
      };
    }

    const stepSize = estimateDerivativeStep(runtime.toNumber(current), request.tolerance);
    const step = runtime.fromNumber(stepSize);
    const forward = evaluateFinite(request, runtime.add(current, step));
    const backward = evaluateFinite(request, runtime.subtract(current, step));
    const derivative = runtime.divide(
      runtime.subtract(forward, backward),
      runtime.multiply(runtime.fromNumber(2), step)
    );
    const derivativeNumber = runtime.toNumber(derivative);

    history.push({
      iteration,
      estimate: runtime.toNumber(current),
      residual: residualNumber,
      derivative: derivativeNumber
    });

    if (!Number.isFinite(derivativeNumber) || Math.abs(derivativeNumber) <= Math.max(request.tolerance, MIN_DERIVATIVE)) {
      return {
        root: current,
        residual,
        iterations: iteration,
        converged: false,
        tolerance: request.tolerance,
        maxIterations: request.maxIterations,
        terminationReason: "zero_derivative",
        history
      };
    }

    const next = runtime.subtract(current, runtime.divide(value, derivative));
    if (!runtime.isFinite(next)) {
      throw new SolverComputationError(
        "solver_non_finite",
        "The solver produced a non-finite estimate.",
        "expression"
      );
    }

    const stepMagnitude = toMagnitude(runtime, runtime.subtract(next, current));
    history[history.length - 1]!.step = stepMagnitude;
    current = next;
  }

  const residual = runtime.abs(evaluateFinite(request, current));
  history.push({
    iteration: request.maxIterations,
    estimate: runtime.toNumber(current),
    residual: toMagnitude(runtime, residual),
    step: 0
  });

  return {
    root: current,
    residual,
    iterations: request.maxIterations,
    converged: false,
    tolerance: request.tolerance,
    maxIterations: request.maxIterations,
    terminationReason: "max_iterations",
    history
  };
}

function solveWithBisection<TValue>(request: SolverEngineRequest<TValue>): RootSolveResult<TValue> {
  const { runtime } = request;
  const history: SolverIteration[] = [];
  const bracket = request.bracket;

  if (!bracket) {
    throw new SolverComputationError(
      "solver_bracket_required",
      "Bisection requires lower and upper interval bounds.",
      "bracket"
    );
  }

  let [lowerNumber, upperNumber] = bracket;
  if (!Number.isFinite(lowerNumber) || !Number.isFinite(upperNumber)) {
    throw new SolverComputationError(
      "solver_invalid_bracket",
      "Bisection interval bounds must be finite numbers.",
      "bracket"
    );
  }

  if (lowerNumber >= upperNumber) {
    throw new SolverComputationError(
      "solver_invalid_bracket",
      "Bisection requires the lower bound to stay below the upper bound.",
      "bracket"
    );
  }

  let lower = runtime.fromNumber(lowerNumber);
  let upper = runtime.fromNumber(upperNumber);
  let lowerValue = evaluateFinite(request, lower);
  let upperValue = evaluateFinite(request, upper);
  const lowerResidual = toMagnitude(runtime, runtime.abs(lowerValue));
  const upperResidual = toMagnitude(runtime, runtime.abs(upperValue));

  if (lowerResidual <= request.tolerance) {
    return {
      root: lower,
      residual: runtime.abs(lowerValue),
      iterations: 0,
      converged: true,
      tolerance: request.tolerance,
      maxIterations: request.maxIterations,
      terminationReason: "exact_endpoint",
      history: [
        {
          iteration: 0,
          estimate: lowerNumber,
          residual: lowerResidual,
          lowerBound: lowerNumber,
          upperBound: upperNumber
        }
      ]
    };
  }

  if (upperResidual <= request.tolerance) {
    return {
      root: upper,
      residual: runtime.abs(upperValue),
      iterations: 0,
      converged: true,
      tolerance: request.tolerance,
      maxIterations: request.maxIterations,
      terminationReason: "exact_endpoint",
      history: [
        {
          iteration: 0,
          estimate: upperNumber,
          residual: upperResidual,
          lowerBound: lowerNumber,
          upperBound: upperNumber
        }
      ]
    };
  }

  if (sameSign(runtime.toNumber(lowerValue), runtime.toNumber(upperValue))) {
    throw new SolverComputationError(
      "solver_invalid_bracket",
      "Bisection requires the interval bounds to bracket a sign change.",
      "bracket"
    );
  }

  let midpoint = lower;
  let midpointValue = lowerValue;

  for (let iteration = 1; iteration <= request.maxIterations; iteration += 1) {
    midpoint = runtime.divide(runtime.add(lower, upper), runtime.fromNumber(2));
    midpointValue = evaluateFinite(request, midpoint);

    const midpointNumber = runtime.toNumber(midpoint);
    const residualNumber = toMagnitude(runtime, runtime.abs(midpointValue));
    lowerNumber = runtime.toNumber(lower);
    upperNumber = runtime.toNumber(upper);

    history.push({
      iteration,
      estimate: midpointNumber,
      residual: residualNumber,
      lowerBound: lowerNumber,
      upperBound: upperNumber,
      step: Math.abs(upperNumber - lowerNumber) / 2
    });

    if (residualNumber <= request.tolerance) {
      return {
        root: midpoint,
        residual: runtime.abs(midpointValue),
        iterations: iteration,
        converged: true,
        tolerance: request.tolerance,
        maxIterations: request.maxIterations,
        terminationReason: "residual_tolerance",
        history
      };
    }

    if (Math.abs(upperNumber - lowerNumber) / 2 <= request.tolerance) {
      return {
        root: midpoint,
        residual: runtime.abs(midpointValue),
        iterations: iteration,
        converged: true,
        tolerance: request.tolerance,
        maxIterations: request.maxIterations,
        terminationReason: "interval_tolerance",
        history
      };
    }

    if (sameSign(runtime.toNumber(lowerValue), runtime.toNumber(midpointValue))) {
      lower = midpoint;
      lowerValue = midpointValue;
    } else {
      upper = midpoint;
      upperValue = midpointValue;
    }
  }

  return {
    root: midpoint,
    residual: runtime.abs(midpointValue),
    iterations: request.maxIterations,
    converged: false,
    tolerance: request.tolerance,
    maxIterations: request.maxIterations,
    terminationReason: "max_iterations",
    history
  };
}

function normalizeTolerance(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TOLERANCE;
}

function normalizeMaxIterations(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    return 100;
  }

  return Math.max(1, Math.trunc(value));
}

function estimateDerivativeStep(estimate: number, tolerance: number): number {
  return Math.max(Math.sqrt(tolerance), 1e-7) * Math.max(1, Math.abs(estimate));
}

function evaluateFinite<TValue>(request: SolverEngineRequest<TValue>, input: TValue): TValue {
  const value = request.evaluate(input);
  if (!request.runtime.isFinite(value)) {
    throw new SolverComputationError(
      "solver_non_finite",
      "The solver evaluated a non-finite function value.",
      "expression"
    );
  }

  return value;
}

function toMagnitude<TValue>(runtime: NumericRuntime<TValue>, value: TValue): number {
  return Math.abs(runtime.toNumber(value));
}

function sameSign(left: number, right: number): boolean {
  return Math.sign(left) === Math.sign(right);
}
