import React from "react";
import ReactDOM from "react-dom/client";
// Inter, variable — one face, three levers (size / weight / colour) do the work.
import "@fontsource-variable/inter";
import App from "./App";
// Order matters: tokens -> base -> components -> shell -> screens.
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/shell.css";
import "./styles/screens.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
