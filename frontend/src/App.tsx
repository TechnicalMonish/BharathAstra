import { BrowserRouter, Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar";
import LandingPage from "./pages/LandingPage";
import DocumentAnalyzer from "./pages/DocumentAnalyzer";
import ResourceAggregator from "./pages/ResourceAggregator";
import CostPredictor from "./pages/CostPredictor";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <NavBar />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/documents" element={<DocumentAnalyzer />} />
          <Route path="/resources" element={<ResourceAggregator />} />
          <Route path="/cost" element={<CostPredictor />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
