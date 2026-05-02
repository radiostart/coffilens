import { useLocation } from "wouter";
import { NavBar } from "../components/nav-bar";
import {
  useMeasurementStore,
  type CoinType,
} from "../stores/measurement.store";
import { getTelemetryClient } from "../telemetry/client";
import "./coin-select.css";

interface Coin {
  id: CoinType;
  name: string;
  desc: string;
  iconLabel: string;
}

// 500원 먼저 — 사용자 결정 (2026-05-02). 더 큰 동전이 검출 정확도 높고
// 일반적으로 더 자주 사용. 100원은 보조.
const COINS: Coin[] = [
  {
    id: "500",
    name: "500원",
    desc: "직경 26.5mm — 학",
    iconLabel: "500",
  },
  {
    id: "100",
    name: "100원",
    desc: "직경 24.0mm — 이순신 장군",
    iconLabel: "100",
  },
];

export function CoinSelectRoute() {
  const setCoinType = useMeasurementStore((s) => s.setCoinType);
  const [, setLocation] = useLocation();

  function handleSelect(id: CoinType) {
    setCoinType(id);
    void getTelemetryClient().then((c) =>
      c.track({ type: "measurement_attempt", coinType: id }),
    );
    setLocation("/capture-guide");
  }

  return (
    <>
      <NavBar title="동전 선택" />
      <main className="coin-select" aria-label="기준 동전 선택">
        <h1 className="text-h2 coin-select-heading">
          어떤 동전과 함께 찍을까요?
        </h1>
        <p className="text-body coin-select-description">
          분쇄 입자 크기를 mm 로 환산하기 위한 기준이에요.
        </p>
        <ul className="coin-select-list">
          {COINS.map((coin) => (
            <li key={coin.id}>
              <button
                type="button"
                className="coin-card"
                onClick={() => handleSelect(coin.id)}
                aria-label={`${coin.name} — ${coin.desc}`}
              >
                <span className="coin-card-icon" aria-hidden="true">
                  {coin.iconLabel}
                </span>
                <span className="coin-card-text">
                  <strong className="text-h4 coin-card-name">
                    {coin.name}
                  </strong>
                  <span className="text-body coin-card-desc">{coin.desc}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
