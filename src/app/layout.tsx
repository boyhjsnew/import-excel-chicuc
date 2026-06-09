import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Import Biên Lai - Chi Cục",
  description: "Công cụ import hóa đơn từ file Excel theo định dạng chuẩn",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}
      >
        <main className="flex flex-1 flex-col">{children}</main>
        <footer className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 text-center text-xs text-gray-500">
          Copyright © {new Date().getFullYear()}. M-invoice HCM
        </footer>
      </body>
    </html>
  );
}
