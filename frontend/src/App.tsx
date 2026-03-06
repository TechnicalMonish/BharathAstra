import { BrowserRouter, Routes, Route } from "react-router-dom";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/" element={<div>Landing Page</div>} />
          <Route path="/documents" element={<div>Document Analyzer</div>} />
          <Route path="/resources" element={<div>Resource Aggregator</div>} />
          <Route path="/cost" element={<div>Cost Predictor</div>} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
