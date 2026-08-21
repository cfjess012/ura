import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import Link from "next/link";
import { currentPerson } from "@/lib/current-person";
import { canAdminister } from "@/lib/people";
import { peopleStore } from "@/lib/repo";
import { PersonSwitcher } from "./person-switcher";
import "./globals.css";

// Self-hosted at build time — no runtime CDN dependency (SPEC §6.4).
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });

export const metadata: Metadata = {
  title: "Risk Assessment Advisor",
  description: "One front door for risk assessment.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [people, current] = await Promise.all([peopleStore().list(), currentPerson()]);
  return (
    <html lang="en" className={figtree.variable}>
      <body>
        <header className="appbar">
          <div className="appbar-inner">
            <Link href="/" className="wordmark">
              Risk Assessment <span>Advisor</span>
            </Link>
            <span className="appbar-right">
              {canAdminister(current.role) && (
                <Link href="/admin/agents" className="appbar-link">
                  Agents
                </Link>
              )}
              <PersonSwitcher people={people} current={current} />
            </span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
