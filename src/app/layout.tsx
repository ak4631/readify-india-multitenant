import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

const bodyFont = localFont({
  src: [
    { path: "../assets/fonts/font-0.ttf", weight: "400" },
    { path: "../assets/fonts/font-1.ttf", weight: "500" },
    { path: "../assets/fonts/font-2.ttf", weight: "600" },
    { path: "../assets/fonts/font-3.ttf", weight: "700" },
  ],
  variable: "--font-dm-sans",
  display: "swap",
});
const headingFont = localFont({
  src: [
    { path: "../assets/fonts/font-4.ttf", weight: "400" },
    { path: "../assets/fonts/font-5.ttf", weight: "500" },
    { path: "../assets/fonts/font-6.ttf", weight: "600" },
    { path: "../assets/fonts/font-7.ttf", weight: "700" },
    { path: "../assets/fonts/font-8.ttf", weight: "800" },
  ],
  variable: "--font-manrope",
  display: "swap",
});
export const metadata: Metadata = {
  icons: {
    icon: "/brand/zerotham-symbol.png",
    apple: "/brand/zerotham-symbol.png",
  },
  title: "ZEROTHAM Management Portal",
  description:
    "ZEROTHAM partner and platform management — A Better Way to Grow.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${bodyFont.variable} ${headingFont.variable}`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
