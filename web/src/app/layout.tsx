import type { Metadata } from "next";
import { Cormorant_Garamond, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CommandPalette from "@/components/CommandPalette";
import { AuthProvider } from "@/context/AuthContext";

const ibmPlex = IBM_Plex_Sans({
  variable: "--font-editorial-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  variable: "--font-editorial-serif",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "G.C.C. Index | Global Capability Center Intelligence",
  description: "A premium typographic catalog tracking, classifying, and mapping active positions across Indian Global Capability Centers (GCC).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${ibmPlex.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#F7F4EE] text-[#161616] relative max-w-6xl mx-auto border-x border-[#E5E1D8] px-4 sm:px-8 shadow-sm">
        <AuthProvider>
          <Navbar />
          <main className="flex-1 flex flex-col">
            {children}
          </main>
          <Footer />
          <CommandPalette />
        </AuthProvider>
      </body>
    </html>
  );
}
