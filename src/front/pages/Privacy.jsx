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
.sq-legal-card p, .sq-legal-card li { color: #cbd0d8; font-size: 0.95rem; }
.sq-legal-card ul, .sq-legal-card ol { padding-left: 1.25rem; }
.sq-legal-card a { color: #818cf8; text-decoration: none; }
.sq-legal-card a:hover { color: #a5b4fc; text-decoration: underline; }
.sq-legal-toc {
  background: #0f111a; border: 1px solid #262a36;
  border-radius: 10px; padding: 1rem 1.25rem; margin-bottom: 2rem;
}
.sq-legal-toc h2 {
  border: none !important; padding: 0 !important; margin: 0 0 0.5rem !important;
  font-size: 0.85rem !important; text-transform: uppercase;
  letter-spacing: 0.08em; color: #adb5bd !important;
}
.sq-legal-toc ol { margin: 0; padding-left: 1.25rem; }
.sq-legal-toc li { font-size: 0.9rem; margin: 0.2rem 0; }
.sq-legal-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  margin: 1rem 0;
}
.sq-legal-table th {
  background: #0f111a;
  color: #adb5bd;
  padding: 0.6rem 0.8rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border: 1px solid #262a36;
}
.sq-legal-table td {
  padding: 0.6rem 0.8rem;
  border: 1px solid #262a36;
  color: #cbd0d8;
  vertical-align: top;
}
.sq-legal-highlight {
  background: rgba(99,102,241,0.08);
  border-left: 3px solid #6366f1;
  padding: 0.75rem 1rem;
  border-radius: 0 8px 8px 0;
  margin: 1rem 0;
}
`;

export const Privacy = () => {
  return (
    <div className="sq-legal-page">
      <style>{LEGAL_CSS}</style>
      <Container style={{ maxWidth: 820 }}>
        <article className="sq-legal-card">
          <h1>Privacy Policy</h1>
          <p className="sq-legal-meta">
            Last updated: 15 June 2026 · This policy applies to all users of SideQuest worldwide.
          </p>

          <nav className="sq-legal-toc" aria-label="Table of contents">
            <h2>On this page</h2>
            <ol>
              <li><a href="#controller">Data Controller</a></li>
              <li><a href="#data-collected">Data We Collect</a></li>
              <li><a href="#how-we-use">How We Use Your Data</a></li>
              <li><a href="#legal-basis">Legal Basis (GDPR Art. 6)</a></li>
              <li><a href="#sharing">Sharing & Third Parties</a></li>
              <li><a href="#international">International Data Transfers</a></li>
              <li><a href="#retention">Retention Periods</a></li>
              <li><a href="#your-rights">Your Rights under GDPR</a></li>
              <li><a href="#cookies">Cookies & Local Storage</a></li>
              <li><a href="#location">Location Data</a></li>
              <li><a href="#minors">Minors</a></li>
              <li><a href="#automated">Automated Decision-Making</a></li>
              <li><a href="#security">Security</a></li>
              <li><a href="#breach">Data Breach Procedure</a></li>
              <li><a href="#changes">Changes to This Policy</a></li>
              <li><a href="#contact">Contact & Complaints</a></li>
            </ol>
          </nav>

          {/* 1 */}
          <h2 id="controller">1. Data Controller</h2>
          <p>
            SideQuest, an unincorporated association ("association de fait") established
            under Luxembourg law, is the data controller for personal data processed
            through the SideQuest application and website.
          </p>
          <ul>
            <li><strong>Name</strong>: SideQuest</li>
            <li><strong>Address</strong>:  Luxembourg, Luxembourg</li>
            <li><strong>Email</strong>: <a href="mailto:radiostation87.7.7@gmail.com">radiostation87.7.7@gmail.com</a></li>
            <li><strong>Representative</strong>: Marveen Riskwait</li>
          </ul>
          <p>
            We are subject to the EU General Data Protection Regulation (GDPR) and the
            Luxembourg Law of 1 August 2018 on data protection.
          </p>

          {/* 2 */}
          <h2 id="data-collected">2. Data We Collect</h2>
          <h3>2.1 Data you provide directly</h3>
          <table className="sq-legal-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Data</th>
                <th>Required?</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Account</td>
                <td>Email address, username, password (hashed — never stored in clear text)</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>Profile (optional)</td>
                <td>First name, last name, city, biography, phone number, birthdate, profile picture</td>
                <td>No</td>
              </tr>
              <tr>
                <td>Events</td>
                <td>Title, description, date, time, location, cover image, visibility setting, invited friends</td>
                <td>Yes (if creating events)</td>
              </tr>
              <tr>
                <td>Communications</td>
                <td>Text messages, photos, audio recordings sent via in-app chat</td>
                <td>Yes (if using chat)</td>
              </tr>
              <tr>
                <td>Social graph</td>
                <td>Friend requests sent, received and accepted</td>
                <td>Yes (if using social features)</td>
              </tr>
            </tbody>
          </table>

          <h3>2.2 Data collected automatically</h3>
          <table className="sq-legal-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Data</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Location</td>
                <td>GPS coordinates (only with your browser permission)</td>
                <td>Map centering, showing nearby events — in-session only, not stored</td>
              </tr>
              <tr>
                <td>Technical</td>
                <td>IP address, browser type, OS, device type, language</td>
                <td>Security, fraud prevention</td>
              </tr>
              <tr>
                <td>Usage</td>
                <td>Pages visited, events viewed, RSVPs, feature interactions</td>
                <td>Service improvement</td>
              </tr>
              <tr>
                <td>Session</td>
                <td>Authentication token (JWT in httpOnly cookie)</td>
                <td>Keeping you signed in</td>
              </tr>
            </tbody>
          </table>

          {/* 3 */}
          <h2 id="how-we-use">3. How We Use Your Data</h2>
          <ul>
            <li><strong>Account management</strong>: create, maintain and authenticate your account.</li>
            <li><strong>Core service</strong>: deliver the map, events, chat, friends and notification features.</li>
            <li><strong>Communications</strong>: send transactional emails (password reset, email verification, security alerts). We do <strong>not</strong> send marketing emails without your explicit consent.</li>
            <li><strong>Safety & security</strong>: detect, prevent and investigate fraud, abuse, illegal activity and security incidents.</li>
            <li><strong>Service improvement</strong>: understand how users interact with the Service to fix bugs and improve features.</li>
            <li><strong>Legal compliance</strong>: comply with applicable laws, regulations and lawful requests from authorities.</li>
          </ul>
          <p>
            We do <strong>not</strong> use your data for advertising, sell it to third parties,
            or use it to train AI/ML models.
          </p>

          {/* 4 */}
          <h2 id="legal-basis">4. Legal Basis for Processing (GDPR Art. 6)</h2>
          <table className="sq-legal-table">
            <thead>
              <tr>
                <th>Processing activity</th>
                <th>Legal basis</th>
                <th>GDPR Article</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Account creation & authentication</td>
                <td>Performance of contract</td>
                <td>Art. 6.1.b</td>
              </tr>
              <tr>
                <td>Delivering events, chat, map, friends features</td>
                <td>Performance of contract</td>
                <td>Art. 6.1.b</td>
              </tr>
              <tr>
                <td>Transactional emails (password reset, verification)</td>
                <td>Performance of contract</td>
                <td>Art. 6.1.b</td>
              </tr>
              <tr>
                <td>Security logs & fraud prevention</td>
                <td>Legitimate interest</td>
                <td>Art. 6.1.f</td>
              </tr>
              <tr>
                <td>Service analytics & improvement</td>
                <td>Legitimate interest</td>
                <td>Art. 6.1.f</td>
              </tr>
              <tr>
                <td>Browser geolocation</td>
                <td>Consent (withdrawable at any time)</td>
                <td>Art. 6.1.a</td>
              </tr>
              <tr>
                <td>Optional profile fields</td>
                <td>Consent (withdrawable at any time)</td>
                <td>Art. 6.1.a</td>
              </tr>
              <tr>
                <td>Compliance with legal obligations</td>
                <td>Legal obligation</td>
                <td>Art. 6.1.c</td>
              </tr>
            </tbody>
          </table>

          {/* 5 */}
          <h2 id="sharing">5. Sharing & Third Parties</h2>
          <p>
            We do <strong>not</strong> sell, rent or trade your personal data.
            We share data only with the following categories of recipients:
          </p>
          <table className="sq-legal-table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Purpose</th>
                <th>Location</th>
                <th>Safeguard</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Fly.io Inc.</td>
                <td>Cloud hosting & infrastructure</td>
                <td>USA (EU region cdg — Paris)</td>
                <td>DPA + Standard Contractual Clauses (SCCs)</td>
              </tr>
              <tr>
                <td>Brevo (Sendinblue)</td>
                <td>Transactional email delivery</td>
                <td>France (EU)</td>
                <td>DPA — adequacy (EU)</td>
              </tr>
              <tr>
                <td>Cloudinary Ltd.</td>
                <td>Image & media storage</td>
                <td>USA</td>
                <td>DPA + SCCs</td>
              </tr>
              <tr>
                <td>OpenStreetMap</td>
                <td>Map tile rendering</td>
                <td>EU</td>
                <td>No account data shared — tile requests only</td>
              </tr>
              <tr>
                <td>Law enforcement / authorities</td>
                <td>Legal compliance, lawful orders</td>
                <td>Varies</td>
                <td>Only when legally required</td>
              </tr>
            </tbody>
          </table>
          <p>
            All third-party processors are bound by Data Processing Agreements (DPAs) that
            require them to process your data only on our instructions, implement appropriate
            security measures, and comply with GDPR.
          </p>

          {/* 6 */}
          <h2 id="international">6. International Data Transfers</h2>
          <p>
            Some of our third-party service providers (Fly.io, Cloudinary) are based in the
            United States, which is not considered to provide an equivalent level of data
            protection to the EU/EEA by default.
          </p>
          <p>
            For these transfers, we rely on <strong>Standard Contractual Clauses (SCCs)</strong>{" "}
            approved by the European Commission under GDPR Art. 46.2(c), which contractually
            require the recipient to provide equivalent protection to EU data subjects.
          </p>
          <p>
            Our primary server infrastructure is deployed in the <strong>cdg (Paris, France)</strong>{" "}
            region of Fly.io, meaning your data is primarily stored within the EU.
          </p>
          <p>
            You have the right to obtain a copy of the SCCs by contacting us at{" "}
            <a href="mailto:radiostation87.7.7@gmail.com">radiostation87.7.7@gmail.com</a>.
          </p>

          {/* 7 */}
          <h2 id="retention">7. Retention Periods</h2>
          <table className="sq-legal-table">
            <thead>
              <tr>
                <th>Data category</th>
                <th>Retention period</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Account & profile data</td>
                <td>Until account deletion + 30 days</td>
                <td>Service delivery; erasure window</td>
              </tr>
              <tr>
                <td>Event data</td>
                <td>Until deleted by user or account deletion + 30 days</td>
                <td>Service delivery</td>
              </tr>
              <tr>
                <td>Chat messages</td>
                <td>Until deleted by user or account deletion + 30 days</td>
                <td>Service delivery</td>
              </tr>
              <tr>
                <td>Security logs (IP addresses)</td>
                <td>90 days</td>
                <td>Security & fraud prevention</td>
              </tr>
              <tr>
                <td>Email delivery logs</td>
                <td>30 days</td>
                <td>Troubleshooting</td>
              </tr>
              <tr>
                <td>Legal holds</td>
                <td>As required by applicable law</td>
                <td>Legal obligation</td>
              </tr>
            </tbody>
          </table>
          <p>
            After the applicable retention period, data is securely deleted or irreversibly
            anonymized.
          </p>

          {/* 8 */}
          <h2 id="your-rights">8. Your Rights under GDPR</h2>
          <p>
            As a data subject under the GDPR, you have the following rights, which you may
            exercise free of charge by contacting us at{" "}
            <a href="mailto:radiostation87.7.7@gmail.com">radiostation87.7.7@gmail.com</a>:
          </p>
          <table className="sq-legal-table">
            <thead>
              <tr>
                <th>Right</th>
                <th>What it means</th>
                <th>GDPR Article</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Access</td>
                <td>Obtain a copy of your personal data and information about how we process it</td>
                <td>Art. 15</td>
              </tr>
              <tr>
                <td>Rectification</td>
                <td>Correct inaccurate or complete incomplete data</td>
                <td>Art. 16</td>
              </tr>
              <tr>
                <td>Erasure ("right to be forgotten")</td>
                <td>Request deletion of your data (subject to legal retention obligations)</td>
                <td>Art. 17</td>
              </tr>
              <tr>
                <td>Restriction of processing</td>
                <td>Request that we limit how we use your data in certain circumstances</td>
                <td>Art. 18</td>
              </tr>
              <tr>
                <td>Data portability</td>
                <td>Receive your data in a structured, machine-readable format (JSON/CSV)</td>
                <td>Art. 20</td>
              </tr>
              <tr>
                <td>Object</td>
                <td>Object to processing based on legitimate interests or for direct marketing</td>
                <td>Art. 21</td>
              </tr>
              <tr>
                <td>Withdraw consent</td>
                <td>Withdraw any consent given at any time, without affecting past processing</td>
                <td>Art. 7.3</td>
              </tr>
              <tr>
                <td>Lodge a complaint</td>
                <td>File a complaint with the CNPD (Luxembourg supervisory authority)</td>
                <td>Art. 77</td>
              </tr>
            </tbody>
          </table>
          <p>
            We will respond to your request within <strong>30 days</strong>. In complex cases,
            we may extend this by an additional 60 days and will notify you accordingly.
            We may need to verify your identity before processing your request.
          </p>
          <p>
            <strong>Luxembourg supervisory authority (CNPD)</strong>:<br />
            Commission Nationale pour la Protection des Données<br />
            15, boulevard du Jazz — L-4370 Belvaux, Luxembourg<br />
            <a href="https://cnpd.public.lu" target="_blank" rel="noreferrer">cnpd.public.lu</a>
          </p>

          {/* 9 */}
          <h2 id="cookies">9. Cookies & Local Storage</h2>
          <p>
            We use only <strong>strictly necessary</strong> cookies and local storage
            required to operate the Service. These do not require your consent under the
            ePrivacy Directive (2002/58/EC) because they are essential for the Service to function.
          </p>
          <table className="sq-legal-table">
            <thead>
              <tr>
                <th>Name / type</th>
                <th>Purpose</th>
                <th>Duration</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>JWT auth cookie</td>
                <td>Keeps you signed in securely</td>
                <td>Session / configurable</td>
                <td>httpOnly, Secure, SameSite=None</td>
              </tr>
              <tr>
                <td>User preferences (localStorage)</td>
                <td>Stores UI preferences (theme, language)</td>
                <td>Until cleared</td>
                <td>Local storage — no server transmission</td>
              </tr>
            </tbody>
          </table>
          <p>
            We do <strong>not</strong> use advertising cookies, third-party analytics that
            profile users (e.g. Google Analytics), social media pixels, or cross-site tracking.
          </p>

          {/* 10 */}
          <h2 id="location">10. Location Data</h2>
          <p>
            Location access is <strong>optional</strong> and entirely controlled by you through
            your browser or device settings. We request your location only to:
          </p>
          <ul>
            <li>Center the map on your current position.</li>
            <li>Show events near you.</li>
          </ul>
          <div className="sq-legal-highlight">
            <p>
              <strong>We never store your location persistently.</strong> Your coordinates
              are used in-session only (in your browser's memory) and are never saved to our
              database or transmitted to third parties. You can revoke location permission at
              any time in your browser settings.
            </p>
          </div>
          <p>
            Event locations you manually enter when creating an event are stored as part of
            your event data and are subject to the visibility setting you choose (public or private).
          </p>

          {/* 11 */}
          <h2 id="minors">11. Minors</h2>
          <p>
            SideQuest is not directed at children under 16 years of age (or the applicable
            digital age of consent in your country under GDPR Art. 8). We do not knowingly
            collect personal data from users below this age.
          </p>
          <p>
            If we become aware that we have collected personal data from a child under 16
            without appropriate parental consent, we will delete that data promptly. If you
            are a parent or guardian and believe your child has created a SideQuest account,
            please contact us at{" "}
            <a href="mailto:radiostation87.7.7@gmail.com">radiostation87.7.7@gmail.com</a>.
          </p>

          {/* 12 */}
          <h2 id="automated">12. Automated Decision-Making & Profiling</h2>
          <p>
            SideQuest does <strong>not</strong> make automated decisions that produce legal
            or similarly significant effects about you (GDPR Art. 22). We do not use your
            data for algorithmic profiling for advertising or discrimination purposes.
          </p>
          <p>
            Basic technical operations (e.g. filtering events by proximity or date) are
            performed in real-time based on your explicit inputs and do not constitute
            profiling under GDPR.
          </p>

          {/* 13 */}
          <h2 id="security">13. Security Measures</h2>
          <p>
            We implement appropriate technical and organizational measures to protect your
            personal data against unauthorized access, loss, destruction or disclosure:
          </p>
          <ul>
            <li><strong>Passwords</strong>: stored using bcrypt hashing with salt — never in clear text.</li>
            <li><strong>Transit encryption</strong>: all communications use TLS 1.2+ (HTTPS).</li>
            <li><strong>Authentication tokens</strong>: JWT stored in httpOnly, Secure cookies — inaccessible to JavaScript.</li>
            <li><strong>Access control</strong>: production systems are accessible only to authorized team members.</li>
            <li><strong>Infrastructure</strong>: hosted on Fly.io with network isolation, managed firewalls and regular security updates.</li>
            <li><strong>Media</strong>: user-uploaded files stored on Cloudinary with access controls.</li>
          </ul>
          <p>
            No system is 100% secure. We encourage you to use a strong, unique password and
            to contact us immediately if you suspect unauthorized access to your account.
          </p>

          {/* 14 */}
          <h2 id="breach">14. Data Breach Procedure</h2>
          <p>
            In the event of a personal data breach:
          </p>
          <ul>
            <li>We will notify the <strong>CNPD within 72 hours</strong> of becoming aware of the breach, as required by GDPR Art. 33, where the breach is likely to result in a risk to individuals' rights and freedoms.</li>
            <li>Where the breach is likely to result in a <strong>high risk</strong> to your rights and freedoms, we will notify you directly without undue delay (GDPR Art. 34).</li>
            <li>Notification to you will be sent to your registered email address and/or posted prominently in the app.</li>
            <li>We will document all breaches internally, including those not requiring notification.</li>
          </ul>

          {/* 15 */}
          <h2 id="changes">15. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy to reflect changes in applicable law, our
            practices or the Service. We will notify you of material changes at least 30 days
            in advance by email or in-app notification. For non-material changes, we will
            update the "Last updated" date at the top of this page.
          </p>
          <p>
            We encourage you to review this policy periodically. Continued use of the Service
            after changes take effect constitutes your acceptance of the updated policy.
          </p>

          {/* 16 */}
          <h2 id="contact">16. Contact & Complaints</h2>
          <p>
            For any privacy-related question, request or complaint:
          </p>
          <ul>
            <li><strong>Email</strong>: <a href="mailto:radiostation87.7.7@gmail.com">radiostation87.7.7@gmail.com</a></li>
            <li><strong>Post</strong>: SideQuest,  Luxembourg, Luxembourg</li>
            <li><strong>Response time</strong>: within 30 days</li>
          </ul>
          <p>
            You also have the right to lodge a complaint with the Luxembourg data protection
            authority:
          </p>
          <ul>
            <li><strong>CNPD</strong> — Commission Nationale pour la Protection des Données</li>
            <li>15, boulevard du Jazz — L-4370 Belvaux, Luxembourg</li>
            <li><a href="https://cnpd.public.lu" target="_blank" rel="noreferrer">cnpd.public.lu</a></li>
          </ul>
          <p>
            EU Online Dispute Resolution:{" "}
            <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer">
              ec.europa.eu/consumers/odr
            </a>
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
