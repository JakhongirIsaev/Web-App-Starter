import { createRoot } from "react-dom/client";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import "./i18n";
import App from "./App";
import "./index.css";

const apiOrigin = import.meta.env.VITE_API_ORIGIN?.replace(/\/+$/, "") || null;

setBaseUrl(apiOrigin);
setAuthTokenGetter(() => localStorage.getItem("auth_token"));

createRoot(document.getElementById("root")!).render(<App />);
