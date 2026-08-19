import "./globals.css";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "LinkPe",
  description: "Decentralized Escrow Protocol for Freelancers",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <body className="min-h-screen bg-[#09090b] text-white">
        <Providers>
          {/* Navbar */}
          <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#09090b]/80 backdrop-blur-xl">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-blue-500 to-purple-600" />
                <span className="text-lg font-bold tracking-tight">LinkPe</span>
                <span className="ml-2 hidden rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-white/60 sm:inline-block">
                  Protocol
                </span>
              </div>
              <ConnectButton />
            </div>
          </nav>

          {/* Main Content */}
          <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}