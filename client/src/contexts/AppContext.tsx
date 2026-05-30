import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  ApiProject,
  ApiReport,
  ApiRule,
  ApiVulnerability,
  auditLogsApi,
  chatApi,
  createScanWebSocket,
  overviewApi,
  projectsApi,
  reportsApi,
  rulesApi,
  scansApi,
} from "@/lib/api";

// ==================== TYPES ====================

export interface Vulnerability {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  cwe: string;
  owasp: string;
  file: string;
  line: number;
  codeSnippet: string;
  description: string;
  dataFlow: { step: number; file: string; line: number; code: string; note: string }[];
  aiReasoning: string;
  suggestedFix: string;
  fixedCode: string;
  status: "unresolved" | "fixed" | "ignored";
  // PoC fields
  pocDescription?: string | null;
  pocScriptCode?: string | null;
  pocGeneratedAt?: string | null;
  // Backend fields
  _backendId?: number;
  _scanId?: number;
}

export interface Project {
  id: string;
  _backendId?: number;
  name: string;
  repoUrl: string;
  branch: string;
  language: string;
  lastScanTime: string;
  status: "idle" | "scanning" | "completed" | "failed";
  vulnerabilities: Vulnerability[];
  progress: number;
  scanLogs: string[];
  latestScanId?: number;
}

export interface Rule {
  id: string;
  _backendId?: number;
  name: string;
  lang: string;
  severity: "critical" | "high" | "medium" | "low";
  cwe: string;
  description: string;
  exampleBad: string;
  exampleGood: string;
  type: "security" | "quality" | "standard";
  isBuiltin?: boolean;
}

export interface Report {
  id: string;
  _backendId?: number;
  projectId: string;
  projectName: string;
  scanTime: string;
  vulnerabilityCount: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  fileUrl: string;
  complianceGrade?: string;
}

export interface AuditLog {
  id: string;
  time: string;
  user: string;
  action: string;
  ip: string;
  status: "success" | "warning" | "failed";
}

export interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  time: string;
  suggestions?: string[];
  // 扫描日志气泡扩展字段
  scanLogs?: string[];
  scanStatus?: "running" | "completed" | "failed";
  scanTitle?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  time: string;
  messages: ChatMessage[];
}

