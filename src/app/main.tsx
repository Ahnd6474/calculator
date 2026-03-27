import ReactDOM from "react-dom/client";
import { App } from "@app/App";
import "@app/app.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root was not found.");
}

ReactDOM.createRoot(container).render(<App />);
