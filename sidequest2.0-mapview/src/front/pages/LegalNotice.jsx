import { Link } from "react-router-dom";
import { Container } from "react-bootstrap";

// ════════════════════════════════════════════════════════════════
// Legal Notice — Aviso Legal / Mentions Légales / Impressum
// ════════════════════════════════════════════════════════════════
//
// OBLIGATORIO en muchos países de la UE (LCEN en Francia, LSSI en
// España, TMG en Alemania). Identifica al editor del sitio y al
// proveedor de alojamiento. Sin esto puedes recibir sanciones
// administrativas significativas.
//
// Placeholders a rellenar:
//   [NOMBRE LEGAL]          — Razón social
//   [FORMA JURÍDICA]        — SAS, SL, GmbH, LLC...
//   [CAPITAL SOCIAL]        — Si aplica
//   [Nº REGISTRO MERCANTIL] — RM, RCS, HRB...
//   [Nº IDENTIFICACIÓN FISCAL] — NIF, SIRET, USt-IdNr...
//   [DIRECCIÓN POSTAL]
//   [PAÍS]
//   [EMAIL CONTACTO]
//   [TELÉFONO]              — Opcional
//   [DIRECTOR PUBLICACIÓN]  — Persona física responsable
//   [HOSTING PROVIDER]      — Render.com u otro
//   [HOSTING DIRECCIÓN]     — Dirección del proveedor de hosting
//   [HOSTING URL]
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
.sq-legal-card p,
.sq-legal-card li,
.sq-legal-card dd {
  color: #cbd0d8;
  font-size: 0.95rem;
}
.sq-legal-card dt {
  color: #adb5bd;
  font-weight: 600;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-top: 1rem;
}
.sq-legal-card dd {
  margin-left: 0;
  margin-bottom: 0.5rem;
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
`;

const PH = ({ children }) => (
  <span className="sq-legal-placeholder">[{children}]</span>
);

export const LegalNotice = () => {
  return (
    <div className="sq-legal-page">
      <style>{LEGAL_CSS}</style>

      <Container style={{ maxWidth: 820 }}>
        <article className="sq-legal-card">
          <h1>Legal Notice</h1>
          <p className="sq-legal-meta">
            Site editor and hosting information, as required by EU regulations
            (LCEN-FR / LSSI-ES / TMG-DE).
          </p>

          <h2>1. Site editor</h2>
          <dl>
            <dt>Legal name</dt>
            <dd><PH>NOMBRE LEGAL</PH></dd>

            <dt>Legal form</dt>
            <dd><PH>FORMA JURÍDICA</PH> (e.g. SAS, SL, SARL, GmbH, LLC)</dd>

            <dt>Share capital (if applicable)</dt>
            <dd><PH>CAPITAL SOCIAL</PH></dd>

            <dt>Commercial register</dt>
            <dd><PH>Nº REGISTRO MERCANTIL</PH></dd>

            <dt>Tax / VAT identification</dt>
            <dd><PH>Nº IDENTIFICACIÓN FISCAL</PH></dd>

            <dt>Registered office</dt>
            <dd><PH>DIRECCIÓN POSTAL</PH>, <PH>PAÍS</PH></dd>

            <dt>Contact email</dt>
            <dd>
              <a href={`mailto:`}>
                <PH>EMAIL CONTACTO</PH>
              </a>
            </dd>

            <dt>Phone (optional)</dt>
            <dd><PH>TELÉFONO</PH></dd>

            <dt>Director of publication</dt>
            <dd><PH>DIRECTOR PUBLICACIÓN</PH></dd>
          </dl>

          <h2>2. Hosting provider</h2>
          <dl>
            <dt>Provider</dt>
            <dd><PH>HOSTING PROVIDER</PH></dd>

            <dt>Address</dt>
            <dd><PH>HOSTING DIRECCIÓN</PH></dd>

            <dt>Website</dt>
            <dd>
              <a href={`https://`} target="_blank" rel="noreferrer">
                <PH>HOSTING URL</PH>
              </a>
            </dd>
          </dl>

          <h2>3. Intellectual property</h2>
          <p>
            All elements of the SideQuest service (branding, logo, design,
            graphics, source code unless open-sourced under a public license,
            texts, illustrations) are the exclusive property of{" "}
            <PH>NOMBRE LEGAL</PH> or are used under license. Any reproduction,
            distribution, public communication or transformation, in whole or in
            part, without prior written authorisation is strictly prohibited and
            may constitute an infringement.
          </p>
          <p>
            User-generated content (events, messages, photos) remains the
            property of its authors. See our{" "}
            <Link to="/terms">Terms of Service</Link> for the license granted to
            us by users.
          </p>

          <h2>4. Trademark</h2>
          <p>
            "SideQuest" and the SideQuest logo are trademarks of{" "}
            <PH>NOMBRE LEGAL</PH>. Unauthorised use is prohibited.
          </p>

          <h2>5. Third-party content</h2>
          <p>
            The map background is provided by{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap contributors
            </a>{" "}
            under the Open Database License (ODbL).
          </p>

          <h2>6. Reporting illegal content</h2>
          <p>
            If you notice content that violates applicable law or our{" "}
            <Link to="/terms">Terms of Service</Link>, please report it to{" "}
            <PH>EMAIL CONTACTO</PH> with a description and URL of the content.
            We will review reports promptly.
          </p>

          <h2>7. Personal data and cookies</h2>
          <p>
            See our <Link to="/privacy">Privacy Policy</Link> for details on how
            we process personal data and use cookies / local storage.
          </p>

          <p className="mt-4">
            See also: <Link to="/terms">Terms of Service</Link> ·{" "}
            <Link to="/privacy">Privacy Policy</Link>
          </p>
        </article>
      </Container>
    </div>
  );
};

export default LegalNotice;
