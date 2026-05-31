import React, { useState, useRef, useEffect, useCallback } from "react";
import { useApp, ChatMessage, ChatSession } from "@/contexts/AppContext";
import {
  Send,
  Sparkles,
  Bot,
  User,
  Plus,
  Trash2,
  MessageSquare,
  ArrowRight,
  ShieldAlert,
  Zap,
  BookOpen,
  FileText,
  Upload,
  Link,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  Github,
  Package,
  Terminal,
  Code2,
  Globe,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Bug,
  Shield,
  Search,
} from "lucide-react";
import { chatApi } from "@/lib/api";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type InputMode = "text" | "file" | "url";
type ScanDepth = "quick" | "standard" | "deep";

interface CodeContext {
  code: string;
  targetInfo: string;
  fileCount: number;
  language: string;
  scanId?: number;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function uploadArchiveForChat(
  file: File,
  scanMode: string
): Promise<{ code: string; fileCount: number; language: string; filesAnalyzed: string[]; scanId: number }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("scan_mode", scanMode);
  formData.append("instruction", `对压缩包 ${file.name} 进行全面安全审计，重点挖掘高危漏洞`);

  const resp = await fetch("/api/upload/archive", { method: "POST", body: formData });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "上传失败" }));
    throw new Error(err.detail || "上传失败");
  }
  const data = await resp.json();
  const filesAnalyzed: string[] = data.files_analyzed || [];
  // Use full code content returned by backend for OpenCode analysis
  const codeContent = data.code_content || [
    `# 代码包: ${file.name}`,
    `# 语言: ${data.language}`,
    `# 文件数: ${data.file_count}`,
    `# 已分析文件列表:`,
    ...filesAnalyzed.map((f: string) => `#   - ${f}`),
  ].join("\n");
  return {
    code: codeContent,
    fileCount: data.file_count,
    language: data.language,
    filesAnalyzed,
    scanId: data.scan_id,
  };
}

async function cloneUrlForChat(
  url: string,
  scanMode: string
): Promise<{ code: string; fileCount: number; language: string; targetName: string; scanId: number }> {
  const resp = await fetch("/api/upload/url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, scan_mode: scanMode, instruction: `对 ${url} 进行全面安全审计，重点挖掘高危漏洞` }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "分析失败" }));
    throw new Error(err.detail || "分析失败");
  }
  const data = await resp.json();
  const filesAnalyzed: string[] = data.files_analyzed || [];
  const targetName = data.target_name || url;
  // Use full code content returned by backend for OpenCode analysis
  const codeContent = data.code_content || [
    `# 目标: ${url}`,
    `# 仓库/文件名: ${targetName}`,
    `# 语言: ${data.language}`,
    `# 文件数: ${data.file_count}`,
    `# 已分析文件列表:`,
    ...filesAnalyzed.map((f: string) => `#   - ${f}`),
  ].join("\n");
  return {
    code: codeContent,
    fileCount: data.file_count,
    language: data.language,
    targetName,
    scanId: data.scan_id,
  };
}

