import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { HomeRoute } from "../../src/routes/home";
import { useHistoryStore } from "../../src/stores/history.store";
import { _resetDbForTests } from "../../src/storage/db";
import { _clearAllForTests } from "../../src/storage/records";

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
});

function fakeRecord() {
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

describe("HomeRoute", () => {
  it("측정 기록 없을 때 EmptyStateCard 렌더", async () => {
    render(<HomeRoute />);
    await waitFor(() => {
      expect(screen.getByText("첫 측정을 시작해보세요")).toBeDefined();
    });
    expect(screen.getByText("아직 측정 기록이 없어요")).toBeDefined();
  });

  it("측정 기록 있을 때 RecordList 렌더", async () => {
    await useHistoryStore.getState().save(fakeRecord());

    render(<HomeRoute />);

    await waitFor(() => {
      expect(screen.getByText(/720μm/)).toBeDefined();
    });
    expect(screen.getByText(/신뢰도 8\/10/)).toBeDefined();
  });
});
