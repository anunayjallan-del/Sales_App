"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { fetchJson } from "@/lib/fetcher";
import { FilterOutlined } from "@ant-design/icons";
import { App, Button, Card, Dropdown, Input, Modal, Popconfirm, Popover, Segmented, Select, Space, Table, Tag, Typography } from "antd";

type SamplingRow = {
  id: string;
  lot_id: string;
  performed_at: string;
  payload?: {
    parties?: string[];
    sampling_date?: string;
    remarks?: string;
  } | null;
  lots?: {
    mark?: string;
    invoice_number?: string;
    grade?: string;
  } | null;
};

type ViewMode = "PARTIES" | "LOT";

type PartyViewRow = {
  id: string;
  party: string;
  mark: string;
  lot_numbers: string[];
  grades: string;
  sampling_date: string;
  remarks: string;
  performed_at: string;
};

type LotRow = {
  id: string;
  mark: string;
  invoice_number: string;
  grade: string;
  bags: number;
  net_weight_kg: number;
  active_statuses?: string[];
  lifecycle_status?: string;
};

type SamplingDraftRow = {
  id: string;
  party: string;
  mark: string;
  lotIds: string[];
  lotNumbers: string[];
};

type HistoryGroup = {
  mark: string;
  lotNumbers: string[];
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function createRowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function uniqueNameOptions(names: string[]): Array<{ label: string; value: string }> {
  return Array.from(new Set(names.map((name) => String(name).trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ label: name, value: name }));
}

function HeaderFilter({
  label,
  active,
  content
}: {
  label: string;
  active: boolean;
  content: ReactNode;
}) {
  return (
    <Space size={6}>
      <span>{label}</span>
      <Popover trigger="click" placement="bottomLeft" content={content}>
        <Button size="small" type={active ? "primary" : "text"} icon={<FilterOutlined />} onClick={(e) => e.stopPropagation()} />
      </Popover>
    </Space>
  );
}

function HeaderMenuFilter({
  label,
  active,
  items,
  onClick
}: {
  label: string;
  active: boolean;
  items: Array<{ key: string; label: ReactNode }>;
  onClick: (key: string) => void;
}) {
  return (
    <Space size={6}>
      <span>{label}</span>
      <Dropdown
        trigger={["click"]}
        menu={{
          items,
          onClick: ({ key }) => onClick(String(key))
        }}
      >
        <Button size="small" type={active ? "primary" : "text"} icon={<FilterOutlined />} onClick={(e) => e.stopPropagation()} />
      </Dropdown>
    </Space>
  );
}

function isDateInRange(dateValue: string | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!dateValue || dateValue === "-") return false;
  if (from && dateValue < from) return false;
  if (to && dateValue > to) return false;
  return true;
}

