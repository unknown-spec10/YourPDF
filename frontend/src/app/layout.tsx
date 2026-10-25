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
          {/* Floating Ambient Mesh */}
          <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-60 select-none dark:opacity-40">
            <div className="absolute top-[-10%] left-[8%] h-[42rem] w-[42rem] rounded-full bg-accent/[0.07] blur-[140px] animate-orb-1" />
            <div className="absolute right-[-8%] bottom-[-15%] h-[46rem] w-[46rem] rounded-full bg-accent/[0.05] blur-[150px] animate-orb-2" />
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
