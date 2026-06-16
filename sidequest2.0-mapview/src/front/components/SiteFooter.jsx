import { Link, useLocation } from "react-router-dom";

// ════════════════════════════════════════════════════════════════
// SiteFooter — footer compacto con enlaces legales obligatorios
// ════════════════════════════════════════════════════════════════
//
// Se monta en Layout.jsx después del <main>. Aparece en todas las
// páginas EXCEPTO:
//   - "/"            → la landing tiene su propio footer (lp-footer)
//   - "/app", "/map" → el mapa es fullscreen, el footer estaría
//                     siempre fuera de pantalla; los enlaces
//                     legales son accesibles desde el menú
//                     hamburger del Navbar en esas vistas.
//
// El footer va por DEBAJO del contenido scrollable. La pill
// bottom-nav (.sq-bottom-nav, position:fixed) flota encima,
// pero como las páginas con footer ya reservan padding-bottom
// para la pill, no hay colisión.
//
// NOTA: este componente es DISTINTO del legacy Footer.jsx
// (que era código muerto importado pero no renderizado).
// ════════════════════════════════════════════════════════════════

const FOOTER_CSS = `
.sq-site-footer {
  background: #0f111a;
  border-top: 1px solid #262a36;
  color: #adb5bd;
  padding: 1.25rem 1rem;
  /* Margen inferior para que la pill bottom-nav flotante (con
     bottom: 1rem + safe-area) no tape el copyright. */
  margin-bottom: calc(90px + env(safe-area-inset-bottom));
  font-size: 0.82rem;
}
.sq-site-footer-inner {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1.5rem;
}
.sq-site-footer-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.9rem;
  list-style: none;
  margin: 0;
  padding: 0;
}
.sq-site-footer-links a {
  color: #adb5bd;
  text-decoration: none;
  transition: color 0.15s;
}
.sq-site-footer-links a:hover,
.sq-site-footer-links a:focus {
  color: #fff;
  text-decoration: underline;
}
.sq-site-footer-sep {
  color: #3a3f55;
  user-select: none;
}
.sq-site-footer-brand {
  color: #6c757d;
  font-size: 0.78rem;
}

@media (max-width: 575.98px) {
  .sq-site-footer-inner {
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
  }
}
`;

// Rutas en las que ocultamos el footer (mapa fullscreen + landing).
// Landing ya tiene su propio footer. Mapa no scrollea, los links
// legales están accesibles desde el hamburger menu del Navbar.
const HIDE_ON_PATHS = ["/", "/app", "/map"];

export const SiteFooter = () => {
  const location = useLocation();
  if (HIDE_ON_PATHS.includes(location.pathname)) return null;

  const year = new Date().getFullYear();

  return (
    <>
      <style>{FOOTER_CSS}</style>

      {/* SEMÁNTICA: <footer role="contentinfo"> es el patrón estándar
          para el pie de página de la web. Asistivos lo anuncian como
          "footer" o "información de contenido". */}
      <footer className="sq-site-footer" role="contentinfo" aria-label="Site footer">
        <div className="sq-site-footer-inner">
          <ul className="sq-site-footer-links">
            <li>
              <Link to="/terms">Terms of Service</Link>
            </li>
            <li aria-hidden="true" className="sq-site-footer-sep">·</li>
            <li>
              <Link to="/privacy">Privacy Policy</Link>
            </li>
            <li aria-hidden="true" className="sq-site-footer-sep">·</li>
            <li>
              <Link to="/legal">Legal Notice</Link>
            </li>
          </ul>

          <div className="sq-site-footer-brand">
            © {year} SideQuest. All rights reserved.
          </div>
        </div>
      </footer>
    </>
  );
};

export default SiteFooter;
