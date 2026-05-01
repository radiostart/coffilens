import { Switch, Route, Redirect } from "wouter";
import { IntroRoute } from "./routes/intro";
import { HomeRoute } from "./routes/home";

export default function App() {
  return (
    <Switch>
      <Route path="/" component={IntroRoute} />
      <Route path="/intro" component={IntroRoute} />
      <Route path="/home" component={HomeRoute} />
      <Route>
        <Redirect to="/intro" />
      </Route>
    </Switch>
  );
}
