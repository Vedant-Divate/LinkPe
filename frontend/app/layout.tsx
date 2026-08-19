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
                <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-blue-500 to-purple-600 flex items-center justify-center">
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <span className="text-lg font-bold tracking-tight">LinkPe</span>
                <span className="ml-2 hidden rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-white/60 sm:inline-block">
                  E2EE Protocol
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