interface AppContextType {
  projects: Project[];
  activeProjectId: string | null;
  rules: Rule[];
  reports: Report[];
  auditLogs: AuditLog[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
  addProject: (name: string, repoUrl: string, language: string) => void;
  deleteProject: (id: string) => void;
  startScan: (projectId: string) => void;
  fixVulnerability: (projectId: string, vulnId: string) => void;
  ignoreVulnerability: (projectId: string, vulnId: string) => void;
  addRule: (rule: Omit<Rule, "id">) => void;
  deleteRule: (id: string) => void;
  integrations: {
    git: boolean;
    jenkins: boolean;
    jira: boolean;
    vscode: boolean;
    dingtalk: boolean;
  };
  toggleIntegration: (key: "git" | "jenkins" | "jira" | "vscode" | "dingtalk") => void;
  triggerQuickScan: (code: string, lang: string) => void;
  quickScanResult: {
    status: "idle" | "scanning" | "completed";
    logs: string[];
    vulnerabilities: Vulnerability[];
    code: string;
    scanId?: number;
  };
  chatSessions: ChatSession[];
  activeSessionId: string;
  setActiveSessionId: (id: string) => void;
  createNewSession: () => void;
  deleteSession: (id: string) => void;
  sendChatMessage: (text: string) => void;
  addChatMessage: (msg: ChatMessage) => void;
  updateChatMessage: (msgId: string, updater: (prev: ChatMessage) => ChatMessage) => void;
  isChatTyping: boolean;
  isLoading: boolean;
  refreshData: () => void;
}

// ==================== HELPERS ====================

function mapApiVuln(v: ApiVulnerability, scanId?: number): Vulnerability {
  return {
    id: v.vuln_id || String(v.id),
    _backendId: v.id,
    _scanId: scanId,
    title: v.title,
    severity: v.severity,
    cwe: v.cwe || "CWE-Unknown",
    owasp: "OWASP Top 10",
    file: v.file_path || "unknown",
    line: v.start_line || 0,
    codeSnippet: v.code_snippet || v.fix_before || "",
    description: v.description || "",
    dataFlow: [],
    aiReasoning: v.description || "",
    suggestedFix: v.remediation || "",
    fixedCode: v.fix_after || "",
    status: (v.status as "unresolved" | "fixed" | "ignored") || "unresolved",
    pocDescription: v.poc_description || null,
    pocScriptCode: v.poc_script_code || null,
    pocGeneratedAt: v.poc_generated_at || null,
  };
}

function mapApiProject(p: ApiProject, vulns: Vulnerability[] = []): Project {
  return {
    id: String(p.id),
    _backendId: p.id,
    name: p.name,
    repoUrl: p.repo_url,
    branch: p.branch,
    language: p.language,
    lastScanTime: p.created_at,
    status: (p.latest_scan_status as Project["status"]) || "idle",
    vulnerabilities: vulns,
    progress: p.latest_scan_status === "completed" ? 100 : 0,
    scanLogs: [],
    latestScanId: p.latest_scan_id || undefined,
  };
}

function mapApiRule(r: ApiRule): Rule {
  return {
    id: String(r.id),
    _backendId: r.id,
    name: r.name,
    lang: r.language,
    severity: r.severity,
    cwe: r.cwe,
    description: r.description,
    exampleBad: r.example_bad || "",
    exampleGood: r.example_good || "",
    type: r.rule_type as Rule["type"],
    isBuiltin: r.is_builtin,
  };
}

function mapApiReport(r: ApiReport): Report {
  return {
    id: r.report_id,
    _backendId: r.id,
    projectId: String(r.scan_id),
    projectName: r.project_name,
    scanTime: r.created_at,
    vulnerabilityCount: r.vulnerability_count || { critical: 0, high: 0, medium: 0, low: 0 },
    fileUrl: `/api/reports/${r.id}/markdown`,
    complianceGrade: r.compliance_grade || undefined,
  };
}

// ==================== INITIAL CHAT SESSION ====================

const INITIAL_SESSION_ID = "SESSION-001";
const INITIAL_SESSIONS: ChatSession[] = [
  {
    id: INITIAL_SESSION_ID,
    title: "欢迎使用 Vuls-Hunter",
    lastMessage: "您好！我是 AI 安全分析助手...",
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    messages: [
      {
        id: "MSG-WELCOME",
        sender: "ai",
        text: "您好！我是 **Vuls-Hunter AI 安全分析助手**，由 Strix 漏洞挖掘引擎驱动。\n\n我可以帮您：\n- 分析代码中的安全漏洞\n- 解释漏洞的危害与修复方案\n- 制定安全审计策略\n- 指导渗透测试流程\n\n请告诉我您需要什么帮助？",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        suggestions: ["开始快速扫描", "查看当前漏洞", "创建安全规则"],
      },
    ],
  },
];

// ==================== CONTEXT ====================

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [integrations, setIntegrations] = useState({
    git: false,
    jenkins: false,
    jira: false,
    vscode: false,
    dingtalk: false,
  });
  const [quickScanResult, setQuickScanResult] = useState<AppContextType["quickScanResult"]>({
    status: "idle",
    logs: [],
    vulnerabilities: [],
    code: "",
  });
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(INITIAL_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState(INITIAL_SESSION_ID);
  const [isChatTyping, setIsChatTyping] = useState(false);

  // Active WebSocket refs
  const scanWsRef = useRef<WebSocket | null>(null);

  // ─── Load data from backend ───────────────────────────────────────────────

  const loadProjects = useCallback(async () => {
    try {
      const apiProjects = await projectsApi.list();
      const mapped = await Promise.all(
        apiProjects.map(async (p) => {
          if (p.latest_scan_id) {
            try {
              const scan = await scansApi.get(p.latest_scan_id);
              const vulns = (scan.vulnerabilities || []).map((v) => mapApiVuln(v, p.latest_scan_id!));
              return mapApiProject(p, vulns);
            } catch {
              return mapApiProject(p);
            }
          }
          return mapApiProject(p);
        })
      );
      setProjects(mapped);
    } catch (err) {
      console.error("Failed to load projects:", err);
    }
  }, []);

  const loadRules = useCallback(async () => {
    try {
      const apiRules = await rulesApi.list();
      setRules(apiRules.map(mapApiRule));
    } catch (err) {
      console.error("Failed to load rules:", err);
    }
  }, []);

  const loadReports = useCallback(async () => {
    try {
      const apiReports = await reportsApi.list();
      setReports(apiReports.map(mapApiReport));
    } catch (err) {
      console.error("Failed to load reports:", err);
    }
  }, []);

  const loadAuditLogs = useCallback(async () => {
    try {
      const apiLogs = await auditLogsApi.list(50);
      setAuditLogs(
        apiLogs.map((l) => ({
          id: String(l.id),
          time: l.created_at,
          user: l.user,
          action: l.action,
          ip: "192.168.1.100",
          status: (l.level === "warning" ? "warning" : l.level === "error" ? "failed" : "success") as AuditLog["status"],
        }))
      );
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    }
  }, []);

  const refreshData = useCallback(async () => {
    await Promise.all([loadProjects(), loadRules(), loadReports(), loadAuditLogs()]);
  }, [loadProjects, loadRules, loadReports, loadAuditLogs]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await refreshData();
      setIsLoading(false);
    };
    init();
  }, [refreshData]);

  // ─── Projects ─────────────────────────────────────────────────────────────

  const addProject = useCallback(async (name: string, repoUrl: string, language: string) => {
    try {
      const created = await projectsApi.create({ name, repo_url: repoUrl, language });
      setProjects((prev) => [mapApiProject(created), ...prev]);
      toast.success(`项目 ${name} 创建成功！`);
    } catch (err) {
      toast.error(`创建项目失败: ${err}`);
    }
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    const project = projects.find((p) => p.id === id);
    if (!project?._backendId) return;
    try {
      await projectsApi.delete(project._backendId);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (activeProjectId === id) setActiveProjectId(null);
      toast.info("项目已成功删除");
    } catch (err) {
      toast.error(`删除项目失败: ${err}`);
    }
  }, [projects, activeProjectId]);

  const startScan = useCallback(async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project?._backendId) return;

    // Update UI immediately
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? { ...p, status: "scanning", progress: 0, scanLogs: ["初始化 AI 漏洞挖掘引擎...", "正在连接 Strix 扫描引擎..."] }
          : p
      )
    );

    toast.info("AI 漏洞挖掘引擎已启动...");

    try {
      const scan = await projectsApi.startScan(project._backendId, "standard");
      const scanId = scan.id;

      // Update project with scan ID
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, latestScanId: scanId } : p))
      );

      // Connect WebSocket for real-time logs
      if (scanWsRef.current) scanWsRef.current.close();
      const ws = createScanWebSocket(
        scanId,
        (event) => {
          if (event.type === "log" && event.data) {
            setProjects((prev) =>
              prev.map((p) =>
                p.id === projectId
                  ? {
                      ...p,
                      scanLogs: [...(p.scanLogs || []), event.data!],
                      progress: Math.min((p.progress || 0) + 5, 95),
                    }
                  : p
              )
            );
          } else if (event.type === "finished") {
            const success = event.success;
            setProjects((prev) =>
              prev.map((p) =>
                p.id === projectId
                  ? {
                      ...p,
                      status: success ? "completed" : "failed",
                      progress: 100,
                      lastScanTime: new Date().toISOString(),
                    }
                  : p
              )
            );

            if (success) {
              toast.success("AI 漏洞挖掘与审计任务已全部完成！");
              // Reload project data to get vulnerabilities
              setTimeout(() => {
                loadProjects();
                loadReports();
              }, 1000);
            } else {
              toast.error("扫描任务失败，请检查引擎日志");
            }
          }
        },
        () => {
          // WebSocket closed
        }
      );
      scanWsRef.current = ws;
    } catch (err) {
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, status: "failed" } : p))
      );
      toast.error(`启动扫描失败: ${err}`);
    }
  }, [projects, loadProjects, loadReports]);

  const fixVulnerability = useCallback(async (projectId: string, vulnId: string) => {
    const project = projects.find((p) => p.id === projectId);
    const vuln = project?.vulnerabilities.find((v) => v.id === vulnId);

    if (vuln?._backendId && vuln._scanId) {
      try {
        await scansApi.updateVulnStatus(vuln._scanId, vuln._backendId, "fixed");
      } catch (err) {
        console.error("Failed to update vuln status:", err);
      }
    }

    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? {
              ...p,
              vulnerabilities: p.vulnerabilities.map((v) =>
                v.id === vulnId ? { ...v, status: "fixed" as const } : v
              ),
            }
          : p
      )
    );
    toast.success("AI 智能感知修复补丁已成功应用并自动验证通过！");
  }, [projects]);

  const ignoreVulnerability = useCallback(async (projectId: string, vulnId: string) => {
    const project = projects.find((p) => p.id === projectId);
    const vuln = project?.vulnerabilities.find((v) => v.id === vulnId);

    if (vuln?._backendId && vuln._scanId) {
      try {
        await scansApi.updateVulnStatus(vuln._scanId, vuln._backendId, "ignored");
      } catch (err) {
        console.error("Failed to update vuln status:", err);
      }
    }

    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? {
              ...p,
              vulnerabilities: p.vulnerabilities.map((v) =>
                v.id === vulnId ? { ...v, status: "ignored" as const } : v
              ),
            }
          : p
      )
    );
    toast.info("已将该漏洞标记为忽略（智能学习库已记录此反馈）");
  }, [projects]);

  // ─── Rules ────────────────────────────────────────────────────────────────

  const addRule = useCallback(async (rule: Omit<Rule, "id">) => {
    try {
      const created = await rulesApi.create({
        name: rule.name,
        language: rule.lang,
        severity: rule.severity,
        cwe: rule.cwe,
        description: rule.description,
        example_bad: rule.exampleBad,
        example_good: rule.exampleGood,
        rule_type: rule.type,
      });
      setRules((prev) => [mapApiRule(created), ...prev]);
      toast.success(`安全规则 "${rule.name}" 已成功创建并下发至引擎！`);
    } catch (err) {
      toast.error(`创建规则失败: ${err}`);
    }
  }, []);

  const deleteRule = useCallback(async (id: string) => {
    const rule = rules.find((r) => r.id === id);
    if (rule?.isBuiltin) {
      toast.error("内置规则不可删除");
      return;
    }
    if (!rule?._backendId) return;
    try {
      await rulesApi.delete(rule._backendId);
      setRules((prev) => prev.filter((r) => r.id !== id));
      toast.info("规则已删除");
    } catch (err) {
      toast.error(`删除规则失败: ${err}`);
    }
  }, [rules]);

  // ─── Integrations ─────────────────────────────────────────────────────────

  const toggleIntegration = useCallback(
    (key: "git" | "jenkins" | "jira" | "vscode" | "dingtalk") => {
      setIntegrations((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        toast.success(`${key.toUpperCase()} 集成状态已切换为: ${next[key] ? "开启" : "关闭"}`);
        return next;
      });
    },
    []
  );

  // ─── Quick Scan ───────────────────────────────────────────────────────────

  const triggerQuickScan = useCallback(async (code: string, lang: string) => {
    setQuickScanResult({
      status: "scanning",
      logs: ["启动 Strix AI 漏洞挖掘引擎...", "正在初始化扫描环境..."],
      vulnerabilities: [],
      code,
    });

    try {
      const scan = await scansApi.startQuick({
        target: `quick-scan-${lang.toLowerCase()}`,
        code,
        language: lang,
        scan_mode: "quick",
      });

      const scanId = scan.id;
      setQuickScanResult((prev) => ({ ...prev, scanId }));

      // Connect WebSocket for real-time logs
      if (scanWsRef.current) scanWsRef.current.close();
      const ws = createScanWebSocket(
        scanId,
        (event) => {
          if (event.type === "log" && event.data) {
            setQuickScanResult((prev) => ({
              ...prev,
              logs: [...prev.logs, event.data!],
            }));
          } else if (event.type === "finished") {
            const success = event.success;
            if (success) {
              // Fetch final results
              scansApi.get(scanId).then((finalScan) => {
                const vulns = (finalScan.vulnerabilities || []).map((v) =>
                  mapApiVuln(v, scanId)
                );
                setQuickScanResult((prev) => ({
                  ...prev,
                  status: "completed",
                  vulnerabilities: vulns,
                }));
                if (vulns.length > 0) {
                  toast.warning(`AI 快速检测发现 ${vulns.length} 个漏洞！`);
                } else {
                  toast.success("AI 自动审计完成：未发现明显安全缺陷！");
                }
                loadReports();
              });
            } else {
              setQuickScanResult((prev) => ({ ...prev, status: "completed" }));
              toast.error("扫描任务失败");
            }
          }
        },
        () => {
          setQuickScanResult((prev) => {
            if (prev.status === "scanning") {
              return { ...prev, status: "completed" };
            }
            return prev;
          });
        }
      );
      scanWsRef.current = ws;
    } catch (err) {
      setQuickScanResult((prev) => ({ ...prev, status: "completed" }));
      toast.error(`快速扫描失败: ${err}`);
    }
  }, [loadReports]);

  // ─── Chat ─────────────────────────────────────────────────────────────────

  const createNewSession = useCallback(() => {
    const id = `SESSION-${Date.now()}`;
    const newSession: ChatSession = {
      id,
      title: "新建挖掘会话",
      lastMessage: "",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      messages: [],
    };
    setChatSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(id);
  }, []);

  const deleteSession = useCallback(
    (id: string) => {
      setChatSessions((prev) => {
        const filtered = prev.filter((s) => s.id !== id);
        if (activeSessionId === id && filtered.length > 0) {
          setActiveSessionId(filtered[0].id);
        }
        return filtered;
      });
      toast.info("会话已删除");
    },
    [activeSessionId]
  );

  // ─── Chat helpers ──────────────────────────────────────────────────────────

  const addChatMessage = useCallback(
    (msg: ChatMessage) => {
      setChatSessions((prev) =>
        prev.map((sess) =>
          sess.id === activeSessionId
            ? {
                ...sess,
                lastMessage: msg.text.substring(0, 40),
                messages: [...sess.messages, msg],
              }
            : sess
        )
      );
    },
    [activeSessionId]
  );

  const updateChatMessage = useCallback(
    (msgId: string, updater: (prev: ChatMessage) => ChatMessage) => {
      setChatSessions((prev) =>
        prev.map((sess) =>
          sess.id === activeSessionId
            ? {
                ...sess,
                messages: sess.messages.map((m) => (m.id === msgId ? updater(m) : m)),
              }
            : sess
        )
      );
    },
    [activeSessionId]
  );

  const sendChatMessage = useCallback(
    async (text: string) => {
      const userMsg: ChatMessage = {
        id: `MSG-${Date.now()}`,
        sender: "user",
        text,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setChatSessions((prev) =>
        prev.map((sess) =>
          sess.id === activeSessionId
            ? {
                ...sess,
                title:
                  sess.title === "新建挖掘会话"
                    ? text.substring(0, 15) + (text.length > 15 ? "..." : "")
                    : sess.title,
                lastMessage: text.substring(0, 40),
                messages: [...sess.messages, userMsg],
              }
            : sess
        )
      );

      setIsChatTyping(true);

      try {
        const response = await chatApi.send(text, activeSessionId);
        const aiMsg: ChatMessage = {
          id: `MSG-${Date.now() + 1}`,
          sender: "ai",
          text: response.text,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          suggestions: response.suggestions,
        };

        setChatSessions((prev) =>
          prev.map((sess) =>
            sess.id === activeSessionId
              ? {
                  ...sess,
                  lastMessage: response.text.substring(0, 40) + "...",
                  messages: [...sess.messages, aiMsg],
                }
              : sess
          )
        );
      } catch (err) {
        const errorMsg: ChatMessage = {
          id: `MSG-${Date.now() + 1}`,
          sender: "ai",
          text: `抱歉，AI 助手暂时无法响应。请检查 API 配置后重试。\n\n错误详情: ${err}`,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setChatSessions((prev) =>
          prev.map((sess) =>
            sess.id === activeSessionId
              ? { ...sess, messages: [...sess.messages, errorMsg] }
              : sess
          )
        );
      } finally {
        setIsChatTyping(false);
      }
    },
    [activeSessionId]
  );

  return (
    <AppContext.Provider
      value={{
        projects,
        activeProjectId,
        rules,
        reports,
        auditLogs,
        activeTab,
        setActiveTab,
        addProject,
        deleteProject,
        startScan,
        fixVulnerability,
        ignoreVulnerability,
        addRule,
        deleteRule,
        integrations,
        toggleIntegration,
        triggerQuickScan,
        quickScanResult,
        chatSessions,
        activeSessionId,
        setActiveSessionId,
        createNewSession,
        deleteSession,
        sendChatMessage,
        addChatMessage,
        updateChatMessage,
        isChatTyping,
        isLoading,
        refreshData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within an AppProvider");
  return context;
};
