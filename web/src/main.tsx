import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { activateLocale, detectLocale } from "./i18n";
import "./index.css";

activateLocale(detectLocale(), false);

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
