import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

// Self-hosted at build time — no runtime CDN dependency (SPEC §6.4).
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });

export const metadata: Metadata = {
  title: "Risk Assessment Advisor",
  description: "One front door for risk assessment.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={figtree.variable}>
      <body>{children}</body>
    </html>
  );
}
