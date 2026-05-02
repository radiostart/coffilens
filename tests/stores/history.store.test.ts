import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { _resetDbForTests } from "../../src/storage/db";
import { _clearAllForTests } from "../../src/storage/records";
import { useHistoryStore } from "../../src/stores/history.store";

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  await _resetDbForTests();
  useHistoryStore.getState().clear();
});

afterEach(async () => {
  try {
    await _clearAllForTests();
  } catch {
    /* ignore */
  }
  useHistoryStore.getState().clear();
});

function fakeRecordInput() {
  return {
    thumbnail: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
    d50: 720,
    d10: 480,
    d90: 1100,
    uniformity: 2.29,
    finesPercent: 8.2,
    confidence: 8,
    coinType: "500" as const,
  };
}

describe("useHistoryStore", () => {
  it("save → meta 즉시 추가", async () => {
    const store = useHistoryStore.getState();
    expect(store.meta).toHaveLength(0);

    await store.save(fakeRecordInput());

    expect(useHistoryStore.getState().meta).toHaveLength(1);
    expect(useHistoryStore.getState().meta[0].d50).toBe(720);
  });

  it("load → IndexedDB 에서 비동기 조회", async () => {
    const store = useHistoryStore.getState();
    await store.save(fakeRecordInput());

    // 다른 store 인스턴스 시뮬레이트 (clear → load)
    store.clear();
    expect(useHistoryStore.getState().meta).toHaveLength(0);

    await useHistoryStore.getState().load();
    expect(useHistoryStore.getState().meta).toHaveLength(1);
  });

  it("remove → meta + thumbnails 동시 제거", async () => {
    const store = useHistoryStore.getState();
    const { record } = await store.save(fakeRecordInput());

    // thumbnail load (URL 생성)
    // jsdom 의 URL.createObjectURL 가 동작하지 않으면 mock
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:mock-url");
    URL.revokeObjectURL = vi.fn();

    await store.loadThumbnail(record.id);
    expect(useHistoryStore.getState().thumbnails.has(record.id)).toBe(true);

    await useHistoryStore.getState().remove(record.id);

    expect(useHistoryStore.getState().meta).toHaveLength(0);
    expect(useHistoryStore.getState().thumbnails.has(record.id)).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  it("clear → meta 초기화 + 모든 ObjectURL revoke", async () => {
    const store = useHistoryStore.getState();
    await store.save(fakeRecordInput());

    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:url-1");
    URL.revokeObjectURL = vi.fn();

    await store.loadThumbnail(useHistoryStore.getState().meta[0].id);
    useHistoryStore.getState().clear();

    expect(useHistoryStore.getState().meta).toHaveLength(0);
    expect(useHistoryStore.getState().thumbnails.size).toBe(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:url-1");

    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });
});
