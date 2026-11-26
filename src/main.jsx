import React from "react";
import { createRoot } from "react-dom/client";
import { AccountWorkspace } from "./AccountWorkspace.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AccountWorkspace />
  </React.StrictMode>,
);
