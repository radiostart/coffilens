import { useLocation } from "wouter";
import { NavBar } from "../components/nav-bar";
import { useMeasurementStore } from "../stores/measurement.store";
import "./capture-guide.css";

/**
 * 단계 안내. 동전 step 은 coin-select 에서 선택한 동전을 명시 (2026-05-07).
 * coinType null 이면 fallback 으로 "100원 또는 500원" 표시.
 *
 * **숫자 면 위로 (2026-05-09)**: 동전의 그림 면 (100원 이순신 / 500원 학) 은
 * 깊은 부조 텍스처로 동전 내부 픽셀 stddev 가 ~45 까지 올라가 검출 필터의
 * `COIN_MAX_STDDEV=42` 임계를 종종 초과 → 진짜 동전이 `coffee_cluster` 로
 * 오판 reject. 숫자 (한국은행) 면은 텍스트만 있어 stddev ~4-8 로 매우 균일,
 * 임계 여유 충분. 사용자 가이드로 face 인식 코드 없이 검출 안정성 ↑.
 */
function buildSteps(coinType: "100" | "500" | null): string[] {
  const coinLabel = coinType === "100" ? "100원" : coinType === "500" ? "500원" : "100원 또는 500원";
  return [
    "흰 종이 위에 분쇄한 원두를 얇게 펴주세요",
    `${coinLabel} 동전을 1개만 같이 놓아주세요`,
    "동전은 숫자(한국은행) 면이 위로 보이게 놓아주세요",
    "균일한 조명 아래에서 촬영해주세요",
    "동전이 화면 안에 완전히 보이도록 해주세요",
  ];
}

export function CaptureGuideRoute() {
  const [, setLocation] = useLocation();
  const coinType = useMeasurementStore((s) => s.coinType);
  const steps = buildSteps(coinType);

  return (
    <>
      <NavBar title="촬영 가이드" />
      <main className="capture-guide" aria-label="촬영 가이드">
        <h1 className="text-h2 capture-guide-heading">촬영 가이드</h1>
        <p className="text-body capture-guide-description">
          정확한 측정을 위해 아래 4가지를 확인해주세요.
        </p>
        {/*
         * 측정 알고리즘이 핸드드립~프렌치프레스 영역 (D50 500-1500µm) 에 최적화.
         * espresso/Turkish 영역은 sub-pixel 한계로 절대값 신뢰도 낮음 — 사전에
         * 알려 측정값 해석 기대치 설정. 추천 도구 라벨은 brewing-guide.ts SSOT.
         */}
        <aside className="capture-guide-banner" role="note">
          <span aria-hidden="true">☕</span>
          <p className="text-body">
            이 측정은 <strong>핸드드립·프렌치프레스</strong> 분쇄도에 최적화돼
            있어요. 에스프레소/모카포트 영역은 절대값보다 상대 비교용으로 활용해주세요.
          </p>
        </aside>
        <ol className="capture-guide-steps">
          {steps.map((step, idx) => (
            <li key={idx} className="capture-guide-step">
              <span className="capture-guide-step-number">{idx + 1}</span>
              <span className="text-body-large">{step}</span>
            </li>
          ))}
        </ol>
        {/*
         * **미세 입자 측정 팁** (2026-05-03 / 2026-05-07 톤 완화):
         * 카메라 해상도 한계로 동전이 매우 작게 찍히면 sub-pixel 작은 입자가
         * 검출에서 제외됨 (statistics.ts computeMinDiameter — 픽셀당 µm 비례).
         * 핸드드립 (~600~800µm) 은 평소 거리에서 충분, 에스프레소/모카포트 미세
         * 영역만 가까이 촬영 권장.
         */}
        <aside className="capture-guide-tip" role="note">
          <span className="capture-guide-tip-icon" aria-hidden="true">💡</span>
          <div className="capture-guide-tip-body">
            <p className="capture-guide-tip-title">에스프레소·모카포트 정확도 높이려면</p>
            <p className="capture-guide-tip-desc">
              동전을 가까이 찍으면 미세 입자(약 100µm)까지 정확히 잡혀요.
              핸드드립 정도는 평소 거리에서도 충분합니다.
            </p>
          </div>
        </aside>
        <button
          type="button"
          className="btn-primary capture-guide-cta"
          onClick={() => setLocation("/camera")}
        >
          촬영 시작
        </button>
      </main>
    </>
  );
}