function connectScanWebSocket(
  scanId: number,
  onLog: (line: string) => void,
  onFinished: (success: boolean) => void
): WebSocket {
  const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/scans/${scanId}/ws`;
  const ws = new WebSocket(wsUrl);
  ws.onmessage = (evt) => {
    try {
      const event = JSON.parse(evt.data);
      if (event.type === "log" && event.data) onLog(event.data);
      else if (event.type === "finished") { onFinished(event.success !== false); ws.close(); }
    } catch {}
  };
  ws.onerror = () => onFinished(false);
  return ws;
}

// ─────────────────────────────────────────────
// ScanLogBubble
// ─────────────────────────────────────────────

interface ScanLogBubbleProps {
  logs: string[];
  status: "running" | "completed" | "failed";
  title: string;
}

function ScanLogBubble({ logs, status, title }: ScanLogBubbleProps) {
  const [collapsed, setCollapsed] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!collapsed) logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, collapsed]);

  return (
    <div className="space-y-2">
      <div
        className="flex items-center gap-2 text-sm font-semibold text-[#1c1917] cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <Terminal className="w-4 h-4 text-blue-600 shrink-0" />
        <span className="flex-1">{title}</span>
        {status === "running" && (
          <span className="flex items-center gap-1 text-xs text-blue-600 font-normal">
            <Loader2 className="w-3 h-3 animate-spin" /> 分析中...
          </span>
        )}
        {status === "completed" && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 font-normal">
            <CheckCircle className="w-3 h-3" /> 完成
          </span>
        )}
        {status === "failed" && (
          <span className="flex items-center gap-1 text-xs text-red-600 font-normal">
            <AlertCircle className="w-3 h-3" /> 失败
          </span>
        )}
        {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" /> : <ChevronUp className="w-3.5 h-3.5 text-stone-400" />}
      </div>

      {!collapsed && (
        <div className="bg-[#0f172a] rounded-xl p-4 max-h-56 overflow-y-auto font-mono text-xs border border-slate-700 shadow-inner">
          {logs.map((log, i) => (
            <div
              key={i}
              className={`leading-5 ${
                log.includes("[✓]") || log.includes("[+]") ? "text-emerald-400"
                : log.includes("[!]") ? "text-amber-400"
                : log.includes("[✗]") || log.includes("失败") || log.includes("Error") ? "text-red-400"
                : log.includes("[*]") ? "text-sky-300"
                : "text-slate-300"
              }`}
            >
              {log}
            </div>
          ))}
          {status === "running" && (
            <div className="text-blue-400 flex items-center gap-1 mt-1 animate-pulse"><span>▋</span></div>
          )}
          <div ref={logsEndRef} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MarkdownRenderer — 简单 Markdown 渲染
// ─────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let codeBlock: string[] = [];
  let inCode = false;
  let codeLang = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (!inCode) {
        inCode = true;
        codeLang = line.slice(3).trim();
        codeBlock = [];
      } else {
        nodes.push(
          <div key={`code-${i}`} className="my-2 rounded-lg overflow-hidden border border-slate-700">
            {codeLang && (
              <div className="bg-slate-800 px-3 py-1 text-xs text-slate-400 font-mono border-b border-slate-700 flex items-center gap-1.5">
                <Code2 className="w-3 h-3" />{codeLang}
              </div>
            )}
            <pre className="bg-[#0f172a] p-3 text-xs font-mono text-slate-200 overflow-x-auto leading-5 whitespace-pre-wrap">
              {codeBlock.join("\n")}
            </pre>
          </div>
        );
        inCode = false;
        codeBlock = [];
        codeLang = "";
      }
      continue;
    }

    if (inCode) {
      codeBlock.push(line);
      continue;
    }

    if (line.startsWith("## ")) {
      nodes.push(<h2 key={i} className="text-sm font-bold text-[#1c1917] mt-3 mb-1 border-b border-[#e7e5e4] pb-1">{line.slice(3)}</h2>);
    } else if (line.startsWith("### ")) {
      nodes.push(<h3 key={i} className="text-xs font-bold text-[#1c1917] mt-2 mb-0.5 uppercase tracking-wide">{line.slice(4)}</h3>);
    } else if (line.startsWith("**") && line.endsWith("**") && line.length > 4) {
      nodes.push(<p key={i} className="text-sm font-bold text-[#1c1917] my-0.5">{line.slice(2, -2)}</p>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      const content = line.slice(2);
      nodes.push(
        <div key={i} className="flex gap-2 text-sm text-[#1c1917] my-0.5">
          <span className="text-blue-500 mt-1 shrink-0">•</span>
          <span dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/`(.*?)`/g, '<code class="bg-stone-100 px-1 rounded text-xs font-mono text-red-700">$1</code>') }} />
        </div>
      );
    } else if (line.match(/^\d+\. /)) {
      const content = line.replace(/^\d+\. /, "");
      const num = line.match(/^(\d+)\./)?.[1];
      nodes.push(
        <div key={i} className="flex gap-2 text-sm text-[#1c1917] my-0.5">
          <span className="text-blue-600 font-bold shrink-0 min-w-[1.2rem]">{num}.</span>
          <span dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/`(.*?)`/g, '<code class="bg-stone-100 px-1 rounded text-xs font-mono text-red-700">$1</code>') }} />
        </div>
      );
    } else if (line.startsWith("> ")) {
      nodes.push(
        <blockquote key={i} className="border-l-2 border-amber-400 pl-3 text-sm text-amber-800 bg-amber-50 rounded-r py-1 my-1 italic">
          {line.slice(2)}
        </blockquote>
      );
    } else if (line === "---" || line === "***") {
      nodes.push(<hr key={i} className="border-[#e7e5e4] my-2" />);
    } else if (line.trim() === "") {
      nodes.push(<div key={i} className="h-1.5" />);
    } else {
      nodes.push(
        <p key={i} className="text-sm text-[#1c1917] leading-relaxed my-0.5"
          dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/`(.*?)`/g, '<code class="bg-stone-100 px-1 rounded text-xs font-mono text-red-700">$1</code>') }}
        />
      );
    }
  }

  return nodes;
}

// ─────────────────────────────────────────────
// ChatMessageBubble
// ─────────────────────────────────────────────

interface ChatMessageBubbleProps {
  msg: ChatMessage;
  onActionClick: (action: string) => void;
}

function ChatMessageBubble({ msg, onActionClick }: ChatMessageBubbleProps) {
  const isAI = msg.sender === "ai";

  return (
    <div className={`flex gap-3 ${isAI ? "max-w-3xl" : "max-w-2xl ml-auto flex-row-reverse"}`}>
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
          isAI
            ? "bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 border-blue-100 shadow-sm"
            : "bg-stone-100 text-stone-600 border-stone-200"
        }`}
      >
        {isAI ? <Sparkles className="w-4 h-4" /> : <User className="w-4 h-4" />}
      </div>

      <div className="space-y-1.5 min-w-0 flex-1">
        <div
          className={`p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] ${
            isAI
              ? "bg-[#fafaf9] border border-[#e7e5e4] text-[#1c1917] rounded-tl-none"
              : "bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-tr-none"
          }`}
        >
          {msg.scanLogs !== undefined ? (
            <ScanLogBubble logs={msg.scanLogs} status={msg.scanStatus || "running"} title={msg.scanTitle || "AI 漏洞扫描"} />
          ) : isAI ? (
            <div className="space-y-0.5">{renderMarkdown(msg.text)}</div>
          ) : (
            <span className="text-sm font-medium whitespace-pre-line">{msg.text}</span>
          )}
        </div>

        {isAI && msg.suggestions && msg.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {msg.suggestions.map((sug: string, idx: number) => (
              <button
                key={idx}
                onClick={() => onActionClick(sug)}
                className="px-3 py-1.5 bg-white border border-[#e7e5e4] hover:border-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg text-xs font-semibold transition-all duration-200 inline-flex items-center gap-1 shadow-sm"
              >
                {sug}
                <ArrowRight className="w-3 h-3" />
              </button>
            ))}
          </div>
        )}

        <span className="text-[10px] text-stone-400 block px-1">{msg.time}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CodeContextBadge — 显示已加载的代码上下文
