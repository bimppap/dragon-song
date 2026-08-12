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
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* FOUC 방지: 하이드레이션 전에 저장된 테마를 적용 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
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
