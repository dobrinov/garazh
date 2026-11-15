import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
// Plate lettering, bundled so it looks the same on every computer, offline.
import "@fontsource/roboto-condensed/600.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
