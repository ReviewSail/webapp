import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { MapRatedProvider } from "./context/MapRatedContext"
import { Layout } from "./components/Layout"
import Dashboard from "./pages/Dashboard"
import Import from "./pages/Import"
import Settings from "./pages/Settings"
import OptOut from "./pages/OptOut"

function App() {
  return (
    <MapRatedProvider>
      <Router>
        <Routes>
          <Route path="/opt-out" element={<OptOut />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="import" element={<Import />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </Router>
    </MapRatedProvider>
  )
}

export default App
