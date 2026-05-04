# Spec Sweep Findings — F01–F11
**Date**: 2026-05-01  
**Reviewer**: Systematic spec-quality sweep (read-only)  
**Scope**: F01, F02, F03, F05, F06, F07, F08, F09, F10, F11  
**Reference**: plain.md v6, DESIGN.md v1, docs/superpowers/specs/2026-05-01-f00-fixture-strategy-design.md

---

## Summary

10 feature specs reviewed. No spec is completely clean. The most common failure patterns are:

1. **Stale / un-updated cross-references** — several specs still contain old fixture filenames (`no-coin.jpg`, `varia-dial-*`) that the F00 fixture redesign replaced with `grind-anchor-{NNN}.jpg` + synthetic variants.
2. **Hard-wired placeholder values presented as real data** — pipeline.ts in F06 hard-codes `meanBrightness: 150` and `laplacianVariance: 300` as TODO placeholders, but the spec acceptance criterion doesn't flag this as incomplete.
3. **Scope ambiguity around F09 telemetry infra** — building and deploying a Cloudflare Workers backend is not a "polish" task; its failure modes (deployment, CORS, KV consistency) are under-specified.
4. **DESIGN.md token drift** — F07 example code hard-codes a hex color (`fill="#6B4423"`) and uses `--text-h3` for D50 in a way that conflicts with the typography scale.
5. **Test environment gap for OpenCV** — F10 acknowledges that jsdom doesn't run OpenCV.js but doesn't mandate a resolution; vitest browser mode / Playwright is listed as an option without a decision.

Issue counts: **Critical: 3 | Important: 14 | Minor: 10**

---

## F01 — Navigation & Intro Bridge

**Overall health: 🟡 minor**

### Issue 1 — Internal contradiction: exit-modal.tsx created twice
- **Category**: B (internal contradiction)
- **Severity**: Minor
- **Location**: F01 산출물 line 23 AND F08 산출물 line 24
- Both F01 and F08 list `src/components/exit-modal.tsx` as a **신규 파일**. F01 creates it as a placeholder; F08 creates it again as a separate 신규 파일 entry. This will confuse the implementer — they will either duplicate the file or overwrite F01's work without realising it.
- **Recommendation**: F01 산출물 should mark exit-modal.tsx as owned by F08; F01 should only stub a `<ExitModal>` import. No redesign needed — 5 min edit.

### Issue 2 — Hidden assumption: SDK nav-bar component existence
- **Category**: A (hidden assumption)
- **Severity**: Minor
- **Location**: F01 구현 디테일 lines 43-58
- The entire `nav-bar.tsx` design says "SDK 컴포넌트가 있으면 wrapper, 없으면 fallback" but the fallback implementation is not specified beyond "자체 구현". If D1 reveals no SDK nav component exists, the implementer has no spec to follow for the fallback.
- **Recommendation**: Add a minimal fallback interface contract to the spec (even just "same `NavBarProps`, renders `<nav>` + title + right-action slot"). 15 min edit.

### Issue 3 — ESLint rule false-negative: `router.back()` not caught
- **Category**: E (missing detail)
- **Severity**: Minor
- **Location**: F01 eslint-rules/no-custom-back-button.ts lines 107-140, valid test case line 184
- The valid test case explicitly passes `router.push("/home")`, but the comment on line 110 says pattern 3 catches `router.back()`. The `create()` function body shows only `CallExpression` checking for `history.back()` / `history.go()` — it does NOT catch `router.back()`. The valid test case does not test `router.back()` either, so this gap would ship undetected.
- **Recommendation**: Add `router.back()` to the CallExpression pattern and add it as an invalid test case. 15 min edit.

**Estimated fix effort**: ~30 min total

---

## F02 — Home & Tool Selection & Routing

**Overall health: 🟡 minor**

### Issue 4 — HomeRoute renders empty-state caption redundantly
- **Category**: B (internal contradiction)
- **Severity**: Minor
- **Location**: F02 home.tsx lines 75-91
- When `meta.length === 0`, the component renders both an `<EmptyStateCard>` (which already contains the "첫 측정을 시작해보세요" copy) AND a separate `<p>아직 측정 기록이 없어요</p>` outside the card (the second `meta.length === 0` conditional at line 85). These two messages will both be visible simultaneously in empty state, which contradicts the plain.md Section 19-3 EMPTY state spec (single "첫 측정을 시작해보세요" card).
- **Recommendation**: Remove the outer `<p>` caption — it's redundant with the card. 5 min edit.

### Issue 5 — F04 dependency not declared
- **Category**: E (missing detail)
- **Severity**: Minor
- **Location**: F02 header, line 5
- F02 mounts a `/camera` route placeholder for F03. However, the actual camera capture then flows into analysis which is F03 → F04 → F05 → F06. F02 declares `Blocks: F07` but does NOT declare `Blocks: F03`. This is a documentation gap, not a code issue, but could cause scheduling confusion.
- **Recommendation**: Add F03 to Blocks. 2 min edit.

