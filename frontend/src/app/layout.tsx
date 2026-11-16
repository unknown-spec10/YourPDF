import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

// Absolute URLs are required for og:image/twitter. The static export bakes this at build time,
// so production sets NEXT_PUBLIC_SITE_URL (the Cloud Run URL, or the custom domain behind IAP).
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title: "YourPDF — Free & Private PDF, Image and Office Tools",
  description: "A production-grade, privacy-first, open-source PDF processing platform. All processing runs server-side, and files are hard-deleted immediately after processing.",
  applicationName: "YourPDF",
  // The light lockup on brand cream doubles as the social card.
  icons: {
    icon: [{ url: "/brand/yourpdf-icon-light.png", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/brand/yourpdf-icon-180.png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    siteName: "YourPDF",
    title: "YourPDF — Free & Private PDF, Image and Office Tools",
    description:
      "27 tools for PDFs, images and Office files. Files are processed on the server and deleted the moment your result is returned.",
    images: [
      {
        url: "/brand/yourpdf-social-card.png",
        width: 1200,
        height: 630,
        alt: "YourPDF",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "YourPDF — Free & Private PDF, Image and Office Tools",
    description:
      "27 tools for PDFs, images and Office files. Files are processed on the server and deleted the moment your result is returned.",
    images: ["/brand/yourpdf-social-card.png"],
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