// ─────────────────────────────────────────────

interface CodeContextBadgeProps {
  ctx: CodeContext;
  onClear: () => void;
}

function CodeContextBadge({ ctx, onClear }: CodeContextBadgeProps) {
  return (
    <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-xs">
      <Code2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-indigo-800 truncate block">{ctx.targetInfo}</span>
        <span className="text-indigo-500">{ctx.fileCount} 个文件 · {ctx.language}</span>
      </div>
      <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold">已加载</span>
      <button onClick={onClear} className="p-0.5 text-indigo-400 hover:text-red-500 rounded transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────

export default function ChatAgent() {
  const {
    chatSessions,
    activeSessionId,
    setActiveSessionId,
    createNewSession,
    deleteSession,
    sendChatMessage,
    addChatMessage,
    updateChatMessage,
    isChatTyping,
  } = useApp();

  const [input, setInput] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [urlInput, setUrlInput] = useState("");
  const [scanDepth, setScanDepth] = useState<ScanDepth>("standard");
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState<string>("");
  const [codeContext, setCodeContext] = useState<CodeContext | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeSession = chatSessions.find((s) => s.id === activeSessionId) || chatSessions[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages, isChatTyping]);

  useEffect(() => {
    return () => { wsRef.current?.close(); };
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  // Clear code context when switching sessions
  useEffect(() => {
    setCodeContext(null);
    setInputMode("text");
  }, [activeSessionId]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    if (codeContext) {
      // Send with code context attached
      sendChatMessage(input, codeContext.code, codeContext.targetInfo);
      // After first message with code, clear context (OpenCode session retains it)
      setCodeContext(null);
    } else {
      sendChatMessage(input);
    }
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as any);
    }
  };

  const handleActionClick = (action: string) => {
    const lower = action.toLowerCase();
    if (lower.includes("上传代码") || lower.includes("代码包")) {
      setInputMode("file");
    } else if (lower.includes("github") || lower.includes("url") || lower.includes("仓库")) {
      setInputMode("url");
    } else {
      sendChatMessage(action);
    }
  };

  // ─── File handling ────────────────────────────

  const handleFileSelect = (file: File) => {
    setUploadError("");
    const name = file.name.toLowerCase();
    const isArchive =
      name.endsWith(".zip") || name.endsWith(".tar") ||
      name.endsWith(".tar.gz") || name.endsWith(".tgz") ||
      name.endsWith(".tar.bz2") || name.endsWith(".tar.xz");
    if (!isArchive) {
      setUploadError("仅支持 .zip / .tar / .tar.gz / .tgz 格式的压缩包");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadError("文件大小不能超过 50MB");
      return;
    }
    setSelectedFile(file);
  };

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  // ─── 加载代码到上下文（不立即发送，等用户输入问题）────

  const loadFileToContext = async () => {
    if (!selectedFile) return;
    const file = selectedFile;
    setIsProcessing(true);
    setUploadError("");

    // Insert user message
    const userMsgId = `MSG-USER-${Date.now()}`;
    addChatMessage({
      id: userMsgId,
      sender: "user",
      text: `上传代码包：${file.name}（${(file.size / 1024).toFixed(1)} KB）`,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });

    // Insert scan log bubble
    const logMsgId = `MSG-SCAN-${Date.now()}`;
    addChatMessage({
      id: logMsgId,
      sender: "ai",
      text: "",
      scanLogs: ["[*] 正在解压代码包..."],
      scanStatus: "running",
      scanTitle: `加载代码包: ${file.name}`,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    } as ChatMessage);

    const appendLog = (line: string) => {
      updateChatMessage(logMsgId, (prev) => ({
        ...prev,
        scanLogs: [...(prev.scanLogs || []), line],
      }));
    };

    try {
      const result = await uploadArchiveForChat(file, scanDepth);

      // Connect WebSocket for real-time scan logs
      await new Promise<void>((resolve) => {
        wsRef.current = connectScanWebSocket(
          result.scanId,
          (line) => appendLog(line),
          (success) => {
            updateChatMessage(logMsgId, (prev) => ({
              ...prev,
              scanStatus: success ? "completed" : "failed",
            }));
            resolve();
          }
        );
      });

      // Store code context
      setCodeContext({
        code: result.code,
        targetInfo: file.name,
        fileCount: result.fileCount,
        language: result.language,
        scanId: result.scanId,
      });

      // AI prompt to start analysis
      setInputMode("text");
      setSelectedFile(null);

      // Auto-send initial analysis request
      sendChatMessage(
        `我已上传代码包 "${file.name}"（${result.fileCount} 个 ${result.language} 文件）。请对这份代码进行全面的安全漏洞审计，按危险等级从高到低列出所有发现的漏洞，并给出具体修复方案。`,
        result.code,
        file.name
      );
    } catch (err: any) {
      appendLog(`[✗] 错误: ${err.message || "操作失败"}`);
      updateChatMessage(logMsgId, (prev) => ({ ...prev, scanStatus: "failed" }));
      setUploadError(err.message || "操作失败");
    } finally {
      setIsProcessing(false);
    }
  };

  const loadUrlToContext = async () => {
    if (!urlInput.trim()) return;
    const url = urlInput.trim();
    const isGithub = url.toLowerCase().includes("github.com");
    setIsProcessing(true);
    setUploadError("");

    const userMsgId = `MSG-USER-${Date.now()}`;
    addChatMessage({
      id: userMsgId,
      sender: "user",
      text: `分析 ${isGithub ? "GitHub 仓库" : "URL"}: ${url}`,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });

    const logMsgId = `MSG-SCAN-${Date.now()}`;
    addChatMessage({
      id: logMsgId,
      sender: "ai",
      text: "",
      scanLogs: [isGithub ? "[*] 正在克隆 GitHub 仓库..." : "[*] 正在下载代码..."],
      scanStatus: "running",
      scanTitle: isGithub ? `克隆仓库: ${url.split("/").slice(-2).join("/")}` : `分析 URL: ${url}`,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    } as ChatMessage);

    const appendLog = (line: string) => {
      updateChatMessage(logMsgId, (prev) => ({
        ...prev,
        scanLogs: [...(prev.scanLogs || []), line],
      }));
    };

    try {
      const result = await cloneUrlForChat(url, scanDepth);

      await new Promise<void>((resolve) => {
        wsRef.current = connectScanWebSocket(
          result.scanId,
          (line) => appendLog(line),
          (success) => {
            updateChatMessage(logMsgId, (prev) => ({
              ...prev,
              scanStatus: success ? "completed" : "failed",
            }));
            resolve();
          }
        );
      });

      setCodeContext({
        code: result.code,
        targetInfo: result.targetName,
        fileCount: result.fileCount,
        language: result.language,
        scanId: result.scanId,
      });

      setInputMode("text");
      setUrlInput("");

      sendChatMessage(
        `我已提交 ${isGithub ? "GitHub 仓库" : "URL"} "${url}"（${result.fileCount} 个 ${result.language} 文件）。请对这份代码进行全面的安全漏洞审计，按危险等级从高到低列出所有发现的漏洞，并给出具体修复方案。`,
        result.code,
        result.targetName
      );
    } catch (err: any) {
      appendLog(`[✗] 错误: ${err.message || "操作失败"}`);
      updateChatMessage(logMsgId, (prev) => ({ ...prev, scanStatus: "failed" }));
      setUploadError(err.message || "操作失败");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNewSession = () => {
    createNewSession();
    setCodeContext(null);
    setInputMode("text");
    setUrlInput("");
    setSelectedFile(null);
  };

  const isGithubUrl = urlInput.toLowerCase().includes("github.com");

  const quickPrompts = [
    { icon: <Bug className="w-3 h-3" />, text: "分析 SQL 注入漏洞的危害与防御方案" },
    { icon: <Shield className="w-3 h-3" />, text: "帮我制定一套 Web 应用安全审计策略" },
    { icon: <Search className="w-3 h-3" />, text: "解释 SSRF 漏洞的利用链与防御方案" },
    { icon: <ShieldAlert className="w-3 h-3" />, text: "JWT 认证安全缺陷有哪些？如何加固？" },
  ];

  // ─── Render ──────────────────────────────────

  return (
    <div className="space-y-4 animate-fadeIn h-[calc(100vh-11rem)] flex flex-col">
      {/* 头部 */}
      <div className="space-y-0.5 shrink-0">
        <h2 className="text-xl font-bold tracking-tight text-[#1c1917] flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-600" />
          智能对话漏洞挖掘
          <span className="ml-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-bold tracking-wide uppercase">OpenCode</span>
        </h2>
        <p className="text-xs text-[#78716c]">
          由 OpenCode AI 驱动的对话式漏洞挖掘引擎。上传代码包或输入 GitHub URL，通过自然语言交互进行深度安全审计。
        </p>
      </div>

      {/* 主面板 */}
      <div className="flex-1 bg-white border border-[#e7e5e4] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.02)] flex min-h-0 overflow-hidden">

        {/* 左侧会话列表 */}
        <div className="w-60 border-r border-[#e7e5e4] flex flex-col bg-[#fafaf9] shrink-0">
          <div className="p-3 border-b border-[#e7e5e4] flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#57534e] uppercase tracking-wider">历史会话</span>
            <button
              onClick={handleNewSession}
              className="p-1.5 bg-white border border-[#e7e5e4] hover:border-blue-500 hover:text-blue-700 text-[#57534e] rounded-lg transition-all duration-200 flex items-center gap-1 shadow-sm"
              title="新建会话"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="text-xs font-bold">新建</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {chatSessions.map((sess: ChatSession) => {
              const isActive = sess.id === activeSessionId;
              return (
                <div
                  key={sess.id}
                  onClick={() => setActiveSessionId(sess.id)}
                  className={`p-2.5 rounded-lg border transition-all duration-200 cursor-pointer flex flex-col gap-1 relative group ${
                    isActive ? "bg-white border-blue-500 shadow-sm" : "border-transparent hover:bg-stone-100/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-blue-600" : "text-[#78716c]"}`} />
                      <span className={`text-xs font-semibold truncate ${isActive ? "text-blue-700" : "text-[#1c1917]"}`}>
                        {sess.title}
                      </span>
                    </div>
                    {chatSessions.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteSession(sess.id); }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-stone-400 hover:text-red-600 rounded transition-all shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-[#78716c] truncate">{sess.lastMessage || "暂无消息"}</p>
                  <span className="text-[9px] text-stone-400 text-right">{sess.time}</span>
                </div>
              );
            })}
          </div>

          {/* 快捷提示 */}
          <div className="p-3 border-t border-[#e7e5e4] space-y-1.5">
            <p className="text-[10px] font-bold text-[#57534e] uppercase tracking-wider mb-2">快速提问</p>
            {quickPrompts.map((p, i) => (
              <button
                key={i}
                onClick={() => sendChatMessage(p.text)}
                className="w-full text-left px-2.5 py-2 rounded-lg bg-white border border-[#e7e5e4] hover:border-blue-400 hover:bg-blue-50 transition-all text-[10px] text-[#57534e] font-medium flex items-start gap-1.5 shadow-sm"
              >
                <span className="text-blue-500 mt-0.5 shrink-0">{p.icon}</span>
                <span className="leading-tight">{p.text}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 右侧对话区 */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          {activeSession ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* 消息列表 */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {activeSession.messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-12">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center border border-blue-100 shadow-sm">
                      <Bot className="w-8 h-8 text-blue-600" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base font-bold text-[#1c1917]">开始漏洞挖掘对话</h3>
                      <p className="text-sm text-[#78716c] max-w-sm">
                        上传代码压缩包或输入 GitHub URL，由 OpenCode AI 进行深度安全审计；<br />
                        或直接提问安全相关问题。
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setInputMode("file")}
                        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
                      >
                        <Upload className="w-4 h-4" /> 上传代码包
                      </button>
                      <button
                        onClick={() => setInputMode("url")}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#e7e5e4] hover:border-blue-500 text-[#1c1917] rounded-xl text-sm font-semibold transition-colors shadow-sm"
                      >
                        <Github className="w-4 h-4" /> GitHub URL
                      </button>
                    </div>
                  </div>
                )}

                {activeSession.messages.map((msg: ChatMessage) => (
                  <ChatMessageBubble key={msg.id} msg={msg} onActionClick={handleActionClick} />
                ))}

                {isChatTyping && (
                  <div className="flex gap-3 max-w-3xl">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 border border-blue-100 shadow-sm flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 animate-pulse" />
                    </div>
                    <div className="bg-[#fafaf9] border border-[#e7e5e4] px-4 py-3 rounded-2xl rounded-tl-none inline-flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      <span className="text-xs text-stone-500 ml-1">OpenCode AI 正在分析...</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* 底部输入区 */}
              <div className="p-4 border-t border-[#e7e5e4] bg-[#fafaf9] shrink-0 space-y-2.5">

                {/* 模式切换 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 bg-white border border-[#e7e5e4] rounded-lg p-1">
                    {[
                      { mode: "text" as InputMode, icon: <MessageSquare className="w-3.5 h-3.5" />, label: "对话" },
                      { mode: "file" as InputMode, icon: <Upload className="w-3.5 h-3.5" />, label: "上传代码包" },
                      { mode: "url" as InputMode, icon: <Globe className="w-3.5 h-3.5" />, label: "URL / GitHub" },
                    ].map(({ mode, icon, label }) => (
                      <button
                        key={mode}
                        onClick={() => { setInputMode(mode); setUploadError(""); }}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
                          inputMode === mode
                            ? "bg-blue-600 text-white shadow-sm"
                            : "text-stone-500 hover:text-stone-700 hover:bg-stone-50"
                        }`}
                      >
                        {icon}{label}
                      </button>
                    ))}
                  </div>

                  {/* 扫描深度（非对话模式显示） */}
                  {inputMode !== "text" && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-stone-500 font-medium">深度：</span>
                      {(["quick", "standard", "deep"] as ScanDepth[]).map((d) => (
                        <button
                          key={d}
                          onClick={() => setScanDepth(d)}
                          className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                            scanDepth === d
                              ? "bg-amber-100 text-amber-700 border border-amber-200"
                              : "bg-white border border-[#e7e5e4] text-stone-500 hover:border-stone-300"
                          }`}
                        >
                          {d === "quick" ? "快速" : d === "standard" ? "标准" : "深度"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 代码上下文 Badge */}
                {codeContext && inputMode === "text" && (
                  <CodeContextBadge ctx={codeContext} onClear={() => setCodeContext(null)} />
                )}

                {/* ─── 文件上传模式 ─── */}
                {inputMode === "file" && (
                  <div className="space-y-2">
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleFileDrop}
                      onClick={() => !selectedFile && fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-4 text-center transition-all duration-200 ${
                        dragOver ? "border-blue-500 bg-blue-50 cursor-copy"
                        : selectedFile ? "border-emerald-400 bg-emerald-50 cursor-default"
                        : "border-[#e7e5e4] hover:border-blue-400 hover:bg-blue-50/30 cursor-pointer"
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".zip,.tar,.tar.gz,.tgz,.tar.bz2,.tar.xz"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                      />
                      {selectedFile ? (
                        <div className="flex items-center justify-center gap-3">
                          <Package className="w-5 h-5 text-emerald-600" />
                          <div className="text-left">
                            <p className="text-sm font-bold text-emerald-700">{selectedFile.name}</p>
                            <p className="text-xs text-stone-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }} className="ml-2 p-1 text-stone-400 hover:text-red-500 rounded">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1.5">
                          <Upload className="w-6 h-6 text-stone-400" />
                          <p className="text-sm font-medium text-stone-600">拖拽或点击上传代码压缩包</p>
                          <p className="text-xs text-stone-400">支持 .zip / .tar / .tar.gz / .tgz，最大 50MB</p>
                        </div>
                      )}
                    </div>

                    {uploadError && (
                      <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />{uploadError}
                      </div>
                    )}

                    <button
                      onClick={loadFileToContext}
                      disabled={!selectedFile || isProcessing}
                      className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white rounded-xl text-sm font-bold transition-colors shadow-sm flex items-center justify-center gap-2"
                    >
                      {isProcessing ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> 正在加载代码并启动分析...</>
                      ) : (
                        <><Sparkles className="w-4 h-4" /> 加载代码并开始 AI 漏洞挖掘</>
                      )}
                    </button>
                  </div>
                )}

                {/* ─── URL 模式 ─── */}
                {inputMode === "url" && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        {isGithubUrl && (
                          <Github className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                        )}
                        {!isGithubUrl && urlInput && (
                          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                        )}
                        <input
                          type="url"
                          value={urlInput}
                          onChange={(e) => { setUrlInput(e.target.value); setUploadError(""); }}
                          placeholder="https://github.com/user/repo 或代码包直链..."
                          className={`w-full border border-[#e7e5e4] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                            isGithubUrl || urlInput ? "pl-9" : ""
                          }`}
                          onKeyDown={(e) => { if (e.key === "Enter" && urlInput.trim()) loadUrlToContext(); }}
                        />
                      </div>
                      <button
                        onClick={loadUrlToContext}
                        disabled={!urlInput.trim() || isProcessing}
                        className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white rounded-xl text-sm font-bold transition-colors shadow-sm flex items-center gap-2 shrink-0"
                      >
                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {isGithubUrl ? "克隆分析" : "分析"}
                      </button>
                    </div>

                    {uploadError && (
                      <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />{uploadError}
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-[10px] text-stone-400">
                      <span className="flex items-center gap-1"><Github className="w-3 h-3" /> GitHub 仓库（自动浅克隆）</span>
                      <span className="flex items-center gap-1"><Package className="w-3 h-3" /> 代码包直链（自动解压）</span>
                      <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> 单文件 URL</span>
                    </div>
                  </div>
                )}

                {/* ─── 对话输入模式 ─── */}
                {inputMode === "text" && (
                  <form onSubmit={handleSend} className="flex gap-2 items-end">
                    <div className="flex-1 relative">
                      <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                          codeContext
                            ? `代码已加载（${codeContext.targetInfo}），输入你的分析问题...`
                            : "输入安全问题，或上传代码包 / GitHub URL 进行漏洞挖掘..."
                        }
                        rows={1}
                        className="w-full border border-[#e7e5e4] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none leading-relaxed"
                        style={{ maxHeight: "120px" }}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!input.trim() || isChatTyping}
                      className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl transition-colors shadow-sm shrink-0"
                    >
                      {isChatTyping ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </form>
                )}

                <p className="text-[10px] text-stone-400 text-center">
                  由 OpenCode AI 驱动 · Enter 发送 · Shift+Enter 换行
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-stone-400 text-sm">
              请选择或创建一个对话会话
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