### Issue 6 — `useHistoryStore` hook referenced before it exists
- **Category**: B (internal contradiction)
- **Severity**: Minor
- **Location**: F02 home.tsx line 69
- `const meta = useHistoryStore(s => s.meta)` is referenced in F02's code, but `history.store.ts` is a **신규 파일 in F08**. The F02 spec says "F08에서 채움. 지금은 빈 배열 hook만" — but the hook import path is not defined yet. If F02 is implemented literally, it will fail to compile until F08 ships. The spec should either include a stub store or explicitly state that this line is a comment placeholder.
- **Recommendation**: Clarify that this line is pseudocode until F08; provide a stub `useHistoryStore` return value for F02 to compile. 10 min edit.

**Estimated fix effort**: ~20 min total

---

## F03 — OpenCV Foundation

**Overall health: 🟠 important**

### Issue 7 — CRITICAL: OpenCV CDN URL is unguarded external dependency
- **Category**: A (hidden assumption) / G (risk underestimation)
- **Severity**: Important
- **Location**: F03 opencv/loader.ts line 68: `const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js';`
- The spec hard-codes `docs.opencv.org` as the only source. The 위험/함정 section (line 295) mentions "CORS 이슈 → CDN 미러(cdnjs, jsdelivr) 또는 self-host" as a risk, but provides no fallback URL in the actual loader code. If the primary CDN fails at runtime (this has happened historically), there is no code-level fallback, only a comment. The 3-retry logic retries the same broken URL.
- **Recommendation**: Add a `CDN_MIRRORS` array with at least one fallback (jsdelivr / cdnjs) and attempt them in sequence on failure. Important — needs spec update with code snippet. 30 min.

### Issue 8 — `no-direct-mat` ESLint rule ALLOWED_FILES uses filename match only
- **Category**: E (missing detail)
- **Severity**: Minor
- **Location**: F03 eslint-rules/no-direct-mat.ts line 243: `ALLOWED_FILES.some(f => context.filename.endsWith(f))`
- `endsWith('mat-pool.ts')` would also match a file named e.g. `src/tests/fake-mat-pool.ts`. More importantly, it would NOT correctly match a Windows path that uses `\` separators. Should use `context.filename.includes('/mat-pool.ts')` or a regex. Low severity since the app is WebView-only, but the test environment might run on Windows CI.
- **Recommendation**: Use `context.getFilename().endsWith('/mat-pool.ts')` or a path-separator-safe check. 5 min.

### Issue 9 — `camera.tsx` misses `stopStream()` implementation
- **Category**: E (missing detail)
- **Severity**: Important
- **Location**: F03 routes/camera.tsx line 187: `return () => stopStream();`
- The cleanup function calls `stopStream()` but this function is neither imported nor defined anywhere in the spec. The spec shows `requestCameraStream()` returning a `MediaStream` but the `stopStream()` implementation is absent. Without it, the camera stream will never be properly torn down when navigating away, causing the camera indicator light to stay on.
- **Recommendation**: Define `stopStream()` in `lib/permissions.ts` (close tracks on the stored stream ref). Add it to the spec code snippets. 15 min.

### Issue 10 — Portrait lock not specified in camera.tsx
- **Category**: C (cross-spec contradiction)
- **Severity**: Minor
- **Location**: F03 routes/camera.tsx — entire section; DESIGN.md Section 11 line 327
- DESIGN.md Section 11 (Portrait Lock) explicitly specifies that camera/analyzing screens should call `screen.orientation.lock('portrait')` on enter and `unlock()` on exit. F03's `camera.tsx` code snippet does not include this. It may be assumed to be "polish", but since F03 is the feature that creates the camera route, this is the natural home for it.
- **Recommendation**: Add portrait lock call to `camera.tsx` `useEffect`. Also add to acceptance criteria. 10 min.

**Estimated fix effort**: ~60 min total

---

## F05 — Particle Segmentation

**Overall health: 🟠 important (stale fixture references)**

### Issue 11 — STALE FIXTURE: `synthetic/no-coin.synth.jpg` path matches new scheme but test code wording mixes old/new
- **Category**: F (stale references)
- **Severity**: Important
- **Location**: F05 tests/opencv/particle-segment.test.ts lines 194-198
- The test code at line 195 reads: `// 합성 reject (no-coin 변형) 으로 빈 종이 케이스 simulate — F04 의 build-reject-fixtures 결과 사용`. The filename `synthetic/no-coin.synth.jpg` correctly matches the F00 fixture redesign schema. However, the comment says "no-coin 변형" — this conflates the F00 OLD `no-coin.jpg` fixture with the new `no-coin.synth.jpg` synthetic fixture. More critically, the comment implies this tests "빈 종이" (empty paper), but `no-coin.synth.jpg` tests **no coin present with grind present** (coin masked out from anchor). The segmentation test should actually be using a truly empty image (no particles), not a no-coin image, for the `no_particles` case. Using a no-coin image still has particles — `segmentParticles` would not reject it, it would just produce results without a valid mm/px calibration (which comes from `coin` parameter, passed in separately as `mockCoin500`).
- **Recommendation**: The test fixture for `no_particles` case should be a synthetically generated blank/near-blank image, not the `no-coin.synth.jpg`. Either create a separate blank fixture or generate it programmatically in the test. Needs spec clarification. 20 min.

