import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
} from "react-router-dom";

import { Layout } from "./pages/Layout";
import { LandingPage } from "./pages/LandingPage";
import { Home } from "./pages/Home";
import { Single } from "./pages/Single";
import { Demo } from "./pages/Demo";
import { Register } from "./pages/Register";
import { Login } from "./pages/Login";
import { Friends } from "./pages/Friends";
import { FriendProfile } from "./pages/FriendProfile";
import { EventsList } from "./pages/EventsList";
import Map from "./pages/Map";
import Messages from "./pages/Messages";
// Tanda 4D — Legal pages (RGPD / LCEN / LSSI compliance).
// Páginas estáticas públicas, enlazadas desde el SiteFooter y desde
// el hamburger menu del Navbar.
import { Terms } from "./pages/Terms";
import { Privacy } from "./pages/Privacy";
import { LegalNotice } from "./pages/LegalNotice";
// Tanda 7E — destino del link de recuperación de contraseña que llega
// por email (token firmado, caduca en 1 h). Página pública.
import { ResetPassword } from "./pages/ResetPassword";

export const router = createBrowserRouter(
  createRoutesFromElements(
    <Route
      path="/"
      element={<Layout />}
      errorElement={<h1>Not found!</h1>}
    >
      {/* Public landing page — first screen any visitor sees */}
      <Route path="/" element={<LandingPage />} />
      {/* The actual app (fullscreen map). Reached after login/register. */}
      <Route path="/app" element={<Home />} />
      <Route path="/demo" element={<Demo />} />
      <Route path="/single/:theId" element={<Single />} />
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
      {/* Tanda 7E/7H — reset por link de email (pública, sin sesión).
          El token viaja por QUERY STRING (?token=...) porque lleva
          puntos y el dev-server de Vite no aplica el fallback SPA a
          paths con "." (404). Mantenemos también la variante /:token
          por compatibilidad con emails ya enviados (caducan en 1 h). */}
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />
      <Route path="/friends" element={<Friends />} />
      <Route path="/friends/:userId" element={<FriendProfile />} />
      <Route path="/events" element={<EventsList />} />
      <Route path="/map" element={<Map />} />

      {/* Messages — page dedicated */}
      <Route path="/messages" element={<Messages />} />
      <Route path="/messages/:roomId" element={<Messages />} />

      {/* Legal — required by EU regulations (RGPD / LCEN / LSSI).
          Públicas (sin auth) para que los buscadores y usuarios no
          registrados puedan verlas. */}
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/legal" element={<LegalNotice />} />
    </Route>
  )
);