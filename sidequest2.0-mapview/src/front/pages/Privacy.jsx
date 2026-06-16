import { Link } from "react-router-dom";
import { Container } from "react-bootstrap";

// ════════════════════════════════════════════════════════════════
// Privacy Policy — Política de Privacidad (RGPD-compliant)
// ════════════════════════════════════════════════════════════════
//
// ⚠️ TEMPLATE — NO ES ASESORÍA LEGAL.
// Esta página cubre los puntos OBLIGATORIOS bajo el RGPD (UE)
// pero el contenido específico (datos de la empresa, contacto del
// DPO, retención exacta, base legal de cada tratamiento) DEBE ser
// completado por ti y revisado por un abogado antes de ir a prod.
//
// Placeholders a rellenar (busca [BRACKETS]):
//   [NOMBRE LEGAL]       — Razón social de tu empresa
//   [DIRECCIÓN POSTAL]   — Domicilio social
//   [PAÍS]               — País de constitución
//   [EMAIL CONTACTO]     — Contacto privacidad (legal@..., privacy@...)
//   [EMAIL DPO]          — Si tienes Data Protection Officer designado
//   [HOSTING PROVIDER]   — Render.com (ver render.yaml) u otro
//   [FECHA ACTUALIZACIÓN]— Fecha de la última revisión
// ════════════════════════════════════════════════════════════════

const LEGAL_CSS = `
.sq-legal-page {
  min-height: 100dvh;
  background:
    radial-gradient(1200px 600px at 10% -10%, rgba(99, 102, 241, 0.15), transparent 60%),
    radial-gradient(900px 500px at 100% 10%, rgba(236, 72, 153, 0.10), transparent 60%),
    #0b0d12;
  color: #e9ecef;
  padding-top: 80px;
  padding-bottom: calc(120px + env(safe-area-inset-bottom));
}
.sq-legal-card {
  background: #161922;
  border: 1px solid #262a36;
  border-radius: 14px;
  color: #e9ecef;
  padding: 2rem 1.5rem;
  line-height: 1.6;
}
.sq-legal-card h1 {
  color: #fff;
  font-weight: 700;
  margin-bottom: 0.5rem;
}
.sq-legal-meta {
  color: #6c757d;
  font-size: 0.85rem;
  margin-bottom: 2rem;
}
.sq-legal-card h2 {
  color: #fff;
  font-size: 1.3rem;
  font-weight: 700;
  margin: 2rem 0 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid #262a36;
}
.sq-legal-card h2:first-of-type {
  border-top: none;
  padding-top: 0;
  margin-top: 0;
}
.sq-legal-card h3 {
  color: #e9ecef;
  font-size: 1.05rem;
  font-weight: 600;
  margin: 1.25rem 0 0.5rem;
}
.sq-legal-card p,
.sq-legal-card li {
  color: #cbd0d8;
  font-size: 0.95rem;
}
.sq-legal-card ul {
  padding-left: 1.25rem;
}
.sq-legal-card a {
  color: #818cf8;
  text-decoration: none;
}
.sq-legal-card a:hover {
  color: #a5b4fc;
  text-decoration: underline;
}
.sq-legal-placeholder {
  background: rgba(250, 204, 21, 0.12);
  color: #facc15;
  padding: 0.05rem 0.4rem;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.85em;
}
.sq-legal-toc {
  background: #0f111a;
  border: 1px solid #262a36;
  border-radius: 10px;
  padding: 1rem 1.25rem;
  margin-bottom: 2rem;
}
.sq-legal-toc h2 {
  border: none !important;
  padding: 0 !important;
  margin: 0 0 0.5rem !important;
  font-size: 0.85rem !important;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #adb5bd !important;
}
.sq-legal-toc ol {
  margin: 0;
  padding-left: 1.25rem;
}
.sq-legal-toc li {
  font-size: 0.9rem;
  margin: 0.2rem 0;
}
`;

// Helper para resaltar placeholders visualmente
const PH = ({ children }) => (
  <span className="sq-legal-placeholder">[{children}]</span>
);