### Issue 12 — `SANITY_MIN_AREA_RATIO` threshold has no documented basis
- **Category**: A (hidden assumption)
- **Severity**: Minor
- **Location**: F05 particle-segment.ts line 41: `const SANITY_MIN_AREA_RATIO = 0.005;`
- The value 0.005 (0.5%) is stated but not justified. The 위험/함정 section mentions "fixture 기반 튜닝" for threshold params (line 217) but does not mention this ratio. If the anchor fixture has a certain particle density, this ratio may or may not be appropriate. This is a parameter that needs empirical validation like the others.
- **Recommendation**: Add to the 위험/함정 section: `SANITY_MIN_AREA_RATIO` needs empirical validation against anchor fixture; note expected range. 10 min.

### Issue 13 — `contours` and `hierarchy` escape the `withMatScope` — leak risk under error path
- **Category**: G (risk underestimation)
- **Severity**: Important
- **Location**: F05 particle-segment.ts lines 103-104 and lines 121-130
- The spec correctly notes that `contours` and `hierarchy` escape the `withMatScope` closure and must be manually disposed by the caller via `disposeSegmentation()`. However, in the sanity check failure path (lines 121-130), the code calls `contours.delete()` and `hierarchy.delete()` manually BEFORE throwing, which is correct. But the code at line 103 creates `contours = new cv.MatVector()` and `hierarchy = new cv.Mat()` — these are created with `new cv.*()` directly, bypassing the `scope.track()` pattern AND bypassing the `no-direct-mat` ESLint rule because they are NOT wrapped in `scope.track()`. The ESLint rule would flag these as violations. This is an internal contradiction: the spec simultaneously requires ESLint clean code AND uses `new cv.MatVector()` directly.
- **Recommendation**: The spec needs to explicitly note that `contours` and `hierarchy` are ESLint rule exceptions (add them to `ALLOWED_FILES` or add an `// eslint-disable-next-line` with a comment explaining the escaping ownership). Or redesign the pattern. This needs a small design decision. 20 min.

**Estimated fix effort**: ~50 min total

---

## F06 — Statistics + Confidence + Pipeline

**Overall health: 🔴 critical**

### Issue 14 — CRITICAL: Hard-coded placeholder values in pipeline.ts will ship silently
- **Category**: B (internal contradiction) / G (risk underestimation)
- **Severity**: Critical
- **Location**: F06 opencv/pipeline.ts lines 223-224:
  ```ts
  meanBrightness: 150, // TODO: checkInputQuality 결과 재사용 (현재는 placeholder)
  laplacianVariance: 300,
  ```
- These placeholder values are hard-coded in the `runPipeline()` function. The confidence score will always use brightness=150 and blur=300 regardless of the actual image quality. The spec's acceptance criterion (line 319) only checks `computeConfidence()` unit tests in isolation — it does NOT check that `runPipeline()` passes real values from the preflight step to confidence computation. A passing test suite would NOT catch this regression because `statistics.test.ts` and `confidence.test.ts` test the pure functions, not the pipeline integration.
- The `checkInputQuality()` function (from F04, not in this spec) should return `meanBrightness` and `laplacianVariance` — but `pipeline.ts` discards its output (`await checkInputQuality(canvas)` with no assigned return value at line 197).
- **Recommendation**: Add an acceptance criterion: "pipeline.ts의 confidence 입력 meanBrightness와 laplacianVariance는 checkInputQuality() 실제 출력값 사용 (hard-coded placeholder X)". Add integration test or inline assertion. Needs F04 spec coordination. Important effort: ~30 min spec edit + F04 coordination.

### Issue 15 — `low_particles` error type added to errors.ts but never thrown from pipeline
- **Category**: B (internal contradiction)
- **Severity**: Important
- **Location**: F06 errors.ts extension line 286: `| { kind: 'low_particles'; count: number }` — but in pipeline.ts, the stats computation at line 212 catches any error and throws `{ kind: 'no_particles' }`. There is no code path in the pipeline that throws `low_particles`. The plain.md Section 11 Failure Modes Registry (line 438) lists `low_particles` as being reflected in confidence score + warning badge — NOT as a rejection. So `low_particles` should never be thrown; it should be a signal to the confidence module. The spec adds it to `AnalysisError` but this is incorrect per plain.md.
- **Recommendation**: Remove `low_particles` from `AnalysisError` discriminated union. It is a confidence signal (already handled by `PARTICLE_TIERS` in confidence.ts), not an error path. The `userMessage()` function already reflects this ("메시지 없음"). The type should live in `ConfidenceInputs` or a separate enum. 15 min.

