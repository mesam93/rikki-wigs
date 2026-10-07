import { useEffect } from "react";
import { SiteNav } from "@/components/SiteNav";
import { siteUrl } from "@/hooks/use-client-auth";

const sections = [
  {
    title: "Information used by the studio",
    text: "Rikki Wigs uses the information you provide when requesting an appointment or placing an order, including your name, email address, phone number, requested service, appointment details and optional notes. Order records may include wig specifications, prices, recorded payment amounts and receipts. Please avoid including unnecessary sensitive information in appointment notes.",
  },
  {
    title: "Google sign-in",
    text: "When you choose Google sign-in, Google handles authentication. The website receives your Google account identifier, verified email address and basic profile information such as your name. We use your verified email to show matching appointments and receipts and to authorize studio-owner access. We do not receive your Google password. Sign-in requests only identity, email and profile permissions—not access to your Gmail inbox or Google Calendar.",
  },
  {
    title: "How information is used",
    text: "Information is used to manage appointment requests, provide studio services, maintain order and receipt records, communicate about your requests, display your account history and protect access to the website. Records already held by the studio may be matched to your account using your verified email address.",
  },
  {
    title: "Cookies and technical information",
    text: "The website uses essential session cookies to complete sign-in and keep you signed in. These cookies do not contain your Google password. Hosting and security services may process technical request information to deliver the website and investigate errors or misuse. You can remove cookies through your browser settings; doing so may sign you out.",
  },
  {
    title: "Service providers and access",
    text: "Authorized studio staff and service providers supporting the website may access information as needed to operate and maintain it. Providers include Google for authentication, Railway for live hosting, and Replit for development and maintenance, together with the database and file-storage services used by the website. If the studio enables calendar or appointment-email features, appointment information may also be processed by those services. Providers process information under their own terms and applicable privacy policies.",
  },
  {
    title: "Record retention and privacy requests",
    text: "Appointment, order and receipt records support studio services and business record-keeping. Some records may also need to be retained for legal or accounting purposes. Contact the studio to ask about retention or request access, correction or deletion of your information. Requests are subject to identity verification and applicable requirements; signing out or deleting browser cookies does not delete studio records.",
  },
  {
    title: "Security",
    text: "The website uses access controls and session protections to limit unauthorized access. No online service can guarantee complete security. Contact the studio if you believe your information or account has been accessed without permission.",
  },
  {
    title: "External services and policy changes",
    text: "Links to Google, Instagram or WhatsApp take you to services with their own privacy policies. This policy may be updated when the studio's practices or website features change. Any approved updates will be available on this page.",
  },
];

export default function PrivacyPolicy() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Privacy Policy — Rikki Wigs";
    return () => { document.title = previousTitle; };
  }, []);

  return (
    <div className="site-shell min-h-[100dvh] bg-[hsl(var(--background))]">
      <SiteNav />
      <main className="container-rikki py-12 md:py-20">
        <article className="mx-auto max-w-3xl">
          <p className="eyebrow text-[hsl(var(--primary))]">Rikki Wigs</p>
          <h1 className="display-title mt-4 text-4xl md:text-6xl">Privacy Policy</h1>
          <p className="mt-5 text-sm text-[hsl(var(--muted-foreground))]">Last updated October 7, 2026</p>
          <p className="mt-8 leading-7 text-[hsl(var(--muted-foreground))]">
            This policy explains how Rikki Wigs handles information connected with its website, appointment booking, Google sign-in, orders and receipts.
          </p>
          <div className="mt-10 space-y-9">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="font-editorial text-2xl">{section.title}</h2>
                <p className="mt-3 leading-7 text-[hsl(var(--muted-foreground))]">{section.text}</p>
              </section>
            ))}
            <section>
              <h2 className="font-editorial text-2xl">Contact Rikki Wigs</h2>
              <p className="mt-3 leading-7 text-[hsl(var(--muted-foreground))]">
                For questions about this policy or a privacy request, contact the studio at{" "}
                <a className="underline underline-offset-4" href="tel:+17327424559">732-742-4559</a>.
              </p>
            </section>
          </div>
          <a className="mt-12 inline-block editorial-link" href={siteUrl("/")}>Back to the website</a>
        </article>
      </main>
    </div>
  );
}
