import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { _resetDbForTests } from "../../src/storage/db";
import {
  _clearAllForTests,
  saveRecord,
} from "../../src/storage/records";
import { checkQuota, ensureQuota } from "../../src/storage/quota";

function stubEstimate(usage: number, quota: number) {
  vi.stubGlobal("navigator", {
    ...navigator,
    storage: {
      estimate: vi.fn(async () => ({ usage, quota })),
    },
  });
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  await _resetDbForTests();
  vi.unstubAllGlobals();
});

afterEach(async () => {
  try {
    await _clearAllForTests();
  } catch {
    /* ignore */
  }
  vi.unstubAllGlobals();
});

function fakeRecordInput(overrides: Partial<Parameters<typeof saveRecord>[0]> = {}) {
  return {
    thumbnail: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
    d50: 720,
    d10: 480,
    d90: 1100,
    uniformity: 2.29,
    finesPercent: 8.2,
    confidence: 8,
    coinType: "500" as const,
    ...overrides,
  };
}

describe("checkQuota", () => {
  it("ratio < 0.9 → needsCleanup false", async () => {
    stubEstimate(50, 100); // 0.5
    const status = await checkQuota();
    expect(status.ratio).toBe(0.5);
    expect(status.needsCleanup).toBe(false);
  });

  it("ratio = 0.9 → needsCleanup true", async () => {
    stubEstimate(900, 1000);
    const status = await checkQuota();
    expect(status.needsCleanup).toBe(true);
  });

  it("ratio > 0.9 → needsCleanup true", async () => {
    stubEstimate(950, 1000);
    const status = await checkQuota();
    expect(status.needsCleanup).toBe(true);
  });

  it("estimate 미지원 (Safari 일부 버전) → needsCleanup false", async () => {
    vi.stubGlobal("navigator", { ...navigator, storage: undefined });
    const status = await checkQuota();
    expect(status.needsCleanup).toBe(false);
    expect(status.quota).toBe(Infinity);
  });

  it("quota = 0 → ratio 0", async () => {
    stubEstimate(100, 0);
    const status = await checkQuota();
    expect(status.ratio).toBe(0);
  });
});

describe("ensureQuota", () => {
  it("cleanup 불필요 → 0 반환", async () => {
    stubEstimate(50, 100);
    const cleaned = await ensureQuota();
    expect(cleaned).toBe(0);
  });

  it("쿼터 90% + records 11개 이상 → 10개 삭제", async () => {
    // 11개 record 저장
    for (let i = 0; i < 11; i++) {
      await saveRecord(fakeRecordInput({ timestamp: 1000 + i }));
    }
    stubEstimate(950, 1000);

    const cleaned = await ensureQuota();
    expect(cleaned).toBe(10);
  });

  it("쿼터 90% + records 5개 → 0 반환 (다른 원인)", async () => {
    for (let i = 0; i < 5; i++) {
      await saveRecord(fakeRecordInput({ timestamp: 1000 + i }));
    }
    stubEstimate(950, 1000);

    const cleaned = await ensureQuota();
    expect(cleaned).toBe(0);
  });
});
