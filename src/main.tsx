import React from "react";
import ReactDOM from "react-dom/client";

import "./App.css";
import { getWindowLabel } from "./lib/tauriWindowApi";
import ChatWindow from "./windows/ChatWindow";
import PetWindow from "./windows/PetWindow";
import SettingsWindow from "./windows/SettingsWindow";

const label = getWindowLabel();
document.documentElement.dataset.windowLabel = label;

// Pet must paint fully clear before React mounts. `color-scheme: light` +
// `:root` gray background make WKWebView show a frosted gray box on macOS.
if (label === "pet") {
  const root = document.documentElement;
  root.style.background = "transparent";
  root.style.backgroundColor = "transparent";
  root.style.colorScheme = "normal";
  document.body.style.background = "transparent";
  document.body.style.backgroundColor = "transparent";
}

const root =
  label === "chat" ? (
    <ChatWindow />
  ) : label === "settings" ? (
    <SettingsWindow />
  ) : (
    <PetWindow />
  );

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{root}</React.StrictMode>,
);
