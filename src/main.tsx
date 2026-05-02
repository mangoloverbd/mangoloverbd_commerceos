import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSupabaseFromServer } from "./integrations/supabase/client";

async function bootstrap() {
  await initSupabaseFromServer();
  createRoot(document.getElementById("root")!).render(<App />);
}

bootstrap();
