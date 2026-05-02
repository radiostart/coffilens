import { create } from "zustand";
import type { PipelineResult } from "../opencv/pipeline";
import type { AnalysisError } from "../opencv/errors";

export type CoinType = "100" | "500";

/**
 * 사용자가 사진에서 탭한 동전 위치 — **상대 좌표 (0~1)**.
 * x=0.5 가 가운데, x=0 이 왼쪽 가장자리, x=1 이 오른쪽 가장자리.
 * 상대 좌표로 저장해서 원본·다운샘플 canvas 어느 사이즈에도 적용 가능.
 * Phase 1 (coin-locate UX) — pixel-stat 기반 자동 검출의 fundamental ambiguity 해결.
 */
export interface CoinHint {
  x: number;
  y: number;
}

interface MeasurementState {
  /** 사용자가 촬영 전 지정한 동전 종류 — F04 직경 환산 기준 */
  coinType: CoinType | null;
  /** 카메라에서 캡처한 frame canvas — F03 setFrame, F06 분석 입력 */
  frame: HTMLCanvasElement | null;
  /** 사용자가 탭한 동전 위치 hint (선택) — null 이면 자동 검출 */
  coinHint: CoinHint | null;
  /** 분석 결과 — F06 setResult, F07 결과 화면 입력 */
  result: PipelineResult | null;
  /** 분석 실패 시 — F07 에러 화면 입력 */
  error: AnalysisError | null;
  /**
   * Archived view mode — IndexedDB 에서 로드된 과거 기록.
   * true 시 result.tsx 가 "측정 저장" CTA 숨기고 "삭제" 버튼 표시.
   * 2026-05-02 추가.
   */
  archivedRecordId: string | null;
  setCoinType: (c: CoinType) => void;
  setFrame: (canvas: HTMLCanvasElement | null) => void;
  setCoinHint: (h: CoinHint | null) => void;
  setResult: (r: PipelineResult | null) => void;
  setError: (e: AnalysisError | null) => void;
  setArchivedRecordId: (id: string | null) => void;
  reset: () => void;
}

export const useMeasurementStore = create<MeasurementState>((set) => ({
  coinType: null,
  frame: null,
  coinHint: null,
  result: null,
  error: null,
  archivedRecordId: null,
  setCoinType: (c) => set({ coinType: c }),
  setFrame: (canvas) => set({ frame: canvas }),
  setCoinHint: (h) => set({ coinHint: h }),
  setResult: (r) => set({ result: r, error: null }),
  setError: (e) => set({ error: e, result: null }),
  setArchivedRecordId: (id) => set({ archivedRecordId: id }),
  reset: () =>
    set({
      coinType: null,
      frame: null,
      coinHint: null,
      result: null,
      error: null,
      archivedRecordId: null,
    }),
}));
