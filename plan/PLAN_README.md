# 커피렌즈 (Coffilens)

> 동전 하나로 분쇄도 진단 — 카메라로 보는 핸드드립 분쇄도 분석 토스 미니앱

---

## 문서 구조

| 파일 | 용도 |
|---|---|
| **[plain.md](./plain.md)** | 마스터 기획서 (v5) — 모든 결정의 출처 |
| **[features/README.md](./features/README.md)** | Feature 분할 인덱스 + 의존성 그래프 |
| **features/F0X-*.md** | Feature 단위 spec (구현 핸드오프용) |
| **.env** | 토스 API 키 (커밋 금지) |

## 작업 순서

1. **기획**: [plain.md](./plain.md) v5 — CEO 리뷰 + 엔지니어링 리뷰 반영 완료
2. **분할**: [features/README.md](./features/README.md) — F00~F11 12개 feature
3. **개발**: 각 feature spec 따라 별도 환경에서 구현 (이 디렉토리는 plan SSOT)

## 주요 결정사항 (v5 시점)

- **풀 클라이언트 처리**: OpenCV.js + WebView, 백엔드 없음 (Phase 0~1)
- **MatScope (RAII)** + ESLint 룰로 메모리 누수 차단
- **AbortSignal** 단계 사이 통합으로 분석 취소
- **AnalysisError discriminated union** 단일 진실
- **그라운드 트루스 fixture + 단위 테스트** 회귀 방어
- **18일 일정** + 베타 5명 5일 + 검수 반려 +14일 여유

## 빠른 참조

- 토스 미니앱 검수 체크리스트: [plain.md Section 4](./plain.md)
- 이미지 처리 파이프라인: [plain.md Section 6](./plain.md)
- Failure Modes Registry (16개): [plain.md Section 11](./plain.md)
- 디렉토리 구조: [plain.md Section 12](./plain.md)
- 테스트 전략: [plain.md Section 13](./plain.md)
