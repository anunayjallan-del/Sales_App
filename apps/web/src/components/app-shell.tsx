"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  AppstoreOutlined,
  MenuOutlined,
  DashboardOutlined,
  SettingOutlined,
  SyncOutlined,
  TruckOutlined,
  UploadOutlined,
  ExperimentOutlined,
  ClockCircleOutlined,
  BookOutlined
} from "@ant-design/icons";
import { Button, Drawer, Grid, Layout, Menu, Space, Typography } from "antd";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: <DashboardOutlined /> },
  { href: "/lots", label: "Lots", icon: <AppstoreOutlined /> },
  { href: "/sampling", label: "Sampling", icon: <ExperimentOutlined /> },
  { href: "/dispatch-pending", label: "Pending Dispatches", icon: <ClockCircleOutlined /> },
  { href: "/auction-catalogue", label: "Auction Catalogue", icon: <BookOutlined /> },
  { href: "/daily-sync", label: "Daily Sync", icon: <UploadOutlined /> },
  { href: "/dispatch-advices", label: "Dispatch", icon: <TruckOutlined /> },
  { href: "/sync-history", label: "Sync History", icon: <SyncOutlined /> },
  { href: "/settings", label: "Settings", icon: <SettingOutlined /> }
];

export function AppShell({ children, title }: { children: React.ReactNode; title: string }) {
  const pathname = usePathname();
  const screens = Grid.useBreakpoint();
  const [menuOpen, setMenuOpen] = useState(false);
  const selectedKey = links.find((item) => pathname.startsWith(item.href))?.href ?? "/dashboard";

  return (
    <Layout style={{ minHeight: "100vh", background: "transparent" }}>
      <Layout.Header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          background: "rgba(250, 251, 246, 0.9)",
          borderBottom: "1px solid #e9e9e9",
          height: "auto",
          lineHeight: "normal",
          padding: screens.md ? "12px 20px" : "10px 14px"
        }}
      >
        <Space align="center" style={{ width: "100%", justifyContent: "space-between" }}>
          <Space direction="vertical" size={0}>
            <Typography.Title level={screens.md ? 4 : 5} style={{ margin: 0 }}>
              {title}
            </Typography.Title>
            <Typography.Text type="secondary">Tea Sales Control App</Typography.Text>
          </Space>
          {screens.md ? (
            <Menu
              mode="horizontal"
              selectedKeys={[selectedKey]}
              items={links.map((item) => ({
                key: item.href,
                icon: item.icon,
                label: <Link href={item.href}>{item.label}</Link>
              }))}
              style={{ background: "transparent", borderBottom: "none", flex: 1, justifyContent: "flex-end" }}
            />
          ) : (
            <>
              <Button icon={<MenuOutlined />} onClick={() => setMenuOpen(true)} />
              <Drawer placement="right" open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
                <Menu
                  mode="inline"
                  selectedKeys={[selectedKey]}
                  items={links.map((item) => ({
                    key: item.href,
                    icon: item.icon,
                    label: (
                      <Link href={item.href} onClick={() => setMenuOpen(false)}>
                        {item.label}
                      </Link>
                    )
                  }))}
                />
              </Drawer>
            </>
          )}
        </Space>
      </Layout.Header>
      <Layout.Content style={{ padding: screens.md ? 20 : 12, maxWidth: 1240, width: "100%", margin: "0 auto" }}>{children}</Layout.Content>
    </Layout>
  );
}
