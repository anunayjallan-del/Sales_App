"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import AppstoreOutlined from "@ant-design/icons/es/icons/AppstoreOutlined";
import BookOutlined from "@ant-design/icons/es/icons/BookOutlined";
import ClockCircleOutlined from "@ant-design/icons/es/icons/ClockCircleOutlined";
import DashboardOutlined from "@ant-design/icons/es/icons/DashboardOutlined";
import ExperimentOutlined from "@ant-design/icons/es/icons/ExperimentOutlined";
import MenuFoldOutlined from "@ant-design/icons/es/icons/MenuFoldOutlined";
import MenuOutlined from "@ant-design/icons/es/icons/MenuOutlined";
import MenuUnfoldOutlined from "@ant-design/icons/es/icons/MenuUnfoldOutlined";
import SearchOutlined from "@ant-design/icons/es/icons/SearchOutlined";
import SettingOutlined from "@ant-design/icons/es/icons/SettingOutlined";
import SyncOutlined from "@ant-design/icons/es/icons/SyncOutlined";
import TruckOutlined from "@ant-design/icons/es/icons/TruckOutlined";
import UploadOutlined from "@ant-design/icons/es/icons/UploadOutlined";
import { Badge, Button, Drawer, Grid, Input, Layout, Menu, Space, Typography, theme } from "antd";

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

const pageDescriptions: Record<string, string> = {
  "/dashboard": "Track urgent queues, receivables, and throughput across the tea sales lifecycle.",
  "/lots": "Search, review, and update every master lot from one operational table.",
  "/sampling": "Manage sampling workflows, party outreach, and send status with less back-and-forth.",
  "/dispatch-pending": "Keep sold or auction-ready lots moving before dispatch turns into a bottleneck.",
  "/in-transit": "Monitor transfer progress and clear the next handoff without losing lot context.",
  "/auction-catalogue": "Prepare auction readiness, catalogue activity, and live sale coordination.",
  "/daily-sync": "Run operational syncs and import updates without leaving the control surface.",
  "/dispatch-advices": "Review dispatch paperwork and final movement details before shipment.",
  "/sync-history": "Audit sync runs, exceptions, and the freshness of operational data.",
  "/settings": "Adjust environment and workflow settings that support the control room."
};

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

export function AppShell({ children, title }: { children: React.ReactNode; title: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const { token } = theme.useToken();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [masterLotSearch, setMasterLotSearch] = useState("");
  const selectedKey = links.find((item) => pathname.startsWith(item.href))?.href ?? "/dashboard";
  const pageDescription =
    pageDescriptions[selectedKey] ??
    "Use the workspace to search lots quickly and move each sale stage forward with confidence.";
  const todayLabel = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date());

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
          className="app-shell-sidebar"
          style={{
            position: "sticky",
            top: 0,
            height: "100vh",
            background: "rgba(255, 250, 241, 0.68)",
            borderRight: "1px solid rgba(114, 90, 52, 0.14)",
            padding: sidebarCollapsed ? "14px 8px" : "16px 12px"
          }}
        >
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <div
              className="app-shell-brand"
              style={{
                alignItems: sidebarCollapsed ? "center" : "flex-start",
                flexDirection: sidebarCollapsed ? "column" : "row"
              }}
            >
              <div className="app-shell-brand-mark">TS</div>
              {!sidebarCollapsed ? (
                <div className="app-shell-brand-copy">
                  <Typography.Text className="app-shell-eyebrow">Tea Sales Control</Typography.Text>
                  <Typography.Title level={4} style={{ fontSize: "1.05rem", letterSpacing: "-0.02em", margin: "4px 0 0" }}>
                    Operations cockpit
                  </Typography.Title>
                </div>
              ) : null}
              <Button
                type="text"
                icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                style={{ marginLeft: sidebarCollapsed ? 0 : "auto" }}
              />
            </div>
            {!sidebarCollapsed ? (
              <div className="app-shell-status-panel">
                <div className="app-shell-status-row">
                  <Typography.Text strong>Workflow lane</Typography.Text>
                  <Badge status="processing" text="Live" />
                </div>
                <Typography.Paragraph style={{ color: token.colorTextSecondary, margin: "10px 0 0" }}>
                  Search any lot from the header to jump straight into sampling, dispatch, or settlement.
                </Typography.Paragraph>
              </div>
            ) : null}
            {!sidebarCollapsed ? <Typography.Text className="app-shell-eyebrow">Navigation</Typography.Text> : null}
            <Menu
              mode="inline"
              inlineCollapsed={sidebarCollapsed}
              selectedKeys={[selectedKey]}
              className="app-shell-nav"
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
          className="app-shell-header"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 30,
            background: "rgba(255, 250, 241, 0.68)",
            borderBottom: "1px solid rgba(114, 90, 52, 0.14)",
            height: "auto",
            lineHeight: "normal",
            padding: screens.md ? "18px 24px" : "14px"
          }}
        >
          <div className="app-shell-header-grid">
            <div>
              <Typography.Text className="app-shell-eyebrow">
                {selectedKey === "/dashboard" ? "Control centre" : "Tea sales control"}
              </Typography.Text>
              <Typography.Title level={1} className="app-shell-title">
                {title}
              </Typography.Title>
              <Typography.Paragraph className="app-shell-description">{pageDescription}</Typography.Paragraph>
            </div>
            <div>
              <div className="app-shell-meta-row">
                {screens.md ? (
                  <div className="app-shell-meta-chip">
                    <Typography.Text className="app-shell-eyebrow">Today</Typography.Text>
                    <Typography.Text strong>{todayLabel}</Typography.Text>
                  </div>
                ) : (
                  <Typography.Text type="secondary">Quick access</Typography.Text>
                )}
                {!screens.md ? (
                  <>
                    <Button icon={<MenuOutlined />} onClick={() => setMenuOpen(true)} aria-label="Open navigation menu" />
                    <Drawer placement="left" open={menuOpen} onClose={() => setMenuOpen(false)} title="Navigation">
                      <Menu
                        mode="inline"
                        selectedKeys={[selectedKey]}
                        className="app-shell-nav"
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
                ) : null}
              </div>
              <div className="app-shell-search-panel">
                <Typography.Text className="app-shell-search-label">Master lot lookup</Typography.Text>
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
              </div>
            </div>
          </div>
        </Layout.Header>
        <Layout.Content style={{ padding: screens.md ? 24 : 14, width: "100%" }}>
          <div className="app-shell-content content-fade-in">{children}</div>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
