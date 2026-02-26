"use client";

import { useState } from "react";
import { Alert, App, Button, Card, Space, Typography, Upload } from "antd";
import type { UploadProps } from "antd";

export function ImportXlsxForm() {
  const [file, setFile] = useState<File | null>(null);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState<"dry-run" | "commit" | null>(null);
  const { message } = App.useApp();

  const uploadProps: UploadProps = {
    accept: ".xlsx",
    maxCount: 1,
    beforeUpload: (selectedFile) => {
      setFile(selectedFile as File);
      return false;
    },
    onRemove: () => {
      setFile(null);
    }
  };

  async function submit(mode: "dry-run" | "commit") {
    if (!file) return;
    setLoading(mode);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", mode);
      const res = await fetch("/api/import/xlsx", { method: "POST", body: fd });
      const data = await res.json();
      setMessageText(JSON.stringify(data, null, 2));
      message.success(mode === "dry-run" ? "Dry run completed" : "Sync committed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Card title="Daily Sync Upload (.xlsx)" variant="borderless">
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Upload {...uploadProps}>
          <Button>Select Excel File</Button>
        </Upload>
        <Space>
          <Button onClick={() => submit("dry-run")} disabled={!file} loading={loading === "dry-run"}>
            Dry Run
          </Button>
          <Button type="primary" onClick={() => submit("commit")} disabled={!file} loading={loading === "commit"}>
            Commit
          </Button>
        </Space>
        {messageText ? (
          <Alert
            type="info"
            message={<Typography.Text strong>Import Response</Typography.Text>}
            description={<pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{messageText}</pre>}
          />
        ) : null}
      </Space>
    </Card>
  );
}
