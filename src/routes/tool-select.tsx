import { useLocation } from "wouter";
import { NavBar } from "../components/nav-bar";
import {
  useMeasurementStore,
  type ToolId,
} from "../stores/measurement.store";
import "./tool-select.css";

interface Tool {
  id: ToolId;
  name: string;
  desc: string;
}

const TOOLS: Tool[] = [
  { id: "v60", name: "V60", desc: "핸드드립 표준" },
  { id: "kalita", name: "Kalita Wave", desc: "굵은 분쇄" },
  { id: "clever", name: "Clever", desc: "침지 + 드립" },
  { id: "origami", name: "Origami", desc: "V60 변형" },
  { id: "chemex", name: "Chemex", desc: "두꺼운 필터" },
];

export function ToolSelectRoute() {
  const setTool = useMeasurementStore((s) => s.setTool);
  const [, setLocation] = useLocation();

  function handleSelect(id: ToolId) {
    setTool(id);
    setLocation("/capture-guide");
  }

  return (
    <>
      <NavBar title="도구 선택" />
      <main className="tool-select" aria-label="추출 도구 선택">
        <h1 className="text-h2 tool-select-heading">
          어떤 도구로 추출할까요?
        </h1>
        <p className="text-body tool-select-description">
          선택한 도구에 맞는 분쇄도 추천을 보여드려요.
        </p>
        <ul className="tool-select-list">
          {TOOLS.map((tool) => (
            <li key={tool.id}>
              <button
                type="button"
                className="tool-card"
                onClick={() => handleSelect(tool.id)}
                aria-label={`${tool.name} — ${tool.desc}`}
              >
                <strong className="text-h4 tool-card-name">{tool.name}</strong>
                <span className="text-body tool-card-desc">{tool.desc}</span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
