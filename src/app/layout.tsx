import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Self-hosted at build time — no runtime CDN dependency (SPEC §6.4).
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });

export const metadata: Metadata = {
  title: "Risk Assessment Advisor",
  description: "One front door for risk assessment.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={figtree.variable}>
      <body>
        <header className="appbar">
          <div className="appbar-inner">
            <Link href="/" className="wordmark">
              Risk Assessment <span>Advisor</span>
            </Link>
            {/* Identity is Phase-2 work (§12); the requester is implied for now. */}
            <span className="whoami">Requester</span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
