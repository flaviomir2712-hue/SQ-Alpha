import { Outlet, useLocation } from "react-router-dom";
import ScrollToTop from "../components/ScrollToTop";
import { Navbar } from "../components/Navbar";
// Tanda 7H — Footer.jsx eliminado: era un editor de perfil completo
// (17KB, con fetches a /profile/me) que se importaba aquí pero NUNCA
// se renderizaba. El footer real de la app es SiteFooter.
import { BottomNavbar } from "../components/ButtonNavbar";
import { SiteFooter } from "../components/SiteFooter";
import { Onboarding } from "../components/Onboarding";

// Base component that maintains the navbar and footer throughout the page
// and the scroll-to-top functionality.
//
// On the landing ("/") and the auth pages (/login, /register) we hide both
// navbars so each of those screens owns the whole viewport — the landing
// has its own black header, and the auth screens are fullscreen dark.
const NAV_FREE_PATHS = ["/", "/login", "/register"];

export const Layout = () => {
    const location = useLocation();
    // Tanda 7E — /reset-password/<token> es otra pantalla auth
    // fullscreen (llega desde el link del email, sin sesión): también
    // va sin navbars. startsWith porque lleva el token en el path.
    const hideNav =
        NAV_FREE_PATHS.includes(location.pathname) ||
        // Tanda 7H — sin barra final: el token ahora va en query string
        // (el path es exactamente /reset-password).
        location.pathname.startsWith("/reset-password");

    return (
        <ScrollToTop>
            {/* SEMÁNTICA: el Navbar es semánticamente un <header> global
                (lo envolvemos dentro del propio componente Navbar para
                no duplicarlo aquí). Aquí marcamos el área principal con
                <main role="main"> — Google y los lectores de pantalla
                saltan directamente al contenido cuando el usuario pulsa
                "saltar a contenido". UN <main> por página es el
                estándar HTML5; por eso LandingPage cambia su <main>
                interno a <section> para no anidar dos <main>. */}
            {!hideNav && <Navbar />}
            <main id="main-content" role="main">
                <Outlet />
            </main>
            {/* SiteFooter: enlaces legales (Terms / Privacy / Legal Notice)
                + copyright. Aparece en todas las páginas EXCEPTO:
                  - "/"      → landing tiene su propio lp-footer
                  - "/app"   → mapa fullscreen, no scrollea
                  - "/map"   → idem
                  - "/login", "/register" → auth screens fullscreen
                El propio componente decide ocultarse en esas rutas via
                HIDE_ON_PATHS, así que aquí lo montamos siempre.
                Los enlaces legales SIEMPRE son accesibles desde el
                hamburger menu del Navbar incluso cuando el footer no
                se renderiza (mapa).                                       */}
            <SiteFooter />
            {!hideNav && <BottomNavbar />}
            {/* Onboarding tour: se monta SIEMPRE pero internamente
                decide cuándo mostrarse (logged-in + no completado +
                ruta apropiada). También escucha el evento
                "sq:show-onboarding" disparado desde el menú del
                Navbar para que el usuario pueda repetir el tour. */}
            <Onboarding />
        </ScrollToTop>
    );
};
