# Inspection Submission (D18)

> 토스 콘솔 검수 요청 시 입력한 내용 + 일시 기록. 검수 반려 시 비교용.

---

## 제출 일시

- _D18 제출 시점에 갱신_: `YYYY-MM-DD HH:MM`

## 토스 콘솔 입력값

### 미니앱 정보
- **앱명 (한글)**: 커피렌즈
- **앱명 (영문)**: Coffilens
- **부제 (12자 이하)**: 동전 하나로 분쇄도 진단
- **카테고리**: 비게임 (라이프스타일/푸드)

### 상세 설명 (240자 내외)
plain.md Section 2 텍스트 그대로:

```
핸드드립 분쇄도 분석 서비스

흰 종이 위에 분쇄한 원두와 100원 또는 500원 동전을 함께 놓고
카메라로 촬영하면, 동전을 기준으로 입자 크기를 측정해 분쇄도를
분석해드려요. 분석이 끝나면 입자 크기 분포 그래프와 함께 평균
분쇄도, 균일도, 미분 비율을 한눈에 확인할 수 있어요. 결과
화면에서 V60, 칼리타, 클레버 등 추출 도구별로 현재 분쇄도에
맞는 추천 레시피를 확인하고, 측정 기록을 저장해 그라인더
세팅별로 비교할 수 있어요.
```

### 권한 사유

#### 카메라
> 분쇄한 원두와 동전을 촬영하여 분쇄도를 분석하기 위해 카메라 권한이 필요합니다. 촬영된 이미지는 디바이스 내에서만 처리되며 외부로 전송되지 않습니다.

#### 외부 통신 (4-7)
- **결정**: D1 분류 ⑥ Console-only ([features/F00-investigation.md](../features/F00-investigation.md))
- **외부 도메인 호출 X** — 토스 SDK `eventLog` 만 사용 (CF Workers 폐기)
- **검수 콘솔 외부 통신 사유 입력**: 별도 입력 **불요**

만약 외부 통신 사유 입력 필드가 강제일 경우:
> 측정 분석은 디바이스 내 OpenCV.js 로 수행. 외부 도메인 호출 없음. 토스 내장 분석 API 만 사용 (개인정보·이미지·위치 정보 미수집).

### 아이콘 / 대표 색상
- **primaryColor**: `#6B4423` (DESIGN.md `--color-primary`)
- **icon**: D2 확정 (TODO)

---

## 제출 직전 최종 체크

### 코드 품질 게이트
- [ ] `npm run check` (typecheck + lint + test) 통과
- [ ] 162/162 tests
- [ ] 0 lint, 0 type errors
- [ ] 베타 P0/P1 버그 0개 미해결

### 문서 게이트
- [ ] [docs/self-inspection.md](./self-inspection.md) 100% ✅
- [ ] [docs/inspection-evidence.md](./inspection-evidence.md) 최신 (종료 모달 1:1 매치 캡처 포함)
- [ ] [docs/beta-feedback.md](./beta-feedback.md) D17 마감

### Git tag (sweep Issue 33)
**절차** (D18 검수 제출 직전):
```bash
# main 브랜치 최신 커밋 기준
git checkout main
git pull
git tag -a v1.0.0-rc1 -m "v1.0.0-rc1 — 검수 제출 (D18)"
git push origin v1.0.0-rc1
```

- 검수 통과 후 `v1.0.0` 으로 promote (`git tag -a v1.0.0 -m "v1.0.0 release"`).
- 반려 사유 수정 후 재제출 시 `v1.0.0-rc2` / `rc3` 식 incrementing.

---

## Kill Switch (sweep Issue 34)

**현재 상태**: 미구현. D1 분류 ⑥ Console-only 결정으로 CF Workers 폐기 → kill switch 인프라 없음.

**대안**:
- 토스 콘솔에서 미니앱 자체 비공개 처리 (가장 빠름, 분 단위)
- 클라이언트 측 SDK 의 `env.getAppVersion()` 또는 deployment_id 비교 → 특정 버전 차단 (Phase 1)

**Phase 1 검토**: kill switch 가 필요해진다면:
1. CF Workers + KV 1-byte 엔드포인트 (`/maintenance` GET → 200 / 503)
2. 클라이언트 부팅 시 0.5s timeout 으로 fetch
3. 503 → 점검 화면 표시

현 단계는 토스 콘솔 차단으로 충분 — 솔로 운영자 부담 ↑ 회피.

---

## 검수 반려 시 대응

### 반려 사유 분류
1. **자체 백버튼 visual 발견** → 스크린샷 + 코드 라인 evidence 첨부 (ESLint 룰 통과해도 추가 케이스 가능)
2. **종료 모달 텍스트 불일치** → 가이드 페이지 변경 가능성 → 가이드 캡처 갱신 + 코드 매치 → 재제출
3. **외부 링크** → 모든 `<a href>` + `setLocation` 도메인 검증
4. **카메라 권한 거부 안내 부족** → PermissionDeniedScreen UX 보강 (이미지 + 단계 명확화)

### 재제출 사이클
- 평균 1~2회 반려 예상, 회당 5~10일
- 출시 목표일 역산 시 +14일 여유 권장 (plain.md 명시)

### Lessons Learned
반려 사유는 [docs/inspection-lessons.md](./inspection-lessons.md) 에 기록 (선택, 권장) → Phase 1 / 다음 미니앱 자산.

---

## 변경 이력

- `_D18_`: 초기 작성 (제출 직전).
