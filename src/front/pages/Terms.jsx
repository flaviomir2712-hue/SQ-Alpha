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
.sq-legal-highlight {
  background: rgba(99,102,241,0.08);
  border-left: 3px solid #6366f1;
  padding: 0.75rem 1rem;
  border-radius: 0 8px 8px 0;
  margin: 1rem 0;
}
`;

export const Terms = () => {
  return (
    <div className="sq-legal-page">
      <style>{LEGAL_CSS}</style>
      <Container style={{ maxWidth: 820 }}>
        <article className="sq-legal-card">
          <h1>Terms of Service</h1>
          <p className="sq-legal-meta">
            Last updated: 15 June 2026 · Effective immediately for new users.
            Existing users will be notified of material changes by email or in-app notification.
          </p>

          <nav className="sq-legal-toc" aria-label="Table of contents">
            <h2>On this page</h2>
            <ol>
              <li><a href="#acceptance">Acceptance of Terms</a></li>
              <li><a href="#eligibility">Eligibility</a></li>
              <li><a href="#account">Your Account</a></li>
              <li><a href="#license">License to Use</a></li>
              <li><a href="#ugc">User Content</a></li>
              <li><a href="#prohibited">Prohibited Conduct</a></li>
              <li><a href="#events">Events</a></li>
              <li><a href="#ip">Intellectual Property</a></li>
              <li><a href="#dmca">Copyright & DMCA / EU Takedown</a></li>
              <li><a href="#ai">Artificial Intelligence</a></li>
              <li><a href="#dsa">Digital Services Act (DSA)</a></li>
              <li><a href="#moderation">Moderation & Enforcement</a></li>
              <li><a href="#availability">Service Availability</a></li>
              <li><a href="#disclaimer">Disclaimer of Warranties</a></li>
              <li><a href="#liability">Limitation of Liability</a></li>
              <li><a href="#indemnification">Indemnification</a></li>
              <li><a href="#termination">Termination</a></li>
              <li><a href="#privacy">Privacy</a></li>
              <li><a href="#force-majeure">Force Majeure</a></li>
              <li><a href="#changes">Changes to These Terms</a></li>
              <li><a href="#general">General Provisions</a></li>
              <li><a href="#governing-law">Governing Law & Jurisdiction</a></li>
              <li><a href="#contact">Contact</a></li>
            </ol>
          </nav>

          {/* 1 */}
          <h2 id="acceptance">1. Acceptance of Terms</h2>
          <p>
            These Terms of Service ("Terms") constitute a legally binding agreement between
            you and SideQuest, an unincorporated association ("association de fait") based at
             Luxembourg, Luxembourg ("SideQuest", "we", "us", "our"),
            governing your access to and use of the SideQuest application, website, APIs and
            all related services (collectively, the "Service").
          </p>
          <p>
            By creating an account, clicking "I agree", accessing or using the Service in any
            way, you confirm that you have read, understood and agree to be bound by these Terms
            and our <Link to="/privacy">Privacy Policy</Link>. If you do not agree, you must not
            use the Service.
          </p>
          <p>
            These Terms apply in addition to any other agreements you may have with us. In case
            of conflict, the more specific agreement prevails.
          </p>

          {/* 2 */}
          <h2 id="eligibility">2. Eligibility</h2>
          <ul>
            <li>You must be at least <strong>16 years old</strong> (or the applicable digital age of consent in your country under GDPR Art. 8) to create an account.</li>
            <li>If you are between 16 and 18, you confirm that you have obtained parental or guardian consent where required by your local law.</li>
            <li>You must have the legal capacity to enter into a binding contract under the laws of your country of residence.</li>
            <li>You must not be barred from using the Service under applicable law.</li>
            <li>You must not have had a previous SideQuest account terminated for violations of these Terms.</li>
          </ul>

          {/* 3 */}
          <h2 id="account">3. Your Account</h2>
          <ul>
            <li>You must provide accurate, complete and up-to-date information when creating your account. You agree to keep this information current.</li>
            <li>You are solely responsible for safeguarding your login credentials. Do not share your password with anyone.</li>
            <li>You are responsible for all activity that occurs under your account, whether or not you authorized it. Notify us immediately at <a href="mailto:radiostation87.7.7@gmail.com">radiostation87.7.7@gmail.com</a> if you suspect unauthorized use.</li>
            <li>One account per person. Creating multiple accounts to circumvent bans, restrictions or these Terms is prohibited.</li>
            <li>Impersonating another person, organization or brand is strictly prohibited.</li>
            <li>Your username must not infringe any trademark or third-party rights and must not be offensive or misleading.</li>
          </ul>

          {/* 4 */}
          <h2 id="license">4. License to Use the Service</h2>
          <p>
            Subject to your compliance with these Terms, we grant you a limited, non-exclusive,
            non-transferable, revocable, personal license to access and use the Service for your
            own personal, non-commercial purposes. This license does not include the right to:
          </p>
          <ul>
            <li>Sublicense, sell, resell, transfer, assign or otherwise exploit the Service.</li>
            <li>Modify, translate, adapt, or create derivative works based on the Service.</li>
            <li>Reverse-engineer, decompile, disassemble, or attempt to derive the source code of the Service (except to the extent permitted by applicable law).</li>
            <li>Use the Service to build a competing product or service.</li>
            <li>Remove any copyright, trademark or other proprietary notices from any part of the Service.</li>
          </ul>
          <p>
            We reserve all rights not expressly granted in these Terms.
          </p>

          {/* 5 */}
          <h2 id="ugc">5. User Content</h2>
          <h3>5.1 Ownership</h3>
          <p>
            You retain all intellectual property rights in the content you create and post on
            SideQuest ("User Content"), including events, messages, photos, audio recordings
            and profile information.
          </p>

          <h3>5.2 License granted to SideQuest</h3>
          <p>
            By posting User Content on the Service, you grant SideQuest a worldwide,
            non-exclusive, royalty-free, sublicensable, transferable license to host, store,
            display, reproduce, modify (for formatting/technical purposes only), distribute
            and make available that User Content solely to operate, provide, maintain and
            improve the Service. This license ends when you delete your content or your account,
            subject to reasonable technical delays.
          </p>
          <p>
            We do <strong>not</strong> claim ownership of your User Content and will not use
            it for advertising, AI training or any purpose beyond operating the Service without
            your explicit separate consent.
          </p>

          <h3>5.3 Your representations</h3>
          <p>By posting User Content you represent and warrant that:</p>
          <ul>
            <li>You own or have the necessary rights, licenses and permissions to post that content.</li>
            <li>The content does not infringe any third-party intellectual property, privacy, personality or other rights.</li>
            <li>The content complies with these Terms and all applicable laws.</li>
            <li>The content does not contain personal data of third parties without their consent.</li>
          </ul>

          <h3>5.4 Content standards</h3>
          <p>User Content must not:</p>
          <ul>
            <li>Be false, misleading, defamatory, threatening, abusive, harassing, hateful or discriminatory.</li>
            <li>Contain sexually explicit material or content involving minors in any sexual context.</li>
            <li>Promote violence, self-harm, terrorism or illegal activities.</li>
            <li>Violate anyone's privacy (e.g. sharing personal data, images or location without consent — "doxing").</li>
            <li>Infringe any intellectual property rights.</li>
            <li>Contain spam, unsolicited commercial messages, pyramid schemes or malware.</li>
            <li>Impersonate any person or entity.</li>
            <li>Contain content designed to deceive others about the nature, origin or facts of an event.</li>
          </ul>

          {/* 6 */}
          <h2 id="prohibited">6. Prohibited Conduct</h2>
          <p>You agree NOT to:</p>
          <ul>
            <li>Scrape, harvest, crawl or programmatically collect data about users or events without our express written permission.</li>
            <li>Use automated tools, bots, scripts or macros to interact with the Service in ways that disrupt normal operation or gain unfair advantage.</li>
            <li>Attempt to gain unauthorized access to any part of the Service, other accounts, or our infrastructure.</li>
            <li>Probe, scan or test the vulnerability of any system or network without authorization.</li>
            <li>Introduce viruses, trojans, worms or any malicious code.</li>
            <li>Conduct denial-of-service (DoS or DDoS) attacks.</li>
            <li>Misuse the location feature to stalk, track or harass other users.</li>
            <li>Circumvent, disable or otherwise interfere with security-related features.</li>
            <li>Use the Service for any commercial purpose without our express written permission.</li>
            <li>Access the Service through means other than our official interfaces and APIs.</li>
            <li>Facilitate or encourage others to do any of the above.</li>
          </ul>

          {/* 7 */}
          <h2 id="events">7. Events Created on SideQuest</h2>
          <p>
            You are the organizer of any event you create. You are solely responsible for:
          </p>
          <ul>
            <li>Obtaining all necessary venue permissions, authorizations and permits.</li>
            <li>Ensuring the safety of participants and compliance with applicable health, safety and public order regulations.</li>
            <li>The accuracy of all event information (date, location, description, capacity, etc.).</li>
            <li>The conduct of participants at your event.</li>
            <li>Any contractual relationship with participants, venues or third-party service providers.</li>
          </ul>
          <p>
            SideQuest is a neutral platform and is <strong>not</strong> the organiser,
            co-organiser, venue operator or agent of any event. We do not verify, endorse
            or guarantee the accuracy, safety or legality of any event listed on the Service.
            Attending or organising any event is entirely at your own risk.
          </p>

          {/* 8 */}
          <h2 id="ip">8. Intellectual Property</h2>
          <p>
            The Service and all its components — including but not limited to the SideQuest
            name, logo, trademarks, design, graphics, software, source code (except
            open-source components under their respective licenses), text and other materials —
            are the exclusive property of SideQuest or are licensed to us. All rights reserved.
          </p>
          <p>
            Nothing in these Terms grants you any right to use our trademarks, trade names,
            logos or service marks without our prior written consent.
          </p>
          <p>
            Map data is provided by <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> under the Open Database License (ODbL).
          </p>

          {/* 9 */}
          <h2 id="dmca">9. Copyright Infringement — Takedown Procedure</h2>
          <p>
            We respect intellectual property rights and comply with the EU Directive on
            Copyright in the Digital Single Market (2019/790) and, where applicable, the
            U.S. Digital Millennium Copyright Act (DMCA).
          </p>
          <p>
            If you believe that content on SideQuest infringes your copyright, please send
            a notice to <a href="mailto:radiostation87.7.7@gmail.com">radiostation87.7.7@gmail.com</a> containing:
          </p>
          <ul>
            <li>Identification of the copyrighted work claimed to be infringed.</li>
            <li>Identification of the infringing material and its location on the Service (URL).</li>
            <li>Your contact information (name, address, email, phone).</li>
            <li>A statement that you have a good-faith belief that the use is not authorized.</li>
            <li>A statement that the information in the notice is accurate.</li>
            <li>Your physical or electronic signature.</li>
          </ul>
          <p>
            We will process valid notices promptly. Repeat infringers' accounts may be terminated.
            Submitting a false notice may expose you to legal liability.
          </p>
          <p>
            If your content was removed and you believe this was in error, you may submit a
            counter-notice to the same address with the equivalent information and a statement
            that you consent to the jurisdiction of the competent courts.
          </p>

          {/* 10 */}
          <h2 id="ai">10. Artificial Intelligence</h2>
          <p>
            SideQuest does <strong>not</strong> use your User Content to train artificial
            intelligence or machine learning models, and does not sell your data to any
            third party for this purpose.
          </p>
          <p>
            If you use AI-generated content on SideQuest (e.g. AI-generated event descriptions
            or images), you remain solely responsible for that content and must ensure it:
          </p>
          <ul>
            <li>Does not infringe third-party intellectual property rights.</li>
            <li>Is not misleading, deceptive or harmful.</li>
            <li>Complies with applicable EU AI Act regulations where applicable.</li>
          </ul>
          <p>
            We reserve the right to label or remove AI-generated content that violates
            these standards.
          </p>

          {/* 11 */}
          <h2 id="dsa">11. Digital Services Act (DSA) Compliance</h2>
          <p>
            As a platform operating in the European Union, SideQuest is subject to
            Regulation (EU) 2022/2065 on a Single Market For Digital Services ("DSA").
          </p>
          <h3>11.1 Content reporting</h3>
          <p>
            Users may report illegal content or content that violates these Terms at any time
            by emailing <a href="mailto:radiostation87.7.7@gmail.com">radiostation87.7.7@gmail.com</a>{" "}
            with the subject line "Content Report" and including the URL of the content and
            the reason for the report. We will process all reports in a timely manner and
            inform you of the outcome.
          </p>
          <h3>11.2 Transparency</h3>
          <p>
            We publish our content moderation approach in these Terms (Section 12). We do not
            use algorithmic recommendation systems that profile users for advertising.
          </p>
          <h3>11.3 Single point of contact</h3>
          <p>
            Our single point of contact for DSA purposes and for EU authorities is:{" "}
            <a href="mailto:radiostation87.7.7@gmail.com">radiostation87.7.7@gmail.com</a> —
            Marveen Riskwait,  Luxembourg, Luxembourg.
          </p>

          {/* 12 */}
          <h2 id="moderation">12. Moderation & Enforcement</h2>
          <p>
            We may, at our reasonable discretion and without prior notice where urgency requires:
          </p>
          <ul>
            <li>Remove or restrict access to any User Content that violates these Terms or applicable law.</li>
            <li>Temporarily suspend or permanently terminate your account.</li>
            <li>Issue warnings or restrict specific features.</li>
            <li>Report illegal content or activity to competent law enforcement or judicial authorities.</li>
          </ul>
          <p>
            Where we take action against your account or content, we will notify you (unless
            legally prohibited from doing so) and provide a brief explanation. You may appeal
            any moderation decision by contacting us at{" "}
            <a href="mailto:radiostation87.7.7@gmail.com">radiostation87.7.7@gmail.com</a>{" "}
            within 30 days. We will review appeals in good faith.
          </p>
          <p>
            We are not obliged to monitor all content proactively but will act expeditiously
            upon valid reports.
          </p>

          {/* 13 */}
          <h2 id="availability">13. Service Availability</h2>
          <p>
            We strive to keep SideQuest available 24 hours a day, 7 days a week, but we do
            not guarantee uninterrupted, error-free or secure access. The Service is provided
            on an "as is" and "as available" basis. We may:
          </p>
          <ul>
            <li>Perform scheduled or emergency maintenance with or without prior notice.</li>
            <li>Modify, suspend or discontinue any feature or the entire Service at any time.</li>
            <li>Impose usage limits to protect the integrity of the Service.</li>
          </ul>
          <p>
            We shall not be liable for any loss or damage resulting from unavailability of
            the Service.
          </p>

          {/* 14 */}
          <h2 id="disclaimer">14. Disclaimer of Warranties</h2>
          <div className="sq-legal-highlight">
            <p>
              <strong>To the maximum extent permitted by applicable law</strong>, the Service
              is provided "as is" and "as available" without warranties of any kind, whether
              express or implied, including but not limited to implied warranties of
              merchantability, fitness for a particular purpose, non-infringement, accuracy,
              or uninterrupted availability.
            </p>
          </div>
          <p>
            We do not warrant that: (a) the Service will meet your requirements; (b) the
            Service will be uninterrupted, timely, secure or error-free; (c) results obtained
            from the Service will be accurate or reliable; (d) any errors will be corrected.
          </p>
          <p>
            We are not responsible for the conduct, content, or actions of other users,
            third-party services, or events organized through the Service.
          </p>

          {/* 15 */}
          <h2 id="liability">15. Limitation of Liability</h2>
          <div className="sq-legal-highlight">
            <p>
              <strong>To the maximum extent permitted by applicable law</strong>, SideQuest,
              its founders, team members, partners, licensors and service providers shall not
              be liable for any indirect, incidental, special, consequential, punitive or
              exemplary damages, including but not limited to: loss of profits, loss of data,
              loss of goodwill, business interruption, personal injury or property damage,
              arising out of or in connection with these Terms or your use of or inability
              to use the Service, even if we have been advised of the possibility of such
              damages.
            </p>
          </div>
          <p>
            Our total aggregate liability to you for all claims arising under or in connection
            with these Terms shall not exceed the greater of: (a) the amount you paid us in
            the 12 months preceding the claim, or (b) €100 (one hundred euros).
          </p>
          <p>
            Nothing in these Terms excludes or limits liability for: death or personal injury
            caused by our gross negligence; fraud or fraudulent misrepresentation; or any
            liability that cannot be excluded or limited under applicable mandatory consumer
            protection law in your country of residence.
          </p>

          {/* 16 */}
          <h2 id="indemnification">16. Indemnification</h2>
          <p>
            You agree to defend, indemnify and hold harmless SideQuest and its founders,
            team members, partners, licensors, service providers, successors and assigns
            from and against any and all claims, liabilities, damages, losses, costs and
            expenses (including reasonable legal fees) arising out of or relating to:
          </p>
          <ul>
            <li>Your use of or inability to use the Service.</li>
            <li>Your User Content.</li>
            <li>Your violation of these Terms or any applicable law or regulation.</li>
            <li>Your violation of any third-party rights, including intellectual property, privacy or personality rights.</li>
            <li>Any event you organize through the Service.</li>
            <li>Any dispute between you and another user.</li>
          </ul>
          <p>
            We reserve the right to assume exclusive control of the defense of any matter
            subject to indemnification by you, at your expense. You agree to cooperate
            reasonably with us in the defense of any such claims.
          </p>

          {/* 17 */}
          <h2 id="termination">17. Termination</h2>
          <h3>17.1 By you</h3>
          <p>
            You may delete your account at any time from your profile settings. Deletion
            is permanent and will result in the loss of your data, content and access to
            the Service. We will process your deletion request within 30 days in accordance
            with our <Link to="/privacy">Privacy Policy</Link>.
          </p>
          <h3>17.2 By us</h3>
          <p>
            We may suspend or terminate your account at any time if: (a) you breach these
            Terms; (b) we are required to do so by law; (c) your conduct poses a risk to
            other users, the Service or third parties. For serious violations (e.g. illegal
            content, fraud, harassment), termination may be immediate and without notice.
            For lesser violations, we will generally provide a warning first.
          </p>
          <h3>17.3 Effect of termination</h3>
          <p>
            Upon termination, your license to use the Service ends immediately. Provisions
            of these Terms that by their nature should survive termination shall do so,
            including Sections 5.2, 8, 14, 15, 16, 20 and 21.
          </p>

          {/* 18 */}
          <h2 id="privacy">18. Privacy</h2>
          <p>
            Our collection and use of personal data is governed by our{" "}
            <Link to="/privacy">Privacy Policy</Link>, which is incorporated into these Terms
            by reference. By using the Service, you also agree to the Privacy Policy.
          </p>

          {/* 19 */}
          <h2 id="force-majeure">19. Force Majeure</h2>
          <p>
            We shall not be liable for any failure or delay in performance of our obligations
            under these Terms to the extent such failure or delay is caused by circumstances
            beyond our reasonable control, including but not limited to: acts of God, natural
            disasters, war, terrorism, pandemic, strikes, government action, internet or
            infrastructure outages, cyberattacks, or failure of third-party service providers
            (including cloud hosting or payment providers).
          </p>
          <p>
            We will notify you as soon as reasonably practicable of any force majeure event
            affecting the Service and will use reasonable efforts to resume normal operation.
          </p>

          {/* 20 */}
          <h2 id="changes">20. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time to reflect changes in the law, our
            practices, or the Service. We will notify you of material changes at least 30 days
            in advance via: (a) email to your registered address; or (b) prominent in-app
            notice. For non-material changes, we will update the "Last updated" date.
          </p>
          <p>
            If you do not agree with the updated Terms, you may terminate your account before
            the changes take effect. Continued use of the Service after the effective date
            constitutes your acceptance of the updated Terms.
          </p>

          {/* 21 */}
          <h2 id="general">21. General Provisions</h2>
          <h3>21.1 Entire Agreement</h3>
          <p>
            These Terms, together with our <Link to="/privacy">Privacy Policy</Link> and any
            other agreements expressly incorporated by reference, constitute the entire
            agreement between you and SideQuest with respect to the Service and supersede
            all prior agreements, representations and understandings.
          </p>
          <h3>21.2 Severability</h3>
          <p>
            If any provision of these Terms is found to be invalid, illegal or unenforceable
            under applicable law, that provision shall be modified to the minimum extent
            necessary to make it enforceable, or severed from these Terms, and the remaining
            provisions shall continue in full force and effect.
          </p>
          <h3>21.3 No Waiver</h3>
          <p>
            Our failure to enforce any right or provision of these Terms shall not be deemed
            a waiver of that right or provision. A waiver of any breach shall not constitute
            a waiver of any subsequent breach.
          </p>
          <h3>21.4 Assignment</h3>
          <p>
            You may not assign or transfer your rights or obligations under these Terms
            without our prior written consent. We may assign our rights and obligations
            under these Terms freely, including in connection with a merger, acquisition,
            or sale of assets, provided that your rights under these Terms are not materially
            diminished.
          </p>
          <h3>21.5 Notices</h3>
          <p>
            We will send notices to you at the email address associated with your account.
            You may send legal notices to us at{" "}
            <a href="mailto:radiostation87.7.7@gmail.com">radiostation87.7.7@gmail.com</a>{" "}
            or by post to  Luxembourg, Luxembourg. Notices
            are deemed received: (a) immediately when sent by email if no delivery failure
            is received; or (b) 5 business days after posting by registered mail.
          </p>
          <h3>21.6 Language</h3>
          <p>
            These Terms are written in English. In the event of a conflict between a
            translation and the English version, the English version prevails.
          </p>

          {/* 22 */}
          <h2 id="governing-law">22. Governing Law & Jurisdiction</h2>
          <p>
            These Terms are governed by and construed in accordance with the laws of the
            Grand Duchy of Luxembourg, without regard to its conflict-of-laws provisions.
          </p>
          <p>
            Any dispute, controversy or claim arising out of or relating to these Terms or
            the Service that cannot be resolved amicably shall be submitted to the exclusive
            jurisdiction of the competent courts of Luxembourg City, Luxembourg.
          </p>
          <p>
            If you are a consumer resident in another EU member state, you retain the right
            to bring proceedings before the courts of your country of residence and to benefit
            from the mandatory consumer protection provisions of your country's law. You may
            also use the EU Online Dispute Resolution platform:{" "}
            <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer">
              ec.europa.eu/consumers/odr
            </a>.
          </p>

          {/* 23 */}
          <h2 id="contact">23. Contact</h2>
          <p>
            For any question, complaint or request regarding these Terms:
          </p>
          <ul>
            <li><strong>Email</strong>: <a href="mailto:radiostation87.7.7@gmail.com">radiostation87.7.7@gmail.com</a></li>
            <li><strong>Post</strong>: SideQuest,  Luxembourg, Luxembourg</li>
            <li><strong>DSA contact</strong>: same as above — Marveen Riskwait</li>
          </ul>

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
