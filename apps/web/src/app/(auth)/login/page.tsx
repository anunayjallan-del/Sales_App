"use client";

import { Button, Card, Form, Input, Space, Typography } from "antd";

export default function LoginPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <Card style={{ width: "100%", maxWidth: 420 }} variant="borderless">
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Typography.Title level={3} style={{ margin: 0 }}>
            Sign in
          </Typography.Title>
          <Typography.Text type="secondary">Use Supabase Auth email/password in production setup.</Typography.Text>
          <Form layout="vertical">
            <Form.Item label="Email" name="email">
              <Input type="email" placeholder="name@company.com" />
            </Form.Item>
            <Form.Item label="Password" name="password">
              <Input.Password />
            </Form.Item>
            <Button type="primary" block>
              Sign in
            </Button>
          </Form>
        </Space>
      </Card>
    </main>
  );
}
