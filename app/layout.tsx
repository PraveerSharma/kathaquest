import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "KathaQuest — Video adventures from real footage",
  description:
    "Turn textbook chapters into multilingual video adventures using real educational footage.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
