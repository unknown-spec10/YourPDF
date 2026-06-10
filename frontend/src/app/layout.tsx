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
      <body className="min-h-screen flex flex-col bg-background text-foreground transition-colors duration-200">
        <Providers>
          <Navbar />
          <main className="flex-1 flex flex-col w-full">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
