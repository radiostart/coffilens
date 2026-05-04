# 커피렌즈 (Coffilens)

> 동전 하나로 분쇄도 진단 — 카메라로 보는 핸드드립 분쇄도 분석 토스 미니앱

**Document Version**: v6 (디자인 리뷰 반영)
**Last Updated**: 2026-05-01
**Changes from v5**: DESIGN.md 신설 / Brand identity 정의 / 화면별 정보 위계 wireframe / 상태 시각 사양 / User journey 매핑 / Portrait lock + a11y 사양 / 신뢰도 가로 바 + inline data list 결정

**Changes 2026-05-01 (Option A)**: 추출 도구 선택 (V60/Kalita 등) → 기준 동전 선택 (100원/500원) 로 교체. 도구별 추천 매트릭스 제거, 결과 화면이 순수 측정값 표시. `src/recommendation/` 삭제. 사유: 도구별 추천이 절대 권장값 인상 → 검수 책임 소재 / 사용자 클레임 위험. 동전 선택은 F04 직경 환산 정확도 (오선택 시 ±10% 편향) 회피용.

**Changes 2026-05-01 (Phase 2 광고 위치)**: IAA 배너 2곳 결정 — **결과 화면 하단** + **홈 화면 하단**. SDK 내장 `useTossBanner` (`@apps-in-toss/web-framework`) 사용, 외부 광고 SDK 통합 불요. 인트로/로딩/모달 노출 절대 금지 ([Section 4-5](#4-5-광고-phase-2-진입-시)) 유지. Phase 0/1 출시에는 광고 X — Phase 2 진입 시점에 사업자 등록 + 활성화. 빈 상태 홈 (측정 기록 0건) 에서의 광고 노출 여부는 Phase 2 베타에서 결정 (현재 default: 노출).

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| **앱명 (한글)** | 커피렌즈 |
| **앱명 (영문)** | Coffilens |
| **부제** | 동전 하나로 분쇄도 진단 |
| **카테고리** | 비게임 (라이프스타일/푸드) |
| **타겟** | 토스 유저 중 홈브루잉 핸드드립 입문~중급자 (만 19세 이상) |
| **핵심 가치** | 100/500원 동전만 있으면 1분 안에 분쇄도 진단 + 레시피 코칭 |
| **수익 모델** | Phase 0~1 무료 / Phase 2부터 IAA 배너 검토 |
| **플랫폼** | 앱인토스 미니앱 (WebView 기반) |
| **사업자 등록** | 불필요 (수익화 단계 진입 시 등록) |

> ⚠️ **연령 제약**: 앱인토스는 현재 만 19세 이상만 이용 가능. 마케팅 카피에서 "20대 직장인" 같은 톤 활용

---

## 2. 토스 콘솔 등록 카피

### 부제 (12자)
```
동전 하나로 분쇄도 진단
```

### 상세 설명 (공식 등록용, ~240자)
```
분쇄 커피 위에 동전을 두고 촬영하면, 동전 크기를 기준으로 원두
입자 크기를 mm 단위로 분석해줘요. 100원 또는 500원 중 사용한
동전을 미리 선택하면 직경 기준으로 정확하게 환산해요. 분석
결과 화면에서 입자 크기 분포 히스토그램과 신뢰도 점수를 볼 수
있어요. "기록 저장" 버튼을 누르면 측정 결과가 저장되고, 홈에서
이전 측정 기록을 다시 볼 수 있어요. 모든 이미지 분석은 단말
안에서만 처리되고 서버로 전송되지 않아요.
```

---

## 3. 기술 스택 (개발 가이드 기준)

### 클라이언트 (필수)
- **빌드 환경**: Vite + React + TypeScript (가이드 권장)
- **앱인토스 SDK**: `@apps-in-toss/web-framework` **SDK 2.x** ⚠️ 필수
  - SDK 1.x는 2026년 3월 23일 이후 콘솔 업로드 차단됨
  - SDK 2.x로만 시작
  - **D1에 SDK 제공 컴포넌트 우선 조사** (nav-bar, exit-modal 등 자체 구현 전)
- **이미지 처리**: OpenCV.js (lazy load, ~8MB)
- **차트**: Recharts (히스토그램, 결과 화면 진입 시 동적 import)
- **상태 관리**: Zustand
- **라우터**: Wouter (~2KB) — hash 기반, 토스 백버튼 호환 양호
- **테스트**: Vitest + @testing-library/react
- **Lint 룰**: ESLint custom rule — 자체 뒤로가기 버튼 사용 차단 (검수 반려 단골)

### 백엔드
- Phase 0~1: **없음** (전부 클라이언트 처리)
- 단, **익명 텔레메트리**는 토스 SDK 내장 분석 API 우선 시도, 없으면 Cloudflare Workers + KV (무료 티어, 외부 통신 사유 명시)
- Phase 2~: 통계 수집/원두 추천 시 Rails on Railway 추가

### 빌드 설정 예시 (`vite.config.ts`)
```ts
import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'coffilens', // 토스 콘솔에 등록한 앱 이름과 일치 필수
  brand: {
    displayName: '커피렌즈',
    primaryColor: '#6B4423', // 커피 톤 (확정 시 업데이트)
  },
});
```

### 사용자 식별 (선택)
- 비게임 미니앱도 **SDK로 유저 식별키(hash)** 발급 가능 (서버 불필요)
- 측정 기록을 디바이스 로컬 + 유저 hash 키로 저장 → 디바이스 변경 시 복구 가능
- 토스 로그인 약관 동의 플로우 없이 식별 가능 (이탈률 ↓)

---

## 4. 토스 미니앱 검수 체크리스트 (비게임) ⚠️ 핵심

> 검수 반려 사유 대부분이 이 항목들에서 나옴. **개발 시작 전 반드시 숙지**.

### 4-1. 인트로 화면 (브릿지 뷰)
- [ ] 앱 진입 시 **앱 이름 + 로고 + 대표 색상**이 보이는 브릿지 뷰 정상 동작
- [ ] Basic / Inverted 중 미니앱 분위기에 맞는 스타일 선택
- [ ] 인트로에서 즉시 토스 로그인 유도 금지 → **서비스 설명 먼저**

### 4-2. 내비게이션 바 (앱인토스 비게임 표준)
- [ ] **좌측**: 뒤로가기 버튼(`<`) — 모든 화면에서 정상 동작
- [ ] **중앙**: 브랜드 로고 + 미니앱 이름
- [ ] **중앙(선택)**: 홈 버튼
- [ ] **우측(선택)**: 미니앱 기능 버튼 — **최대 1개**
- [ ] **더보기(⋯)** 버튼: 토스 공통 기능(신고, 공유) 제공
- [ ] ❌ **토스 내비게이션 뒤로가기 + 자체 뒤로가기 버튼 동시 노출 금지** (대표 반려 사유)
- [ ] **ESLint 커스텀 룰로 자체 뒤로가기 버튼 추가 차단** (D2 셋업, `eslint-rules/no-custom-back-button.ts`)
  - AST 매칭: `history.back()`, `history.go(-1)`, `<button>`/`<Link>` 텍스트가 `["뒤로", "이전", "←", "<"]` 패턴
  - 솔로 프로젝트 단순화 옵션: 정규식 grep 기반 lint 스크립트 (~10 LOC) 도 충분
- [ ] 닫기 버튼과 뒤로가기 버튼 동작이 명확

### 4-3. 종료 동작
- [ ] **최초 화면에서 뒤로가기** → 미니앱 종료
- [ ] **AOS 시스템 백버튼**으로도 최초 화면에서 종료 가능
- [ ] 종료 시 확인 모달: `"커피렌즈를 종료할까요? / 취소 / 종료하기"`
- [ ] **D10에 토스 비게임 가이드 문서와 모달 텍스트 정확히 일치하는지 검증** (반려 단골)

### 4-4. UX 제약
- [ ] 미니앱 진입 즉시 바텀시트 자동 오픈 금지
- [ ] 화면 전환 시 바텀시트로 행동 강제 유도 금지
- [ ] CTA 버튼만 봐도 다음 행동 예측 가능해야 함
- [ ] **자사 서비스/앱 설치 유도 링크 금지** ⚠️ 외부 쇼핑몰도 불가
- [ ] 모든 화면에서 미니앱을 나갈 수 있는 명확한 경로 존재

### 4-5. 광고 (Phase 2 진입 시)
- [ ] 인앱 광고는 **인트로/로딩/컷신/팝업 모달**에 노출 금지
- [ ] 광고 사전 로딩 (재생 시점에 실시간 로딩 X)
- [ ] 광고 종료 후 미니앱 화면으로 정상 복귀

### 4-6. 카메라 권한 (커피렌즈 핵심)
- [ ] **iOS**: 토스 앱 자체의 카메라 권한이 켜져 있어야 미니앱에서도 사용 가능
- [ ] **Android**: WebView 카메라 권한은 별도 처리 필요할 수 있음 — D1에 검증
- [ ] 권한 거부 시 사용자에게 명확한 안내 + 설정 진입 유도 화면 제공

### 4-7. 외부 통신 사유 (텔레메트리 추가 시)
- [ ] 토스 SDK 내장 분석 API 사용 시 → 별도 사유 불필요 (D1에 확인)
- [ ] Cloudflare Workers fallback 시 → 검수 콘솔에 "익명 사용 통계 수집 (개인정보 미수집)" 명시
- [ ] 전송 데이터 명세: `{event_type, success, fail_reason, device_class, timestamp}` 만 — 이미지·위치·식별값 절대 미포함

---

## 5. 핵심 화면 플로우

```
[인트로/브릿지뷰] (커피렌즈 + 로고 + 대표컬러)
  └─ [홈]
      ├─ "분쇄도 측정하기" CTA
      ├─ 측정 기록 (있으면) — 첫 진입 시 빈 상태 안내 카드
      │   └─ 가상 스크롤 + thumbnail lazy load (N+1 방지)
      ├─ 기준 동전 선택 (100원 / 500원) ← Option A 변경 (2026-05-01)
      └─ [Phase 2] IAA 배너 (하단, useTossBanner)
          └─ [촬영 가이드 안내]
              - 흰 종이 위에 얇게 펴기
              - 선택한 동전 1개를 같이 놓기
              - 균일한 조명
              - 동전이 화면 안에 완전히 보이도록
              └─ [카메라 촬영 화면]
                  - 동전 위치 가이드 박스 오버레이
                  - 밝기 체크 (어두우면 reject + 후레쉬 권유)
                  └─ [분석 중] (~3초, 진행률 0~100% + 취소 버튼)
                      - AbortSignal 단계 간 체크 (취소 시 즉시 중단)
                      └─ [결과 화면]
                          - D50 (헤드라인) + 보조 문구
                          - **신뢰도 점수 (X/10)** 가로 바 — 입자수+동전신뢰도+밝기 종합
                          - 히스토그램
                          - inline data list (D10/D90/Uniformity/Fines%)
                          - 신뢰도/입자수 경고 (있을 때만)
                          - "100원 인식됨 (24mm)" 검출 동전 메타
                          - 📌 디스클레이머: "측정값은 상대 비교용입니다. 절대값으로 단정하지 마세요."
                          ├─ [측정 기록 저장]
                          └─ [Phase 2] IAA 배너 (하단, useTossBanner)
```

### 상태 커버리지 매트릭스

| 화면 | LOADING | EMPTY | ERROR | SUCCESS | PARTIAL |
|---|---|---|---|---|---|
| 인트로 | 스플래시 | N/A | 권한 미허용 안내 | 진입 | N/A |
| 홈 | 짧은 스켈레톤 | "첫 측정을 시작하세요" 카드 | 측정 기록 로드 실패 안내 | 정상 | N/A |
| 촬영 가이드 | N/A | N/A | 권한 거부 → 설정 진입 | 진입 | N/A |
| 분석 중 | 진행률 + 취소 버튼 | N/A | 동전/입자 검출 실패 → 재촬영 가이드 | 결과로 이동 | 사용자 취소 → 홈 복귀 |
| 동전 선택 | N/A | N/A | N/A | 100원 / 500원 카드 | N/A |
| 결과 | N/A | N/A | 저장 실패 → 재시도 | 정상 | 신뢰도 < 5 → 경고 배지 |

---

## 6. 이미지 처리 파이프라인

```
0. 이미지 다운샘플링
   - 입력 1080×1920 → 긴변 1280px로 리사이즈 (canvas API)
   - WebView 메모리 피크 ~150MB → ~70MB로 절감
   - 분석 정확도 영향 없음 (입자 크기 충분히 분리됨)
   - lib/image-downsample.ts

1. 입력 검증
   - 밝기 히스토그램 → 평균 밝기 < 80 → "더 밝은 곳에서" reject + 후레쉬 권유
   - 모션 블러 감지 (Laplacian variance < 임계값)

2. 동전 검출
   - cv.HoughCircles → 원형 후보 검출
   - 검출 결과 분기:
     * 0개 → "동전이 보이지 않아요" reject (AnalysisError: no_coin)
     * 1개 → 진행
     * 2개+ → "동전 1개만 놓아주세요" reject (multi_coin)
     * 화면 가장자리에 잘림 → "동전을 화면 안에 완전히 넣어주세요" reject (partial_coin)
   - 반지름 → 100원(12mm)/500원(13.25mm) 자동 판별
   - mm/pixel 환산 계수 산출
   - 검출된 동전 종류 결과 화면 출력 ("100원 인식됨 (24mm)")
   - opencv/coin-detect.ts

3. 입자 영역 추출
   - 동전 마스킹 + 주변 5mm 마진 추가 마스킹 (경계 입자 왜곡 방지)
   - Adaptive threshold (gaussian, blockSize=51, C=10)
   - Morphological opening (커널 3x3) → 노이즈 제거
   - opencv/particle-segment.ts

4. 입자 분리 (Watershed)
   - distance transform → 시드 추출 → markers
   - cv.watershed() 적용
   - **Sanity check**: 전체 입자 면적 / 동전 면적 비율 < 0.5% 또는 단일 거대 입자 > 50% → "분쇄가 안 된 것 같아요" reject

5. 측정
   - 각 contour 면적 → 등가 직경 (equivalent diameter)
   - μm 단위 변환
   - 100μm 미만은 노이즈로 간주 (필터)
   - 검출 입자 수 < 50 → low_particles 플래그 (신뢰도 점수에 반영)

6. 통계
   - D10, D50, D90 percentile
   - **Division by zero 가드**: 빈 배열 → throw, D10=0 → uniformity 무한대 방지
   - Fines% = (300μm 미만 입자 면적) / (전체 면적, 분모 0 가드)
   - Uniformity = D90 / D10 (D10>0 보장)
   - opencv/statistics.ts

7. 신뢰도 점수 산출
   - 입력: 동전 검출 신뢰도(0~1) + 입자 수(50/200/500 단계) + 밝기 적정도(0~1) + 블러 점수
   - 출력: 0~10 스케일
   - 결과 카드에 "신뢰도 8/10" 형태 표시
   - < 5점 시 "신뢰도가 낮아요. 더 밝은 곳에서 재측정 권장" 배지
   - opencv/confidence.ts

### Mat Lifecycle 패턴 (★ 메모리 누수 방지)

OpenCV.js의 `cv.Mat`/`cv.MatVector` 등은 **WASM 힙 할당, GC 대상 아님**. `.delete()` 누락 시 영구 누수 → 100건 측정 후 WebView 크래시.

```typescript
// opencv/mat-pool.ts
export class MatScope {
  private mats: cv.Mat[] = [];
  track<T extends cv.Mat>(m: T): T {
    this.mats.push(m);
    return m;
  }
  dispose() {
    this.mats.forEach(m => m.delete());
    this.mats = [];
  }
}

// 사용 예
async function detectCoin(src: cv.Mat) {
  const scope = new MatScope();
  try {
    const gray = scope.track(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    // ... 모든 임시 Mat은 scope.track()
    return result;
  } finally {
    scope.dispose();
  }
}
```

**ESLint 커스텀 룰**: `new cv.Mat()`/`new cv.MatVector()` 직접 호출 차단 → `scope.track()` 강제. 신규 코드의 누수 구조적 차단.

### AbortSignal 통합 (분석 취소)

```typescript
// opencv/pipeline.ts
async function runPipeline(src: cv.Mat, signal: AbortSignal): Promise<Result> {
  signal.throwIfAborted();
  const downsampled = await downsample(src);

  signal.throwIfAborted();
  const coin = await detectCoin(downsampled);
  await Promise.resolve(); // microtask 양보

  signal.throwIfAborted();
  const particles = await segmentParticles(downsampled, coin);
  // ... 단계 사이마다 체크
}
```

`cv.watershed()` 자체는 동기 WASM이라 중간에 못 자름. 단계 *사이*에서 체크. 취소 시 즉시 다음 단계 진입 안 함.

### 알고리즘 노트 작성 (D7 종료 시 책임 명시)
- 파라미터(blockSize, C, watershed seed 등) 튜닝 이력
- 그라운드 트루스 anchor 검증 결과 (manifest 기반)
- Phase 1 본인이 6개월 후 자기 자신을 위해

---

## 7. 추천 룰베이스 매트릭스 — **Option A 로 폐기 (2026-05-01)**

> ⚠️ **이 섹션은 더 이상 적용되지 않음**. 2026-05-01 결정으로 추출 도구 선택 + 도구별 추천 매트릭스를 모두 제거하고, 결과 화면을 **순수 측정값 표시** 로 단순화. 코드 측에서도 `src/recommendation/` 디렉토리 전체 삭제됨 ([F07-result-recommendation.md](features/F07-result-recommendation.md) 참조).
>
> **이유**:
> - 도구별 추천이 "정확한 권장값" 인상을 주면 검수에서 책임 소재 우려
> - 사용자 클레임 위험 (실제 추출 결과는 원두/물/온도/그라인더 차에 따라 달라짐)
> - 사용자가 동전 종류 선택만 정확히 하면 측정값 자체는 신뢰도 높음
>
> **대체**: 결과 화면이 D50/D10/D90/Uniformity/Fines%/신뢰도 만 표시. 디스클레이머는 유지. Phase 1 베타 피드백에서 "숫자만으로 가치 부족" 판명 시 정적 가이드 테이블(푸어오버 0.6~0.9mm 등) 추가 검토.
>
> **후속 (2026-05-02, Phase 1 선제 도입)**: "숫자만 가치 부족" 우려를 베타 D13~17 피드백 기다리지 않고 선제 대응. **정적 가이드 테이블 3 카테고리** (미세/중간/거침) 도입 — 4-카테고리 (350/500/800) 는 측정 ±200μm 편향으로 boundary mis-classification 빈번해 3-카테고리 (500/900) 로 단순화. 카테고리 내 brewing 추천은 4-도구 (에스프레소/모카포트/핸드드립/프렌치프레스) 모두 노출 (primary/secondary/avoid 분기). 도구별 (V60/Kalita/Chemex 등) 세분화는 의도적으로 안 함. 임계값은 **표준 sieve 기준 (Hoffmann/SCA 등 외부 reference)** 그대로 사용 — 우리가 결정/조정 X. 측정 정확도는 image→sieve calibration layer 로 align ([F06 추가 섹션](features/F06-statistics-confidence.md)). 가이드 자체 spec 은 [F07 추가 섹션](features/F07-result-recommendation.md) ("정책 변경 4가지" SSOT).

<details>
<summary>이전 v5 매트릭스 (참고용 — 적용 안 됨)</summary>

### 분쇄도 진단 (D50 기준)

| D50 (μm) | 진단 | 적정 추출법 |
|---|---|---|
| < 500 | 매우 곱음 | 에스프레소/모카포트 |
| 500–650 | 곱은 편 | Clever, 융드립 |
| 650–800 | V60 적정 | V60, Origami |
| 800–950 | 굵은 편 | Kalita Wave, Chemex |
| > 950 | 매우 굵음 | 프렌치프레스, 콜드브루 |

### 균일도 (D90/D10)

| Uniformity | 평가 | 액션 |
|---|---|---|
| < 3.0 | 매우 균일 | 그라인더 좋음, 레시피 자유롭게 |
| 3.0–5.0 | 양호 | 일반적인 레시피 OK |
| > 5.0 | 편차 큼 | 저온 추출 / 짧은 추출시간으로 보완 |

### Fines 비율 (<300μm 면적%)

| Fines% | 평가 | 액션 |
|---|---|---|
| < 10% | 깨끗함 | 표준 레시피 |
| 10–15% | 보통 | 블루밍 30초 충분히 |
| > 15% | 채널링 위험 | 블루밍 짧게(15초), 약하게 푸어, 침지 비율↑ |

</details>

---

## 8. 개발 일정 (18일 + 베타 + 반려 사이클)

| Day | 작업 |
|---|---|
| **D0** | **프리체크**: 토스 콘솔 가입 + 미니앱 등록 + "커피렌즈" 이름 선점 확인 + **anchor fixture 1장 준비** (sieve 분급 → `fixtures/grind-anchor-{NNN}.jpg` + `manifest.json`). Reject fixture 는 F04 에서 합성 (디자인 spec: docs/superpowers/specs/2026-05-01-f00-fixture-strategy-design.md) |
| **D1** | `npx create-ait-app` 스캐폴드 + SDK 2.x 설치 + 샌드박스 카메라 권한 검증 (iOS/AOS) + **토스 SDK 내장 분석 API + nav-bar/exit-modal 컴포넌트 조사** |
| **D2** | 인트로/브릿지뷰 + 비게임 표준 nav-bar (SDK 우선, 자체 fallback) + **ESLint 커스텀 룰 셋업** + primaryColor 확정 |
| **D3** | 홈 화면 (빈 상태 카드) + **기준 동전 선택 (100원/500원)** + 촬영 가이드 + Wouter 라우터 셋업 |
| **D4** | OpenCV.js loader (다운로드 실패 fallback + 진행률) + **MatScope 패턴 셋업** + 카메라 컴포넌트 + 권한 추상화 |
| **D5** | 이미지 다운샘플링 + mm/pixel 캘리브레이션 + 입력 검증 (밝기/블러) + **동전 검출 (0/1/2+/잘림 + 컵받침 노이즈) + 그라운드 트루스 회귀 테스트** |
| **D6** | 입자 세그멘테이션 (threshold + watershed + 5mm 마진 + watershed sanity check + 메모리 OOM fallback) |
| **D7** | 통계 산출 (division by zero 가드 포함) + **신뢰도 점수 산출 로직** + AbortSignal 통합 + **알고리즘 노트 작성 (필수)** |
| **D8** | 결과 화면 (히스토그램 lazy import + 검출 동전 종류 + 신뢰도 가로 바 + inline data list + 디스클레이머) — **순수 측정값 표시, 도구별 추천 없음 (Option A)** |
| **D9** | 측정 기록 저장 (SDK 유저 hash + IndexedDB 스키마 + 가상 스크롤 + 쿼터 자동 정리) + 종료 모달 |
| **D10** | UX 다듬기 + 권한 거부 플로우 + **종료 모달 텍스트 토스 가이드 정확 매치** + 자가 검수 체크리스트 + 텔레메트리 셋업 |
| **D11** | opencv/* 단위 테스트 마무리 + 자체 검수 체크리스트 + 코드 리뷰 (DRY 정리) |
| **D12** | 샌드박스 + 토스 앱 QR 실기기 테스트 (iOS + AOS 각 1대 이상) |
| **D13-17** | **베타 테스트 5일** — 지인 5명 (성인) 실기기 사용 + 피드백 수집 + 버그 수정 |
| **D18** | 검수 요청 제출 |
| **+α** | **검수 반려 대응 — 보통 1~2회, 회당 5~10일 소요. 출시 목표일 역산 시 +14일 여유 권장** |

### 샌드박스 테스트 환경 설정
- **iPhone**: 로컬 서버와 같은 와이파이 + "로컬 네트워크" 권한 허용
- **Android**: USB 연결 + `adb reverse tcp:8081 tcp:8081` + `adb reverse tcp:5173 tcp:5173`

### 베타 테스트 체크리스트 (D13~17)
- [ ] iOS 사용자 ≥ 2명 (Safari WebView 기반)
- [ ] Android 사용자 ≥ 2명 (다양한 제조사)
- [ ] 저사양 기기 ≥ 1대 (3년 이상 경과 폰) — 분석 시간·메모리 검증
- [ ] anchor + 베타 사진 D50 일관성 검증 (Phase 1 자연 추가)
- [ ] 권한 거부 → 재허용 플로우 사용자 막힘 없는지
- [ ] 종료 모달 + 백버튼 동작 일관성
- [ ] 100건+ 측정 후 메모리 누수 없는지 (Mat lifecycle)

---

## 9. Phase 로드맵

### Phase 0 — MVP 출시 (현재)
- 분쇄도 분석 + 룰베이스 추천 + **신뢰도 점수**
- 무료, 광고 없음, 사업자 등록 불필요
- 익명 텔레메트리로 측정 성공률·실패 사유 수집

### Phase 1 — UX 고도화 (수집 데이터 기반)
- 그라인더 프리셋 저장 (Varia, 1Zpresso 등) — Phase 0 측정 데이터 활용
- 측정 히스토리 + SDK 유저 hash로 디바이스 간 복구
- 추출 결과 메모 + 분쇄도 상관관계
- **추천 피드백 루프** ("맛있었어요/아니에요" 버튼) → 추천 정확도 개선
- D50/Uniformity/Fines% **인포 버튼** 추가
- **다중 프레임 평균** (자동 3장 촬영)
- **결과 공유 카드** (검수 정책 확인 후)
- 추천 정확도 다듬기 (단변수 → 종합 점수)
- Playwright E2E 도입 검토

### Phase 2 — 수익화
- 사업자 등록 (광고 수익 발생 시점 필수)
- **IAA 배너 2곳** — 결과 화면 하단 + 홈 화면 하단
  - SDK: `useTossBanner` (`@apps-in-toss/web-framework` 내장, 외부 광고 SDK 불요)
  - 결과 화면: 측정 저장 버튼 아래, 디스클레이머 sticky 와 별도 영역
  - 홈 화면: 측정 기록 리스트 아래 (또는 빈 상태 카드 아래)
  - 빈 상태 (측정 기록 0건) 노출 여부: Phase 2 베타 결정 (default 노출)
  - 인트로/로딩/모달/분석중/촬영중 노출 절대 X ([Section 4-5](#4-5-광고-phase-2-진입-시))
- 전면형 광고는 UX 해치니까 보류
- 백엔드 분리 (Rails on Railway) — 분석을 서버로 이전, OpenCV.js 의존 해소
- **익명 데이터 풀링 옵트인** — 사용자 동의 기반 ML 학습 자산

### Phase 3 — 차별화 (선택)
- 분석 결과 기반 원두/도구 큐레이션
- **토스페이/IAP 인앱 결제** 연동 (외부 쇼핑몰 유도 불가, 인앱 완결 필수)

---

## 10. 리스크 & 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| **WebView 카메라 권한 (iOS/AOS 차이)** | 치명 | D1에 양쪽 실기기 검증, 권한 거부 플로우 사전 설계 |
| **OpenCV Mat 메모리 누수** | 치명 | MatScope (RAII) 패턴 강제 + ESLint 룰로 직접 호출 차단 |
| **검수 반려 (내비게이션 바 위반)** | 높음 | 자체 뒤로가기 버튼 절대 추가 X — SDK 표준만 사용, **ESLint 룰로 코드 레벨 차단** |
| **검수 반려 (종료 모달 텍스트)** | 높음 | D10에 토스 비게임 가이드 문서와 1:1 매칭 |
| **인트로 화면 누락** | 높음 | 브릿지뷰를 D2에 먼저 구현 |
| **OpenCV.js 다운로드 실패 (8MB)** | 높음 | 진행률 표시 + 재시도 버튼 + 네트워크 끊김 안내 + CDN 캐싱 |
| **저사양 폰 UI 프리즈** | 중 | 진행률 0~100% 표시 + 취소 버튼 + AbortSignal + requestIdleCallback + 이미지 다운샘플링 |
| **동전 오인식 (컵받침 등 노이즈)** | 중 | 0/1/2+/잘림 분기 모두 처리, 검출 동전 종류 화면 표시, 동전 신뢰도 점수 활용 |
| **사용자 촬영 표준화 실패** | 중 | 가이드 오버레이 강제, 밝기/블러 자동 reject |
| **Watershed 결과 이상 (분쇄 안 됨/단일 거대 입자)** | 중 | sanity check (입자 면적 비율) → reject |
| **Division by zero (D10=0, 빈 배열)** | 중 | statistics.ts 가드 + 단위 테스트 경계값 |
| **AbortSignal 좀비 작업** | 중 | 단계 사이 throwIfAborted + microtask 양보 |
| **Fines 검출 한계 (폰 카메라 해상도)** | 중 | <100μm는 측정 불가 명시, 핸드드립 영역(600~900μm)은 충분 |
| **측정 결과 신뢰도 의심 / 클레임** | 중 | 신뢰도 점수 표시 + "상대 비교용" 디스클레이머 결과 화면 영구 노출 |
| **앱 이름 선점 가능성** | 중 | "커피렌즈" 토스 미니앱 검색에서 미리 확인 |
| **연령 19+ 제한** | 저 | 마케팅 톤을 성인 사용자 대상으로 (홈카페/오피스카페 키워드) |

---

## 11. Failure Modes Registry

> Section 6 파이프라인의 모든 실패 모드 + 사용자/저장 레이어 실패 모드. 처리 안 된 실패 모드는 검수 반려 + 사용자 신뢰 손실 직결.

| 코드패스 | 실패 모드 | Day | 처리 방식 | 사용자가 보는 것 | 처리 경로 (구현) | 로깅 |
|---|---|---|---|---|---|---|
| OpenCV.js 다운로드 | CDN 실패, 네트워크 끊김 | D4 | 재시도 버튼 + 진행률 + 안내 | "OpenCV 로드 실패. 와이파이 확인 후 재시도" | loader.ts 재시도 ×3 + 진행률 콜백 | telemetry |
| **Mat 메모리 누수 (100건+)** | .delete() 누락 | D4 | **MatScope (RAII) + ESLint 룰** | (방지 — 누수 자체 발생 X) | mat-pool.ts MatScope + eslint-rules | — |
| 카메라 권한 거부 | iOS/AOS 거부 | D10 | 안내 화면 + 설정 진입 | "카메라 권한이 필요해요" 카드 + 버튼 | lib/permissions.ts 추상화 | telemetry |
| 동전 검출 0개 | 동전 미배치, 너무 어두움 | D5 | reject + 재촬영 가이드 | "동전이 보이지 않아요" | AnalysisError: no_coin | telemetry |
| 동전 검출 2개+ | 100원+500원 동시 배치 | D5 | reject + 가이드 | "동전 1개만 놓아주세요" | AnalysisError: multi_coin | telemetry |
| 동전 부분 잘림 | 화면 가장자리 | D5 | reject + 가이드 | "동전을 화면 안에 완전히 넣어주세요" | AnalysisError: partial_coin | telemetry |
| **동전 노이즈 오인식 (컵받침)** | 원형 노이즈 → 잘못된 mm/pixel | D5 | 동전 신뢰도 점수 → 낮으면 신뢰도 카드 반영 | "신뢰도 X/10" + 경고 배지 | confidence.ts 동전 신호 | telemetry |
| Watershed 결과 0개 | 너무 곱은 분쇄, 종이만 | D6 | reject + 안내 | "입자가 검출되지 않았어요" | AnalysisError: no_particles | telemetry |
| **Watershed sanity 실패** | 단일 거대 입자, 면적 비율 < 0.5% | D6 | reject + 안내 | "분쇄가 안 된 것 같아요. 갈아주세요" | particle-segment.ts sanity check | telemetry |
| 검출 입자 < 50개 | 통계 신뢰도 부족 | D7 | 신뢰도 점수에 반영 + 경고 배지 | 신뢰도 카드 < 5점 + "재측정 권장" | confidence.ts 입자 수 신호 | telemetry |
| **Division by zero (D10=0, 빈 배열)** | 입자 통계 가드 | D7 | throw → reject 처리 | "분석 실패" + 재촬영 가이드 | statistics.ts 가드 + 단위 테스트 | telemetry |
| **AbortSignal 좀비 작업** | 사용자 취소 시 다음 단계 진입 | D7 | 단계 사이 throwIfAborted | (사용자 체감 X — 즉시 중단) | pipeline.ts AbortSignal 통합 | — |
| IndexedDB 쿼터 초과 | 누적 100건+ 시 | D9 | 가장 오래된 기록 자동 삭제 + 안내 | "오래된 측정 기록을 정리했어요" | storage/quota.ts navigator.storage | telemetry |
| 메모리 부족 (큰 사진) | 다운샘플링에도 OOM | D6 | 다운샘플링 강화 후 재시도, 실패 시 안내 | "사진 크기가 너무 커요. 다시 촬영해주세요" | AnalysisError: memory_oom | telemetry |
| 밝기 부족 | 평균 < 80 | D5 | reject + 후레쉬 권유 | "더 밝은 곳에서 촬영해주세요 / [후레쉬 켜기]" | AnalysisError: low_brightness | telemetry |
| 모션 블러 | Laplacian variance 낮음 | D5 | reject | "흔들렸어요. 폰을 고정하고 다시 촬영해주세요" | AnalysisError: blur | telemetry |

> 모든 reject는 명확한 다음 액션 + 재시도 경로 제공. Silent failure 0건이 목표.
> AnalysisError discriminated union 단일 진실 (errors.ts) → switch exhaustive 체크로 신규 에러 추가 시 컴파일러 강제.

---

## 12. 디렉토리 구조

```
src/
├── main.tsx
├── App.tsx                       # router root
├── routes/                       # 화면 단위
│   ├── intro.tsx                 # 브릿지 뷰
│   ├── home.tsx                  # CTA + 측정 기록
│   ├── coin-select.tsx           # 100원 / 500원 (Option A)
│   ├── capture-guide.tsx
│   ├── camera.tsx                # 카메라 + 가이드 박스
│   ├── analyzing.tsx             # 진행률 + 취소
│   └── result.tsx                # 결과 + 신뢰도 + 디스클레이머
├── opencv/                       # ⚠️ 가장 위험한 모듈 — 메모리 관리 핵심
│   ├── loader.ts                 # lazy load + retry + 진행률 콜백
│   ├── mat-pool.ts               # ★ MatScope (RAII)
│   ├── pipeline.ts               # 6단계 통합 + AbortSignal 지원
│   ├── coin-detect.ts            # HoughCircles + 0/1/2+/잘림 분기 (사용자 지정 coinType 사용)
│   ├── particle-segment.ts       # threshold + watershed + 5mm 마진 + sanity
│   ├── statistics.ts             # D10/D50/D90/Fines%/Uniformity (zero 가드)
│   ├── confidence.ts             # 신뢰도 점수 (0~10)
│   └── errors.ts                 # AnalysisError discriminated union
# (recommendation/ 디렉토리는 Option A 로 삭제됨 — Section 7 참조)
├── stores/
│   ├── measurement.store.ts      # 현재 측정 (transient, Zustand)
│   └── history.store.ts          # IndexedDB 동기화 (meta + thumbnails 분리)
├── storage/
│   ├── db.ts                     # IndexedDB 초기화 + 마이그레이션 + 스키마
│   ├── records.ts                # CRUD
│   └── quota.ts                  # navigator.storage.estimate + 자동 정리
├── telemetry/
│   ├── client.ts                 # interface
│   ├── toss-adapter.ts           # SDK 분석 API 어댑터
│   ├── cf-workers-adapter.ts     # Cloudflare Workers fallback
│   └── events.ts                 # 이벤트 타입 정의
├── components/
│   ├── nav-bar.tsx               # 토스 비게임 표준 (SDK 컴포넌트 우선)
│   ├── exit-modal.tsx            # 종료 확인 (텍스트 정확 매치)
│   ├── confidence-bar.tsx        # 가로 바 (Section 19-7)
│   ├── disclaimer-banner.tsx     # 영구 노출
│   ├── histogram.tsx             # Recharts wrapper (lazy)
│   └── coin-overlay.tsx          # 카메라 가이드 박스
├── lib/
│   ├── image-downsample.ts       # canvas 기반 1280px 리사이즈
│   ├── result.ts                 # Result<T, E> 패턴 (선택)
│   └── permissions.ts            # 카메라 권한 추상화
└── eslint-rules/
    └── no-custom-back-button.ts  # ★ 커스텀 룰

tests/                            # vitest + @testing-library
├── opencv/
│   ├── coin-detect.test.ts       # 그라운드 트루스 + 노이즈 케이스
│   ├── particle-segment.test.ts  # sanity check 포함
│   ├── statistics.test.ts        # division by zero 가드
│   └── confidence.test.ts        # 신호 조합 매트릭스
# (tests/recommendation/ 는 Option A 로 삭제됨)
├── storage/quota.test.ts
├── eslint-rules/no-custom-back-button.test.ts
└── TEST_PLAN.md                  # 본인 D5 시점 참조용

fixtures/                         # 회귀 테스트 anchor + 합성 reject
├── grind-anchor-{NNN}.jpg        # sieve 분급 anchor (NNN = mesh 페어 midpoint, 예: 725)
├── manifest.json                 # 메타데이터 (ground truth, 촬영 정보)
└── synthetic/                    # F04 가 anchor 로부터 생성
    ├── no-coin.synth.jpg         # 동전 마스킹
    ├── two-coins.synth.jpg       # 동전 복제
    ├── partial-coin.synth.jpg    # 우측 25% crop
    └── cup-edge.synth.jpg        # 큰 호 합성
```

### 모듈 책임 요약

- **opencv/**: 가장 위험한 영역. MatScope 강제, AbortSignal 통합, AnalysisError 단일 진실. 모든 단계 단위 테스트 ★★★ 목표.
- **stores/**: measurement (transient) vs history (persistent) 분리. history는 meta + thumbnails 슬라이스 분리 (N+1 방지).
- **storage/**: IndexedDB 추상화. 쿼터 관리, 마이그레이션 책임.
- **telemetry/**: Adapter 패턴. D1 조사 후 한쪽 어댑터 삭제 가능.
- **components/**: SDK 제공 컴포넌트 우선. 자체 구현은 fallback.
- **eslint-rules/**: 검수 안전망 코드 레벨.

---

## 13. 테스트 전략

### 적용 수준
**그라운드 트루스 fixture + opencv/* 단위** (CEO+엔지니어링 리뷰 결정. recommendation 단위 테스트는 Option A 로 폐기 — Section 7 참조)

### Test Pyramid

```
                     /\
                    /  \      E2E (Playwright) — Phase 1 검토
                   /    \     베타 5명 수동으로 D13~17 대체
                  /------\
                 /        \   Integration — Anchor 회귀
                /          \  (1 anchor + 4 합성 reject × 전체 파이프라인)
               /------------\
              /              \  Unit ★★★
             /                \  opencv/* + storage/quota +
            /------------------\ eslint-rules
```

### Anchor 회귀 테스트 (D5 ~ D7 진행)

Anchor fixture 1장이 알고리즘의 D50 절대 정확도를 회귀 잠금. 단조성 / 다른 그라인더 / 다른 폰 검증은 베타 D13~17 이후 자연 추가 (Phase 1).

```typescript
// tests/opencv/regression.test.ts
import manifest from '../../fixtures/manifest.json';

describe('Anchor regression', () => {
  for (const fx of manifest.fixtures.filter(f => f.kind === 'anchor')) {
    it(`${fx.file} → D50 ${fx.ground_truth_d50_um}±${fx.tolerance_um}μm`, async () => {
      const result = await runPipeline(loadFixture(fx.file), new AbortController().signal);
      expect(Math.abs(result.stats.d50 - fx.ground_truth_d50_um)).toBeLessThan(fx.tolerance_um);
    });
  }
});
```

> manifest 기반 동적 루프 — Phase 1 에서 베타 사진 fixture 가 추가되면 테스트 코드 변경 없이 자동 포함.

### Reject 케이스 테스트

```typescript
// F04 의 scripts/build-reject-fixtures.ts 가 anchor 로부터 합성한 4개를 manifest 에서 로드
import manifest from '../../fixtures/manifest.json'; // 앞 Anchor 블록과 동일

const rejects = manifest.fixtures.filter(f => f.kind === 'reject');
// 두 가지 entry shape:
//   throw 케이스: { expected_error: 'no_coin' | 'multi_coin' | 'partial_coin' }
//   신뢰도 케이스: { expected_low_confidence: true } — cup-edge 처럼 통과하되 신뢰도 낮음
```

### 단위 테스트 우선순위 (★★★ 목표)

| 모듈 | 케이스 |
|---|---|
| `statistics.ts` | 빈 배열 throw / 단일 값 / 정렬 + percentile / D10=0 가드 / 분모 0 가드 |
| `confidence.ts` | 모든 신호 양호 → 10 / 입자 < 50 → 점수 ↓ / 밝기 경계 / 모든 신호 나쁨 → 0 |
| `storage/quota.ts` | navigator.storage.estimate mock, 임계 (90%) 초과 → cleanup |
| `lib/image-downsample.ts` | 1080×1920 → 1280px / 정사각형 / 이미 1280 미만 / 메모리 free |
| `eslint-rules/no-custom-back-button.ts` | RuleTester 양성/음성 케이스 |

### 커버리지 목표

```
COVERAGE TARGET (D11 종료 시점):
  opencv/*              ★★★ 모든 분기 + 에러 + 엣지 케이스
  storage/*             ★★  쿼터 + 정상 CRUD
  components/*          ★   smoke (렌더링)
  routes/*              수동 베타 (D13~17) 위주
```

E2E는 Phase 1로 deferred. 베타 5명 수동 검증으로 충분.

---

## 14. 메모

- 동전은 100원(24mm)보다 **500원(26.5mm)** 추천 — 검출 안정성 좋고 fines 영역 더 잘 분리됨
- 흰 A4 용지 권장. 검은 종이는 명암 대비는 좋지만 fines가 종이 결과 헷갈림
- 테스트 케이스 확보: anchor 1장 (sieve 분급) + 합성 reject (F04에서 생성). D0 에 anchor 만 완료
- 추출 결과 피드백 루프 → 추천 정확도 개선 (Phase 1)
- "커피렌즈"는 분쇄도 외에도 추출 분석, 원두 인식, 라떼아트 평가로 확장 가능
- API 키는 `.env` 파일로 분리 + `.gitignore` 등록 완료

---

## 15. 관측성 / 텔레메트리 전략

### 원칙
- Phase 0 클라이언트 단독 → 사용자 행태 파악 불가가 기본값
- **최소한의 익명 텔레메트리**로 측정 성공률·실패 사유는 반드시 수집
- 개인정보·이미지·위치 정보 절대 미수집

### 우선순위 결정 (D1 조사)
1. **1순위**: 토스 SDK 내장 분석 API 사용 (가능 시) — 별도 외부 통신 사유 불필요
2. **Fallback**: Cloudflare Workers + KV (무료 티어) — 검수 콘솔에 외부 통신 사유 명시

### Adapter 패턴 (telemetry/client.ts)

```typescript
export interface TelemetryClient {
  track(event: TelemetryEvent): void;  // fire-and-forget
}

export async function createClient(): Promise<TelemetryClient> {
  const tossSDK = await tryLoadTossAnalytics();
  return tossSDK ?? new CloudflareWorkersAdapter();
}
```

D1 조사 결과에 따라 어댑터 1개만 살리고 다른 거 삭제 가능.

### 수집 이벤트 (telemetry/events.ts)

```typescript
export type TelemetryEvent =
  | { type: 'measurement_attempt'; toolKind: string }
  | { type: 'measurement_success'; durationMs: number; confidence: number; coinType: '100' | '500' }
  | { type: 'measurement_fail'; failReason: AnalysisError['kind']; durationMs: number };

// 디바이스 클래스는 자동 추가
type DeviceClass = 'ios_high' | 'ios_low' | 'android_high' | 'android_low';
```

### 모니터링 대시보드 (Phase 0 최소)
- 일일 측정 시도 / 성공 / 실패 카운트
- 실패 사유별 분포 (no_coin / multi_coin / blur / no_particles 등)
- 디바이스 클래스별 평균 분석 시간
- **임계치 알람**: 측정 성공률 < 70% / OpenCV 로드 실패율 > 5% / 평균 분석 시간 > 8초

---

## 16. 배포·롤아웃 체크리스트

### 검수 제출 전 (D11~D18)
- [ ] 자가 검수 체크리스트 100% 통과
- [ ] 베타 5명 5일 사용 + 피드백 반영 완료
- [ ] Anchor 회귀 테스트 통과 (D50 ± tolerance, manifest 정의값)
- [ ] 텔레메트리 엔드포인트 동작 확인
- [ ] 종료 모달 텍스트 토스 가이드 1:1 매칭
- [ ] 100건+ 측정 메모리 누수 없음 (Mat lifecycle)
- [ ] ESLint 룰 통과 (자체 뒤로가기 차단)

### 검수 통과 직후 (배포 1일차)
- [ ] 5분 후: 텔레메트리 첫 이벤트 수신 확인
- [ ] 1시간 후: 측정 시도 카운트 정상, 실패율 임계치 미만
- [ ] 24시간 후: 측정 성공률 70% 이상 / 디바이스별 분포 확인 / 클레임 대시보드 확인

### Kill Switch (선택, 권장)
- Cloudflare Workers에 1바이트 응답 엔드포인트 (`/maintenance` → "0" 또는 "1")
- 클라이언트 진입 시 체크 → "1" 시 점검 안내 화면
- 치명적 버그 발견 시 검수 재제출 없이 즉시 차단 가능

---

## 17. 출시 전 체크리스트

### 등록/네이밍
- [ ] "커피렌즈" 이름 중복 확인 (토스 미니앱 검색)
- [ ] Coffilens 도메인 / SNS 핸들 확보 (선택)
- [ ] 토스 콘솔 미니앱 등록 + appName 결정

### 콘솔 입력
- [ ] 부제 / 상세 설명 입력
- [ ] 아이콘 (렌즈 + 원두 모티브)
- [ ] 카메라 권한 사유 문구
- [ ] (텔레메트리 추가 시) 외부 통신 사유 명시

### 코드 (검수 대응 핵심)
- [ ] **SDK 2.x 사용 확인**
- [ ] 인트로 브릿지뷰 정상 동작
- [ ] 비게임 표준 내비게이션 바 적용 (SDK 우선, 자체 fallback)
- [ ] **ESLint 룰: 자체 뒤로가기 버튼 사용 차단** (D2)
- [ ] 자체 뒤로가기 버튼 미사용 (SDK 표준만)
- [ ] 종료 모달 텍스트 정확히 일치 (D10 가이드 매칭)
- [ ] AOS 시스템 백버튼 동작
- [ ] 외부 링크 / 자사 앱 유도 0개
- [ ] 카메라 권한 거부 시 안내 화면

### Failure 처리
- [ ] Section 11 Failure Modes Registry 16개 항목 모두 처리
- [ ] 모든 reject 화면에 다음 액션 + 재시도 경로
- [ ] AnalysisError discriminated union switch exhaustive
- [ ] 신뢰도 점수 < 5 시 경고 배지 노출
- [ ] 결과 화면에 "상대 비교용" 디스클레이머 영구 노출

### 메모리 관리
- [ ] **MatScope 패턴 강제 사용** (모든 opencv/* 모듈)
- [ ] **ESLint 룰**: `new cv.Mat()` 직접 호출 차단
- [ ] 100건+ 측정 후 메모리 누수 없음 (베타 검증)

### 보안
- [x] **API 키 .env로 분리 + .gitignore 등록** (완료)

### 테스트
- [ ] Anchor 회귀 테스트 통과 (manifest 동적 루프)
- [ ] opencv/* 단위 테스트 ★★★ (모든 분기 + 엣지)
- [ ] recommendation/matrix 경계값 단위 테스트 통과
- [ ] storage/quota 임계 시나리오 테스트
- [ ] ESLint 룰 단위 테스트 (양성/음성)
- [ ] 샌드박스 앱에서 전체 플로우 통과
- [ ] 토스 앱 QR 테스트 (실기기, iOS + AOS 각 1대)
- [ ] **베타 5명 5일** 피드백 반영 완료
- [ ] 자가 검수 체크리스트 100% 통과 후 제출

### 관측성
- [ ] 텔레메트리 엔드포인트 동작 확인 (D1 조사 결과 따라 SDK 또는 CF Workers)
- [ ] 임계치 알람 셋업
- [ ] (선택) Kill switch 엔드포인트 셋업

---

## 18. 의사결정 보류

### Resolved (v6)
- ✅ 폰트: Pretendard Variable ([DESIGN.md](DESIGN.md))
- ✅ Spacing scale: 4px base ([DESIGN.md](DESIGN.md))
- ✅ Motion tokens 정의됨 ([DESIGN.md](DESIGN.md))
- ✅ Border radius / elevation 정의됨 ([DESIGN.md](DESIGN.md))
- ✅ Brand identity: 친근한 코치 톤 ([DESIGN.md:Section 1](DESIGN.md))
- ✅ Phase 2 광고 위치: 결과 화면 하단 + 홈 화면 하단 2곳 ([Section 9 Phase 2](#9-phase-로드맵))
- ✅ Phase 2 광고 SDK: `useTossBanner` (`@apps-in-toss/web-framework` 내장)
- ✅ Brand icon: 디자인 + 토스 콘솔 업로드 완료 (2026-05-02)
- ✅ Anchor fixture: F00 D0 시점 anchor 1점 확보 + 개발 중 추가 fixture 보강 진행 중 ([F11 Phase 1 — Phase 2 sieve fixture 4종](features/F11-validation-submission.md))

### Open
- [ ] 그라인더 프리셋 - 기본 제공할 모델 리스트 (Varia, 1Zpresso, Comandante, Timemore 등)
- [ ] 추출 레시피 출처/신뢰도 (Tetsu Kasuya 4:6, Lance Hedrick, James Hoffmann 등에서 기본형 참고)
- [ ] 대표 색상 `#6B4423` 가안 → D2에 최종 확인 (DESIGN.md 적용 후 시각 검증)
- [x] ~~Brand icon 디자인 (카메라 렌즈 + 커피 빈)~~ — 2026-05-02 완료, 콘솔 업로드 완료
- [ ] **Empty state 시각** (홈 첫 진입) — 일러스트 vs 아이콘 vs 텍스트만 — D3 결정
- [ ] **Reject 화면 11종 아이콘** (no_coin/multi_coin/blur 등) — Lucide 아이콘 매핑 — D5 결정
- [ ] **Toast 위치** (top vs bottom) — 토스 SDK 제공 시 그것 우선, 없으면 bottom 권장
- [ ] 토스 SDK 내장 분석 API 존재 여부 (D1에 확인)
- [ ] 토스 SDK 내장 nav-bar/exit-modal 컴포넌트 사용 가능 여부 (D1에 확인)
- [ ] Result<T, E> 라이브러리 (neverthrow) 도입 — 본인 취향, 보류
- [ ] 결과 공유 카드 외부 공유 정책 (Phase 1, 검수팀 문의)
- [ ] Image-downsample 추가 단계 (1280 → 720 분석 단계만) — 1280으로 시작 후 실측 결정
- [ ] Dark mode (Phase 1+ 도입 검토)
- [ ] **Phase 2 빈 상태 홈 광고 노출 여부** — default 노출, 베타 결과로 측정 기록 ≥1건 시점에만 노출하도록 조정 검토
- [ ] **Phase 2 광고 단위 발급 시기** — 사업자 등록 후 토스 콘솔에서 광고 단위 발급 → 환경 변수로 주입
- [ ] **광고 SDK 검수 시점** — Phase 2 검수에서 광고 위치 (홈 + 결과 하단) 가 4-5 룰 위반 없는지 사전 확인

---

## 19. Design Decisions (from /plan-design-review)

> [DESIGN.md](DESIGN.md) 가 토큰·컴포넌트·a11y 사양 SSOT. 본 섹션은 plan-level 결정 (위계, 상태 시각, 사용자 journey, 화면 wireframe).

### 19-1. Brand Identity (Pass 4 결정)

**한 문장**: 커피렌즈는 입문~중급 핸드드립 사용자를 위한 친근한 디지털 바리스타.
**톤**: 따뜻하고 권장하는 어조. 전문가 단정 회피.
**시각 언어**: warm cream + coffee brown accent + 충분한 여백.
**Typography**: Pretendard Variable (system-ui 절대 X — AI Slop 방지).

### 19-2. Information Hierarchy Wireframes (Pass 1 결정)

#### 인트로 (브릿지뷰)
```
┌─────────────────────────────┐
│                             │
│                             │
│         ◯ (logo 64px)       │ ← 1차: 로고
│                             │
│       커피렌즈              │ ← 1차: 앱명 (display)
│                             │
│   동전 하나로 분쇄도 진단    │ ← 2차: 부제 (caption)
│                             │
│                             │
└─────────────────────────────┘
1.5초 후 /home 자동 이동
배경: cream
```

#### 홈 (빈 상태 첫 진입)
```
┌─────────────────────────────┐
│ ⋯ 커피렌즈                   │ ← Toss nav (chrome)
├─────────────────────────────┤
│                             │
│  ┌─────────────────────┐    │ ← 1차: hero card
│  │                     │    │
│  │ 첫 측정을 시작해보세요 │    │ ← H2 700
│  │                     │    │
│  │ 분쇄한 원두와 동전을  │    │ ← body
│  │ 같이 촬영하면 분쇄도를 │    │
│  │ 측정해드려요          │    │
│  │                     │    │
│  │ [ 분쇄도 측정하기 ]   │    │ ← CTA primary
│  │                     │    │
│  └─────────────────────┘    │
│                             │
│  아직 측정 기록이 없어요      │ ← caption secondary
│                             │
│ ═══════════════════════════ │
│   [Phase 2] IAA 배너         │ ← 하단 광고 (useTossBanner)
│   광고 영역                   │   Phase 0/1: 표시 X
│ ═══════════════════════════ │
└─────────────────────────────┘
```

> **추가 (2026-05-01, Phase 2 광고)**: 측정 기록 리스트 (또는 빈 상태 캡션) 아래에 IAA 배너. Phase 0/1 출시에는 표시 X. 빈 상태에서도 노출하는 게 default — Phase 2 베타에서 측정 기록 ≥1건 시점에만 노출하도록 변경 검토 (goodwill ↑).

#### 분석 중
```
┌─────────────────────────────┐
│ ⋯ 분석 중                   │
├─────────────────────────────┤
│                             │
│                             │
│   ▓▓▓▓▓▓▓░░░░░ 65%          │ ← 1차: progress bar
│                             │
│   입자 분리 중...           │ ← 2차: 단계 텍스트 (body)
│                             │
│                             │
│        [ 취소 ]              │ ← 3차: secondary button
│                             │
└─────────────────────────────┘
```

#### 결과 (★ 가장 위험한 화면 — Option A 단순화 후)
```
┌─────────────────────────────┐
│ ⋯ 측정 결과                  │ ← Toss nav (chrome)
├─────────────────────────────┤
│                             │
│   D50 720μm                  │ ← 1차 H1 display (32/700, tabular)
│   분쇄 입자 크기 중앙값이에요   │ ← 1차 보조 (--text-body-large)
│                             │
│   ████████░░ 신뢰도 7/10     │ ← 1.5차 confidence bar
│                             │   (DESIGN.md success color)
│                             │
│   ▆▆▆▇▇▇▇▆▅▄ 분포            │ ← 2차 histogram (Recharts)
│                             │
│   D10 480μm · D90 1100μm · 균일도 2.4 · Fines 8% │ ← 3차 inline data list
│                             │   (NOT 4 카드 — Pass 7 결정)
│                             │
│   ⚠️ (있을 때만)             │ ← 3차 경고 (신뢰도 < 5 또는 입자 < 100)
│   "신뢰도가 낮아요…"         │
│                             │
│   📐 100원 인식됨 (24mm) · 분석 1240ms │ ← 3차: 메타 (caption)
│                             │
│ ─────────────────────────── │
│ ⚠️ 측정값은 상대 비교용입니다 │ ← 3차 sticky 디스클레이머
│ ─────────────────────────── │
│                             │
│   [ 측정 저장 ]              │ ← CTA primary
│                             │
│   (저장 후) ✓ Toast + [홈으로] │ ← 도구 chip 제거됨 (Option A)
│                             │
│ ═══════════════════════════ │
│   [Phase 2] IAA 배너         │ ← 하단 광고 (useTossBanner)
│   광고 영역                   │   Phase 0/1: 표시 X
│ ═══════════════════════════ │
└─────────────────────────────┘
```

> **변경 (2026-05-01, Option A)**: "V60 적정" 진단 라벨 → "D50 720μm" 헤드라인 / "📌 V60 추출 시" 추천 섹션 삭제 / "다른 도구로도 보기" chip 그룹 삭제. 도구 의존 메시지 0개, 순수 측정 결과만 표시.

> **추가 (2026-05-01, Phase 2 광고)**: 측정 저장 CTA 아래에 IAA 배너 영역. Phase 0/1 출시 시점에는 표시 X. Phase 2 진입 시 `useTossBanner` 컴포넌트로 활성화.

### 19-3. State Visual Specs (Pass 2 결정)

[Section 5 상태 매트릭스](#5-핵심-화면-플로우) 보강.

| 화면 | 상태 | 시각 사양 |
|---|---|---|
| 인트로 | LOADING | 풀스크린 1.5초 페이드인, cream 배경, 중앙 로고 + 앱명 |
| 인트로 | ERROR (권한 미허용) | 아이콘 + 한 줄 + CTA "설정 열기" |
| 홈 | EMPTY | hero card (W: 92%), `--radius-lg`, 헤드라인 + 부설명 + CTA |
| 홈 | LOADING | top toast 또는 카드 자리 skeleton |
| 홈 | ERROR | 인라인 banner top, error 색, 자동 4초 + 재시도 |
| 촬영 가이드 | ERROR (권한 거부) | 풀스크린 PermissionDeniedScreen (F09 — iOS/AOS 분기) |
| 분석 중 | LOADING | 진행률 바 + 단계 텍스트 + 취소 버튼 |
| 분석 중 | ERROR | **reject 공통 템플릿** (아래) |
| 분석 중 | PARTIAL (취소) | 1초 confirmation → 홈 |
| 결과 | ERROR (저장 실패) | bottom toast (3초) + 재시도, 결과 화면 유지 |
| 결과 | PARTIAL (신뢰도 < 5) | 신뢰도 바 warning color + "재측정 권장" caption |

### 19-4. Reject 공통 템플릿 (Pass 2 결정)

11종 reject (no_coin/multi_coin/partial_coin/blur/no_particles/low_brightness/sanity_fail/memory_oom 등) 모두 동일 템플릿:

```
┌─────────────────────────────┐
│                             │
│                             │
│         ⚠️ (warning)        │ ← icon 64px, warning color
│                             │
│   동전이 보이지 않아요        │ ← H2: 사유
│                             │
│   100원 또는 500원 동전을     │ ← caption: 도움말
│   함께 놓아주세요            │
│                             │
│                             │
│      [ 다시 촬영 ]           │ ← CTA primary
│                             │
│      [ 홈으로 ]              │ ← secondary
│                             │
└─────────────────────────────┘
```

사유별 차이: H2 텍스트 + caption + 아이콘 종류만 (DESIGN.md 컴포넌트 패턴 참조).

### 19-5. User Journey Map (Pass 3 결정)

| Step | User Does | User Feels | Plan Supports |
|---|---|---|---|
| 1. 인트로 (5s) | 앱 진입 | 호기심 | ✅ 브릿지뷰 |
| 2. 홈 빈 상태 | 카드 봄 | "어떻게 시작?" | ✅ Pass 2 hero card |
| 3. 동전 선택 | 100원/500원 클릭 | "내 동전 어느 쪽?" | ✅ 카드에 직경 mm 명시 (Option A) |
| 4. 촬영 가이드 | 4항목 읽음 | "잘 찍을까?" | ⚠️ 예시 사진 보류 (Phase 1) |
| 5. 카메라 | 촬영 | "잘 찍었나?" | ✅ 가이드 박스 |
| 6. 분석 중 (3s) | 대기 | 기대감 | ✅ 진행률 + 단계 |
| 7. 결과 진입 | D50 + 숫자 | "오! 알겠다" | ✅ 19-2 wireframe H1 |
| 8. 결과 상세 | 히스토그램/통계 읽음 | 신뢰 단계 | ✅ 신뢰도 바 + 디스클레이머 |
| 9. 저장 | 버튼 클릭 | 만족 | ✅ Toast + 홈 이동 (Option A — 도구 chip 제거) |
| 10. 재측정 | 다른 다이얼 | 학습 모드 | ✅ Phase 1 히스토리 비교 |

**시간 horizon**:
- **5초 (visceral)**: 인트로 색감/폰트/로고 → DESIGN.md
- **5분 (behavioral)**: 첫 측정 → 결과 → "유용한가" → 19-2 wireframe + reject 친절도
- **5년 (reflective)**: 측정 누적 → 그라인더 발전 회고 → Phase 1 프리셋

### 19-6. Responsive & Accessibility (Pass 6 결정)

#### Responsive
- WebView mobile-only, 375~430px 폭 자연 대응 (`--space-xl` 32px 여백)
- **Portrait lock**: 카메라/분석 화면 — `screen.orientation.lock('portrait')` (지원 시)
- iPhone SE 375px 결과 화면 검증 → D8 베타에서 cramped 여부

#### Accessibility (사양)
- 모든 routes: `<main role="main">` 시맨틱
- nav-bar 백버튼: `aria-label="뒤로"`
- nav-bar ⋯ 버튼: `aria-label="더보기 메뉴"`
- exit-modal: `<dialog aria-modal="true" aria-labelledby="exit-title">` + focus trap (활성 시 첫 버튼 focus)
- 결과 카드 reading order: `aria-label="V60 적정, 분쇄도 720 마이크로미터, 신뢰도 7점 만점 10점"` (시각은 약식, reader 는 풀어쓰기)
- 분석 완료 announcement: `<div role="status" aria-live="polite">분석 완료</div>`
- 저장 toast: `role="status"`
- 수치 reading: `aria-label="분쇄도 720 마이크로미터"` 강제 (시각: `D50 720μm`)
- 색만 의존 X: 신뢰도 바는 색 + 점수 + 길이 3중 표현 (색맹 대응)

상세는 [DESIGN.md Section 11 Accessibility](DESIGN.md) 참조.

### 19-7. Pass 7 결정 정리

- **C 신뢰도 시각화**: 가로 바 + 점수 + DESIGN.md semantic color (≥8 success / 5~7 warning / <5 error)
- **D D50/Uni/Fines 표시**: inline data list (3 카드 X — AI slop 회피)
- **A,B,E,F 보류**: Section 18 의사결정 보류 → open 항목 참조

### 19-8. AI Slop 방어선 점검 결과

| # | 패턴 | 상태 |
|---|---|---|
| 1 | 보라/인디고 그라데이션 | ✅ 회피 (cream + brown) |
| 2 | 3-column icon-circle 그리드 | ✅ 회피 (inline data list 결정) |
| 3 | 콜드 SaaS look | ✅ 회피 (DESIGN.md warm tone) |
| 4 | Centered everything | ✅ 회피 (의도적 left-align body) |
| 5 | Uniform bubbly radius | ✅ 회피 (sm/md/lg/xl 차등) |
| 6 | Decorative blobs | ✅ 회피 |
| 7 | Emoji as design | ⚠️ 디스클레이머 ⚠️ + 추천 📌 + 메타 📐 — 의도적 1~2개 유지, 그 외 SVG icon |
| 8 | Colored left-border cards | ✅ 회피 |
| 9 | Generic copy | ✅ 회피 (specific Korean) |
| 10 | Cookie-cutter rhythm | N/A (앱) |
| 11 | system-ui 메인 폰트 | ✅ 회피 (Pretendard 확정) |

---

## 20. 참고 링크

- [앱인토스 개발자센터](https://developers-apps-in-toss.toss.im/)
- [WebView 튜토리얼](https://developers-apps-in-toss.toss.im/tutorials/webview.html)
- [비게임 출시 가이드](https://developers-apps-in-toss.toss.im/checklist/app-nongame.html)
- [SDK 2.x 마이그레이션 가이드](https://developers-apps-in-toss.toss.im/) (개발자센터 내)
- [개발자 커뮤니티 (검수 사례)](https://techchat-apps-in-toss.toss.im/)
- [OpenCV.js 메모리 관리 가이드](https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html)
