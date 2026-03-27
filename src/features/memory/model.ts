import type { WorkspaceToolId } from "@core/contracts";
import type { HistoryModeMetadata } from "../history/model";

export interface MemoryRegister {
  id: string;
  label: string;
  value: string;
  detail: string;
  sourceTool: WorkspaceToolId | null;
  updatedAt: string | null;
  mode: HistoryModeMetadata | null;
}

export function createDefaultMemoryRegisters(): MemoryRegister[] {
  return ["M1", "M2", "M3", "M4"].map((label) => ({
    id: label.toLowerCase(),
    label,
    value: "",
    detail: "Empty register",
    sourceTool: null,
    updatedAt: null,
    mode: null
  }));
}
