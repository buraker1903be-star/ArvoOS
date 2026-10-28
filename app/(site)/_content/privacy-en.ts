// Privacy Notice (website + demo form) — English. Mirrors privacy.ts (TR).
import { COMPANY } from "@/lib/site/routes";
import type { PrivacyContent } from "./privacy";

export const PRIVACY_EN: PrivacyContent = {
  meta: { title: "Privacy Notice", description: "How personal data is processed on the arvo-os.com website and its demo / contact form under Turkish Personal Data Protection Law No. 6698 (KVKK)." },
  hero: {
    eyebrow: "Privacy", title: "Privacy", subtitle: "Notice",
    lead: "This notice explains how your personal data is processed under Turkish Personal Data Protection Law No. 6698 (KVKK) when you visit arvo-os.com and use its demo / contact form.",
    actions: [],
  },
  updated: "Last updated: 28 October 2026",
  sections: [
    { h: "1. Data controller", p: [`The data controller is ${COMPANY.legalName} (“ArvoOS”). Address: ${COMPANY.address.display}, Türkiye. Email: ${COMPANY.email}.`] },
    { h: "2. Personal data we process", p: ["When you submit the demo / contact form:"], list: [
      "Identity and contact: full name, email address, phone number, organization name (organization and phone are optional).",
      "Request details: the product or service you are interested in, your message, and the page and language the form was sent from.",
      "Acknowledgement record: your confirmation that you have read this notice.",
      "Security: a daily-changing, one-way hashed digest of your IP address, used to prevent abuse. The raw IP address is not stored.",
    ] },
    { h: "3. Purposes", list: [
      "Receiving and assessing your demo, access, information and project requests, and responding to you",
      "Starting proposal and contract processes where you ask for them",
      "Protecting the form against automated and malicious submissions, and keeping information secure",
      "Meeting legal obligations",
    ] },
    { h: "4. Legal bases", p: ["Your personal data is processed on the following legal bases under Article 5(2) of the KVKK:"], list: [
      "(c) Processing is directly related to the establishment or performance of a contract — responding to your request and preparing demos and proposals",
      "(f) Legitimate interest of the data controller, provided it does not harm your fundamental rights and freedoms — form security and request management",
      "(ç) Compliance with a legal obligation of the data controller",
    ] },
    { h: "5. How data is collected", p: ["Data is collected electronically from you through the website form and automatically from your browser when the form is submitted. Your request is recorded as a customer request in our own ArvoOS panel."] },
    { h: "6. Transfers", p: [
      "Your personal data is not sold and is not shared with third parties for marketing.",
      "Data is stored on the servers of the cloud infrastructure and database providers that host the website and panel; these servers may be located outside Türkiye. Such transfers are carried out in line with Article 9 of the KVKK. Data may be disclosed to authorized public bodies only where the law requires it.",
    ] },
    { h: "7. Retention", p: ["Form data is kept for as long as needed to assess your request and carry out any resulting business relationship, and for the periods required by applicable law; it is then deleted, destroyed or anonymized. Security IP digests are deleted automatically within a few days."] },
    { h: "8. Cookies", p: ["This website does not use cookies or tracking tools for advertising, analytics or profiling. Only technical cookies that may be necessary for the site to run securely, and one preference cookie that remembers the language you chose (arvo_site_dil, one year), are used."] },
    { h: "9. Your rights under Article 11 of the KVKK", p: ["By applying to the data controller, you may:"], list: [
      "Learn whether your personal data is processed and, if so, request information about it",
      "Learn the purpose of processing and whether data is used accordingly",
      "Know the third parties in Türkiye or abroad to whom data is transferred",
      "Ask for incomplete or inaccurate data to be corrected",
      "Ask for data to be deleted or destroyed under the conditions of Article 7 of the KVKK",
      "Ask for corrections, deletions and destructions to be notified to third parties the data was transferred to",
      "Object to an adverse outcome arising solely from automated analysis",
      "Claim compensation for damage caused by unlawful processing",
    ] },
    { h: "10. How to apply", p: [`Send your requests by email to ${COMPANY.email} or in writing to ${COMPANY.address.display}, Türkiye. Requests are concluded free of charge within thirty days at the latest, depending on their nature (Article 13 of the KVKK).`] },
    { h: "11. Visitors in the European Economic Area and the United Kingdom (GDPR)", p: [
      "If you are in the EEA or the UK and we offer our services to you, your personal data is also processed under the General Data Protection Regulation (EU) 2016/679 (GDPR) and the UK GDPR. The controller is ArvoOS, as set out in section 1.",
      "Legal bases (Art. 6(1) GDPR): steps prior to entering into a contract — answering your request and preparing demos and proposals (b); legitimate interests — form security and request management (f); compliance with legal obligations (c).",
      "Your data may be processed in Türkiye and on hosting providers’ servers outside the EEA. You can write to us for information about the safeguards relied on for these transfers. Send requests through the channels in section 10; requests under the GDPR are answered within one month.",
      "Under the GDPR you can:",
    ], list: [
      "Access your data and receive a copy (Art. 15)",
      "Have inaccurate data rectified (Art. 16) and data erased (Art. 17)",
      "Restrict processing (Art. 18)",
      "Receive your data in a portable format (Art. 20)",
      "Object to processing based on legitimate interests (Art. 21)",
      "Lodge a complaint with the data protection supervisory authority of the EEA country where you live or work or, in the UK, with the Information Commissioner’s Office (ICO)",
    ] },
    { h: "12. Changes", p: ["This notice may be updated when needed; the current version is always published on this page."] },
  ],
};
