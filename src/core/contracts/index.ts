/**
 * Shared computation contracts for the calculator. All feature UIs talk only to typed service interfaces defined here. Expression, matrix, solver, and numerical-analysis engines must remain pure modules with no React, persistence, or Tauri imports. Persisted settings and workspace state flow only through versioned schemas. New feature code may depend on settings, numeric backend, and result envelopes, but must not reach into sibling engine internals.
 */

export type MaybePromise<T> = T | Promise<T>;

export type NumericBackend = "float64" | "decimal";
export type AngleMode = "degree" | "radian";
export type DisplayMode = "normal" | "scientific" | "engineering";
export type WorkspaceToolId = "calculate" | "matrix" | "solver" | "numerical";

export interface NumericSettings {
  backend: NumericBackend;
  displayPrecision: number;
  internalPrecision: number;
  solverTolerance: number;
  maxIterations: number;
  angleMode: AngleMode;
  displayMode: DisplayMode;
}

export interface CalculatorSettings {
  numeric: NumericSettings;
  locale: string;
}

export interface ComputationIssue {
  code: string;
  message: string;
  severity: "warning" | "error";
  field?: string;
}

export interface ResultMetadata {
  backend: NumericBackend;
  elapsedMs?: number;
}

export interface SuccessfulResult<T> {
  ok: true;
  value: T;
  issues: ComputationIssue[];
  metadata: ResultMetadata;
}

export interface FailedResult {
  ok: false;
  issues: ComputationIssue[];
  metadata: ResultMetadata;
}

export type ResultEnvelope<T> = SuccessfulResult<T> | FailedResult;

export interface ExpressionRequest {
  expression: string;
  settings: CalculatorSettings;
  variables?: Record<string, number | string>;
}

export interface ExpressionResult {
  canonicalExpression: string;
  formattedValue: string;
  approximateValue: number | null;
}

export interface MatrixData {
  rows: number;
  columns: number;
  values: number[][];
}

export type MatrixOperation =
  | "add"
  | "subtract"
  | "multiply"
  | "transpose"
  | "determinant"
  | "inverse";

export interface MatrixOperationRequest {
  operation: MatrixOperation;
  left: MatrixData;
  right?: MatrixData;
  settings: CalculatorSettings;
}

export interface ConditionDiagnostics {
  pivotStrategy: "none" | "partial";
  conditionEstimate?: number;
  singular: boolean;
}

export interface MatrixOperationResult {
  operation: MatrixOperation;
  matrix?: MatrixData;
  scalar?: string;
  diagnostics?: ConditionDiagnostics;
}

export interface LinearSystemRequest {
  matrix: MatrixData;
  rightHandSide: number[];
  settings: CalculatorSettings;
}

export interface LinearSystemResult {
  solution: number[];
  residualNorm?: number;
  diagnostics?: ConditionDiagnostics;
}

export type SolverMethod = "newton" | "bisection";
export type DifferentiationMethod = "central" | "five-point";
export type IntegrationMethod = "trapezoidal" | "simpson";

export interface SolverRequest {
  method: SolverMethod;
  expression: string;
  settings: CalculatorSettings;
  initialGuess?: number;
  bracket?: [number, number];
}

export interface SolverIteration {
  iteration: number;
  estimate: number;
  residual: number;
  step?: number;
  derivative?: number;
  lowerBound?: number;
  upperBound?: number;
}

export type SolverTerminationReason =
  | "residual_tolerance"
  | "interval_tolerance"
  | "exact_endpoint"
  | "zero_derivative"
  | "max_iterations";

export interface SolverResult {
  method: SolverMethod;
  canonicalExpression: string;
  root: number;
  formattedRoot: string;
  residual: number;
  formattedResidual: string;
  iterations: number;
  converged: boolean;
  tolerance: number;
  maxIterations: number;
  terminationReason: SolverTerminationReason;
  history: SolverIteration[];
}

export type NumericalTool = "differentiate" | "integrate" | "sample";

export interface NumericalRequest {
  tool: NumericalTool;
  expression: string;
  settings: CalculatorSettings;
  point?: number;
  interval?: [number, number];
  differentiationMethod?: DifferentiationMethod;
  integrationMethod?: IntegrationMethod;
  sampleCount?: number;
}

export interface NumericalResult {
  tool: NumericalTool;
  method: DifferentiationMethod | IntegrationMethod;
  canonicalExpression: string;
  formattedValue: string;
  approximateValue?: number;
  samples?: Array<[number, number]>;
  errorEstimate?: number;
  sampleCount?: number;
  stepSize?: number;
}

export interface MatrixDraft {
  left: MatrixData;
  right?: MatrixData;
}

export interface SolverDraft {
  expression: string;
  method: SolverMethod;
  initialGuess: string;
  bracketLower: string;
  bracketUpper: string;
}

export interface NumericalDraft {
  expression: string;
  tool: NumericalTool;
  differentiationMethod: DifferentiationMethod;
  integrationMethod: IntegrationMethod;
  point: string;
  intervalStart: string;
  intervalEnd: string;
}

export interface WorkspaceState {
  activeTool: WorkspaceToolId;
  expressionInput: string;
  matrix: MatrixDraft;
  solver: SolverDraft;
  numerical: NumericalDraft;
}

export interface CalculationService {
  calculate(request: ExpressionRequest): MaybePromise<ResultEnvelope<ExpressionResult>>;
}

export interface MatrixService {
  evaluate(request: MatrixOperationRequest): MaybePromise<ResultEnvelope<MatrixOperationResult>>;
  solveLinearSystem(request: LinearSystemRequest): MaybePromise<ResultEnvelope<LinearSystemResult>>;
}

export interface SolverService {
  solve(request: SolverRequest): MaybePromise<ResultEnvelope<SolverResult>>;
}

export interface NumericalToolsService {
  run(request: NumericalRequest): MaybePromise<ResultEnvelope<NumericalResult>>;
}

export interface CalculatorServices {
  calculate: CalculationService;
  matrix: MatrixService;
  solver: SolverService;
  numerical: NumericalToolsService;
}
