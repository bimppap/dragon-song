import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "./components/Header";
import { AuthProvider } from "@/lib/auth";
import { DialogProvider } from "@/components/common/DialogProvider";

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
    <html lang="ko" style={{ colorScheme: "light" }}>
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <AuthProvider>
          <DialogProvider>
            <Header />
            {children}
          </DialogProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
