# Features Index — 커피렌즈

마스터 기획서 [plain.md](../plain.md) v6 + [DESIGN.md](../DESIGN.md) 디자인 시스템을 12개 feature 로 분할. 각 spec은 다른 개발 환경/AI 가 단독으로 구현 가능하도록 자기완결적으로 작성됨.

**SSOT 우선순위**: DESIGN.md (토큰·컴포넌트·a11y) > plain.md (스코프·일정·검수·Failure Modes·wireframe) > features/ (구현 핸드오프).

---

## Feature 목록

| ID | 제목 | Day 범위 | 상태 |
|---|---|---|---|
| [F00](./F00-project-setup.md) | Project Setup & Toss Console | D0–D1 | 🟡 미시작 |
| [F01](./F01-navigation-intro.md) | Navigation & Intro Bridge | D2 | 🟡 미시작 |
| [F02](./F02-home-routing.md) | Home & Tool Selection & Routing | D3 | 🟡 미시작 |
| [F03](./F03-opencv-foundation.md) | OpenCV Foundation (loader + MatScope + Camera) | D4 | 🟡 미시작 |
| [F04](./F04-coin-detection.md) | Coin Detection & Calibration | D5 | 🟡 미시작 |
| [F05](./F05-particle-segmentation.md) | Particle Segmentation | D6 | 🟡 미시작 |
| [F06](./F06-statistics-confidence.md) | Statistics + Confidence + AbortSignal | D7 | 🟡 미시작 |
| [F07](./F07-result-recommendation.md) | Result Screen & Recommendation | D8 | 🟡 미시작 |
| [F08](./F08-storage-exit-modal.md) | Storage & Exit Modal | D9 | 🟡 미시작 |
| [F09](./F09-telemetry-polish.md) | Telemetry + Permission UX + Review Polish | D10 | 🟡 미시작 |
| [F10](./F10-test-hardening.md) | Test Hardening & Code Review | D11 | 🟡 미시작 |
| [F11](./F11-validation-submission.md) | Validation, Beta & Submission | D12–D18 | 🟡 미시작 |

상태: 🟡 미시작 / 🟢 완료 / 🔴 블록됨 / 🟠 진행중

---

## 의존성 그래프

```
F00 (Setup) ─┬─→ F01 (Nav) ──┬─→ F02 (Home) ──→ F07 (Result) ──┐
             │                │                                  │
             │                └─→ F03 (OpenCV) ──→ F04 (Coin) ──→ F05 (Particle) ──→ F06 (Stats) ──→ F07
             │                                                                                       │
             └─→ F08 (Storage) ───────────────────────────────────────────────────────────────────→ F08*
                                                                                                     │
                                                                              ┌──────────────────────┘
                                                                              ↓
                                                                            F09 (Polish) ──→ F10 (Tests) ──→ F11 (Submit)

* F07 → F08: 결과 저장 통합 시점
```

### 병렬 가능 lane

- **Lane A (UI)**: F01 → F02 → F07 (디자인/뷰)
- **Lane B (Vision)**: F03 → F04 → F05 → F06 (OpenCV 파이프라인)
- **Lane C (Infra)**: F08 (storage), F09 (telemetry) — 다른 lane과 의존성 적음

솔로 개발자라면 순차 권장 (컨텍스트 스위칭 비용 ↑).
다중 에이전트/팀이면 A/B 병렬 → F07에서 합류, C는 어느 시점에나 OK.

---

## Feature 분할 원칙

1. **자기완결성** — 각 spec은 plain.md를 모르더라도 구현 가능 (필요 컨텍스트 전부 인라인)
2. **수용 기준 명시** — 체크리스트로 "끝"을 정의
3. **테스트 명시** — 어디에 어떤 테스트를 작성할지
4. **검수 영향 명시** — 토스 검수 체크리스트와 매핑
5. **위험 명시** — 알려진 함정과 회피 패턴

---

## 핸드오프 가이드 (다른 시스템/AI 에게)

각 feature spec 의 **"Handoff Notes"** 섹션이 컨텍스트 부트스트랩. spec 만 보고:
- 무엇을 만들지 안다 (목표, 산출물)
- 끝났는지 안다 (수용 기준)
- 안전한지 안다 (테스트, 검수 매핑)
- 함정을 안다 (위험)

마스터 SSOT는 [plain.md](../plain.md). 충돌 시 plain.md 우선.

---

## 진행 상태 업데이트

작업 시작/완료 시 위 표의 "상태" 컬럼만 수정. 별도 도구 없이 grep 으로 진행률 확인 가능:

```bash
grep -c "🟢 완료" features/README.md
```
