import type { CalculatorSettings, MatrixData, WorkspaceState } from "@core/contracts";

export const SETTINGS_SCHEMA_VERSION = 1 as const;
export const WORKSPACE_SCHEMA_VERSION = 1 as const;

export interface VersionedDocument<TVersion extends number, TPayload> {
  version: TVersion;
  payload: TPayload;
  updatedAt: string;
}

export type PersistedSettingsDocument = VersionedDocument<typeof SETTINGS_SCHEMA_VERSION, CalculatorSettings>;
export type PersistedWorkspaceDocument = VersionedDocument<typeof WORKSPACE_SCHEMA_VERSION, WorkspaceState>;

const defaultMatrix = (): MatrixData => ({
  rows: 2,
  columns: 2,
  values: [
    [1, 0],
    [0, 1]
  ]
});

export function createDefaultSettingsDocument(): PersistedSettingsDocument {
  return {
    version: SETTINGS_SCHEMA_VERSION,
    updatedAt: new Date(0).toISOString(),
    payload: {
      numeric: {
        backend: "float64",
        displayPrecision: 12,
        internalPrecision: 28,
        solverTolerance: 1e-10,
        maxIterations: 100,
        angleMode: "radian",
        displayMode: "normal"
      },
      locale: "en-US"
    }
  };
}

export function createDefaultWorkspaceDocument(): PersistedWorkspaceDocument {
  return {
    version: WORKSPACE_SCHEMA_VERSION,
    updatedAt: new Date(0).toISOString(),
    payload: {
      activeTool: "calculate",
      expressionInput: "",
      matrix: {
        left: defaultMatrix(),
        right: defaultMatrix()
      },
      solver: {
        expression: "",
        method: "newton",
        initialGuess: "0",
        bracketLower: "-1",
        bracketUpper: "1"
      },
      numerical: {
        expression: "",
        tool: "differentiate",
        point: "0",
        intervalStart: "0",
        intervalEnd: "1"
      }
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMatrixData(value: unknown): value is MatrixData {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.rows === "number" &&
    typeof value.columns === "number" &&
    Array.isArray(value.values) &&
    value.values.every(
      (row) => Array.isArray(row) && row.every((entry) => typeof entry === "number")
    )
  );
}

function isCalculatorSettings(value: unknown): value is CalculatorSettings {
  if (!isRecord(value) || !isRecord(value.numeric)) {
    return false;
  }

  const numeric = value.numeric;

  return (
    (numeric.backend === "float64" || numeric.backend === "decimal") &&
    typeof numeric.displayPrecision === "number" &&
    typeof numeric.internalPrecision === "number" &&
    typeof numeric.solverTolerance === "number" &&
    typeof numeric.maxIterations === "number" &&
    (numeric.angleMode === "degree" || numeric.angleMode === "radian") &&
    (numeric.displayMode === "normal" ||
      numeric.displayMode === "scientific" ||
      numeric.displayMode === "engineering") &&
    typeof value.locale === "string"
  );
}

function isWorkspaceState(value: unknown): value is WorkspaceState {
  if (!isRecord(value) || !isRecord(value.matrix) || !isRecord(value.solver) || !isRecord(value.numerical)) {
    return false;
  }

  return (
    (value.activeTool === "calculate" ||
      value.activeTool === "matrix" ||
      value.activeTool === "solver" ||
      value.activeTool === "numerical") &&
    typeof value.expressionInput === "string" &&
    isMatrixData(value.matrix.left) &&
    (!("right" in value.matrix) || value.matrix.right === undefined || isMatrixData(value.matrix.right)) &&
    typeof value.solver.expression === "string" &&
    (value.solver.method === "newton" || value.solver.method === "bisection") &&
    typeof value.solver.initialGuess === "string" &&
    typeof value.solver.bracketLower === "string" &&
    typeof value.solver.bracketUpper === "string" &&
    typeof value.numerical.expression === "string" &&
    (value.numerical.tool === "differentiate" ||
      value.numerical.tool === "integrate" ||
      value.numerical.tool === "sample") &&
    typeof value.numerical.point === "string" &&
    typeof value.numerical.intervalStart === "string" &&
    typeof value.numerical.intervalEnd === "string"
  );
}

export function parsePersistedSettings(value: unknown): PersistedSettingsDocument | null {
  if (!isRecord(value) || value.version !== SETTINGS_SCHEMA_VERSION || !isCalculatorSettings(value.payload)) {
    return null;
  }

  return {
    version: SETTINGS_SCHEMA_VERSION,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
    payload: value.payload
  };
}

export function parsePersistedWorkspace(value: unknown): PersistedWorkspaceDocument | null {
  if (!isRecord(value) || value.version !== WORKSPACE_SCHEMA_VERSION || !isWorkspaceState(value.payload)) {
    return null;
  }

  return {
    version: WORKSPACE_SCHEMA_VERSION,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
    payload: value.payload
  };
}
