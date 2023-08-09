import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { MonitoringProvider } from "./context";

const sentryConfig = {
  dsn: "https://ae2ada5eb74514741c59ee220bb2bf9e@o4505568095109120.ingest.sentry.io/4505662549065728",
  environment: import.meta.env.MODE,
  debug: import.meta.env.PROD,
  tracesSampleRate: 0.025,
  release: `poc-capture-EMR`,
  tracingOrigins: ["localhost", "https://siva-globant.github.io"],
};
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MonitoringProvider config={sentryConfig}>
      <App />
    </MonitoringProvider>
  </React.StrictMode>
);
