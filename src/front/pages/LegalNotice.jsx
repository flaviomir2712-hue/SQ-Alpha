import { Link } from "react-router-dom";
import { Container } from "react-bootstrap";

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
.sq-legal-card h1 { color: #fff; font-weight: 700; margin-bottom: 0.5rem; }
.sq-legal-meta { color: #6c757d; font-size: 0.85rem; margin-bottom: 2rem; }
.sq-legal-card h2 {
  color: #fff; font-size: 1.3rem; font-weight: 700;
  margin: 2rem 0 0.75rem; padding-top: 1rem;
  border-top: 1px solid #262a36;
}
.sq-legal-card h2:first-of-type { border-top: none; padding-top: 0; margin-top: 0; }
.sq-legal-card h3 { color: #e9ecef; font-size: 1.05rem; font-weight: 600; margin: 1.25rem 0 0.5rem; }
.sq-legal-card p, .sq-legal-card li, .sq-legal-card dd { color: #cbd0d8; font-size: 0.95rem; }
.sq-legal-card dt {
  color: #adb5bd; font-weight: 600; font-size: 0.85rem;
  text-transform: uppercase; letter-spacing: 0.04em; margin-top: 1rem;
}
.sq-legal-card dd { margin-left: 0; margin-bottom: 0.5rem; }
.sq-legal-card ul { padding-left: 1.25rem; }
.sq-legal-card a { color: #818cf8; text-decoration: none; }
.sq-legal-card a:hover { color: #a5b4fc; text-decoration: underline; }
`;

export const LegalNotice = () => {
  return (
    <div className="sq-legal-page">
      <style>{LEGAL_CSS}</style>
      <Container style={{ maxWidth: 820 }}>
        <article className="sq-legal-card">
          <h1>Legal Notice</h1>
          <p className="sq-legal-meta">
            Last updated: 15 June 2026 · Required under EU law (Luxembourg, France, Spain).
          </p>

          <h2>1. Site & Application Editor</h2>
          <dl>
            <dt>Name</dt>
            <dd>SideQuest</dd>

            <dt>Legal form</dt>
            <dd>
              Association de fait (unincorporated voluntary association) — Luxembourg.<br />
              <em>Note: an association de fait has no separate legal personality under Luxembourg law.
              The founders are personally and jointly liable for the association's obligations.</em>
            </dd>

            <dt>Registered address</dt>
            <dd> Luxembourg, Grand Duchy of Luxembourg</dd>

            <dt>Contact email</dt>
            <dd><a href="mailto:radiostation87.7.7@gmail.com">radiostation87.7.7@gmail.com</a></dd>

            <dt>Director of publication</dt>
            <dd>Marveen Riskwait</dd>

            <dt>Team</dt>
            <dd>
              International founding team based in Luxembourg and Spain:
              Marveen Riskwait, Flavio, Julio, Alejandro.
            </dd>

            <dt>Activity</dt>
            <dd>
              Social event mapping platform — connecting people to real-world events
              through a mobile-first web application.
            </dd>
          </dl>

          <h2>2. Hosting Provider</h2>
          <dl>
            <dt>Provider</dt>
            <dd>Fly.io Inc.</dd>
            <dt>Address</dt>
            <dd>2261 Market Street #4990, San Francisco, CA 94114, United States of America</dd>
            <dt>Primary server region</dt>
            <dd>cdg — Paris, France (European Union)</dd>
            <dt>Website</dt>
            <dd><a href="https://fly.io" target="_blank" rel="noreferrer">https://fly.io</a></dd>
            <dt>Data transfers</dt>
            <dd>Governed by Standard Contractual Clauses (SCCs) — see <Link to="/privacy">Privacy Policy §6</Link></dd>
          </dl>

          <h2>3. Media & Image Storage</h2>
          <dl>
            <dt>Provider</dt>
            <dd>Cloudinary Ltd.</dd>
            <dt>Address</dt>
            <dd>3400 Central Expressway, Suite 110, Santa Clara, CA 95051, United States of America</dd>
            <dt>Website</dt>
            <dd><a href="https://cloudinary.com" target="_blank" rel="noreferrer">https://cloudinary.com</a></dd>
            <dt>Data transfers</dt>
            <dd>Governed by Standard Contractual Clauses (SCCs)</dd>
          </dl>

          <h2>4. Email Provider</h2>
          <dl>
            <dt>Provider</dt>
            <dd>Brevo SAS (formerly Sendinblue)</dd>
            <dt>Address</dt>
            <dd>7 rue de Madrid, 75008 Paris, France (European Union)</dd>
            <dt>Website</dt>
            <dd><a href="https://www.brevo.com" target="_blank" rel="noreferrer">https://www.brevo.com</a></dd>
            <dt>Note</dt>
            <dd>Brevo is based in the EU — no international transfer safeguards required</dd>
          </dl>

          <h2>5. Intellectual Property</h2>
          <p>
            All elements of the SideQuest service — including but not limited to the name
            "SideQuest", logo, visual identity, design, interface, source code (except
            open-source components governed by their respective licenses), texts and
            illustrations — are the exclusive property of SideQuest or are used under license.
          </p>
          <p>
            Any reproduction, representation, distribution, modification, public communication
            or exploitation of these elements, in whole or in part, by any means and in any
            form whatsoever, without the prior written authorization of SideQuest, is strictly
            prohibited and may constitute an infringement under applicable intellectual property law.
          </p>
          <p>
            User-generated content (events, messages, photos, audio) remains the property of
            its authors. See our <Link to="/terms">Terms of Service §5</Link> for the license
            granted to SideQuest.
          </p>

          <h2>6. Trademarks</h2>
          <p>
            "SideQuest" and the SideQuest logo and visual identity are unregistered trademarks
            of SideQuest. Any unauthorized use, reproduction or imitation is prohibited and
            may give rise to legal action.
          </p>

          <h2>7. Map Data & Open Source</h2>
          <p>
            The map background is provided by{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap contributors
            </a>{" "}
            and is made available under the{" "}
            <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">
              Open Database License (ODbL)
            </a>.
          </p>
          <p>
            The application uses open-source software components. A list of open-source
            dependencies and their licenses is available upon request at{" "}
            <a href="mailto:radiostation87.7.7@gmail.com">radiostation87.7.7@gmail.com</a>.
          </p>

          <h2>8. Links to Third-Party Websites</h2>
          <p>
            The Service may contain links to third-party websites or services. SideQuest
            has no control over and accepts no responsibility for the content, privacy
            policies or practices of those websites. We encourage you to review the privacy
            policy of every site you visit.
          </p>

          <h2>9. Reporting Illegal Content (DSA)</h2>
          <p>
            In accordance with the EU Digital Services Act (Regulation 2022/2065), users
            may report content they consider to be illegal or in violation of our Terms
            of Service at any time by sending an email to:
          </p>
          <ul>
            <li><strong>Email</strong>: <a href="mailto:radiostation87.7.7@gmail.com">radiostation87.7.7@gmail.com</a></li>
            <li><strong>Subject</strong>: "Content Report — DSA"</li>
            <li><strong>Include</strong>: URL of the content, reason for the report, and your contact information</li>
          </ul>
          <p>
            We will acknowledge all reports and process them in a timely manner. You will
            be informed of the outcome and have the right to appeal our decision.
          </p>

          <h2>10. DSA Single Point of Contact</h2>
          <p>
            Our single point of contact for the purposes of the Digital Services Act and
            for EU member state authorities is:
          </p>
          <ul>
            <li><strong>Name</strong>: Marveen Riskwait</li>
            <li><strong>Email</strong>: <a href="mailto:radiostation87.7.7@gmail.com">radiostation87.7.7@gmail.com</a></li>
            <li><strong>Address</strong>:  Luxembourg, Luxembourg</li>
            <li><strong>Languages</strong>: English, French, Spanish, Portuguese</li>
          </ul>

          <h2>11. Personal Data & Cookies</h2>
          <p>
            Information about how we process personal data and use cookies is set out in
            our <Link to="/privacy">Privacy Policy</Link>.
          </p>

          <h2>12. Disclaimer of Liability</h2>
          <p>
            The information published on this Service is provided for general informational
            purposes only. SideQuest makes no representations or warranties of any kind,
            express or implied, as to the completeness, accuracy, reliability, suitability
            or availability of the Service or the information, events, products, services
            or related graphics contained on the Service.
          </p>
          <p>
            SideQuest is not responsible for the content, accuracy or safety of user-generated
            events or communications. See our <Link to="/terms">Terms of Service</Link> for
            full liability provisions.
          </p>

          <h2>13. Applicable Law</h2>
          <p>
            This Legal Notice is governed by the laws of the Grand Duchy of Luxembourg.
            Any dispute relating to this notice shall be submitted to the exclusive
            jurisdiction of the competent courts of Luxembourg City, except where mandatory
            consumer protection law requires otherwise.
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
