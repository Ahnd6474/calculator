import type { AngleMode, DisplayMode, NumericBackend, WorkspaceToolId } from "@core/contracts";

export interface HistoryModeMetadata {
  backend: NumericBackend;
  angleMode: AngleMode;
  displayMode: DisplayMode;
  displayPrecision: number;
}

export interface HistoryEntry {
  id: string;
  tool: WorkspaceToolId;
  title: string;
  detail: string;
  value: string;
  createdAt: string;
  mode: HistoryModeMetadata;
}
