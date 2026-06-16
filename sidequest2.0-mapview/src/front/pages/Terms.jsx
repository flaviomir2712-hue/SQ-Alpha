import { Link } from "react-router-dom";
import { Container } from "react-bootstrap";

// ════════════════════════════════════════════════════════════════
// Terms of Service — Términos y Condiciones de Uso
// ════════════════════════════════════════════════════════════════
//
// ⚠️ TEMPLATE — NO ES ASESORÍA LEGAL.
// Contenido genérico para una red social. Adáptalo a tus reglas
// concretas (qué contenido prohibís, política de monetización si
// la hay, ley aplicable y jurisdicción, edad mínima, etc.) y
// hazlo revisar por un abogado antes de producción.
//
// Placeholders a rellenar:
//   [NOMBRE LEGAL]       — Razón social
//   [DIRECCIÓN POSTAL]
//   [PAÍS]
//   [EMAIL CONTACTO]
//   [JURISDICCIÓN]       — Ley aplicable / tribunales competentes
//   [FECHA ACTUALIZACIÓN]
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
.sq-legal-card ul { padding-left: 1.25rem; }
.sq-legal-card a { color: #818cf8; text-decoration: none; }
.sq-legal-card a:hover { color: #a5b4fc; text-decoration: underline; }
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

export const Terms = () => {
  return (
    <div className="sq-legal-page">
      <style>{LEGAL_CSS}</style>

      <Container style={{ maxWidth: 820 }}>
        <article className="sq-legal-card">
          <h1>Terms of Service</h1>
          <p className="sq-legal-meta">
            Last updated: <PH>FECHA ACTUALIZACIÓN</PH> · By using SideQuest you agree to these Terms.
          </p>

          <h2>1. Acceptance of these Terms</h2>
          <p>
            These Terms of Service ("Terms") govern your access to and use of the
            SideQuest application, website and related services ("Service")
            operated by <PH>NOMBRE LEGAL</PH> ("we", "us", "our"). By creating an
            account, signing in or otherwise using the Service, you confirm that
            you have read, understood and accept these Terms. If you do not
            agree, do not use the Service.
          </p>

          <h2>2. Eligibility</h2>
          <p>
            You must be at least 16 years old (or the digital age of consent in
            your country under GDPR Art. 8) to use SideQuest. By using the
            Service you confirm you meet this requirement.
          </p>

          <h2>3. Your account</h2>
          <ul>
            <li>You are responsible for safeguarding your account credentials. Do not share your password.</li>
            <li>You must provide accurate information at registration. Impersonation of others is prohibited.</li>
            <li>You are responsible for all activity that occurs under your account.</li>
            <li>One account per person. Creating multiple accounts to circumvent restrictions is not allowed.</li>
          </ul>

          <h2>4. User content</h2>
          <p>
            You retain all rights to the content you create on SideQuest (events,
            messages, photos). By posting content you grant us a worldwide,
            non-exclusive, royalty-free license to host, display and distribute
            that content as needed to operate the Service.
          </p>
          <p>You are solely responsible for the content you post. You must:</p>
          <ul>
            <li>Have the rights necessary to share what you post.</li>
            <li>Not post content that infringes someone else's intellectual property.</li>
            <li>Not post unlawful, defamatory, threatening, harassing, obscene or hateful content.</li>
            <li>Not post personal data of others without their consent.</li>
          </ul>

          <h2>5. Prohibited conduct</h2>
          <p>You agree NOT to:</p>
          <ul>
            <li>Scrape, harvest or programmatically collect data about other users.</li>
            <li>Use the Service to send spam, phishing attempts or malware.</li>
            <li>Attempt to gain unauthorized access to other accounts or our infrastructure.</li>
            <li>Reverse-engineer or attempt to extract the source code of the Service (beyond what's permitted by applicable open-source licenses).</li>
            <li>Use bots or automated tools to interact with the Service in ways that disrupt normal operation.</li>
            <li>Misuse the location feature to track or harass other users.</li>
            <li>Organise illegal events, gatherings without required permits, or activities that endanger public safety.</li>
          </ul>

          <h2>6. Events created on SideQuest</h2>
          <p>
            You are responsible for events you create — venue permissions, safety,
            compliance with local regulations and the conduct of participants. We
            are <strong>not</strong> the organiser of any event listed on the
            Service and we do not verify the accuracy of event information.
          </p>

          <h2>7. Moderation and removal</h2>
          <p>
            We may remove content or suspend accounts that violate these Terms,
            without prior notice, at our reasonable discretion. We may report
            illegal activity to the competent authorities.
          </p>

          <h2>8. Service availability</h2>
          <p>
            We strive to keep SideQuest available 24/7 but we do not guarantee
            uninterrupted access. The Service is provided "as is" and "as
            available". Maintenance, technical incidents or external factors may
            cause temporary unavailability.
          </p>

          <h2>9. Disclaimer of warranties</h2>
          <p>
            To the maximum extent permitted by applicable law, the Service is
            provided without warranties of any kind, express or implied,
            including but not limited to merchantability, fitness for a
            particular purpose, or non-infringement.
          </p>

          <h2>10. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by applicable law, we shall not be
            liable for any indirect, incidental, consequential, special or
            punitive damages, including loss of profits, data, use or goodwill,
            arising out of or in connection with your use of the Service.
          </p>
          <p>
            Nothing in these Terms excludes or limits liability that cannot be
            excluded or limited by law (e.g. gross negligence, willful misconduct,
            or consumer rights mandatory under your local law).
          </p>

          <h2>11. Termination</h2>
          <ul>
            <li><strong>By you</strong>: you may delete your account at any time from your profile settings.</li>
            <li><strong>By us</strong>: we may terminate or suspend your account if you breach these Terms, with or without notice depending on the severity.</li>
            <li>Upon termination, your right to use the Service ends immediately. Provisions of these Terms that by their nature should survive termination (e.g. limitation of liability, governing law) shall survive.</li>
          </ul>

          <h2>12. Privacy</h2>
          <p>
            Your privacy matters. Our handling of personal data is described in our{" "}
            <Link to="/privacy">Privacy Policy</Link>, which forms part of these Terms.
          </p>

          <h2>13. Changes to these Terms</h2>
          <p>
            We may update these Terms from time to time. Material changes will be
            communicated in-app or by email. Continued use of the Service after
            changes means you accept the updated Terms.
          </p>

          <h2>14. Governing law and jurisdiction</h2>
          <p>
            These Terms are governed by the laws of <PH>JURISDICCIÓN</PH>,
            without regard to its conflict-of-laws provisions. Any dispute shall
            be submitted to the competent courts of <PH>JURISDICCIÓN</PH>, except
            where consumer protection law mandates a different forum.
          </p>

          <h2>15. Contact</h2>
          <p>
            For any question regarding these Terms, contact us at{" "}
            <PH>EMAIL CONTACTO</PH> or at <PH>DIRECCIÓN POSTAL</PH>.
          </p>

          <p className="mt-4">
            See also: <Link to="/privacy">Privacy Policy</Link> ·{" "}
            <Link to="/legal">Legal Notice</Link>
          </p>
        </article>
      </Container>
    </div>
  );
};

export default Terms;
