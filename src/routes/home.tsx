import { NavBar } from "../components/nav-bar";
import "./home.css";

export function HomeRoute() {
  return (
    <>
      <NavBar title="커피렌즈" />
      <main className="home" aria-label="홈">
        <h2 className="text-h2">분쇄도 측정하기</h2>
        <p className="text-body-large home-stub">F02 에서 채워질 홈 화면.</p>
      </main>
    </>
  );
}
