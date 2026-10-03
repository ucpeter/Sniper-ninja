import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoltSnipe — Real-time Solana pump.fun sniper",
  description:
    "Non-custodial real-time sniping bot for pump.fun on Solana. Connect your wallet, fund a local trading wallet, and let the bot buy and sell live tokens for you.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#08090b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
