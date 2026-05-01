import { describe, it, expect, vi } from "vitest";
import { MatScope, withMatScope } from "../../src/opencv/mat-pool";

function fakeMat() {
  return { delete: vi.fn() };
}

describe("MatScope", () => {
  it("track 한 mat 들이 dispose 시 모두 delete 호출", () => {
    const scope = new MatScope();
    const m1 = scope.track(fakeMat());
    const m2 = scope.track(fakeMat());
    expect(scope.size()).toBe(2);

    scope.dispose();

    expect(m1.delete).toHaveBeenCalledOnce();
    expect(m2.delete).toHaveBeenCalledOnce();
    expect(scope.size()).toBe(0);
  });

  it("dispose 가 이미 해제된 mat 의 throw 를 무시", () => {
    const scope = new MatScope();
    const m = scope.track({
      delete: vi.fn(() => {
        throw new Error("already deleted");
      }),
    });

    expect(() => scope.dispose()).not.toThrow();
    expect(m.delete).toHaveBeenCalledOnce();
  });

  it("dispose 가 빈 scope 에서도 안전", () => {
    const scope = new MatScope();
    expect(() => scope.dispose()).not.toThrow();
  });
});

describe("withMatScope", () => {
  it("fn 정상 종료 시 dispose 호출", async () => {
    const m = fakeMat();
    const result = await withMatScope(async (scope) => {
      scope.track(m);
      return 42;
    });

    expect(result).toBe(42);
    expect(m.delete).toHaveBeenCalledOnce();
  });

  it("fn throw 해도 dispose 호출 (finally)", async () => {
    const m = fakeMat();
    await expect(
      withMatScope(async (scope) => {
        scope.track(m);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(m.delete).toHaveBeenCalledOnce();
  });

  it("동기 fn 도 지원", async () => {
    const m = fakeMat();
    const result = await withMatScope((scope) => {
      scope.track(m);
      return "sync-ok";
    });

    expect(result).toBe("sync-ok");
    expect(m.delete).toHaveBeenCalledOnce();
  });
});
