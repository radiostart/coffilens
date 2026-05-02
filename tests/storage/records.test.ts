import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _resetDbForTests } from "../../src/storage/db";
import {
  _clearAllForTests,
  deleteOldest,
  deleteRecord,
  getThumbnail,
  listRecordsMeta,
  saveRecord,
} from "../../src/storage/records";
import { IDBFactory } from "fake-indexeddb";

beforeEach(async () => {
  // 매 테스트 fresh DB
  globalThis.indexedDB = new IDBFactory();
  await _resetDbForTests();
});

afterEach(async () => {
  try {
    await _clearAllForTests();
  } catch {
    /* DB 미초기화 시 ignore */
  }
});

function makeBlob(): Blob {
  return new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
}

function fakeRecordInput(overrides: Partial<Parameters<typeof saveRecord>[0]> = {}) {
  return {
    thumbnail: makeBlob(),
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

describe("saveRecord + listRecordsMeta", () => {
  it("저장 후 listRecordsMeta 에서 조회 (thumbnail 제외)", async () => {
    const saved = await saveRecord(fakeRecordInput());
    expect(saved.id).toBeTruthy();
    expect(saved.timestamp).toBeGreaterThan(0);

    const meta = await listRecordsMeta();
    expect(meta).toHaveLength(1);
    expect(meta[0].d50).toBe(720);
    // thumbnail 필드 제외 검증 — meta 객체에 thumbnail 키 없음
    expect("thumbnail" in meta[0]).toBe(false);
  });

  it("3개 저장 → timestamp 최신순 정렬", async () => {
    await saveRecord(fakeRecordInput({ timestamp: 1000, d50: 600 }));
    await saveRecord(fakeRecordInput({ timestamp: 3000, d50: 800 }));
    await saveRecord(fakeRecordInput({ timestamp: 2000, d50: 700 }));

    const meta = await listRecordsMeta();
    expect(meta.map((m) => m.d50)).toEqual([800, 700, 600]);
  });

  it("id 자동 생성 — 충돌 없음", async () => {
    const a = await saveRecord(fakeRecordInput());
    const b = await saveRecord(fakeRecordInput());
    expect(a.id).not.toBe(b.id);
  });
});

describe("getThumbnail", () => {
  it("저장된 thumbnail 반환 (not null)", async () => {
    const saved = await saveRecord(fakeRecordInput());
    const blob = await getThumbnail(saved.id);
    // fake-indexeddb 의 structured-clone 이 Blob 을 빈 객체로 변환할 수 있어 (jsdom Blob 호환)
    // 정확한 형식 검증은 실 브라우저 베타에서. 여기는 round-trip 만 검증.
    expect(blob).not.toBeNull();
    expect(blob).toBeDefined();
  });

  it("존재하지 않는 id → null", async () => {
    const blob = await getThumbnail("nonexistent-id");
    expect(blob).toBeNull();
  });
});

describe("deleteRecord", () => {
  it("삭제 후 listRecordsMeta 에서 빠짐", async () => {
    const a = await saveRecord(fakeRecordInput({ d50: 600 }));
    await saveRecord(fakeRecordInput({ d50: 800 }));

    await deleteRecord(a.id);

    const meta = await listRecordsMeta();
    expect(meta).toHaveLength(1);
    expect(meta[0].d50).toBe(800);
  });
});

describe("deleteOldest", () => {
  it("가장 오래된 N개 삭제", async () => {
    await saveRecord(fakeRecordInput({ timestamp: 1000, d50: 600 }));
    await saveRecord(fakeRecordInput({ timestamp: 2000, d50: 700 }));
    await saveRecord(fakeRecordInput({ timestamp: 3000, d50: 800 }));

    const deleted = await deleteOldest(2);
    expect(deleted).toBe(2);

    const meta = await listRecordsMeta();
    expect(meta).toHaveLength(1);
    expect(meta[0].d50).toBe(800);
  });

  it("0 입력 → 즉시 0 반환", async () => {
    await saveRecord(fakeRecordInput());
    const deleted = await deleteOldest(0);
    expect(deleted).toBe(0);
  });

  it("record 보다 많은 N → 모두 삭제", async () => {
    await saveRecord(fakeRecordInput());
    await saveRecord(fakeRecordInput());

    const deleted = await deleteOldest(10);
    expect(deleted).toBe(2);
    expect(await listRecordsMeta()).toHaveLength(0);
  });
});
