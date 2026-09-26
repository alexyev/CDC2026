import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles/globals.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { decodeView } from "./lib/urlCodec";
import { useStore } from "./store/useStore";

// The URL is the initial view state (SPEC.md 3.10); U8's useUrlSync keeps them in step afterwards.
useStore.getState().setView(decodeView(window.location.search));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
