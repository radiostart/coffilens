import { create } from "zustand";
import type { PipelineResult } from "../opencv/pipeline";
import type { AnalysisError } from "../opencv/errors";

export type ToolId = "v60" | "kalita" | "clever" | "origami" | "chemex";

interface MeasurementState {
  tool: ToolId | null;
  /** 카메라에서 캡처한 frame canvas — F03 setFrame, F06 분석 입력 */
  frame: HTMLCanvasElement | null;
  /** 분석 결과 — F06 setResult, F07 결과 화면 입력 */
  result: PipelineResult | null;
  /** 분석 실패 시 — F07 에러 화면 입력 */
  error: AnalysisError | null;
  setTool: (t: ToolId) => void;
  setFrame: (canvas: HTMLCanvasElement | null) => void;
  setResult: (r: PipelineResult | null) => void;
  setError: (e: AnalysisError | null) => void;
  reset: () => void;
}

export const useMeasurementStore = create<MeasurementState>((set) => ({
  tool: null,
  frame: null,
  result: null,
  error: null,
  setTool: (t) => set({ tool: t }),
  setFrame: (canvas) => set({ frame: canvas }),
  setResult: (r) => set({ result: r, error: null }),
  setError: (e) => set({ error: e, result: null }),
  reset: () => set({ tool: null, frame: null, result: null, error: null }),
}));
