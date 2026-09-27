import type { Metadata } from "next";
import { Playfair_Display, Manrope, Geist_Mono } from "next/font/google";
import { SiteChrome } from "@/components/layout/SiteChrome";
import { SearchModalProvider } from "@/components/ui/SearchModal";
import { AuthProvider } from "@/hooks/useAuth";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Astrova — Discover India. Experience Heritage.",
    template: "%s | Astrova",
  },
  description:
    "Astrova is an interactive digital platform for discovering India's cultural heritage — culture, heritage, nature, and tradition — through maps, stories, history, and AI-powered exploration.",
  keywords: [
    "Indian heritage",
    "cultural heritage",
    "Astrova",
    "Indian monuments",
    "Indian crafts",
    "Indian history",
    "heritage discovery",
    "India interactive map",
    "AI heritage guide",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${manrope.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <SearchModalProvider>
            <SiteChrome>{children}</SiteChrome>
          </SearchModalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
