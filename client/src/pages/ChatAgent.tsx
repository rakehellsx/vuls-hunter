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
  Terminal
} from "lucide-react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type InputMode = "text" | "file" | "url";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const API_BASE = "";

async function uploadArchive(
  file: File,
  scanMode: string,
  instruction: string
): Promise<{ scanId: number; fileCount: number; language: string; filesAnalyzed: string[] }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("scan_mode", scanMode);
  formData.append("instruction", instruction);

  const resp = await fetch(`${API_BASE}/api/upload/archive`, {
    method: "POST",
    body: formData,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "上传失败" }));
    throw new Error(err.detail || "上传失败");
  }

  const data = await resp.json();
  return {
    scanId: data.scan_id,
    fileCount: data.file_count,
    language: data.language,
    filesAnalyzed: data.files_analyzed || [],
  };
}

async function analyzeUrl(
  url: string,
  scanMode: string,
  instruction: string
): Promise<{ scanId: number; fileCount: number; language: string; filesAnalyzed: string[]; targetName: string }> {
  const resp = await fetch(`${API_BASE}/api/upload/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, scan_mode: scanMode, instruction }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "分析失败" }));
    throw new Error(err.detail || "分析失败");
  }

  const data = await resp.json();
  return {
    scanId: data.scan_id,
    fileCount: data.file_count,
    language: data.language,
    filesAnalyzed: data.files_analyzed || [],
    targetName: data.target_name || url,
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
      if (event.type === "log" && event.data) {
        onLog(event.data);
      } else if (event.type === "finished") {
        onFinished(event.success !== false);
        ws.close();
      }
    } catch {}
  };

  ws.onerror = () => {
    onFinished(false);
  };

  return ws;
}

// ─────────────────────────────────────────────
// ScanLogBubble — 专用于在对话流中渲染扫描日志气泡
// ─────────────────────────────────────────────

interface ScanLogBubbleProps {
  logs: string[];
  status: "running" | "completed" | "failed";
  title: string;
}

function ScanLogBubble({ logs, status, title }: ScanLogBubbleProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="space-y-2">
      {/* 标题行 */}
      <div className="flex items-center gap-2 text-sm font-semibold text-[#1c1917]">
        <Terminal className="w-4 h-4 text-blue-600 shrink-0" />
        <span>{title}</span>
        {status === "running" && (
          <span className="ml-auto flex items-center gap-1 text-xs text-blue-600 font-normal">
            <Loader2 className="w-3 h-3 animate-spin" />
            分析中...
          </span>
        )}
        {status === "completed" && (
          <span className="ml-auto flex items-center gap-1 text-xs text-emerald-600 font-normal">
            <CheckCircle className="w-3 h-3" />
            完成
          </span>
        )}
        {status === "failed" && (
          <span className="ml-auto flex items-center gap-1 text-xs text-red-600 font-normal">
            <AlertCircle className="w-3 h-3" />
            失败
          </span>
        )}
      </div>

      {/* 日志终端 */}
      <div className="bg-[#0f172a] rounded-xl p-4 max-h-64 overflow-y-auto font-mono text-xs border border-slate-700 shadow-inner">
        {logs.map((log, i) => (
          <div
            key={i}
            className={`leading-5 ${
              log.includes("[✓]") || log.includes("[+]")
                ? "text-emerald-400"
                : log.includes("[!]")
                ? "text-amber-400"
                : log.includes("[✗]") || log.includes("失败") || log.includes("Error")
                ? "text-red-400"
                : log.includes("[*]")
                ? "text-sky-300"
                : "text-slate-300"
            }`}
          >
            {log}
          </div>
        ))}
        {status === "running" && (
          <div className="text-blue-400 flex items-center gap-1 mt-1 animate-pulse">
            <span>▋</span>
          </div>
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ChatMessageBubble — 渲染单条消息气泡（含扫描日志支持）
// ─────────────────────────────────────────────

interface ChatMessageBubbleProps {
  msg: ChatMessage;
  onActionClick: (action: string) => void;
}

function ChatMessageBubble({ msg, onActionClick }: ChatMessageBubbleProps) {
  const isAI = msg.sender === "ai";

  return (
    <div className={`flex gap-4 ${isAI ? "max-w-3xl" : "max-w-2xl ml-auto flex-row-reverse"}`}>
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
          isAI
            ? "bg-blue-50 text-blue-600 border-blue-100 shadow-sm"
            : "bg-stone-100 text-stone-600 border-stone-200"
        }`}
      >
        {isAI ? <Sparkles className="w-4 h-4" /> : <User className="w-4 h-4" />}
      </div>

      <div className="space-y-2 min-w-0 flex-1">
        <div
          className={`p-4 rounded-2xl text-sm leading-relaxed shadow-[0_2px_8px_rgba(0,0,0,0.01)] ${
            isAI
              ? "bg-[#fafaf9] border border-[#e7e5e4] text-[#1c1917] rounded-tl-none"
              : "bg-blue-600 text-white rounded-tr-none font-medium"
          }`}
        >
          {/* 扫描日志气泡 */}
          {msg.scanLogs !== undefined ? (
            <ScanLogBubble
              logs={msg.scanLogs}
              status={msg.scanStatus || "running"}
              title={msg.scanTitle || "AI 漏洞扫描"}
            />
          ) : (
            <span className="whitespace-pre-line">{msg.text}</span>
          )}
        </div>

        {isAI && msg.suggestions && msg.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {msg.suggestions.map((sug: string, idx: number) => (
              <button
                key={idx}
                onClick={() => onActionClick(sug)}
                className="px-3 py-1.5 bg-white border border-[#e7e5e4] hover:border-blue-600 hover:text-blue-700 rounded-lg text-xs font-bold transition-all duration-200 inline-flex items-center gap-1 shadow-sm"
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
    setActiveTab,
  } = useApp();

  const [input, setInput] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [urlInput, setUrlInput] = useState("");
  const [scanMode, setScanMode] = useState("quick");
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [uploadError, setUploadError] = useState<string>("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const activeSession = chatSessions.find((s) => s.id === activeSessionId) || chatSessions[0];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages, isChatTyping]);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendChatMessage(input);
    setInput("");
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendChatMessage(suggestion);
  };

  const handleActionClick = (action: string) => {
    const lowerAction = action.toLowerCase();
    if (lowerAction.includes("规则") || lowerAction.includes("rule")) {
      setActiveTab("rules");
    } else if (lowerAction.includes("报告") || lowerAction.includes("report")) {
      setActiveTab("reports");
    } else if (lowerAction.includes("快速扫描") || lowerAction.includes("quick scan")) {
      setActiveTab("quick-scan");
    } else if (lowerAction.includes("项目") || lowerAction.includes("project")) {
      setActiveTab("projects");
    } else if (lowerAction.includes("引擎") || lowerAction.includes("engine")) {
      setActiveTab("engine");
    } else {
      sendChatMessage(action);
    }
  };

  // ─── File handling ───────────────────────────

  const handleFileSelect = (file: File) => {
    setUploadError("");
    const name = file.name.toLowerCase();
    const isArchive =
      name.endsWith(".zip") ||
      name.endsWith(".tar") ||
      name.endsWith(".tar.gz") ||
      name.endsWith(".tgz") ||
      name.endsWith(".tar.bz2") ||
      name.endsWith(".tar.xz");
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

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  // ─── 核心：将扫描过程注入对话气泡区 ──────────────

  /**
   * 在对话流中插入一条"扫描日志气泡"，并通过 updateChatMessage 实时追加日志。
   * 扫描完成后，自动发送 AI 总结请求，结果也显示在对话流中。
   */
  const runScanInChat = async (
    scanTitle: string,
    userText: string,
    doScan: () => Promise<{ scanId: number; fileCount: number; language: string; summary: string }>
  ) => {
    setIsScanning(true);
    setUploadError("");

    // 1. 插入用户消息气泡
    const userMsgId = `MSG-USER-${Date.now()}`;
    addChatMessage({
      id: userMsgId,
      sender: "user",
      text: userText,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });

    // 2. 插入"扫描日志"气泡（初始空日志）
    const logMsgId = `MSG-SCAN-${Date.now()}`;
    addChatMessage({
      id: logMsgId,
      sender: "ai",
      text: "",
      scanLogs: [`[*] 正在初始化扫描引擎...`],
      scanStatus: "running",
      scanTitle,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    } as ChatMessage);

    const appendLog = (line: string) => {
      updateChatMessage(logMsgId, (prev) => ({
        ...prev,
        scanLogs: [...(prev.scanLogs || []), line],
      }));
    };

    try {
      const result = await doScan();

      // 3. 连接 WebSocket，实时追加日志到气泡
      await new Promise<void>((resolve) => {
        wsRef.current = connectScanWebSocket(
          result.scanId,
          (line) => appendLog(line),
          (success) => {
            // 4. 更新气泡状态为完成/失败
            updateChatMessage(logMsgId, (prev) => ({
              ...prev,
              scanStatus: success ? "completed" : "failed",
            }));
            resolve();
          }
        );
      });

      // 5. 切换回对话模式，发送 AI 总结请求（显示在对话流中）
      setInputMode("text");
      sendChatMessage(result.summary);
    } catch (err: any) {
      appendLog(`[✗] 错误: ${err.message || "操作失败"}`);
      updateChatMessage(logMsgId, (prev) => ({
        ...prev,
        scanStatus: "failed",
      }));
      setUploadError(err.message || "操作失败");
    } finally {
      setIsScanning(false);
    }
  };

  // ─── 文件扫描 ─────────────────────────────────

  const startFileScan = async () => {
    if (!selectedFile) return;
    const file = selectedFile;

    await runScanInChat(
      `分析压缩包: ${file.name}`,
      `请分析压缩包 "${file.name}" (${(file.size / 1024).toFixed(1)} KB) 中的安全漏洞`,
      async () => {
        const result = await uploadArchive(
          file,
          scanMode,
          `分析压缩包 ${file.name} 中的安全漏洞`
        );
        return {
          scanId: result.scanId,
          fileCount: result.fileCount,
          language: result.language,
          summary:
            `我上传了压缩包 "${file.name}"（${result.fileCount} 个 ${result.language} 文件），` +
            `扫描 ID 为 ${result.scanId}，请帮我总结分析结果并给出修复建议。`,
        };
      }
    );

    setSelectedFile(null);
  };

  // ─── URL 扫描 ─────────────────────────────────

  const startUrlScan = async () => {
    if (!urlInput.trim()) return;
    const url = urlInput.trim();
    const isGithub = url.toLowerCase().includes("github.com");

    await runScanInChat(
      isGithub ? `分析 GitHub 仓库: ${url.split("/").slice(-2).join("/")}` : `分析 URL: ${url}`,
      `请分析 ${isGithub ? "GitHub 仓库" : "代码"} "${url}" 中的安全漏洞`,
      async () => {
        const result = await analyzeUrl(url, scanMode, `分析 ${url} 的安全漏洞`);
        return {
          scanId: result.scanId,
          fileCount: result.fileCount,
          language: result.language,
          summary:
            `我提交了 URL "${url}" 进行漏洞分析（${result.fileCount} 个 ${result.language} 文件），` +
            `扫描 ID 为 ${result.scanId}，请帮我总结分析结果并给出修复建议。`,
        };
      }
    );
  };

  const isGithubUrl = urlInput.toLowerCase().includes("github.com");

  // ─── Quick prompts ───────────────────────────

  const quickPrompts = [
    { icon: <ShieldAlert className="w-3 h-3" />, text: "分析 SQL 注入漏洞的危害与防御方案" },
    { icon: <Zap className="w-3 h-3" />, text: "帮我制定一套 Web 应用安全审计策略" },
    { icon: <BookOpen className="w-3 h-3" />, text: "解释 OWASP Top 10 中最危险的漏洞类型" },
    { icon: <FileText className="w-3 h-3" />, text: "如何防御提示词注入（Prompt Injection）攻击" },
  ];

  // ─── Render ──────────────────────────────────

  return (
    <div className="space-y-6 animate-fadeIn h-[calc(100vh-11rem)] flex flex-col">
      {/* 头部标题 */}
      <div className="space-y-1 shrink-0">
        <h2 className="text-xl font-bold tracking-tight text-[#1c1917] flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-600" />
          智能对话漏洞挖掘
        </h2>
        <p className="text-sm text-[#78716c]">
          通过自然语言智能体交互，引导底层 AI 漏洞挖掘引擎进行高精度、指向性的定向漏洞挖掘与安全审计。支持上传代码压缩包或输入 GitHub URL 进行深度分析。
        </p>
      </div>

      {/* 左右结构主面板 */}
      <div className="flex-1 bg-white border border-[#e7e5e4] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.01)] flex min-h-0 overflow-hidden">

        {/* 左侧会话历史列表 */}
        <div className="w-64 border-r border-[#e7e5e4] flex flex-col justify-between bg-[#fafaf9] shrink-0">
          <div className="p-4 border-b border-[#e7e5e4] flex items-center justify-between">
            <span className="text-xs font-bold text-[#57534e] uppercase tracking-wider">历史挖掘会话</span>
            <button
              onClick={createNewSession}
              className="p-1.5 bg-white border border-[#e7e5e4] hover:border-blue-600 hover:text-blue-700 text-[#57534e] rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-1 shadow-sm"
              title="新建会话"
            >
              <Plus className="w-4 h-4" />
              新建
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {chatSessions.map((sess: ChatSession) => {
              const isActive = sess.id === activeSessionId;
              return (
                <div
                  key={sess.id}
                  onClick={() => setActiveSessionId(sess.id)}
                  className={`p-3 rounded-lg border transition-all duration-200 cursor-pointer flex flex-col gap-1.5 relative group ${
                    isActive
                      ? "bg-white border-blue-600 shadow-sm"
                      : "border-transparent hover:bg-stone-100/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <MessageSquare
                        className={`w-4 h-4 shrink-0 ${isActive ? "text-blue-600" : "text-[#78716c]"}`}
                      />
                      <span
                        className={`text-xs font-bold truncate ${isActive ? "text-blue-700" : "text-[#1c1917]"}`}
                      >
                        {sess.title}
                      </span>
                    </div>
                    {chatSessions.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession(sess.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-stone-400 hover:text-red-600 rounded hover:bg-stone-100 transition-all duration-200 shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-[#78716c] truncate leading-normal">
                    {sess.lastMessage || "暂无消息"}
                  </p>
                  <span className="text-[9px] text-stone-400 block text-right">{sess.time}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右侧对话流 */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          {activeSession ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* ─── 消息历史滚动区（包含扫描日志气泡）─── */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {activeSession.messages.map((msg: ChatMessage) => (
                  <ChatMessageBubble
                    key={msg.id}
                    msg={msg}
                    onActionClick={handleActionClick}
                  />
                ))}

                {isChatTyping && (
                  <div className="flex gap-4 max-w-3xl">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 shadow-sm flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 animate-spin" />
                    </div>
                    <div className="bg-[#fafaf9] border border-[#e7e5e4] p-4 rounded-2xl rounded-tl-none text-sm text-stone-500 inline-flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                      <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                      <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                      AI 安全助手正在分析中...
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* ─── 底部输入区 ─── */}
              <div className="p-4 border-t border-[#e7e5e4] bg-[#fafaf9] shrink-0 space-y-3">

                {/* 输入模式切换 */}
                <div className="flex items-center gap-1 bg-white border border-[#e7e5e4] rounded-lg p-1 w-fit">
                  {[
                    { mode: "text" as InputMode, icon: <MessageSquare className="w-3.5 h-3.5" />, label: "对话" },
                    { mode: "file" as InputMode, icon: <Upload className="w-3.5 h-3.5" />, label: "上传压缩包" },
                    { mode: "url" as InputMode, icon: <Link className="w-3.5 h-3.5" />, label: "URL 分析" },
                  ].map(({ mode, icon, label }) => (
                    <button
                      key={mode}
                      onClick={() => { setInputMode(mode); setUploadError(""); }}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all duration-200 flex items-center gap-1.5 ${
                        inputMode === mode
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-stone-500 hover:text-stone-700 hover:bg-stone-50"
                      }`}
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>

                {/* 扫描深度选择（文件/URL 模式下显示） */}
                {inputMode !== "text" && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-stone-500 font-medium">扫描深度：</span>
                    {[
                      { value: "quick", label: "快速" },
                      { value: "standard", label: "标准" },
                      { value: "deep", label: "深度" },
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => setScanMode(value)}
                        className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                          scanMode === value
                            ? "bg-amber-100 text-amber-700 border border-amber-200"
                            : "bg-white border border-[#e7e5e4] text-stone-500 hover:border-stone-300"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
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
                        dragOver
                          ? "border-blue-500 bg-blue-50 cursor-copy"
                          : selectedFile
                          ? "border-green-400 bg-green-50 cursor-default"
                          : "border-[#e7e5e4] hover:border-blue-400 hover:bg-blue-50/30 cursor-pointer"
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".zip,.tar,.tar.gz,.tgz,.tar.bz2,.tar.xz"
                        className="hidden"
                        onChange={handleFileInputChange}
                      />
                      {selectedFile ? (
                        <div className="flex items-center justify-center gap-3">
                          <Package className="w-5 h-5 text-green-600" />
                          <div className="text-left">
                            <p className="text-sm font-bold text-green-700">{selectedFile.name}</p>
                            <p className="text-xs text-stone-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                            className="ml-2 p-1 text-stone-400 hover:text-red-500 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1.5">
                          <Upload className="w-6 h-6 text-stone-400" />
                          <p className="text-sm font-medium text-stone-600">拖拽或点击上传压缩包</p>
                          <p className="text-xs text-stone-400">支持 .zip / .tar / .tar.gz / .tgz，最大 50MB</p>
                        </div>
                      )}
                    </div>

                    {uploadError && (
                      <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {uploadError}
                      </div>
                    )}

                    <button
                      onClick={startFileScan}
                      disabled={!selectedFile || isScanning}
                      className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white rounded-xl text-sm font-bold transition-colors shadow-sm flex items-center justify-center gap-2"
                    >
                      {isScanning ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> 分析中，请查看上方对话...</>
                      ) : (
                        <><Sparkles className="w-4 h-4" /> 开始 AI 漏洞分析</>
                      )}
                    </button>
                  </div>
                )}

                {/* ─── URL 分析模式 ─── */}
                {inputMode === "url" && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        {isGithubUrl && (
                          <Github className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                        )}
                        <input
                          type="url"
                          value={urlInput}
                          onChange={(e) => { setUrlInput(e.target.value); setUploadError(""); }}
                          placeholder="https://github.com/user/repo 或代码包直链..."
                          className={`w-full px-4 py-2.5 border border-[#e7e5e4] rounded-xl text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-inner ${isGithubUrl ? "pl-9" : ""}`}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && urlInput.trim() && !isScanning) {
                              startUrlScan();
                            }
                          }}
                        />
                      </div>
                      <button
                        onClick={startUrlScan}
                        disabled={!urlInput.trim() || isScanning}
                        className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white rounded-xl text-sm font-bold transition-colors shadow-sm flex items-center gap-1.5 shrink-0"
                      >
                        {isScanning ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        分析
                      </button>
                    </div>

                    {isGithubUrl && (
                      <p className="text-xs text-stone-500 flex items-center gap-1">
                        <Github className="w-3 h-3" />
                        检测到 GitHub 仓库，将自动 clone 并分析所有代码文件
                      </p>
                    )}

                    {isScanning && (
                      <p className="text-xs text-blue-600 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        扫描进行中，实时日志已显示在上方对话区
                      </p>
                    )}

                    {uploadError && (
                      <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {uploadError}
                      </div>
                    )}
                  </div>
                )}

                {/* ─── 文本对话模式 ─── */}
                {inputMode === "text" && (
                  <>
                    {!isChatTyping && activeSession.messages.length <= 1 && (
                      <div className="flex flex-wrap gap-2">
                        {quickPrompts.map((prompt, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSuggestionClick(prompt.text)}
                            className="px-2.5 py-1.5 bg-white border border-[#e7e5e4] hover:border-blue-500 hover:text-blue-700 rounded-full text-[11px] font-semibold text-stone-600 transition-colors inline-flex items-center gap-1.5"
                          >
                            {prompt.icon}
                            {prompt.text}
                          </button>
                        ))}
                      </div>
                    )}

                    <form onSubmit={handleSend} className="flex gap-3">
                      <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (input.trim() && !isChatTyping) {
                              sendChatMessage(input);
                              setInput("");
                            }
                          }
                        }}
                        placeholder="请输入您的安全问题，例如：'分析 JWT 令牌伪造漏洞的攻击链'..."
                        className="flex-1 px-4 py-2.5 border border-[#e7e5e4] rounded-xl text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-inner"
                        disabled={isChatTyping}
                      />
                      <button
                        type="submit"
                        disabled={!input.trim() || isChatTyping}
                        className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white rounded-xl text-sm font-bold transition-colors shadow-sm flex items-center gap-1.5"
                      >
                        <Send className="w-4 h-4" />
                        发送
                      </button>
                    </form>
                  </>
                )}

                <p className="text-[10px] text-stone-400 text-center">
                  由 Strix AI 漏洞挖掘引擎驱动 · 支持代码分析、漏洞解释、修复建议 · 支持 GitHub 仓库与压缩包直接分析
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-stone-400 text-sm">
              请选择或新建一个会话
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
