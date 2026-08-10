import type { Metadata } from "next";
import "./globals.css";
import Header from "./components/Header";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Dragon Song",
  description: "Dragon Song Game Admin",
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
          <Header />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
