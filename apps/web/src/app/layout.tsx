import type { Metadata } from "next";
import "@/app/globals.css";
import "antd/dist/reset.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Tea Sales Control",
  description: "Lifecycle control for tea lots"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
