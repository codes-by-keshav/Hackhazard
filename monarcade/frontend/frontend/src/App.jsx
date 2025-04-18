import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Race from "./pages/Race";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/race/*" element={<Race />} />
        <Route path="/monaduno" element={<div>MonadUNO Coming Soon</div>} />
        <Route path="/bluff" element={<div>Bluff Coming Soon</div>} />
      </Routes>
    </Router>
  );
}

export default App;
