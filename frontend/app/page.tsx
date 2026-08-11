"use client";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-900 text-white">
      <h1 className="text-4xl font-bold mb-8">LinkPe</h1>
      <p className="mb-8 text-gray-400">Decentralized Escrow Protocol</p>
      
      <ConnectButton />
    </main>
  );
}