### Issue 16 — `ALGORITHM_NOTES.md` fixture reference uses old placeholder `grind-anchor-{NNN}`
- **Category**: F (stale references)  
- **Severity**: Minor
- **Location**: F06 ALGORITHM_NOTES.md template line 299: `| grind-anchor-{NNN} | {NNN}μm (예: 725) |`
- This is correctly formatted per the F00 redesign. However, "예: 725" is given as a concrete example. The actual anchor filename will only be known after D0 fixture preparation. The template should not pre-assume 725 as the likely value — it should leave the placeholder blank to avoid the implementer copying the example without updating it.
- **Recommendation**: Change "예: 725" to "{actual midpoint from manifest}". 2 min.

### Issue 17 — AbortSignal not checked inside `segmentParticles` call
- **Category**: E (missing detail)
- **Severity**: Minor
- **Location**: F06 pipeline.ts lines 208-229
- The pipeline checks `signal.throwIfAborted()` before calling `segmentParticles`, but `segmentParticles()` itself (F05) is synchronous-heavy WASM work (watershed). There is no abort check AFTER the segment call returns before entering stats/confidence. If the user cancels during watershed (which can take 1-3s on a low-end device), the abort is only caught at the next `throwIfAborted()` call at line 209. This is an acceptable delay, but the plain.md Section 6 AbortSignal documentation explicitly acknowledges this ("`cv.watershed()` 자체는 동기 WASM이라 중간에 못 자름"). The issue is that the spec doesn't add a `signal.throwIfAborted()` immediately after the `segmentParticles` return, before `disposeSegmentation` — this means if abort happens during watershed, we still execute stats+confidence before checking. The `finally` block does clean up, which is correct, but we'd do unnecessary computation.
- **Recommendation**: Add `signal.throwIfAborted()` immediately after `segmentParticles` returns (before stats). Minor clarification. 5 min.

**Estimated fix effort**: Critical issue 14 needs ~45 min including cross-spec coordination. Others ~30 min.

---

## F07 — Result Screen & Recommendation

**Overall health: 🟠 important**

