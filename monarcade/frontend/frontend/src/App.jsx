import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Race from "./pages/Race";
import { ToastContainer } from 'react-toastify'; // Import
import 'react-toastify/dist/ReactToastify.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/race/*" element={<Race />} />
        <Route path="/monaduno" element={<div>MonadUNO Coming Soon</div>} />
        <Route path="/bluff" element={<div>Bluff Coming Soon</div>} />
      </Routes>
      {/* Add ToastContainer here for global notifications */}
      <ToastContainer
          position="bottom-right"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="dark" // Use dark theme to match app
      />
    </Router>
  );
}

export default App;
