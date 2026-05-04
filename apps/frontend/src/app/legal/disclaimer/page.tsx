import Link from "next/link";

export default function DisclaimerPage() {
  return (
    <main className="min-h-screen bg-background text-on-surface">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 border-b border-outline-variant/30 pb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Legal Disclaimer & Acceptable Use Notice</h1>
          <p className="mt-2 text-sm text-on-surface-variant">Last Updated: May 4, 2026</p>
          <p className="mt-4 text-sm text-on-surface-variant">
            Welcome to EtherSend (“Platform”, “Service”, “we”, “our”, or “us”). By accessing or using this file-sharing and
            content-delivery platform, you (“User”, “Uploader”, or “Recipient”) acknowledge and agree to the following disclaimer
            and acceptable use conditions.
          </p>
        </div>

        <div className="space-y-8 text-sm leading-6 text-on-surface">
          <section>
            <h2 className="text-lg font-semibold">1. Nature of the Service</h2>
            <p className="mt-2">
              EtherSend provides tools that enable users to upload, store, transfer, preview, share, and access digital files through
              generated links, tokens, passwords, or other sharing mechanisms.
            </p>
            <p className="mt-2">
              EtherSend acts solely as a technology intermediary and infrastructure provider. We do not actively monitor, verify,
              endorse, review, or control files, links, metadata, or communications shared through the platform unless required by law,
              security necessity, abuse prevention, or policy enforcement.
            </p>
            <p className="mt-2">
              Users are solely responsible for the files, content, data, and communications they upload, distribute, access, or
              transmit using the platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. User Responsibility</h2>
            <p className="mt-2">By using EtherSend, users agree that they:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Are fully responsible for all uploaded, shared, or downloaded content.</li>
              <li>Will comply with all applicable local, national, and international laws and regulations.</li>
              <li>Will not use the platform for unlawful, fraudulent, harmful, abusive, or malicious activities.</li>
              <li>Understand that any misuse of the platform is strictly prohibited.</li>
            </ul>
            <p className="mt-2">
              Users further acknowledge that EtherSend cannot guarantee that files uploaded by third parties are safe, authentic, legal,
              virus-free, or trustworthy.
            </p>
            <p className="mt-2">
              Recipients must independently verify all files, links, and communications before opening, downloading, executing, or
              relying on them.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Prohibited Activities</h2>
            <p className="mt-2">The following activities are strictly prohibited on EtherSend, including but not limited to:</p>

            <h3 className="mt-4 font-semibold">3.1 Malware & Harmful Software Distribution</h3>
            <p className="mt-2">Uploading, sharing, transmitting, or hosting:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Malware</li>
              <li>Viruses</li>
              <li>Trojans</li>
              <li>Ransomware</li>
              <li>Spyware</li>
              <li>Malicious scripts</li>
              <li>Exploit payloads</li>
              <li>Infected documents or media files</li>
            </ul>
            <p className="mt-2">disguised as legitimate or harmless content.</p>

            <h3 className="mt-4 font-semibold">3.2 Phishing & Social Engineering</h3>
            <p className="mt-2">Using the platform to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Impersonate trusted individuals or organizations</li>
              <li>Conduct phishing campaigns</li>
              <li>Deliver deceptive or misleading share links</li>
              <li>Trick users into revealing credentials, payment information, or sensitive data</li>
              <li>Conduct fraud or social engineering attacks</li>
            </ul>

            <h3 className="mt-4 font-semibold">3.3 Illegal or Prohibited Content</h3>
            <p className="mt-2">Uploading, distributing, storing, or facilitating access to content that is:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Illegal under applicable law</li>
              <li>Fraudulent</li>
              <li>Defamatory</li>
              <li>Infringing intellectual property rights</li>
              <li>Abusive, exploitative, or harmful</li>
              <li>Related to criminal activity</li>
              <li>Restricted or prohibited by government regulation</li>
            </ul>

            <h3 className="mt-4 font-semibold">3.4 Unauthorized Access & Security Abuse</h3>
            <p className="mt-2">Attempting to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Guess, brute-force, enumerate, or bypass share tokens or access identifiers</li>
              <li>Circumvent password protections</li>
              <li>Exploit authentication mechanisms</li>
              <li>Scrape previews or metadata using bots or automation</li>
              <li>Bypass view, download, device, session, IP, or access restrictions</li>
              <li>Reverse engineer platform protections or rate limits</li>
            </ul>

            <h3 className="mt-4 font-semibold">3.5 Automated Abuse & Resource Exploitation</h3>
            <p className="mt-2">Using the platform in a manner that may degrade service performance or infrastructure stability, including:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Excessive automated requests</li>
              <li>Request flooding</li>
              <li>Large-scale spam uploads</li>
              <li>Conversion abuse</li>
              <li>Excessive preview generation</li>
              <li>CPU/GPU/resource exhaustion attacks</li>
              <li>Automated extraction or indexing of content</li>
            </ul>

            <h3 className="mt-4 font-semibold">3.6 Insider Data Exfiltration & Unauthorized Sharing</h3>
            <p className="mt-2">
              Using EtherSend to export, leak, distribute, or transfer confidential, proprietary, restricted, or sensitive
              organizational data without proper authorization.
            </p>

            <h3 className="mt-4 font-semibold">3.7 Privacy Violations</h3>
            <p className="mt-2">Sharing files or metadata that expose sensitive personal or organizational information, including but not limited to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Hidden document metadata</li>
              <li>EXIF/location data</li>
              <li>Internal filenames</li>
              <li>Credentials</li>
              <li>Personally identifiable information (PII)</li>
              <li>Confidential business information</li>
            </ul>
            <p className="mt-2">without proper consent or legal authority.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. No Liability for User Content</h2>
            <p className="mt-2">
              EtherSend does not create, own, control, endorse, or assume responsibility for any user-generated files, links, metadata,
              or communications transmitted through the platform.
            </p>
            <p className="mt-2">To the maximum extent permitted by law, EtherSend and its owners, operators, developers, affiliates, employees, and partners shall not be liable for:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Malware infections</li>
              <li>Data loss</li>
              <li>Unauthorized access</li>
              <li>Fraudulent activity</li>
              <li>Phishing attacks</li>
              <li>Illegal file distribution</li>
              <li>Privacy breaches</li>
              <li>Intellectual property violations</li>
              <li>Damages caused by third-party content</li>
              <li>Security incidents arising from user behavior</li>
              <li>Any direct, indirect, incidental, consequential, or special damages</li>
            </ul>
            <p className="mt-2">arising from use of the platform or interaction with shared content.</p>
            <p className="mt-2">Users access and download files entirely at their own risk.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Security Measures & Enforcement</h2>
            <p className="mt-2">EtherSend may implement automated or manual measures to detect, prevent, limit, investigate, or remove abusive activity, including:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Rate limiting</li>
              <li>Abuse detection systems</li>
              <li>Automated scanning</li>
              <li>Temporary suspensions</li>
              <li>Access blocking</li>
              <li>File removal</li>
              <li>Logging and monitoring</li>
              <li>Cooperation with law enforcement or legal authorities where required</li>
            </ul>
            <p className="mt-2">
              We reserve the right to suspend or terminate access to the platform at our sole discretion for suspected abuse, policy
              violations, security threats, or unlawful activity.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. No Warranty</h2>
            <p className="mt-2">EtherSend is provided on an “AS IS” and “AS AVAILABLE” basis without warranties of any kind, express or implied.</p>
            <p className="mt-2">We do not guarantee that the platform will be:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Error-free</li>
              <li>Secure</li>
              <li>Uninterrupted</li>
              <li>Virus-free</li>
              <li>Reliable</li>
              <li>Suitable for any particular purpose</li>
            </ul>
            <p className="mt-2">Users are responsible for maintaining their own backups, antivirus protection, and security practices.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Indemnification</h2>
            <p className="mt-2">Users agree to defend, indemnify, and hold harmless EtherSend and its operators from and against any claims, liabilities, damages, losses, costs, legal fees, or expenses arising from:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Their use of the platform</li>
              <li>Uploaded or shared content</li>
              <li>Violation of applicable laws</li>
              <li>Violation of this disclaimer or platform policies</li>
              <li>Harm caused to third parties through their actions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Reporting Abuse</h2>
            <p className="mt-2">
              If you believe content or activity on EtherSend violates applicable law, intellectual property rights, or this policy, you
              may report it through the designated abuse or contact channel.
            </p>
            <p className="mt-2">EtherSend reserves the right, but not the obligation, to investigate and take appropriate action.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Governing Law</h2>
            <p className="mt-2">
              This disclaimer shall be governed by and interpreted in accordance with the laws applicable in the jurisdiction where the
              platform operator is established, without regard to conflict of law principles.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">10. Acceptance of Terms</h2>
            <p className="mt-2">
              By accessing or using EtherSend, users acknowledge that they have read, understood, and agreed to this disclaimer and all
              related platform policies.
            </p>
            <p className="mt-2">If a user does not agree with these terms, they must immediately discontinue use of the platform.</p>
          </section>
        </div>

        <div className="mt-10 border-t border-outline-variant/30 pt-6 text-sm">
          <Link href="/" className="text-primary hover:underline">
            ← Back to EtherSend
          </Link>
        </div>
      </div>
    </main>
  );
}