### Issue 18 — DESIGN.md token violation: hard-coded hex color in histogram
- **Category**: C (cross-spec contradiction)
- **Severity**: Important
- **Location**: F07 histogram-impl.tsx line 157: `fill="#6B4423"`
- DESIGN.md mandates that no hard-coded hex values be used — all color references must use CSS custom property tokens. `#6B4423` is `--color-primary` in DESIGN.md. Using a hex literal in Recharts `Bar fill` prop is a known gotcha (Recharts doesn't accept CSS variable strings directly). The spec should address this: either pass `getComputedStyle(document.body).getPropertyValue('--color-primary')` or use the hex as a constant derived from the design token. But the spec presents the hex as the final code without any acknowledgment of this DESIGN.md rule.
- **Recommendation**: Add a note that this is a known Recharts limitation; use `const PRIMARY_COLOR = '#6B4423'` as an explicit constant with a comment pointing to the DESIGN.md token, and add it to the DESIGN.md token violation audit in F10. 10 min.

### Issue 19 — `--text-h3` token used for D50 display but DESIGN.md assigns `--text-h2` to numeric
- **Category**: C (cross-spec contradiction)
- **Severity**: Minor
- **Location**: F07 result.tsx line 270: `<p className="text-h2 numeric"` — this is correct. BUT the DESIGN.md Section 3 line 93 says `--text-h3` is for "D50 숫자 강조", while the wireframe at lines 237-238 says D50 should use `--text-h2`. The two sections of DESIGN.md contradict each other. F07 correctly follows the wireframe (`--text-h2`) but the typography scale description says `--text-h3`. This causes confusion about the ground truth.
- **Recommendation**: DESIGN.md Section 3 typography scale description for `--text-h3` should be corrected — "D50 숫자 강조" should say "서브 헤딩" only. F07 is correct as-is. Flag for DESIGN.md correction. 5 min.

### Issue 20 — `extractDiameters(result.stats)` called but never defined in spec
- **Category**: E (missing detail)
- **Severity**: Important
- **Location**: F07 result.tsx line 282: `<Histogram diameters={extractDiameters(result.stats)} />`
- The `extractDiameters()` function is called but never defined or imported anywhere in the F07 spec. `ParticleStats` stores D10/D50/D90/Fines%/Uniformity counts but NOT the raw diameter array. Recharts histogram needs the raw array. This means either: (a) `PipelineResult` needs to include the raw diameter array (a significant F06 change), or (b) `extractDiameters` reconstructs buckets from percentile stats (lossy, not a real histogram). This is a significant missing piece.
- **Recommendation**: Either add `diameters: number[]` to `PipelineResult` (F06 change needed) or specify that the histogram uses pre-bucketed data from stats. The current spec silently drops the raw data after statistics are computed. Needs cross-spec coordination with F06. Important — ~45 min to design + specify correctly.

### Issue 21 — `toolFitness` "suboptimal" is never truly "wrong" — `wrong` case is dead code
- **Category**: B (internal contradiction)
- **Severity**: Minor
- **Location**: F07 recommendation/matrix.ts lines 77-83
- The `toolFitness` function signature returns `'optimal' | 'suboptimal' | 'wrong'` but the implementation comment at line 82 says "단순화: optimal 아니면 suboptimal" — so `'wrong'` is declared in the return type but never returned. The TypeScript type would allow callers to check for `'wrong'` and never find it. This is dead code in the type definition.
- **Recommendation**: Either remove `'wrong'` from the return type or implement the differentiation. The matrix.ts unit tests also don't test the `'wrong'` case. 10 min.

### Issue 22 — Histogram `min/max` calculation fails when `diameters` has 1 element
- **Category**: E (missing detail)
- **Severity**: Minor
- **Location**: F07 histogram-impl.tsx lines 143-148
- When `diameters.length === 1`, `binWidth = (max - min) / bins = 0 / 20 = 0`. Every `filter` condition becomes `d >= min + 0` AND `d < min + 0` which is `d < min` — false for the single element, so all bins are 0. The histogram renders empty. The 위험/함정 section mentions "입자 수 < 50 → bins=20 부적절" (line 412) but the actual degenerate case of a single diameter (or min===max) causes a div-by-zero-like binWidth=0 issue that makes the chart entirely blank.
- **Recommendation**: Guard `if (binWidth === 0) return [{ range: Math.round(min), count: diameters.length }]` as a single-bar fallback. 5 min.

**Estimated fix effort**: Issue 20 (missing extractDiameters) is ~45 min cross-spec. Others ~30 min.

---

## F08 — Storage & Exit Modal

**Overall health: 🟡 minor**

### Issue 23 — `grinderMemo` Phase 1 field added to schema now — migration path undefined
- **Category**: D (scope creep / YAGNI)
- **Severity**: Minor
- **Location**: F08 storage/db.ts line 53: `grinderMemo?: string; // Phase 1 필드 (지금 추가, 나중 활용)`
- Adding a field "for future use" to a IndexedDB schema at v1 is typically harmless since IndexedDB does store extra properties. However, the spec states `DB_VERSION = 1` and the migration guide says "스키마 v2 마이그레이션 비용 줄이기 위함". If `grinderMemo` is already in v1, adding Phase 1 features to it requires a v2 schema anyway (to add indexes, etc.). The pre-emptive addition provides minimal benefit and documents an unstated future intent in the schema. This is a YAGNI violation.
- **Recommendation**: Note this explicitly as a conscious YAGNI exception with justification, or remove it and accept the minor migration cost later. 5 min decision.

### Issue 24 — Thumbnail blob URL revocation not specified
- **Category**: G (risk underestimation)
- **Severity**: Important
- **Location**: F08 stores/history.store.ts lines 247-252 and 위험/함정 line 350
- The 위험/함정 section mentions `revokeObjectURL` risk but the actual `loadThumbnail` implementation never calls `URL.revokeObjectURL`. The `remove()` action at lines 256-263 deletes the URL from the Map but does NOT call `URL.revokeObjectURL(url)` before deletion. This is a memory leak. The spec acknowledges it as a risk but the proposed implementation code doesn't fix it.
- **Recommendation**: Add `URL.revokeObjectURL(url)` in the `remove()` action before removing from the Map. Also add cleanup on component unmount for displayed thumbnails. Needs spec code update. 15 min.

### Issue 25 — `listRecordsMeta` cursor approach won't scale: no pagination
- **Category**: A (hidden assumption)
- **Severity**: Minor
- **Location**: F08 storage/records.ts lines 99-119
- The acceptance criterion (line 308) says "100건 이상 시 가상 스크롤" but `listRecordsMeta()` loads ALL records into memory on every call. With 100 records × ~1KB meta each, that's ~100KB in memory — acceptable, but the spec treats the full in-memory load as solved. For Phase 1 growth (500+ records), this will become a problem. The spec doesn't note this limitation or plan for pagination.
- **Recommendation**: Add a note to the 위험/함정 section about the full-scan limitation. Add a `limit` parameter stub for future pagination. 10 min.

**Estimated fix effort**: ~30 min total (issue 24 is most important)

---

## F09 — Telemetry + Permission UX + Review Polish

**Overall health: 🟠 important**

### Issue 26 — CF Workers deployment is not "polish" — it's a separate infra task
- **Category**: D (scope creep / task classification error)
- **Severity**: Important
- **Location**: F09 산출물 lines 33-37: "Cloudflare Workers (별도 배포, 코드는 worker/index.ts 또는 README)"
- F09 is described as "D10 UX 다듬기 + 권한 거부 플로우 + 종료 모달 + 텔레메트리". Deploying a Cloudflare Workers instance requires: creating a CF account (if not exists), setting up KV namespace, deploying the worker, configuring CORS, testing with curl, and validating from the Toss WebView origin. This is not a polish task — it's a distinct infra deployment step. If this step fails or is delayed, the entire D10 day is blocked.
- The spec's acceptance criterion (line 269): "CF Workers 엔드포인트 배포 (Cloudflare 무료 티어) + KV 카운터 동작 — 수동 검증" — this is a blocking criterion for D10 that has no contingency.
- **Recommendation**: Separate the CF Workers deployment into its own sub-task within D10 with an explicit contingency: "If SDK analytics available (D1 결과), skip CF Workers deployment entirely." Add an estimate: CF Workers setup is 1-3 hours if unfamiliar. Flag as "needs D1 decision gate." 20 min spec edit.

### Issue 27 — Exit modal text verification assumes Toss guide page is stable
- **Category**: A (hidden assumption)
- **Severity**: Important
- **Location**: F09 components/exit-modal.tsx lines 192-194: `EXIT_MODAL_TEXT.title = '커피렌즈를 종료할까요?'`
- plain.md Section 4-3 line 115 gives the exact text: `"커피렌즈를 종료할까요? / 취소 / 종료하기"`. This was already specified in plain.md. F09 confirms this text is correct by presenting it as the final implementation. However, the 위험/함정 section (line 306) correctly notes the guide can change. The spec says "D10 검증 시점의 가이드 URL + 캡처 스크린샷 기록" but does not specify WHERE to record it — just "ALGORITHM_NOTES 또는 별도 문서". F10's acceptance criteria (line 130) then references `docs/inspection-evidence.md` as the target. This is a three-spec chain with no single owner for the task.
- **Recommendation**: F09 수용 기준 should explicitly own the inspection-evidence.md creation (not leave it to F10). One-line clarification. 5 min.

### Issue 28 — `sendBeacon` sends JSON string but Content-Type is missing
- **Category**: E (missing detail)
- **Severity**: Minor
- **Location**: F09 telemetry/cf-workers-adapter.ts line 137: `navigator.sendBeacon(ENDPOINT, JSON.stringify(payload))`
- `navigator.sendBeacon` with a plain string sends it as `text/plain` content type. The CF Workers handler (line 165) calls `request.json()` which will fail with a parse error if the body isn't received as `application/json`. The `fetch` fallback correctly sets `Content-Type: application/json`, but `sendBeacon` does not. This will cause silent failures in the primary send path when `sendBeacon` is available.
- **Recommendation**: Use a `Blob` with explicit MIME type: `navigator.sendBeacon(ENDPOINT, new Blob([JSON.stringify(payload)], { type: 'application/json' }))`. 5 min.

**Estimated fix effort**: ~45 min total (issue 28 is a real bug; issue 26 needs planning attention)

---

## F10 — Test Hardening & Code Review

**Overall health: 🟡 minor**

### Issue 29 — OpenCV.js test environment decision deferred without a decision
- **Category**: A (hidden assumption) / E (missing detail)
- **Severity**: Important
- **Location**: F10 위험/함정 line 155: "jsdom 에서 OpenCV.js 동작 안 함 → fixture 회귀 테스트는 vitest browser mode 또는 Playwright. vitest 단위는 logic 만"
- The regression tests (`tests/opencv/regression.test.ts`) call `runPipeline(loadFixture(...), signal)` which requires OpenCV.js to be loaded. The spec says "vitest browser mode 또는 Playwright" but doesn't decide between them, and doesn't specify how `loadFixture` works in a browser mode context (file system access vs. HTTP fetch). This is a blocked decision that prevents F10's most important acceptance criterion ("그라운드 트루스 회귀 테스트 5/5 통과") from being implemented without further design work.
- **Recommendation**: Decide between vitest browser mode and Playwright at spec time. Add the decision to F10 (or F06 where regression.test.ts is first created). Also define how `loadFixture()` accesses the fixture files in browser mode. Needs ~1h separate mini-design.

### Issue 30 — `docs/self-inspection.md` references a `Section 17` with 16 failure modes counted
- **Category**: B (internal contradiction)
- **Severity**: Minor
- **Location**: F10 self-inspection.md template line 88: "Failure Modes Registry 16개 모두 처리 — tests/opencv 회귀 테스트 통과"
- plain.md Section 11 Failure Modes Registry lists exactly 16 rows. However, `tests/opencv` regression tests only cover the anchor D50 accuracy path — they do NOT cover all 16 failure modes. Most failure modes (no_coin, multi_coin, partial_coin, blur, low_brightness, etc.) are tested via synthetic fixture unit tests in F04/F05, not via regression.test.ts. The self-inspection template entry's evidence link (`tests/opencv 회귀 테스트 통과`) is misleading — it implies regression tests cover all 16 modes.
- **Recommendation**: Update the evidence link to point to the full test suite (`npm test` output) rather than just regression tests. 5 min.

### Issue 31 — No mention of `lib/image-downsample.ts` in test coverage targets
- **Category**: E (missing detail)
- **Severity**: Minor
- **Location**: F10 커버리지 목표 lines 38-43 and plain.md Section 13 unit test priority table
- plain.md Section 13 explicitly lists `lib/image-downsample.ts` in the unit test priority table with specific test cases. F10's coverage targets list does NOT include `lib/` in the coverage targets (only `opencv/*`, `recommendation/*`, `storage/*`, `components/*`, `routes/*`). This module is in the blind spot.
- **Recommendation**: Add `lib/*` to F10 coverage targets with ★★ priority. 5 min.

**Estimated fix effort**: ~25 min for spec edits; issue 29 needs a separate mini-design session.

---

## F11 — Validation, Beta & Submission

**Overall health: 🟡 minor**

### Issue 32 — Beta recruitment has no fallback for < 5 testers
- **Category**: A (hidden assumption) / G (risk underestimation)
- **Severity**: Minor
- **Location**: F11 위험/함정 line 184: "베타 5명 모집 어려움 → D13 시작 전에 미리 섭외"
- The acceptance criterion (line 142) requires "베타 5명 모두 최소 3회 측정 사용" to pass D13~17. If only 3-4 testers are available or one drops out, the acceptance criterion technically fails. There is no stated fallback (e.g., "4명 이상이면 진행, 2명이 Android 포함 시 허용").
- **Recommendation**: Add a minimum viable beta criterion: "최소 4명 (iOS ≥ 1, Android ≥ 1, 저사양 ≥ 1) 으로도 진행 가능; 5명 목표는 권장 기준." 5 min.

### Issue 33 — D18 submission specifies `v1.0.0-rc1` tag but no tagging procedure
- **Category**: E (missing detail)
- **Severity**: Minor
- **Location**: F11 D18 체크리스트 line 131: "git commit + tag `v1.0.0-rc1`"
- This is the first mention of git tagging in any spec. There is no procedure for what the commit should contain, what branch to tag from, or whether this tag triggers any deployment process. For a solo developer this is probably fine, but leaving it as a single bullet without context is a minor spec gap.
- **Recommendation**: Add a one-line note: "main 브랜치 최신 커밋에 태깅. 검수 통과 후 `v1.0.0` 으로 promote." 2 min.

### Issue 34 — Kill switch implementation not specified, only mentioned
- **Category**: E (missing detail)
- **Severity**: Minor
- **Location**: F11 위험/함정 line 189: "Kill switch 셋업 권장 (plain.md Section 16). CF Workers 무료 티어로 가능"
- plain.md Section 16 has a kill switch design (1-byte CF Workers endpoint `/maintenance`). F11 should include this in D18 산출물 (or at least F09's CF Workers deployment should include it). Currently it appears only in the 위험/함정 sections of both F09 and F11 as a recommendation without a concrete owner.
- **Recommendation**: Add kill switch endpoint as a concrete item in F09's CF Workers code (a 5-line addition to `worker/index.ts`) and reference it from F11's D18 체크리스트. 15 min across both specs.

**Estimated fix effort**: ~25 min total

---

## Cross-Spec Issues

### Issue 35 — CRITICAL: `diameters: number[]` missing from PipelineResult
- **Category**: B / C (cross-spec contradiction)
- **Severity**: Critical
- **Location**: F06 pipeline.ts `PipelineResult` interface (no `diameters` field) ↔ F07 result.tsx line 282 `extractDiameters(result.stats)` call
- As noted in Issue 20, the histogram in F07 needs raw particle diameters, but F06's `PipelineResult` only exposes aggregated stats (D10/D50/D90/Fines%/Uniformity/particleCount). The raw `diameters: number[]` array is computed in `statistics.ts` but is NOT passed into `PipelineResult`. This is a cross-spec blocker — F07 cannot build the histogram without this data.
- **Recommendation**: Add `diameters: number[]` to `ParticleStats` (F06) and propagate it through `PipelineResult`. This requires coordinated updates to F06 and F07. ~45 min to specify correctly.

### Issue 36 — Fixture naming inconsistency: F06 ALGORITHM_NOTES references `grind-anchor-{NNN}` (correct) but F05 test comment says "no-coin 변형" (old terminology)
- **Category**: F (stale references)
- **Severity**: Minor
- **Location**: F05 tests line 194 comment vs. F00 fixture strategy
- Already captured as Issue 11. Cross-referencing here for completeness.

### Issue 37 — F03 `no-direct-mat` rule vs. F05 `new cv.MatVector()` direct call
- **Category**: B / C (cross-spec contradiction)
- **Severity**: Important
- **Location**: F03 eslint-rules/no-direct-mat.ts (BLOCKED list includes MatVector) ↔ F05 particle-segment.ts lines 103-104 `new cv.MatVector()` and `new cv.Mat()`
- Already captured as Issue 13. Cross-referencing here for completeness. This will cause a lint error unless the exception is specified.

---

## Prioritized Fix List (Top 10)

| Priority | Issue | Feature | Category | Severity | Estimated Effort |
|---|---|---|---|---|---|
| 1 | **Issue 35 + 20**: `diameters: number[]` missing from PipelineResult — histogram will not compile | F06 + F07 | B/C | Critical | 45 min |
| 2 | **Issue 14**: Hard-coded `meanBrightness: 150` / `laplacianVariance: 300` in pipeline.ts — confidence score always uses placeholder values, passes all unit tests silently | F06 | B/G | Critical | 45 min |
| 3 | **Issue 13 + 37**: `new cv.MatVector()` / `new cv.Mat()` in particle-segment.ts bypasses `no-direct-mat` ESLint rule with no specified exception | F05 | B/C | Important | 20 min |
| 4 | **Issue 7**: OpenCV CDN hard-coded single URL with no code-level fallback — 3 retries hit same broken URL | F03 | A/G | Important | 30 min |
| 5 | **Issue 9**: `stopStream()` called but never defined — camera stream leaks | F03 | E | Important | 15 min |
| 6 | **Issue 28**: `sendBeacon` sends JSON as `text/plain` — CF Workers `request.json()` will fail | F09 | E | Important (bug) | 5 min |
| 7 | **Issue 24**: Thumbnail blob URLs never revoked on record deletion — memory leak | F08 | G | Important | 15 min |
| 8 | **Issue 29**: OpenCV regression test environment (jsdom vs. vitest browser mode vs. Playwright) unresolved — F10's most critical acceptance criterion is blocked | F10 | A/E | Important | needs mini-design |
| 9 | **Issue 26**: CF Workers deployment framed as "polish" — is a blocking infra task with no contingency if D1 shows SDK analytics available | F09 | D | Important | 20 min spec edit |
| 10 | **Issue 18**: Hard-coded hex `#6B4423` in Recharts histogram violates DESIGN.md token rule | F07 | C | Important | 10 min |

---

## Issues Not in Top 10 (Minor / Housekeeping)

| Issue | Feature | Est. |
|---|---|---|
| Issue 1 — exit-modal.tsx dual ownership | F01 | 5 min |
| Issue 2 — SDK nav fallback unspecified | F01 | 15 min |
| Issue 3 — `router.back()` not caught by ESLint rule | F01 | 15 min |
| Issue 4 — Empty state duplicate caption in HomeRoute | F02 | 5 min |
| Issue 5 — F03 missing from F02 Blocks | F02 | 2 min |
| Issue 6 — `useHistoryStore` referenced before F08 | F02 | 10 min |
| Issue 8 — `endsWith` filename match fragility | F03 | 5 min |
| Issue 10 — Portrait lock missing from camera.tsx | F03 | 10 min |
| Issue 11 — `no-coin.synth.jpg` wrong fixture for `no_particles` test | F05 | 20 min |
| Issue 12 — `SANITY_MIN_AREA_RATIO` undocumented basis | F05 | 10 min |
| Issue 15 — `low_particles` in AnalysisError is wrong type | F06 | 15 min |
| Issue 16 — ALGORITHM_NOTES placeholder "예: 725" | F06 | 2 min |
| Issue 17 — AbortSignal not checked post-watershed | F06 | 5 min |
| Issue 19 — DESIGN.md `--text-h3` description contradicts wireframe | F07 | 5 min |
| Issue 21 — `'wrong'` dead code in toolFitness return type | F07 | 10 min |
| Issue 22 — Histogram `binWidth=0` when `min===max` | F07 | 5 min |
| Issue 23 — `grinderMemo` YAGNI field | F08 | 5 min |
| Issue 25 — No pagination in `listRecordsMeta` | F08 | 10 min |
| Issue 27 — inspection-evidence.md ownership spread across F09/F10 | F09 | 5 min |
| Issue 30 — Self-inspection evidence link misleading | F10 | 5 min |
| Issue 31 — `lib/image-downsample.ts` missing from coverage targets | F10 | 5 min |
| Issue 32 — Beta minimum viable tester count | F11 | 5 min |
| Issue 33 — git tag procedure unspecified | F11 | 2 min |
| Issue 34 — Kill switch has no concrete owner | F11 | 15 min |

---

## Appendix: Severity Counts

| Severity | Count |
|---|---|
| Critical | 3 (Issues 14, 35 effectively one cross-spec issue + Issue 14) |
| Important | 14 |
| Minor | 17 |
| **Total** | **34** |

> Note: Issues 35+20 are the same underlying cross-spec problem counted once as Critical.
> Effective Critical count: 2 independent critical issues (diameters gap, placeholder values).
