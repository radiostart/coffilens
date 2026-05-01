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
        <ol className="capture-guide-steps">
          {STEPS.map((step, idx) => (
            <li key={idx} className="capture-guide-step">
              <span className="capture-guide-step-number">{idx + 1}</span>
              <span className="text-body-large">{step}</span>
            </li>
          ))}
        </ol>
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
