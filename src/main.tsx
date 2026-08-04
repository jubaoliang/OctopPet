import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";

import "./App.css";
import ChatWindow from "./windows/ChatWindow";
import PetWindow from "./windows/PetWindow";
import SettingsWindow from "./windows/SettingsWindow";

const label = getCurrentWindow().label;
document.documentElement.dataset.windowLabel = label;

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