export default function SamplingPage() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("LOT");
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [batchSamplingDate, setBatchSamplingDate] = useState(todayIsoDate());
  const [draftRows, setDraftRows] = useState<SamplingDraftRow[]>([]);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [lotModalMark, setLotModalMark] = useState("");
  const [lotModalStatusFilter, setLotModalStatusFilter] = useState<string[]>([]);
  const [lotModalGradeFilter, setLotModalGradeFilter] = useState<string[]>([]);
  const [lotModalSelectedKeys, setLotModalSelectedKeys] = useState<string[]>([]);
  const [partyFilter, setPartyFilter] = useState("");
  const [markFilter, setMarkFilter] = useState("");
  const [lotNoFilter, setLotNoFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [samplingDateFrom, setSamplingDateFrom] = useState("");
  const [samplingDateTo, setSamplingDateTo] = useState("");
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [historyParty, setHistoryParty] = useState("");
  const [historyDate, setHistoryDate] = useState("");
  const [historyGroups, setHistoryGroups] = useState<HistoryGroup[]>([]);
  const { data, isLoading } = useQuery({
    queryKey: ["sampling-records"],
    queryFn: () => fetchJson<{ rows: SamplingRow[] }>("/api/sampling")
  });
  const { data: partyOptions } = useQuery({
    queryKey: ["party-options"],
    queryFn: () => fetchJson<{ buyers: string[]; brokers: string[] }>("/api/parties/options")
  });
  const { data: lotFilterOptions } = useQuery({
    queryKey: ["lot-filter-options"],
    queryFn: () => fetchJson<{ marks: string[]; factories: string[]; grades: string[] }>("/api/lots/filter-options")
  });
  const activeDraftRow = useMemo(() => draftRows.find((row) => row.id === activeRowId) ?? null, [activeRowId, draftRows]);
  const {
    data: lotsForMark,
    isLoading: isLotsForMarkLoading,
    isError: isLotsForMarkError,
    error: lotsForMarkError
  } = useQuery({
    queryKey: ["sampling-lots-by-mark", lotModalMark],
    enabled: Boolean(lotModalMark),
    queryFn: async () => {
      const pageSize = 200;
      let page = 1;
      let total = 0;
      const allLots: LotRow[] = [];

      while (true) {
        const response = await fetchJson<{ lots: LotRow[]; total: number; page: number; pageSize: number }>(
          `/api/lots?page=${page}&pageSize=${pageSize}&mark=${encodeURIComponent(lotModalMark)}`
        );
        allLots.push(...response.lots);
        total = response.total;
        if (!response.lots.length || allLots.length >= total) break;
        page += 1;
      }

      return {
        lots: allLots,
        total,
        page: 1,
        pageSize
      };
    }
  });

  const createSamplingBatch = useMutation({
    mutationFn: async () => {
      if (!draftRows.length) throw new Error("Add at least one row.");
      for (const row of draftRows) {
        if (!row.party) throw new Error("Select party for all rows.");
        if (!row.mark) throw new Error("Select mark for all rows.");
        if (!row.lotIds.length) throw new Error("Select lots for all rows.");
      }
      await Promise.all(draftRows.flatMap((row) =>
        row.lotIds.map((lotId) =>
          fetchJson(`/api/lots/${lotId}/actions`, {
            method: "POST",
            body: JSON.stringify({
              action: "SAMPLING",
              data: {
                parties: [row.party],
                sampling_date: batchSamplingDate
              }
            })
          })
        )
      ));
    },
    onSuccess: async () => {
      message.success("Sampling recorded");
      setIsAddingNew(false);
      setDraftRows([]);
      setActiveRowId(null);
      await queryClient.invalidateQueries({ queryKey: ["sampling-records"] });
      await queryClient.invalidateQueries({ queryKey: ["sampling-lots-by-mark"] });
    },
    onError: (error: Error) => {
      message.error(error.message || "Failed to record sampling");
    }
  });
  const deleteSamplingAction = useMutation({
    mutationFn: async (input: { lotId: string; actionId: string }) =>
      fetchJson<{ deleted: boolean; rolledBackToStatus?: string }>(`/api/lots/${input.lotId}/actions/${input.actionId}`, {
        method: "DELETE"
      }),
    onSuccess: async () => {
      message.success("Sampling action deleted");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sampling-records"] }),
        queryClient.invalidateQueries({ queryKey: ["lots"] })
      ]);
    },
    onError: (error: Error) => {
      message.error(error.message || "Failed to delete action");
    }
  });

  const partySelectOptions = useMemo(
    () => uniqueNameOptions([...(partyOptions?.buyers ?? []), ...(partyOptions?.brokers ?? [])]),
    [partyOptions?.buyers, partyOptions?.brokers]
  );
  const markSelectOptions = useMemo(
    () => (lotFilterOptions?.marks ?? []).map((mark) => ({ label: mark, value: mark })),
    [lotFilterOptions?.marks]
  );
  const selectableLots = useMemo(
    () =>
      (lotsForMark?.lots ?? []).filter((lot) => {
        const statuses = lot.active_statuses ?? (lot.lifecycle_status ? [lot.lifecycle_status] : []);
        return !statuses.includes("CANCELLED") && !statuses.includes("CLOSED");
      }),
    [lotsForMark?.lots]
  );
  const lotStatusItems = useMemo(() => {
    const statuses = Array.from(
      new Set(
        selectableLots.flatMap((lot) => (lot.active_statuses?.length ? lot.active_statuses : lot.lifecycle_status ? [lot.lifecycle_status] : []))
      )
    ).sort((a, b) => a.localeCompare(b));
    return statuses.map((status) => ({ label: status, value: status }));
  }, [selectableLots]);
  const selectableLotsFiltered = useMemo(
    () => {
      const byStatus = lotModalStatusFilter.length
        ? selectableLots.filter((lot) => {
            const statuses = lot.active_statuses?.length ? lot.active_statuses : lot.lifecycle_status ? [lot.lifecycle_status] : [];
            return statuses.some((s) => lotModalStatusFilter.includes(s));
          })
        : selectableLots;

      if (!lotModalGradeFilter.length) return byStatus;
      return byStatus.filter((lot) => lotModalGradeFilter.includes(String(lot.grade ?? "")));
    },
    [lotModalGradeFilter, lotModalStatusFilter, selectableLots]
  );
  const lotGradeItems = useMemo(() => {
    const grades = Array.from(
      new Set(
        selectableLots
          .map((lot) => String(lot.grade ?? "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
    return grades.map((grade) => ({ label: grade, value: grade }));
  }, [selectableLots]);
  const getLatestSampledDateForParty = (party: string): string => {
    const latest = (data?.rows ?? [])
      .filter((record) => (record.payload?.parties ?? []).includes(party))
      .map((record) => String(record.payload?.sampling_date ?? "").trim())
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a))[0];
    return latest ?? "";
  };
  const getSamplingGroupsForPartyDate = (party: string, date: string): HistoryGroup[] => {
    const grouped = new Map<string, Set<string>>();
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

    for (const record of data?.rows ?? []) {
      const parties = record.payload?.parties ?? [];
      const samplingDate = String(record.payload?.sampling_date ?? "").trim();
      const mark = String(record.lots?.mark ?? "").trim();
      const lotNo = String(record.lots?.invoice_number ?? "").trim();
      if (!parties.includes(party) || samplingDate !== date || !mark || !lotNo) continue;
      if (!grouped.has(mark)) grouped.set(mark, new Set<string>());
      grouped.get(mark)?.add(lotNo);
    }

    return Array.from(grouped.entries())
      .map(([mark, lots]) => ({
        mark,
        lotNumbers: Array.from(lots).sort((a, b) => collator.compare(a, b))
      }))
      .sort((a, b) => a.mark.localeCompare(b.mark));
  };
  const samplingLotColumns: ColumnsType<LotRow> = [
    { title: "Lot No.", dataIndex: "invoice_number", key: "invoice_number" },
    { title: "Grade", dataIndex: "grade", key: "grade", responsive: ["md"] },
    { title: "Weight", dataIndex: "net_weight_kg", key: "net_weight_kg", width: 120, responsive: ["md"] },
    {
      title: "Status",
      key: "status",
      render: (_, row) => {
        const statuses = row.active_statuses?.length ? row.active_statuses : row.lifecycle_status ? [row.lifecycle_status] : [];
        return (
          <Space size={[4, 4]} wrap>
            {statuses.map((status) => (
              <Tag key={`${row.id}-${status}`}>{status}</Tag>
            ))}
          </Space>
        );
      }
    }
  ];
  const samplingDraftColumns: ColumnsType<SamplingDraftRow> = [
    {
      title: "Party",
      key: "party",
      render: (_, row) => (
        <Select
          placeholder="Select party"
          value={row.party || undefined}
          options={partySelectOptions}
          showSearch
          optionFilterProp="label"
          style={{ minWidth: 260 }}
          onChange={(value) => {
            setDraftRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, party: value } : r)));
            setHistoryPanelOpen(false);
            setHistoryParty("");
            setHistoryDate("");
            setHistoryGroups([]);
          }}
        />
      )
    },
    {
      title: "Last sampled on",
      key: "last_sampled_on",
      render: (_, row) => {
        if (!row.party) return "-";
        const latest = getLatestSampledDateForParty(row.party);
        if (!latest) return "-";
        return (
          <Button
            type="link"
            size="small"
            style={{ paddingInline: 0 }}
            onClick={() => {
              setHistoryPanelOpen(true);
              setHistoryParty(row.party);
              setHistoryDate(latest);
              setHistoryGroups(getSamplingGroupsForPartyDate(row.party, latest));
            }}
          >
            {latest}
          </Button>
        );
      }
    },
    {
      title: "Mark",
      key: "mark",
      render: (_, row) => (
        <Select
          placeholder="Select mark"
          value={row.mark || undefined}
          options={markSelectOptions}
          showSearch
          optionFilterProp="label"
          style={{ minWidth: 220 }}
          disabled={!row.party}
          onChange={(value) => {
            setDraftRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, mark: value, lotIds: [], lotNumbers: [] } : r)));
            setActiveRowId(row.id);
            setLotModalMark(value);
            setLotModalStatusFilter([]);
            setLotModalGradeFilter([]);
            setLotModalSelectedKeys([]);
          }}
        />
      )
    },
    {
      title: "Lots",
      key: "lots",
      render: (_, row) => (
        <div
          role="button"
          tabIndex={row.mark ? 0 : -1}
          style={{
            cursor: row.mark ? "pointer" : "not-allowed",
            padding: 8,
            borderRadius: 8,
            background: row.mark ? "#fafafa" : "transparent",
            border: row.mark ? "1px solid #f0f0f0" : "1px dashed #f0f0f0"
          }}
          onClick={() => {
            if (!row.mark) return;
            setActiveRowId(row.id);
            setLotModalMark(row.mark);
            setLotModalStatusFilter([]);
            setLotModalGradeFilter([]);
            setLotModalSelectedKeys(row.lotIds);
          }}
          onKeyDown={(event) => {
            if (!row.mark) return;
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            setActiveRowId(row.id);
            setLotModalMark(row.mark);
            setLotModalStatusFilter([]);
            setLotModalGradeFilter([]);
            setLotModalSelectedKeys(row.lotIds);
          }}
        >
          <Space direction="vertical" size={6}>
            <Typography.Text type="secondary">
              {row.mark ? "Click to select lots" : "Select party and mark first"}
            </Typography.Text>
            <Space size={[4, 4]} wrap>
              {row.lotNumbers.length
                ? row.lotNumbers.map((lotNo) => <Tag key={`${row.id}-${lotNo}`}>{lotNo}</Tag>)
                : <Typography.Text type="secondary">No lots selected</Typography.Text>}
            </Space>
          </Space>
        </div>
      )
    }
  ];
  const hasReadyRows = draftRows.some((row) => row.lotIds.length > 0);

  const searchedRows = useMemo(() => {
    const rows = data?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const lot = `${row.lots?.mark ?? ""} ${row.lots?.invoice_number ?? ""} ${row.payload?.sampling_date ?? ""}`.toLowerCase();
      const parties = (row.payload?.parties ?? []).join(" ").toLowerCase();
      const grade = String(row.lots?.grade ?? "").toLowerCase();
      return lot.includes(q) || parties.includes(q) || grade.includes(q);
    });
  }, [data?.rows, search]);

  const markItems = useMemo(() => {
    const marks = Array.from(new Set((searchedRows ?? []).map((r) => String(r.lots?.mark ?? "").trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );
    return [{ key: "__ALL__", label: "All marks" }, ...marks.map((m) => ({ key: m, label: m }))];
  }, [searchedRows]);

  const lotItems = useMemo(() => {
    const lots = Array.from(new Set((searchedRows ?? []).map((r) => String(r.lots?.invoice_number ?? "").trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );
    return [{ key: "__ALL__", label: "All lots" }, ...lots.map((l) => ({ key: l, label: l }))];
  }, [searchedRows]);

  const gradeItems = useMemo(() => {
    const grades = Array.from(new Set((searchedRows ?? []).map((r) => String(r.lots?.grade ?? "").trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );
    return [{ key: "__ALL__", label: "All grades" }, ...grades.map((g) => ({ key: g, label: g }))];
  }, [searchedRows]);

  const partyItems = useMemo(() => {
    const parties = Array.from(
      new Set((searchedRows ?? []).flatMap((r) => (r.payload?.parties ?? []).map((p) => String(p).trim()).filter(Boolean)))
    ).sort((a, b) => a.localeCompare(b));
    return [{ key: "__ALL__", label: "All parties" }, ...parties.map((p) => ({ key: p, label: p }))];
  }, [searchedRows]);

  const lotRows = useMemo(
    () =>
      [...searchedRows]
        .filter((row) => {
          const mark = String(row.lots?.mark ?? "");
          const lotNo = String(row.lots?.invoice_number ?? "");
          const grade = String(row.lots?.grade ?? "");
          const parties = row.payload?.parties ?? [];
          const samplingDate = row.payload?.sampling_date;
          if (markFilter && mark !== markFilter) return false;
          if (lotNoFilter && lotNo !== lotNoFilter) return false;
          if (gradeFilter && grade !== gradeFilter) return false;
          if (partyFilter && !parties.includes(partyFilter)) return false;
          if (!isDateInRange(samplingDate, samplingDateFrom, samplingDateTo)) return false;
          return true;
        })
        .sort((a, b) =>
        String(b.payload?.sampling_date ?? b.performed_at).localeCompare(String(a.payload?.sampling_date ?? a.performed_at))
      ),
    [gradeFilter, lotNoFilter, markFilter, partyFilter, samplingDateFrom, samplingDateTo, searchedRows]
  );

  const partyRows = useMemo<PartyViewRow[]>(() => {
    const groups = new Map<
      string,
      {
        party: string;
        mark: string;
        sampling_date: string;
        lot_numbers: Set<string>;
        grades: Set<string>;
        remarks: Set<string>;
        performed_at: string;
      }
    >();

    for (const row of searchedRows) {
      const samplingDate = row.payload?.sampling_date ?? "-";
      const mark = row.lots?.mark ?? "-";
      const lotNo = row.lots?.invoice_number ?? "-";
      const grade = row.lots?.grade ?? "-";
      const remarks = row.payload?.remarks ?? "";
      for (const party of row.payload?.parties ?? []) {
        const key = `${party}__${samplingDate}__${mark}`;
        const existing = groups.get(key);
        if (existing) {
          existing.lot_numbers.add(lotNo);
          existing.grades.add(grade);
          if (remarks) existing.remarks.add(remarks);
          if (row.performed_at > existing.performed_at) existing.performed_at = row.performed_at;
        } else {
          groups.set(key, {
            party,
            mark,
            sampling_date: samplingDate,
            lot_numbers: new Set([lotNo]),
            grades: new Set([grade]),
            remarks: remarks ? new Set([remarks]) : new Set<string>(),
            performed_at: row.performed_at
          });
        }
      }
    }

    return Array.from(groups.entries())
      .map(([key, value]) => ({
        id: key,
        party: value.party,
        mark: value.mark,
        sampling_date: value.sampling_date,
        lot_numbers: Array.from(value.lot_numbers).sort((a, b) => a.localeCompare(b)),
        grades: Array.from(value.grades).sort((a, b) => a.localeCompare(b)).join(", "),
        remarks: Array.from(value.remarks).join(" | ") || "-",
        performed_at: value.performed_at
      }))
      .sort((a, b) => {
        const partyCompare = a.party.localeCompare(b.party);
        if (partyCompare !== 0) return partyCompare;
        const dateCompare = b.sampling_date.localeCompare(a.sampling_date);
        if (dateCompare !== 0) return dateCompare;
        return a.mark.localeCompare(b.mark);
      })
      .filter((row) => {
        if (partyFilter && row.party !== partyFilter) return false;
        if (markFilter && row.mark !== markFilter) return false;
        if (lotNoFilter && !row.lot_numbers.includes(lotNoFilter)) return false;
        if (gradeFilter && !row.grades.split(", ").includes(gradeFilter)) return false;
        if (!isDateInRange(row.sampling_date, samplingDateFrom, samplingDateTo)) return false;
        return true;
      });
  }, [gradeFilter, lotNoFilter, markFilter, partyFilter, samplingDateFrom, samplingDateTo, searchedRows]);

  const lotColumns: ColumnsType<SamplingRow> = [
    {
      title: (
        <HeaderMenuFilter
          label="Mark"
          active={Boolean(markFilter)}
          items={markItems}
          onClick={(key) => setMarkFilter(key === "__ALL__" ? "" : key)}
        />
      ),
      key: "mark",
      render: (_, row) => row.lots?.mark ?? "-"
    },
    {
      title: (
        <HeaderMenuFilter
          label="Lot No."
          active={Boolean(lotNoFilter)}
          items={lotItems}
          onClick={(key) => setLotNoFilter(key === "__ALL__" ? "" : key)}
        />
      ),
      key: "invoice_number",
      render: (_, row) => row.lots?.invoice_number ?? "-"
    },
    {
      title: (
        <HeaderMenuFilter
          label="Grade"
          active={Boolean(gradeFilter)}
          items={gradeItems}
          onClick={(key) => setGradeFilter(key === "__ALL__" ? "" : key)}
        />
      ),
      dataIndex: ["lots", "grade"],
      key: "grade",
      responsive: ["md"]
    },
    {
      title: (
        <HeaderFilter
          label="Sampling Date"
          active={Boolean(samplingDateFrom || samplingDateTo)}
          content={
            <Space direction="vertical" size={8}>
              <Input type="date" size="small" value={samplingDateFrom} onChange={(e) => setSamplingDateFrom(e.target.value)} />
              <Input type="date" size="small" value={samplingDateTo} onChange={(e) => setSamplingDateTo(e.target.value)} />
            </Space>
          }
        />
      ),
      key: "sampling_date",
      render: (_, row) => row.payload?.sampling_date ?? "-"
    },
    {
      title: (
        <HeaderMenuFilter
          label="Parties"
          active={Boolean(partyFilter)}
          items={partyItems}
          onClick={(key) => setPartyFilter(key === "__ALL__" ? "" : key)}
        />
      ),
      key: "parties",
      render: (_, row) => (
        <Space size={[4, 4]} wrap>
          {(row.payload?.parties ?? []).length
            ? (row.payload?.parties ?? []).map((party) => <Tag key={`${row.id}-${party}`}>{party}</Tag>)
            : "-"}
        </Space>
      )
    },
    {
      title: "Remarks",
      key: "remarks",
      render: (_, row) => row.payload?.remarks ?? "-",
      responsive: ["lg"]
    },
    {
      title: "Recorded At",
      key: "recorded_at",
      render: (_, row) => new Date(row.performed_at).toLocaleString(),
      responsive: ["md"]
    },
    {
      title: "Action",
      key: "action_delete",
      width: 130,
      render: (_, row) => (
        <Popconfirm
          title="Delete this action only?"
          description="Lot will remain. Only latest action can be deleted."
          okText="Delete Action"
          okButtonProps={{ danger: true, loading: deleteSamplingAction.isPending }}
          cancelText="Cancel"
          onConfirm={async () => {
            await deleteSamplingAction.mutateAsync({ lotId: row.lot_id, actionId: row.id });
          }}
        >
          <Button size="small" danger>
            Delete Action
          </Button>
        </Popconfirm>
      )
    }
  ];

  const partyColumns: ColumnsType<PartyViewRow> = [
    {
      title: (
        <HeaderMenuFilter
          label="Party"
          active={Boolean(partyFilter)}
          items={partyItems}
          onClick={(key) => setPartyFilter(key === "__ALL__" ? "" : key)}
        />
      ),
      dataIndex: "party",
      key: "party"
    },
    {
      title: (
        <HeaderFilter
          label="Sampling Date"
          active={Boolean(samplingDateFrom || samplingDateTo)}
          content={
            <Space direction="vertical" size={8}>
              <Input type="date" size="small" value={samplingDateFrom} onChange={(e) => setSamplingDateFrom(e.target.value)} />
              <Input type="date" size="small" value={samplingDateTo} onChange={(e) => setSamplingDateTo(e.target.value)} />
            </Space>
          }
        />
      ),
      dataIndex: "sampling_date",
      key: "sampling_date"
    },
    {
      title: (
        <HeaderMenuFilter
          label="Mark"
          active={Boolean(markFilter)}
          items={markItems}
          onClick={(key) => setMarkFilter(key === "__ALL__" ? "" : key)}
        />
      ),
      dataIndex: "mark",
      key: "mark"
    },
    {
      title: (
        <HeaderMenuFilter
          label="Lot No."
          active={Boolean(lotNoFilter)}
          items={lotItems}
          onClick={(key) => setLotNoFilter(key === "__ALL__" ? "" : key)}
        />
      ),
      key: "lot_numbers",
      render: (_, row) => (
        <Space size={[4, 4]} wrap>
          {row.lot_numbers.length ? row.lot_numbers.map((lot) => <Tag key={`${row.id}-${lot}`}>{lot}</Tag>) : "-"}
        </Space>
      )
    },
    {
      title: (
        <HeaderMenuFilter
          label="Grade"
          active={Boolean(gradeFilter)}
          items={gradeItems}
          onClick={(key) => setGradeFilter(key === "__ALL__" ? "" : key)}
        />
      ),
      dataIndex: "grades",
      key: "grades",
      responsive: ["md"]
    },
    {
      title: "Remarks",
      dataIndex: "remarks",
      key: "remarks",
      responsive: ["lg"]
    }
  ];

  const tableConfig = (() => {
    if (viewMode === "PARTIES") {
      return { rowKey: "id", columns: partyColumns as ColumnsType<unknown>, dataSource: partyRows as unknown[] };
    }
    return { rowKey: "id", columns: lotColumns as ColumnsType<unknown>, dataSource: lotRows as unknown[] };
  })();

  return (
    <AppShell title="Sampling">
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        {!isAddingNew ? (
          <Card variant="borderless">
            <Button
              type="primary"
              onClick={() => {
                setIsAddingNew(true);
                setBatchSamplingDate(todayIsoDate());
                setDraftRows([{ id: createRowId(), party: "", mark: "", lotIds: [], lotNumbers: [] }]);
                setLotModalMark("");
                setHistoryPanelOpen(false);
                setHistoryParty("");
                setHistoryDate("");
                setHistoryGroups([]);
              }}
            >
              Add new
            </Button>
          </Card>
        ) : (
          <Card title="Add Sampling Entries" variant="borderless">
            <Space direction="vertical" size={10} style={{ width: "100%" }}>
              <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
                <Typography.Text type="secondary">Create entries for a single date.</Typography.Text>
                <Space>
                  <Typography.Text strong>Date</Typography.Text>
                  <Input
                    type="date"
                    value={batchSamplingDate}
                    style={{ width: 170 }}
                    onChange={(e) => setBatchSamplingDate(e.target.value)}
                  />
                </Space>
              </Space>
              <Table
                rowKey="id"
                size="small"
                columns={samplingDraftColumns}
                dataSource={draftRows}
                pagination={false}
                scroll={{ x: 900 }}
              />
              {hasReadyRows ? (
                <Space>
                  <Button
                    onClick={() =>
                      setDraftRows((prev) => [...prev, { id: createRowId(), party: "", mark: "", lotIds: [], lotNumbers: [] }])
                    }
                  >
                    Add another row
                  </Button>
                  <Button type="primary" loading={createSamplingBatch.isPending} onClick={() => createSamplingBatch.mutate()}>
                    Save
                  </Button>
                </Space>
              ) : null}
            </Space>
          </Card>
        )}
        <Card variant="borderless">
          <Space direction="vertical" style={{ width: "100%" }} size={8}>
            <Typography.Text type="secondary">Search by lot, grade, or party.</Typography.Text>
            <Input
              placeholder="Search sampling records"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 360 }}
            />
            <Segmented<ViewMode>
              value={viewMode}
              onChange={(v) => setViewMode(v)}
              options={[
                { label: "View by Parties", value: "PARTIES" },
                { label: "View by Lot", value: "LOT" }
              ]}
            />
          </Space>
        </Card>
        <Card variant="borderless" styles={{ body: { padding: 0 } }}>
          <Table
            rowKey={tableConfig.rowKey}
            loading={isLoading}
            columns={tableConfig.columns}
            dataSource={tableConfig.dataSource}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            scroll={{ x: 900 }}
          />
        </Card>
        <Modal
          title={activeDraftRow ? `Select Lots (${activeDraftRow.mark || "-"})` : "Select Lots"}
          open={Boolean(activeRowId)}
          onCancel={() => {
            setActiveRowId(null);
            setLotModalMark("");
            setLotModalStatusFilter([]);
            setLotModalGradeFilter([]);
          }}
          onOk={() => {
            if (!activeDraftRow) return;
            const selectedLotNoById = new Map((selectableLots ?? []).map((lot) => [lot.id, lot.invoice_number]));
            setDraftRows((prev) =>
              prev.map((row) =>
                row.id === activeDraftRow.id
                  ? {
                      ...row,
                      lotIds: lotModalSelectedKeys,
                      lotNumbers: lotModalSelectedKeys.map((id) => selectedLotNoById.get(id) ?? id)
                    }
                  : row
              )
            );
            setActiveRowId(null);
            setLotModalMark("");
            setLotModalStatusFilter([]);
            setLotModalGradeFilter([]);
          }}
        >
          <Space direction="vertical" size={10} style={{ width: "100%" }}>
            {isLotsForMarkError ? (
              <Typography.Text type="danger">
                {lotsForMarkError instanceof Error ? lotsForMarkError.message : "Failed to load lots for selected mark."}
              </Typography.Text>
            ) : null}
            <Select
              mode="multiple"
              allowClear
              placeholder="Filter by status"
              value={lotModalStatusFilter}
              options={lotStatusItems}
              style={{ width: "100%" }}
              onChange={(values) => setLotModalStatusFilter(values)}
            />
            <Select
              mode="multiple"
              allowClear
              placeholder="Filter by grade"
              value={lotModalGradeFilter}
              options={lotGradeItems}
              style={{ width: "100%" }}
              onChange={(values) => setLotModalGradeFilter(values)}
            />
            <Table
              rowKey="id"
              size="small"
              loading={isLotsForMarkLoading}
              columns={samplingLotColumns}
              dataSource={selectableLotsFiltered}
              rowSelection={{
                selectedRowKeys: lotModalSelectedKeys,
                onChange: (keys) => setLotModalSelectedKeys(keys as string[])
              }}
              pagination={{ pageSize: 8, showSizeChanger: false }}
              scroll={{ x: 820 }}
            />
          </Space>
        </Modal>
        <Modal
          title="Sampling History"
          open={historyPanelOpen}
          onCancel={() => setHistoryPanelOpen(false)}
          footer={[
            <Button key="close" onClick={() => setHistoryPanelOpen(false)}>
              Close
            </Button>
          ]}
        >
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <Typography.Text>
              <strong>Party:</strong> {historyParty}
            </Typography.Text>
            <Typography.Text>
              <strong>Date:</strong> {historyDate}
            </Typography.Text>
            {historyGroups.length ? (
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                {historyGroups.map((group) => (
                  <div key={`${group.mark}-${historyDate}`}>
                    <Typography.Text strong>{group.mark}</Typography.Text>
                    <div style={{ marginTop: 6 }}>
                      <Space size={[6, 6]} wrap>
                        {group.lotNumbers.map((lotNo) => (
                          <Tag key={`${group.mark}-${lotNo}`}>{lotNo}</Tag>
                        ))}
                      </Space>
                    </div>
                  </div>
                ))}
              </Space>
            ) : (
              <Typography.Text type="secondary">No lots found.</Typography.Text>
            )}
          </Space>
        </Modal>
      </Space>
    </AppShell>
  );
}