export const Privacy = () => {
  return (
    <div className="sq-legal-page">
      <style>{LEGAL_CSS}</style>

      <Container style={{ maxWidth: 820 }}>
        <article className="sq-legal-card">
          <h1>Privacy Policy</h1>
          <p className="sq-legal-meta">
            Last updated: <PH>FECHA ACTUALIZACIÓN</PH> · Applies to all users of SideQuest.
          </p>

          {/* TABLE OF CONTENTS for accessibility + scannability */}
          <nav className="sq-legal-toc" aria-label="Table of contents">
            <h2>On this page</h2>
            <ol>
              <li><a href="#who-we-are">Who we are</a></li>
              <li><a href="#data-we-collect">What data we collect</a></li>
              <li><a href="#how-we-use">How we use your data</a></li>
              <li><a href="#legal-basis">Legal basis (GDPR Art. 6)</a></li>
              <li><a href="#sharing">Sharing & third parties</a></li>
              <li><a href="#retention">Data retention</a></li>
              <li><a href="#your-rights">Your rights under GDPR</a></li>
              <li><a href="#cookies">Cookies and tracking</a></li>
              <li><a href="#security">Security</a></li>
              <li><a href="#children">Children's privacy</a></li>
              <li><a href="#contact">Contact</a></li>
            </ol>
          </nav>

          <h2 id="who-we-are">1. Who we are</h2>
          <p>
            SideQuest is operated by <PH>NOMBRE LEGAL</PH>, a company registered in{" "}
            <PH>PAÍS</PH> with its registered office at <PH>DIRECCIÓN POSTAL</PH>{" "}
            ("we", "us", "our"). We are the data controller for the personal data
            processed through this service.
          </p>
          <p>
            If you have any questions about this Privacy Policy, you can contact us at{" "}
            <PH>EMAIL CONTACTO</PH>.
          </p>

          <h2 id="data-we-collect">2. What data we collect</h2>

          <h3>2.1 Data you provide directly</h3>
          <ul>
            <li><strong>Account data</strong>: email address, username, password (stored hashed, never in clear text).</li>
            <li><strong>Profile data (optional)</strong>: first name, last name, city, biography, phone number, birthdate, profile picture.</li>
            <li><strong>Event data</strong>: title, description, date, time, location, cover image, visibility setting (public/private), invited friends.</li>
            <li><strong>Communication data</strong>: text messages, photos and audio recordings you send through the in-app chat.</li>
            <li><strong>Friendship data</strong>: friend requests sent/received/accepted.</li>
          </ul>

          <h3>2.2 Data collected automatically</h3>
          <ul>
            <li><strong>Location data</strong>: only when you grant browser permission, used to center the map on your position and to show events near you. We do not store your location persistently — it is used in-session only.</li>
            <li><strong>Technical data</strong>: IP address (in server logs for security), browser type, device type, language.</li>
            <li><strong>Usage data</strong>: pages visited, events viewed, RSVPs, in order to improve the service.</li>
          </ul>

          <h2 id="how-we-use">3. How we use your data</h2>
          <ul>
            <li>To create and maintain your account.</li>
            <li>To deliver core service features (map, events, chat, friends, notifications).</li>
            <li>To send service-related emails (password reset, security alerts) — we do <strong>not</strong> use your data for marketing without explicit consent.</li>
            <li>To detect and prevent fraud, abuse and security incidents.</li>
            <li>To comply with our legal obligations.</li>
          </ul>

          <h2 id="legal-basis">4. Legal basis (GDPR Article 6)</h2>
          <ul>
            <li><strong>Contract performance</strong> (Art. 6.1.b): account creation, event and chat features — necessary to deliver the service you signed up for.</li>
            <li><strong>Legitimate interest</strong> (Art. 6.1.f): fraud prevention, security logs, service improvement.</li>
            <li><strong>Consent</strong> (Art. 6.1.a): browser geolocation, optional profile fields, marketing emails (if any). You can withdraw consent at any time.</li>
            <li><strong>Legal obligation</strong> (Art. 6.1.c): retention of records required by applicable law.</li>
          </ul>

          <h2 id="sharing">5. Sharing & third parties</h2>
          <p>
            We do <strong>not</strong> sell your personal data. We share data only with:
          </p>
          <ul>
            <li><strong>Hosting provider</strong>: <PH>HOSTING PROVIDER</PH> hosts our servers and databases. Data may be stored in their data centers (location: <PH>DATA CENTER LOCATION</PH>).</li>
            <li><strong>Email provider</strong>: for transactional emails (e.g. password reset).</li>
            <li><strong>Map tiles</strong>: OpenStreetMap is used to render the map. Your browser sends standard requests to their tile servers; we do not share account data with them.</li>
            <li><strong>Legal authorities</strong>: when required by law (court order, lawful request).</li>
          </ul>

          <h2 id="retention">6. Data retention</h2>
          <ul>
            <li>Account data: retained while your account is active.</li>
            <li>Event and chat data: retained until you delete it or your account.</li>
            <li>Server logs: <PH>X días/meses</PH> for security.</li>
            <li>Account deletion: when you delete your account, we erase or anonymize your personal data within <PH>30 días</PH>, except where retention is required by law.</li>
          </ul>

          <h2 id="your-rights">7. Your rights under GDPR</h2>
          <p>You can exercise the following rights at any time:</p>
          <ul>
            <li><strong>Right of access</strong> (Art. 15): obtain a copy of the personal data we hold about you.</li>
            <li><strong>Right to rectification</strong> (Art. 16): correct inaccurate or incomplete data.</li>
            <li><strong>Right to erasure / "right to be forgotten"</strong> (Art. 17): request deletion of your account and data.</li>
            <li><strong>Right to restriction of processing</strong> (Art. 18).</li>
            <li><strong>Right to data portability</strong> (Art. 20): receive your data in a structured, machine-readable format.</li>
            <li><strong>Right to object</strong> (Art. 21) to certain types of processing.</li>
            <li><strong>Right not to be subject to automated decisions</strong> (Art. 22).</li>
            <li><strong>Right to lodge a complaint</strong> with a supervisory authority (e.g. CNIL in France, AEPD in Spain, AGPD in Portugal).</li>
          </ul>
          <p>
            To exercise any of these rights, contact us at <PH>EMAIL CONTACTO</PH>. We
            will respond within 30 days as required by GDPR.
          </p>

          <h2 id="cookies">8. Cookies and similar technologies</h2>
          <p>
            We use only <strong>strictly necessary cookies / local storage</strong>{" "}
            required to keep you signed in (JWT token, user preferences). These do
            not require consent under the ePrivacy Directive. We do not use
            advertising cookies, third-party analytics that profile users, or
            cross-site tracking.
          </p>

          <h2 id="security">9. Security</h2>
          <ul>
            <li>Passwords are stored with strong one-way hashing (bcrypt or equivalent).</li>
            <li>Communication uses HTTPS / TLS.</li>
            <li>Access to production systems is restricted to authorized personnel only.</li>
            <li>If a personal data breach occurs that is likely to result in high risk to your rights, we will notify you and the relevant supervisory authority within 72 hours, as required by GDPR Art. 33-34.</li>
          </ul>

          <h2 id="children">10. Children's privacy</h2>
          <p>
            SideQuest is not intended for users under 16 years of age (or the
            applicable digital age of consent in your country — see GDPR Art. 8). We
            do not knowingly collect data from minors below this age. If you are a
            parent or guardian and believe your child has provided us with personal
            data, please contact us so we can remove it.
          </p>

          <h2 id="contact">11. Contact</h2>
          <ul>
            <li>Data controller: <PH>NOMBRE LEGAL</PH></li>
            <li>Postal address: <PH>DIRECCIÓN POSTAL</PH></li>
            <li>Email (general): <PH>EMAIL CONTACTO</PH></li>
            <li>Data Protection Officer (if appointed): <PH>EMAIL DPO</PH></li>
          </ul>

          <h2>12. Changes to this policy</h2>
          <p>
            We may update this Privacy Policy from time to time. The "Last updated"
            date at the top reflects the latest revision. For substantial changes
            we will notify you in-app or by email.
          </p>

          <p className="mt-4">
            See also: <Link to="/terms">Terms of Service</Link> ·{" "}
            <Link to="/legal">Legal Notice</Link>
          </p>
        </article>
      </Container>
    </div>
  );
};

export default Privacy;
