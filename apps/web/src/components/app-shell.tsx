"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  AppstoreOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  SearchOutlined,
  DashboardOutlined,
  SettingOutlined,
  SyncOutlined,
  TruckOutlined,
  UploadOutlined,
  ExperimentOutlined,
  ClockCircleOutlined,
  BookOutlined
} from "@ant-design/icons";
import { Button, Drawer, Grid, Input, Layout, Menu, Space, Typography } from "antd";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: <DashboardOutlined /> },
  { href: "/lots", label: "Lots", icon: <AppstoreOutlined /> },
  { href: "/sampling", label: "Sampling", icon: <ExperimentOutlined /> },
  { href: "/dispatch-pending", label: "Pending Dispatches", icon: <ClockCircleOutlined /> },
  { href: "/in-transit", label: "In Transit", icon: <TruckOutlined /> },
  { href: "/auction-catalogue", label: "Auction Catalogue", icon: <BookOutlined /> },
  { href: "/daily-sync", label: "Daily Sync", icon: <UploadOutlined /> },
  { href: "/dispatch-advices", label: "Dispatch", icon: <TruckOutlined /> },
  { href: "/sync-history", label: "Sync History", icon: <SyncOutlined /> },
  { href: "/settings", label: "Settings", icon: <SettingOutlined /> }
];

function normalizeLotNumber(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

function MasterLotSearchSync({
  pathname,
  setMasterLotSearch
}: {
  pathname: string;
  setMasterLotSearch: React.Dispatch<React.SetStateAction<string>>;
}) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const fromQuery = normalizeLotNumber(searchParams.get("search") ?? "");
    if (pathname.startsWith("/lots")) {
      setMasterLotSearch(fromQuery);
      return;
    }
    setMasterLotSearch("");
  }, [pathname, searchParams, setMasterLotSearch]);

  return null;
}

export function AppShell({ children, title: _title }: { children: React.ReactNode; title: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [masterLotSearch, setMasterLotSearch] = useState("");
  const selectedKey = links.find((item) => pathname.startsWith(item.href))?.href ?? "/dashboard";

  const submitMasterLotSearch = (value?: string) => {
    const normalized = normalizeLotNumber(value ?? masterLotSearch);
    if (!normalized) {
      router.push("/lots");
      return;
    }
    router.push(`/lots?search=${encodeURIComponent(normalized)}`);
  };

  return (
    <Layout style={{ minHeight: "100vh", background: "transparent" }}>
      <Suspense fallback={null}>
        <MasterLotSearchSync pathname={pathname} setMasterLotSearch={setMasterLotSearch} />
      </Suspense>
      {screens.md ? (
        <Layout.Sider
          collapsible
          trigger={null}
          collapsed={sidebarCollapsed}
          collapsedWidth={84}
          width={252}
          style={{
            position: "sticky",
            top: 0,
            height: "100vh",
            background: "rgba(250, 251, 246, 0.9)",
            borderRight: "1px solid #e9e9e9",
            padding: sidebarCollapsed ? "12px 6px" : "12px 10px"
          }}
        >
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Space direction="vertical" size={2} style={{ width: "100%" }}>
              <Space align="center" size={8} style={{ width: "100%", justifyContent: sidebarCollapsed ? "center" : "flex-start" }}>
                <Button
                  type="text"
                  icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  onClick={() => setSidebarCollapsed((prev) => !prev)}
                  aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                />
                {!sidebarCollapsed ? (
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    Tea Sales Control App
                  </Typography.Title>
                ) : (
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    TSC
                  </Typography.Title>
                )}
              </Space>
            </Space>
            <Menu
              mode="inline"
              inlineCollapsed={sidebarCollapsed}
              selectedKeys={[selectedKey]}
              items={links.map((item) => ({
                key: item.href,
                icon: item.icon,
                label: <Link href={item.href}>{item.label}</Link>
              }))}
              style={{ background: "transparent", borderRight: "none" }}
            />
          </Space>
        </Layout.Sider>
      ) : null}
      <Layout style={{ background: "transparent", minWidth: 0 }}>
        <Layout.Header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 30,
            background: "rgba(250, 251, 246, 0.9)",
            borderBottom: "1px solid #e9e9e9",
            height: "auto",
            lineHeight: "normal",
            padding: screens.md ? "10px 20px" : "10px 14px"
          }}
        >
          <Space direction="vertical" size={screens.md ? 4 : 8} style={{ width: "100%" }}>
            {!screens.md ? (
              <Space align="center" style={{ width: "100%", justifyContent: "space-between" }}>
                <Typography.Text strong>Tea Sales Control App</Typography.Text>
                <>
                  <Button icon={<MenuOutlined />} onClick={() => setMenuOpen(true)} />
                  <Drawer placement="left" open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
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
              </Space>
            ) : null}
            <Space direction="vertical" size={2} style={{ width: screens.md ? 560 : "100%" }}>
              <Input.Search
                size="large"
                allowClear
                value={masterLotSearch}
                maxLength={7}
                placeholder="Search by Lot No."
                enterButton={<SearchOutlined />}
                onChange={(event) => setMasterLotSearch(normalizeLotNumber(event.target.value))}
                onSearch={(value) => submitMasterLotSearch(String(value))}
              />
            </Space>
          </Space>
        </Layout.Header>
        <Layout.Content style={{ padding: screens.md ? 20 : 12, width: "100%" }}>{children}</Layout.Content>
      </Layout>
    </Layout>
  );
}
