import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "YourPDF — Free, Private, No-Upload PDF Tools",
  description: "A production-grade, privacy-first, open-source PDF processing platform. Simple operations run client-side. Heavy operations run server-side in secure temporary environments.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="dark antialiased"
    >
      <body className="min-h-screen flex flex-col bg-background text-foreground transition-colors duration-200 relative">
        <Providers>
          {/* Floating Ambient Mesh Orbs */}
          <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none opacity-40 dark:opacity-30 select-none">
            <div className="absolute top-[15%] left-[10%] w-[45vw] h-[45vw] rounded-full bg-indigo-500/15 dark:bg-indigo-500/5 blur-[120px] animate-orb-1" />
            <div className="absolute bottom-[15%] right-[5%] w-[50vw] h-[50vw] rounded-full bg-purple-500/15 dark:bg-purple-500/5 blur-[135px] animate-orb-2" />
          </div>
          <Navbar />
          <main className="flex-1 flex flex-col w-full relative z-10">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
