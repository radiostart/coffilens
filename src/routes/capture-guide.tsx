import { useLocation } from "wouter";
import { NavBar } from "../components/nav-bar";
import "./capture-guide.css";

const STEPS = [
  "흰 종이 위에 분쇄한 원두를 얇게 펴주세요",
  "100원 또는 500원 동전을 같이 놓아주세요 (1개만!)",
  "균일한 조명 아래에서 촬영해주세요",
  "동전이 화면 안에 완전히 보이도록 해주세요",
];

export function CaptureGuideRoute() {
  const [, setLocation] = useLocation();

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
          {STEPS.map((step, idx) => (
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
