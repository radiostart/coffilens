import { create } from "zustand";
import {
  deleteRecord,
  getThumbnail,
  listRecordsMeta,
  saveRecord,
} from "../storage/records";
import { ensureQuota } from "../storage/quota";
import type { RecordEntity, RecordMeta } from "../storage/db";

/**
 * 측정 기록 — IndexedDB persist.
 *
 * meta + thumbnails 슬라이스 분리 (N+1 방지):
 *  - meta: 100건 동시 로드 OK (thumbnail 제외)
 *  - thumbnails: 화면 진입 카드만 lazy load (URL.createObjectURL)
 *
 * 메모리 누수: remove() 시 thumbnails Map 의 ObjectURL revoke (sweep Issue 24).
 */

interface HistoryState {
  meta: RecordMeta[];
  /** id → blob URL (lazy load 후 캐시) */
  thumbnails: Map<string, string>;
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  save: (
    record: Omit<RecordEntity, "id" | "timestamp">,
  ) => Promise<{ record: RecordEntity; cleanedCount: number }>;
  loadThumbnail: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  meta: [],
  thumbnails: new Map(),
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const meta = await listRecordsMeta();
      set({ meta, loading: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ error: msg, loading: false });
    }
  },

  save: async (record) => {
    const cleanedCount = await ensureQuota();
    const full = await saveRecord(record);
    const meta: RecordMeta = {
      id: full.id,
      timestamp: full.timestamp,
      tool: full.tool,
      d50: full.d50,
      d10: full.d10,
      d90: full.d90,
      uniformity: full.uniformity,
      finesPercent: full.finesPercent,
      confidence: full.confidence,
      coinType: full.coinType,
      grinderMemo: full.grinderMemo,
    };
    set((state) => ({ meta: [meta, ...state.meta] }));
    return { record: full, cleanedCount };
  },

  loadThumbnail: async (id) => {
    if (get().thumbnails.has(id)) return;
    const blob = await getThumbnail(id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    set((state) => ({
      thumbnails: new Map(state.thumbnails).set(id, url),
    }));
  },

  remove: async (id) => {
    await deleteRecord(id);
    // sweep Issue 24: Blob URL 누수 방지 — 표시 중이던 URL revoke
    const existingUrl = get().thumbnails.get(id);
    if (existingUrl) URL.revokeObjectURL(existingUrl);
    set((state) => ({
      meta: state.meta.filter((m) => m.id !== id),
      thumbnails: (() => {
        const next = new Map(state.thumbnails);
        next.delete(id);
        return next;
      })(),
    }));
  },

  clear: () => {
    // 모든 ObjectURL revoke 후 reset (테스트 / 디버그용)
    for (const url of get().thumbnails.values()) {
      URL.revokeObjectURL(url);
    }
    set({ meta: [], thumbnails: new Map(), error: null });
  },
}));
