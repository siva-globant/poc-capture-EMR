import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { MonitoringProvider } from "./context";
// import * as Sentry from "@sentry/react";

const sentryConfig = {
  dsn: "https://eeb16749da09e0fe93f5441a6df9c435@o4505669501648896.ingest.sentry.io/4505679652061184",
  environment: import.meta.env.MODE,
  debug: import.meta.env.PROD,
  tracesSampleRate: 1.0,
  release: `poc-video-capture-emr`,
  tracingOrigins: ["127.0.0.1", "localhost", "https://siva-globant.github.io"],
};
// Sentry.init({
//   dsn: "https://6452d0c6c4bda6947b3186da5506fba3@o4505669501648896.ingest.sentry.io/4505679649177600",
//   integrations: [new Sentry.BrowserTracing(), new Sentry.Replay()],

//   // Set tracesSampleRate to 1.0 to capture 100%
//   // of transactions for performance monitoring.
//   tracesSampleRate: 1.0,

//   // Set `tracePropagationTargets` to control for which URLs distributed tracing should be enabled
//   tracePropagationTargets: ["localhost"],

//   // Capture Replay for 10% of all sessions,
//   // plus for 100% of sessions with an error
//   replaysSessionSampleRate: 0.1,
//   replaysOnErrorSampleRate: 1.0,
// });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MonitoringProvider config={sentryConfig}>
      <App />
    </MonitoringProvider>
  </React.StrictMode>
);
