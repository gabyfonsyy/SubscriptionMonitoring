import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { THEME_COOKIE, parseTheme, themeAttr } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Every page is rendered per request so each response can carry its own CSP nonce.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Subscription Monitoring", template: "%s · Subscription Monitoring" },
  description: "Platform Operations subscription inventory, cost history and renewal alerts.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The theme is read from a cookie so the very first paint is already correct: no flash, no inline script.
  // No cookie (or "system") leaves the attribute off, so the OS preference applies.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang="en"
      data-theme={themeAttr(theme)}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
