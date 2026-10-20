import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/store/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "GateKeeper",
  description: "GateKeeper is a modern estate management application designed to improve security, communication, and daily operations in gated residential communities. Built with Next.js, Firebase Authentication, and Cloud Firestore, it provides separate dashboards for residents, security personnel, and estate administrators",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><Providers>{children}</Providers></body>
    </html>
  );
}
