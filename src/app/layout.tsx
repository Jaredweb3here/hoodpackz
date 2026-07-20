import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Web3Provider } from "@/components/providers/web3-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Paxz | Onchain Token Packs",
  description:
    "Open token packs from funded reserves on Robinhood Chain.",
  icons: {
    icon: "/lopa.png",
    apple: "/lopa.png",
  },
  openGraph: {
    title: "Paxz",
    description: "Three-token packs from funded reserves on Robinhood Chain.",
  },
  twitter: {
    card: "summary",
    title: "Paxz",
    description: "Three-token packs from funded reserves on Robinhood Chain.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-black text-foreground">
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
