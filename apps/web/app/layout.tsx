import type { Metadata, Viewport } from "next";
import "galmuri/dist/galmuri.css";
import "./globals.css";
import Header from "./components/Header";
import { AuthProvider } from "@/lib/auth";
import { DialogProvider } from "@/components/common/DialogProvider";
import CursorEffect from "@/components/common/CursorEffect";

export const metadata: Metadata = {
  title: "Dragon Song",
  description: "Dragon Song Game Admin",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-ground text-ivory">
        <AuthProvider>
          <DialogProvider>
            <Header />
            {children}
          </DialogProvider>
        </AuthProvider>
        <CursorEffect />
      </body>
    </html>
  );
}
