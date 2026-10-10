import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/montserrat";
import "./globals.css";

import { APP_FULL_NAME, APP_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: `${APP_NAME} | Monitoring dan Evaluasi Anggaran dan Kinerja`, template: `%s | ${APP_NAME}` },
  description: `${APP_FULL_NAME}.`,
  applicationName: APP_NAME,
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://simaspraja.vercel.app"),
  openGraph: {
    title: APP_NAME,
    description: APP_FULL_NAME,
    siteName: APP_NAME,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: `Logo ${APP_NAME}` }],
    locale: "id_ID",
    type: "website",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0a2140", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <a href="#konten" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow-lift">
          Lewati ke konten utama
        </a>
        {children}
      </body>
    </html>
  );
}
