import { BrowserRouter, Routes, Route } from "react-router";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Pool } from "./pages/Pool";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="pool" element={<Pool />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
