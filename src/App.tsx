import { Switch, Route, Redirect } from "wouter";
import { IntroRoute } from "./routes/intro";
import { HomeRoute } from "./routes/home";
import { ToolSelectRoute } from "./routes/tool-select";
import { CaptureGuideRoute } from "./routes/capture-guide";
import { CameraRoute } from "./routes/camera";
import { AnalyzingRoute } from "./routes/analyzing";

export default function App() {
  return (
    <Switch>
      <Route path="/" component={IntroRoute} />
      <Route path="/intro" component={IntroRoute} />
      <Route path="/home" component={HomeRoute} />
      <Route path="/tool-select" component={ToolSelectRoute} />
      <Route path="/capture-guide" component={CaptureGuideRoute} />
      <Route path="/camera" component={CameraRoute} />
      <Route path="/analyzing" component={AnalyzingRoute} />
      <Route>
        <Redirect to="/intro" />
      </Route>
    </Switch>
  );
}
