"use client";

import "@ant-design/v5-patch-for-react-19";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PropsWithChildren, useState } from "react";
import { App as AntApp, ConfigProvider, theme } from "antd";

export function Providers({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          fontFamily: "var(--font-sans)",
          fontFamilyCode: "var(--font-mono)",
          colorPrimary: "#315c46",
          colorInfo: "#315c46",
          colorSuccess: "#4c7d56",
          colorWarning: "#b9822b",
          colorError: "#b84d40",
          colorText: "#1f2a20",
          colorTextSecondary: "#606857",
          colorBgBase: "#f4ecdf",
          colorBgContainer: "#fffaf1",
          colorBorder: "#d7cfbf",
          colorBorderSecondary: "#e9e0d0",
          borderRadius: 18,
          borderRadiusLG: 24,
          boxShadow: "0 24px 60px rgba(66, 46, 18, 0.10)",
          boxShadowSecondary: "0 16px 40px rgba(66, 46, 18, 0.08)"
        }
      }}
    >
      <AntApp>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}
