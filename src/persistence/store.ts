import type { CalculatorSettings, WorkspaceState } from "@core/contracts";
import type { HistoryEntry } from "../features/history/model";
import type { MemoryRegister } from "../features/memory/model";
import {
  HISTORY_SCHEMA_VERSION,
  MEMORY_SCHEMA_VERSION,
  SETTINGS_SCHEMA_VERSION,
  WORKSPACE_SCHEMA_VERSION,
  createDefaultHistoryDocument,
  createDefaultMemoryDocument,
  createDefaultSettingsDocument,
  createDefaultWorkspaceDocument,
  parsePersistedHistory,
  parsePersistedMemory,
  parsePersistedSettings,
  parsePersistedWorkspace,
  type PersistedHistoryDocument,
  type PersistedMemoryDocument,
  type PersistedSettingsDocument,
  type PersistedWorkspaceDocument
} from "./schema";
import { sanitizeCalculatorSettings } from "../features/settings/model";
import { sanitizeWorkspaceState } from "../app/workspaceDrafts";

const STORAGE_KEYS = {
  settings: "calculator.settings.v1",
  workspace: "calculator.workspace.v1",
  history: "calculator.history.v1",
  memory: "calculator.memory.v1"
} as const;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersistenceSnapshot {
  settings: PersistedSettingsDocument;
  workspace: PersistedWorkspaceDocument;
  history: PersistedHistoryDocument;
  memory: PersistedMemoryDocument;
}

type Clock = () => string;

function readDocument<TDocument>(
  storage: StorageLike,
  key: string,
  parse: (value: unknown) => TDocument | null,
  fallback: () => TDocument
): TDocument {
  const raw = storage.getItem(key);
  if (raw === null) {
    return fallback();
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return parse(parsed) ?? fallback();
  } catch {
    return fallback();
  }
}

function writeDocument(storage: StorageLike, key: string, value: unknown): void {
  storage.setItem(key, JSON.stringify(value));
}

export function createMemoryStorage(): StorageLike {
  const values = new Map<string, string>();

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

export function getBrowserStorage(): StorageLike {
  if (typeof window === "undefined") {
    return createMemoryStorage();
  }

  try {
    return window.localStorage;
  } catch {
    return createMemoryStorage();
  }
}

export function createCalculatorPersistence(storage: StorageLike, now: Clock = () => new Date().toISOString()) {
  return {
    loadSnapshot(): PersistenceSnapshot {
      return {
        settings: readDocument(storage, STORAGE_KEYS.settings, parsePersistedSettings, createDefaultSettingsDocument),
        workspace: readDocument(storage, STORAGE_KEYS.workspace, parsePersistedWorkspace, createDefaultWorkspaceDocument),
        history: readDocument(storage, STORAGE_KEYS.history, parsePersistedHistory, createDefaultHistoryDocument),
        memory: readDocument(storage, STORAGE_KEYS.memory, parsePersistedMemory, createDefaultMemoryDocument)
      };
    },
    saveSettings(payload: CalculatorSettings): PersistedSettingsDocument {
      const document: PersistedSettingsDocument = {
        version: SETTINGS_SCHEMA_VERSION,
        updatedAt: now(),
        payload: sanitizeCalculatorSettings(payload)
      };
      writeDocument(storage, STORAGE_KEYS.settings, document);
      return document;
    },
    saveWorkspace(payload: WorkspaceState): PersistedWorkspaceDocument {
      const document: PersistedWorkspaceDocument = {
        version: WORKSPACE_SCHEMA_VERSION,
        updatedAt: now(),
        payload: sanitizeWorkspaceState(payload)
      };
      writeDocument(storage, STORAGE_KEYS.workspace, document);
      return document;
    },
    saveHistory(entries: HistoryEntry[]): PersistedHistoryDocument {
      const document: PersistedHistoryDocument = {
        version: HISTORY_SCHEMA_VERSION,
        updatedAt: now(),
        payload: {
          entries
        }
      };
      writeDocument(storage, STORAGE_KEYS.history, document);
      return document;
    },
    saveMemory(registers: MemoryRegister[]): PersistedMemoryDocument {
      const document: PersistedMemoryDocument = {
        version: MEMORY_SCHEMA_VERSION,
        updatedAt: now(),
        payload: {
          registers
        }
      };
      writeDocument(storage, STORAGE_KEYS.memory, document);
      return document;
    }
  };
}
