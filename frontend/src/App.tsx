// Phase 4: the search page at "/" (FE-03) and the /share page (FE-04, SPEC §5.6).
// No router library: the server sends index.html for every path (SPEC §3.4), so the page is chosen here.
import SearchPage from "./pages/SearchPage";
import SharePage from "./pages/SharePage";

export default function App() {
  return window.location.pathname === "/share" ? <SharePage /> : <SearchPage />;
}
