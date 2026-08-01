import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./hero-fix.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://arvo-os.com"),
  title: {
    default: "ArvoOS | Kurumsal İşletim Sistemi",
    template: "%s | ArvoOS",
  },
  description:
    "ArvoOS; satış, finans, operasyon, ekip ve müşteri süreçlerini tek merkezde birleştiren kurumsal işletim sistemidir.",
  applicationName: "ArvoOS",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
