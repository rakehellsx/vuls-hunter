/**
 * Vuls-Hunter API Client
 * Provides typed wrappers around all backend REST endpoints.
 */

const API_BASE = "/api";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ApiVulnerability {
  id: number;
  vuln_id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  impact: string;
  remediation: string;
  proof_of_concept: string;
  cwe: string | null;
  file_path: string | null;
  start_line: number | null;
  end_line: number | null;
  code_snippet: string | null;
  fix_before: string | null;
  fix_after: string | null;
  status: "unresolved" | "fixed" | "ignored";
  discovered_at: string;
}

export interface ApiScan {
  id: number;
  run_name: string;
  target: string;
  scan_mode: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  log_output?: string;
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
  vulnerabilities?: ApiVulnerability[];
}

export interface ApiProject {
  id: number;
  name: string;
  repo_url: string;
  language: string;
  description: string | null;
  branch: string;
  created_at: string;
  vulnerability_summary: { critical: number; high: number; medium: number; low: number };
  latest_scan_status: string | null;
  latest_scan_id: number | null;
}

export interface ApiRule {
  id: number;
  name: string;
  language: string;
  severity: "critical" | "high" | "medium" | "low";
  cwe: string;
  description: string;
  example_bad: string | null;
  example_good: string | null;
  rule_type: "security" | "quality" | "standard";
  is_builtin: boolean;
  is_active: boolean;
  created_at: string;
}

export interface ApiReport {
  id: number;
  report_id: string;
  project_name: string;
  executive_summary: string | null;
  vulnerability_count: { critical: number; high: number; medium: number; low: number };
  compliance_grade: string | null;
  created_at: string;
  scan_id: number;
}

export interface ApiAuditLog {
  id: number;
  action: string;
  level: string;
  user: string;
  details: string | null;
  created_at: string;
}

export interface ApiOverview {
  vulnerability_counts: { critical: number; high: number; medium: number; low: number };
  total_vulnerabilities: number;
  fixed_count: number;
  auto_fix_rate: number;
  project_count: number;
  scan_count: number;
  recent_scans: Array<{ id: number; target: string; scan_mode: string; status: string; created_at: string }>;
  recent_reports: Array<{ id: number; report_id: string; project_name: string; compliance_grade: string; vulnerability_count: Record<string, number>; created_at: string }>;
}

export interface QuickScanRequest {
  target: string;
  code?: string;
  language?: string;
  scan_mode?: string;
  project_id?: number;
  instruction?: string;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`API ${path} failed (${res.status}): ${error}`);
  }
  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────
// Scans
// ─────────────────────────────────────────────

export const scansApi = {
  startQuick: (data: QuickScanRequest) =>
    request<ApiScan>("/scans/quick", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  get: (scanId: number) =>
    request<ApiScan & { vulnerabilities: ApiVulnerability[] }>(`/scans/${scanId}`),

  updateVulnStatus: (scanId: number, vulnId: number, status: string) =>
    request<{ success: boolean; status: string }>(
      `/scans/${scanId}/vulnerabilities/${vulnId}?status=${status}`,
      { method: "PATCH" }
    ),
};

// ─────────────────────────────────────────────
// Projects
// ─────────────────────────────────────────────

export const projectsApi = {
  list: () => request<ApiProject[]>("/projects/"),

  create: (data: { name: string; repo_url: string; language: string; description?: string; branch?: string }) =>
    request<ApiProject>("/projects/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  createFromArchive: async (data: {
    name: string;
    language: string;
    description?: string;
    branch?: string;
    file: File;
  }): Promise<ApiProject & { archive_filename?: string }> => {
    const formData = new FormData();
    formData.append("name", data.name);
    formData.append("language", data.language);
    formData.append("description", data.description || "");
    formData.append("branch", data.branch || "main");
    formData.append("file", data.file);
    const res = await fetch(`${API_BASE}/projects/upload-archive`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Upload failed (${res.status}): ${error}`);
    }
    return res.json();
  },

  delete: (id: number) =>
    request<{ success: boolean }>(`/projects/${id}`, { method: "DELETE" }),

  startScan: (id: number, scan_mode = "standard", instruction?: string) =>
    request<ApiScan>(`/projects/${id}/scan?scan_mode=${scan_mode}${instruction ? `&instruction=${encodeURIComponent(instruction)}` : ""}`, {
      method: "POST",
    }),

  getScans: (id: number) =>
    request<ApiScan[]>(`/projects/${id}/scans`),
};

// ─────────────────────────────────────────────
// Rules
// ─────────────────────────────────────────────

export const rulesApi = {
  list: () => request<ApiRule[]>("/rules/"),

  create: (data: {
    name: string;
    language: string;
    severity: string;
    cwe: string;
    description: string;
    example_bad?: string;
    example_good?: string;
    rule_type?: string;
  }) =>
    request<ApiRule>("/rules/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/rules/${id}`, { method: "DELETE" }),

  compileWithAI: (id: number) =>
    request<{ success: boolean; description: string; example_bad: string; example_good: string }>(
      `/rules/${id}/compile`,
      { method: "POST" }
    ),
};

// ─────────────────────────────────────────────
// Reports
// ─────────────────────────────────────────────

export const reportsApi = {
  list: () => request<ApiReport[]>("/reports/"),

  get: (id: number) =>
    request<ApiReport & { full_report_md: string; methodology: string; technical_analysis: string; recommendations: string }>(
      `/reports/${id}`
    ),

  getMarkdown: async (id: number): Promise<string> => {
    const res = await fetch(`${API_BASE}/reports/${id}/markdown`);
    if (!res.ok) throw new Error("Failed to fetch report markdown");
    return res.text();
  },
};

// ─────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────

export const overviewApi = {
  get: () => request<ApiOverview>("/overview"),
};

// ─────────────────────────────────────────────
// Audit Logs
// ─────────────────────────────────────────────

export const auditLogsApi = {
  list: (limit = 100) => request<ApiAuditLog[]>(`/audit-logs?limit=${limit}`),
};

// ─────────────────────────────────────────────
// Chat
// ─────────────────────────────────────────────

export const chatApi = {
  send: (message: string, session_id?: string) =>
    request<{ text: string; suggestions: string[]; session_id: string }>("/chat", {
      method: "POST",
      body: JSON.stringify({ message, session_id }),
    }),
};

// ─────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────

export const engineApi = {
  status: () =>
    request<{
      status: string;
      components: Record<string, { status: string; version?: string; model?: string }>;
      metrics: { cpu_usage: number; memory_usage: number; memory_used_gb: number; memory_total_gb: number };
    }>("/engine/status"),
};

// ─────────────────────────────────────────────
// WebSocket
// ─────────────────────────────────────────────

export function createScanWebSocket(
  scanId: number,
  onMessage: (event: { type: string; data?: string; exit_code?: number; success?: boolean }) => void,
  onClose?: () => void
): WebSocket {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const ws = new WebSocket(`${protocol}//${host}/api/scans/${scanId}/ws`);

  ws.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      onMessage(event);
    } catch {
      onMessage({ type: "log", data: e.data });
    }
  };

  ws.onclose = () => {
    onClose?.();
  };

  ws.onerror = (e) => {
    console.error("WebSocket error:", e);
  };

  return ws;
}
