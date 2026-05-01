import { create } from "zustand";

export type ToolId = "v60" | "kalita" | "clever" | "origami" | "chemex";

interface MeasurementState {
  tool: ToolId | null;
  setTool: (t: ToolId) => void;
  reset: () => void;
}

export const useMeasurementStore = create<MeasurementState>((set) => ({
  tool: null,
  setTool: (t) => set({ tool: t }),
  reset: () => set({ tool: null }),
}));
