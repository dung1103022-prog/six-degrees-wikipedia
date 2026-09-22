// Phase 4: the search page at "/" (FE-03) and the /share page (FE-04, SPEC §5.6).
// No router library: the server sends index.html for every path (SPEC §3.4), so the page is chosen here.
import AmbientBackground from "./components/AmbientBackground";
import { BackgroundQualityProvider } from "./lib/backgroundQuality";
import SearchPage from "./pages/SearchPage";
import SharePage from "./pages/SharePage";

export default function App() {
  // The decorative night-sky background (design: 2026-09-22) is mounted once here, behind whichever
  // page is chosen below, rather than inside each page -- it is app-wide, not page content.
  return (
    <BackgroundQualityProvider>
      <AmbientBackground />
      {window.location.pathname === "/share" ? <SharePage /> : <SearchPage />}
    </BackgroundQualityProvider>
  );
}
