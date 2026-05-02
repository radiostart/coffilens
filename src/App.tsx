import { Switch, Route, Redirect } from "wouter";
import { IntroRoute } from "./routes/intro";
import { HomeRoute } from "./routes/home";
import { CoinSelectRoute } from "./routes/coin-select";
import { CaptureGuideRoute } from "./routes/capture-guide";
import { CameraRoute } from "./routes/camera";
import { CoinLocateRoute } from "./routes/coin-locate";
import { AnalyzingRoute } from "./routes/analyzing";
import { ResultRoute } from "./routes/result";

export default function App() {
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
