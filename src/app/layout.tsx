import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Risk Assessment",
  description: "One front door for risk assessment.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="site">
          <Link href="/">
            Risk <span className="word">Assessment</span>
          </Link>
        </header>
        {children}
      </body>
    </html>
  );
}
