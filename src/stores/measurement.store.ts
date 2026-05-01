import { create } from "zustand";

export type ToolId = "v60" | "kalita" | "clever" | "origami" | "chemex";

interface MeasurementState {
  tool: ToolId | null;
  /** 카메라에서 캡처한 frame canvas — F03 setFrame, F06 분석 입력 */
  frame: HTMLCanvasElement | null;
  setTool: (t: ToolId) => void;
  setFrame: (canvas: HTMLCanvasElement | null) => void;
  reset: () => void;
}

export const useMeasurementStore = create<MeasurementState>((set) => ({
  tool: null,
  frame: null,
  setTool: (t) => set({ tool: t }),
  setFrame: (canvas) => set({ frame: canvas }),
  reset: () => set({ tool: null, frame: null }),
}));
