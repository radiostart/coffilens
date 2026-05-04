import { useEffect } from "react";
import { Switch, Route, Redirect } from "wouter";
import { IntroRoute } from "./routes/intro";
import { HomeRoute } from "./routes/home";
import { CoinSelectRoute } from "./routes/coin-select";
import { CaptureGuideRoute } from "./routes/capture-guide";
import { CameraRoute } from "./routes/camera";
import { CoinLocateRoute } from "./routes/coin-locate";
import { AnalyzingRoute } from "./routes/analyzing";
import { ResultRoute } from "./routes/result";
import { getTelemetryClient } from "./telemetry/client";

export default function App() {
  // app_open 텔레메트리 — App mount 시 정확히 1회. 토스 deep link 가
  // /home 으로 직접 진입해도 누락되지 않도록 라우트 비의존.
  useEffect(() => {
    void getTelemetryClient().then((c) => c.track({ type: "app_open" }));
  }, []);

  return (
    <Switch>
      <Route path="/" component={IntroRoute} />
      <Route path="/intro" component={IntroRoute} />
      <Route path="/home" component={HomeRoute} />
      <Route path="/coin-select" component={CoinSelectRoute} />
      <Route path="/capture-guide" component={CaptureGuideRoute} />
      <Route path="/camera" component={CameraRoute} />
      <Route path="/coin-locate" component={CoinLocateRoute} />
      <Route path="/analyzing" component={AnalyzingRoute} />
      <Route path="/result" component={ResultRoute} />
      <Route>
        <Redirect to="/intro" />
      </Route>
    </Switch>
  );
}
