import type { CalculatorSettings, MatrixData, WorkspaceState } from "@core/contracts";
import type { HistoryEntry, HistoryModeMetadata } from "../features/history/model";
import type { MemoryRegister } from "../features/memory/model";
import { createDefaultMemoryRegisters } from "../features/memory/model";
import { createDefaultWorkspaceState, sanitizeWorkspaceState } from "../app/workspaceDrafts";
import { createDefaultCalculatorSettings, sanitizeCalculatorSettings } from "../features/settings/model";

export const SETTINGS_SCHEMA_VERSION = 1 as const;
export const WORKSPACE_SCHEMA_VERSION = 1 as const;
export const HISTORY_SCHEMA_VERSION = 1 as const;
export const MEMORY_SCHEMA_VERSION = 1 as const;

export interface VersionedDocument<TVersion extends number, TPayload> {
  version: TVersion;
  payload: TPayload;
  updatedAt: string;
}

export type PersistedSettingsDocument = VersionedDocument<typeof SETTINGS_SCHEMA_VERSION, CalculatorSettings>;
export type PersistedWorkspaceDocument = VersionedDocument<typeof WORKSPACE_SCHEMA_VERSION, WorkspaceState>;
export type PersistedHistoryDocument = VersionedDocument<typeof HISTORY_SCHEMA_VERSION, { entries: HistoryEntry[] }>;
export type PersistedMemoryDocument = VersionedDocument<typeof MEMORY_SCHEMA_VERSION, { registers: MemoryRegister[] }>;

const DEFAULT_UPDATED_AT = new Date(0).toISOString();

export function createDefaultSettingsDocument(): PersistedSettingsDocument {
  return {
    version: SETTINGS_SCHEMA_VERSION,
    updatedAt: DEFAULT_UPDATED_AT,
    payload: createDefaultCalculatorSettings()
  };
}

export function createDefaultWorkspaceDocument(): PersistedWorkspaceDocument {
  return {
    version: WORKSPACE_SCHEMA_VERSION,
    updatedAt: DEFAULT_UPDATED_AT,
    payload: createDefaultWorkspaceState()
  };
}

export function createDefaultHistoryDocument(): PersistedHistoryDocument {
  return {
    version: HISTORY_SCHEMA_VERSION,
    updatedAt: DEFAULT_UPDATED_AT,
    payload: {
      entries: []
    }
  };
}

export function createDefaultMemoryDocument(): PersistedMemoryDocument {
  return {
    version: MEMORY_SCHEMA_VERSION,
    updatedAt: DEFAULT_UPDATED_AT,
    payload: {
      registers: createDefaultMemoryRegisters()
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

function isHistoryModeMetadata(value: unknown): value is HistoryModeMetadata {
  return (
    isRecord(value) &&
    (value.backend === "float64" || value.backend === "decimal") &&
    (value.angleMode === "degree" || value.angleMode === "radian") &&
    (value.displayMode === "normal" || value.displayMode === "scientific" || value.displayMode === "engineering") &&
    typeof value.displayPrecision === "number"
  );
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.tool === "calculate" || value.tool === "matrix" || value.tool === "solver" || value.tool === "numerical") &&
    typeof value.title === "string" &&
    typeof value.detail === "string" &&
    typeof value.value === "string" &&
    typeof value.createdAt === "string" &&
    isHistoryModeMetadata(value.mode)
  );
}

function isMemoryRegister(value: unknown): value is MemoryRegister {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.value === "string" &&
    typeof value.detail === "string" &&
    (value.sourceTool === null ||
      value.sourceTool === "calculate" ||
      value.sourceTool === "matrix" ||
      value.sourceTool === "solver" ||
      value.sourceTool === "numerical") &&
    (value.updatedAt === null || typeof value.updatedAt === "string") &&
    (value.mode === null || isHistoryModeMetadata(value.mode))
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
    (value.numerical.differentiationMethod === "central" ||
      value.numerical.differentiationMethod === "five-point") &&
    (value.numerical.integrationMethod === "trapezoidal" ||
      value.numerical.integrationMethod === "simpson") &&
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
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : DEFAULT_UPDATED_AT,
    payload: sanitizeCalculatorSettings(value.payload)
  };
}

export function parsePersistedWorkspace(value: unknown): PersistedWorkspaceDocument | null {
  if (!isRecord(value) || value.version !== WORKSPACE_SCHEMA_VERSION || !isWorkspaceState(value.payload)) {
    return null;
  }

  return {
    version: WORKSPACE_SCHEMA_VERSION,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : DEFAULT_UPDATED_AT,
    payload: sanitizeWorkspaceState(value.payload)
  };
}

export function parsePersistedHistory(value: unknown): PersistedHistoryDocument | null {
  if (
    !isRecord(value) ||
    value.version !== HISTORY_SCHEMA_VERSION ||
    !isRecord(value.payload) ||
    !Array.isArray(value.payload.entries) ||
    !value.payload.entries.every((entry) => isHistoryEntry(entry))
  ) {
    return null;
  }

  return {
    version: HISTORY_SCHEMA_VERSION,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : DEFAULT_UPDATED_AT,
    payload: {
      entries: value.payload.entries
    }
  };
}

export function parsePersistedMemory(value: unknown): PersistedMemoryDocument | null {
  if (
    !isRecord(value) ||
    value.version !== MEMORY_SCHEMA_VERSION ||
    !isRecord(value.payload) ||
    !Array.isArray(value.payload.registers) ||
    !value.payload.registers.every((register) => isMemoryRegister(register))
  ) {
    return null;
  }

  return {
    version: MEMORY_SCHEMA_VERSION,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : DEFAULT_UPDATED_AT,
    payload: {
      registers: value.payload.registers
    }
  };
}
