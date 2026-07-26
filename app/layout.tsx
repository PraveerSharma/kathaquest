import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "KathaQuest | AI lesson studio for curious kids",
  description:
    "Turn any chapter into one multilingual interactive lesson film with scripts, diagrams, animation and reviewed real footage.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html data-scroll-behavior="smooth" lang="en">
      <body>{children}</body>
    </html>
  );
}
