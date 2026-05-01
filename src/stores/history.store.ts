import { create } from "zustand";

/**
 * 측정 기록 메타데이터.
 *
 * F08 에서 IndexedDB persist 추가 + thumbnail 슬라이스 분리.
 * 지금은 메모리 stub — 항상 빈 배열.
 */
export interface RecordMeta {
  id: string;
  createdAt: string; // ISO8601
  toolId: string;
  d50: number;
  confidence: number;
}

interface HistoryState {
  meta: RecordMeta[];
  add: (record: RecordMeta) => void;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  meta: [],
  add: (record) => set((state) => ({ meta: [record, ...state.meta] })),
  clear: () => set({ meta: [] }),
}));
