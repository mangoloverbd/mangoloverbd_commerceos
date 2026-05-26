export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Header */}
      <header className="border-b border-black/[0.08] bg-white">
        <div className="mx-auto max-w-3xl px-6 py-5 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="Arc Lab Technology" className="h-7 w-7" />
            <span className="text-[15px] font-semibold tracking-tight text-black">Arc Lab Technology</span>
          </a>
          <a
            href="/"
            className="text-[13px] text-black/40 hover:text-black transition-colors"
          >
            Back to app
          </a>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-12 space-y-10 text-center">
        {/* Title */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-black/40">Legal</p>
          <h1 className="text-[32px] font-semibold tracking-tight text-black leading-tight">
            Privacy Policy
          </h1>
          <p className="text-[14px] text-black/45">
            Effective date: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            &nbsp;·&nbsp; Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>

        <div className="prose prose-sm max-w-none space-y-8 text-[15px] leading-relaxed text-black/80 text-center [&_ul]:text-left [&_p]:text-center">

          {/* Introduction */}
          <Section title="1. Introduction">
            <p>
              Arc Lab Technology ("we", "us", or "our") operates the Seraphine business management
              platform, accessible at{" "}
              <a href="https://suite.arclabtechnology.com" className="text-black underline underline-offset-2">
                https://suite.arclabtechnology.com
              </a>{" "}
              (the "Service"). This Privacy Policy explains how we collect, use, disclose, and safeguard
              your information when you use our Service. Please read this policy carefully. If you
              disagree with its terms, please discontinue use of the Service.
            </p>
          </Section>

          {/* Information We Collect */}
          <Section title="2. Information We Collect">
            <p>We collect the following categories of information:</p>
            <SubSection title="2.1 Account Information">
              <p>
                When you register, we collect your email address and password (stored as a secure hash).
                Organisation administrators also provide a business/workspace name.
              </p>
            </SubSection>
            <SubSection title="2.2 Business Data">
              <p>
                To operate the Service, we store data you provide or import, including:
              </p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li>Customer orders (names, phone numbers, delivery addresses, order details)</li>
                <li>Product catalogue (product names, prices, cost of goods, stock levels)</li>
                <li>Social inbox conversations from Facebook Messenger, Instagram DM, and WhatsApp Business</li>
                <li>Courier dispatch records and tracking data</li>
                <li>Integration credentials (stored encrypted at rest)</li>
              </ul>
            </SubSection>
            <SubSection title="2.3 Third-Party Platform Data">
              <p>
                When you connect third-party platforms (Shopify, Meta Business Suite, Steadfast,
                Pathao, FraudShield), we receive and store data from those platforms as authorised
                by your OAuth consent. This may include page access tokens, order data, and
                messaging history. We store access tokens in encrypted form and never expose them
                in plaintext outside the server.
              </p>
            </SubSection>
            <SubSection title="2.4 Automatically Collected Data">
              <p>
                We collect standard server logs including IP addresses, browser type, pages visited,
                and timestamps. This data is used for security monitoring, debugging, and service
                improvement. We do not use third-party advertising trackers.
              </p>
            </SubSection>
          </Section>

          {/* How We Use Information */}
          <Section title="3. How We Use Your Information">
            <ul className="list-disc pl-5 space-y-2">
              <li>To provide, operate, and maintain the Service</li>
              <li>To authenticate users and enforce multi-tenant data isolation</li>
              <li>To power AI features (order extraction, business forecasting, social inbox auto-reply) using OpenAI APIs — your data is sent to OpenAI solely to generate responses and is not used to train OpenAI models</li>
              <li>To process courier dispatch requests via Steadfast and Pathao APIs</li>
              <li>To detect fraud on phone numbers via the FraudShield API</li>
              <li>To send automated replies to your customers via Facebook, Instagram, and WhatsApp on your behalf</li>
              <li>To comply with legal obligations and enforce our Terms of Service</li>
            </ul>
          </Section>

          {/* Data Sharing */}
          <Section title="4. Data Sharing and Disclosure">
            <p>
              We do not sell, rent, or trade your personal data. We share data only in the following
              limited circumstances:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li>
                <strong>Service providers:</strong> Supabase (database and authentication), OpenAI
                (AI processing), Upstash (rate limiting), Firecrawl (product extraction). Each
                provider is bound by data processing agreements.
              </li>
              <li>
                <strong>Meta Platforms:</strong> When you use Facebook, Instagram, or WhatsApp
                integrations, message content is transmitted to and from Meta's Graph API in
                accordance with Meta's Platform Terms.
              </li>
              <li>
                <strong>Legal requirements:</strong> We may disclose data if required by law,
                court order, or governmental authority.
              </li>
              <li>
                <strong>Business transfers:</strong> In the event of a merger, acquisition, or sale
                of assets, your data may be transferred to the acquiring entity.
              </li>
            </ul>
          </Section>

          {/* Meta Platform Data */}
          <Section title="5. Meta Platform Data (Facebook, Instagram, WhatsApp)">
            <p>
              Our Service integrates with the Meta Platform to enable social inbox management and
              automated customer replies. By connecting your Meta Business account, you authorise us
              to:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li>Read and store messages sent to your connected Facebook Pages, Instagram accounts, and WhatsApp Business numbers</li>
              <li>Send replies to customers on your behalf using AI-generated responses</li>
              <li>Access page and account metadata (page name, phone number, account status)</li>
            </ul>
            <p className="mt-3">
              We use Meta Platform data only to provide the features you have enabled. We do not
              use Meta user data for advertising or share it with data brokers. Customers who
              message your business via Meta platforms should be aware that their messages are
              processed by our Service as part of your business operations.
            </p>
            <p className="mt-3">
              You can revoke our access at any time from your Meta Business Suite settings or by
              disconnecting the integration from the Settings page of the Service.
            </p>
          </Section>

          {/* Data Retention */}
          <Section title="6. Data Retention">
            <p>
              We retain your data for as long as your account is active or as needed to provide
              the Service. If you delete your account, we will delete or anonymise your personal
              data within 30 days, except where retention is required by law or for legitimate
              business purposes (such as fraud prevention records).
            </p>
            <p className="mt-3">
              Social inbox messages are retained indefinitely to preserve conversation history.
              You may delete individual conversations or contact us to request bulk deletion.
            </p>
          </Section>

          {/* Security */}
          <Section title="7. Data Security">
            <p>
              We implement the following security measures:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li>All data in transit is encrypted via TLS 1.2+</li>
              <li>Third-party access tokens (Meta, Shopify, Steadfast, Pathao) are encrypted at rest using AES-256</li>
              <li>Database access is restricted to server-side service role credentials; the frontend never has direct database write access</li>
              <li>Multi-tenant isolation is enforced at the application layer — each organisation can only access its own data</li>
              <li>Rate limiting is applied to all API endpoints via Redis to prevent abuse</li>
            </ul>
            <p className="mt-3">
              No method of transmission over the internet or electronic storage is 100% secure.
              While we use commercially reasonable measures to protect your data, we cannot
              guarantee absolute security.
            </p>
          </Section>

          {/* Your Rights */}
          <Section title="8. Your Rights">
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li><strong>Access:</strong> Request a copy of the personal data we hold about you</li>
              <li><strong>Correction:</strong> Request correction of inaccurate data</li>
              <li><strong>Deletion:</strong> Request deletion of your account and associated data</li>
              <li><strong>Portability:</strong> Request an export of your data in a machine-readable format</li>
              <li><strong>Objection:</strong> Object to certain processing activities</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, contact us at the email address below. We will
              respond within 30 days.
            </p>
          </Section>

          {/* Cookies */}
          <Section title="9. Cookies and Local Storage">
            <p>
              We use browser local storage to persist your authentication session and user
              preferences (such as remembered email). We do not use third-party advertising cookies.
              Session tokens are managed by Supabase Auth and expire automatically.
            </p>
          </Section>

          {/* Children */}
          <Section title="10. Children's Privacy">
            <p>
              The Service is not directed at individuals under the age of 18. We do not knowingly
              collect personal data from children. If you believe a child has provided us with
              personal data, please contact us and we will delete it promptly.
            </p>
          </Section>

          {/* Changes */}
          <Section title="11. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. When we make material changes,
              we will update the "Last updated" date at the top of this page and, where appropriate,
              notify you by email or via a notice within the Service. Your continued use of the
              Service after any changes constitutes your acceptance of the revised policy.
            </p>
          </Section>

          {/* Contact */}
          <Section title="12. Contact Us">
            <p>
              If you have questions about this Privacy Policy or wish to exercise your data rights,
              please contact us:
            </p>
            <div className="mt-3 rounded-[14px] border border-black/[0.08] bg-white px-5 py-4 space-y-1 text-[14px]">
              <p className="font-semibold text-black">Arc Lab Technology</p>
              <p className="text-black/60">Email: <a href="mailto:privacy@arclabtechnology.com" className="text-black underline underline-offset-2">privacy@arclabtechnology.com</a></p>
              <p className="text-black/60">Website: <a href="https://suite.arclabtechnology.com" className="text-black underline underline-offset-2">https://suite.arclabtechnology.com</a></p>
              <p className="text-black/60">Bangladesh</p>
            </div>
          </Section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-black/[0.08] mt-16">
        <div className="mx-auto max-w-3xl px-6 py-6 flex items-center justify-center text-[12px] text-black/35">
          <span>© {new Date().getFullYear()} Arc Lab Technology. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 text-center">
      <h2 className="text-[18px] font-semibold tracking-tight text-black">{title}</h2>
      <div className="space-y-3 text-[15px] text-black/75 leading-relaxed text-center [&_ul]:text-left [&_ul]:inline-block [&_ul]:text-left">{children}</div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 text-center">
      <h3 className="text-[14px] font-semibold text-black/80">{title}</h3>
      <div className="text-[14px] text-black/70 leading-relaxed text-center">{children}</div>
    </div>
  );
}
