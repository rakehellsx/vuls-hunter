import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useApp, Project, Vulnerability } from "@/contexts/AppContext";
import { projectsApi, scansApi } from "@/lib/api";
import { 
  Play, 
  Trash2, 
  Plus, 
  FolderGit2, 
  ShieldAlert, 
  AlertTriangle, 
  CheckCircle2, 
  Terminal, 
  Sparkles,
  ArrowRight,
  GitBranch,
  X,
  RefreshCw,
  Upload,
  Link,
  Archive,
  Bug,
  Shield,
  Code,
  Copy,
  ChevronDown,
  ChevronUp,
  Zap,
  Clock
} from "lucide-react";

// PoC 状态类型
interface PocState {
  loading: boolean;
  error: string | null;
  description: string | null;
  scriptCode: string | null;
  generatedAt: string | null;
}

export default function Projects() {
  const { 
    projects, 
    activeProjectId, 
    addProject, 
    deleteProject, 
    startScan, 
    fixVulnerability, 
    ignoreVulnerability,
    refreshData
  } = useApp();

  const [showAddModal, setShowAddModal] = useState(false);
  const [sourceType, setSourceType] = useState<"git" | "archive">("git");
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [lang, setLang] = useState("Java");
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [archiveDragOver, setArchiveDragOver] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // PoC 状态：key = vuln._backendId
  const [pocStates, setPocStates] = useState<Record<number, PocState>>({});
  // 展开的 PoC 面板：key = vuln._backendId
  const [expandedPoc, setExpandedPoc] = useState<Set<number>>(new Set());
  // 复制成功提示
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // 当 projects 列表变化时，自动选中第一个（如果当前没有选中或选中的项目已被删除）
  useEffect(() => {
    if (projects.length === 0) {
      setSelectedProjectId(null);
      return;
    }
    const stillExists = projects.some(p => p.id === selectedProjectId);
    if (!stillExists) {
      setSelectedProjectId(activeProjectId || projects[0]?.id || null);
    }
  }, [projects, activeProjectId]);

  // 当选中项目变化时，初始化 PoC 状态（从已有数据恢复）
  useEffect(() => {
    const project = projects.find(p => p.id === selectedProjectId);
    if (!project) return;
    const initialStates: Record<number, PocState> = {};
    project.vulnerabilities.forEach(v => {
      if (v._backendId && (v.pocDescription || v.pocScriptCode)) {
        initialStates[v._backendId] = {
          loading: false,
          error: null,
          description: v.pocDescription || null,
          scriptCode: v.pocScriptCode || null,
          generatedAt: v.pocGeneratedAt || null,
        };
      }
    });
    setPocStates(prev => ({ ...initialStates, ...prev }));
  }, [selectedProjectId, projects]);

  const project = projects.find(p => p.id === selectedProjectId);

  // 生成 PoC
  const handleGeneratePoc = async (vuln: Vulnerability) => {
    const backendId = vuln._backendId;
    const scanId = vuln._scanId;
    if (!backendId || !scanId) {
      console.error("Missing backendId or scanId for vuln:", vuln);
      return;
    }

    setPocStates(prev => ({
      ...prev,
      [backendId]: { loading: true, error: null, description: null, scriptCode: null, generatedAt: null }
    }));
    // 展开面板
    setExpandedPoc(prev => new Set([...prev, backendId]));

    try {
      const result = await scansApi.generatePoc(scanId, backendId);
      setPocStates(prev => ({
        ...prev,
        [backendId]: {
          loading: false,
          error: null,
          description: result.poc_description,
          scriptCode: result.poc_script_code,
          generatedAt: result.poc_generated_at,
        }
      }));
    } catch (err: any) {
      setPocStates(prev => ({
        ...prev,
        [backendId]: {
          loading: false,
          error: err.message || "PoC 生成失败，请重试",
          description: null,
          scriptCode: null,
          generatedAt: null,
        }
      }));
    }
  };

  // 复制 PoC 代码
  const handleCopyPoc = (code: string, id: number) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // 切换 PoC 面板展开/收起
  const togglePocPanel = (id: number) => {
    setExpandedPoc(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    if (!name) return;

    setIsSubmitting(true);
    try {
      if (sourceType === "git") {
        if (!repoUrl) { setSubmitError("请输入 Git 仓库 URL"); setIsSubmitting(false); return; }
        await addProject(name, repoUrl, lang);
      } else {
        if (!archiveFile) { setSubmitError("请选择压缩包文件"); setIsSubmitting(false); return; }
        await projectsApi.createFromArchive({ name, language: lang, file: archiveFile });
        await refreshData();
      }
      setName("");
      setRepoUrl("");
      setArchiveFile(null);
      setSourceType("git");
      setShowAddModal(false);
    } catch (err: any) {
      setSubmitError(err.message || "创建失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteProject(id);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshData();
    setIsRefreshing(false);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 头部标题 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-[#1c1917]">项目与代码仓库管理</h2>
          <p className="text-sm text-[#78716c]">
            在这里绑定您的企业代码仓库，配置审计分支。AI 漏洞挖掘引擎将通过持续的自动化调度进行深度静态数据流与语义分析。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-3 py-2 border border-[#e7e5e4] text-[#57534e] rounded-lg text-xs font-semibold hover:bg-[#fafaf9] transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            刷新
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-700 text-white rounded-lg text-xs font-bold hover:bg-blue-800 transition-colors shadow-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            关联代码仓库
          </button>
        </div>
      </div>

      {/* 两栏式布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 项目列表 (左侧 4 栏) */}
        <div className="lg:col-span-4 space-y-4">
          <h3 className="text-xs font-bold text-[#78716c] uppercase tracking-wider">
            代码仓库列表 ({projects.length})
          </h3>
          {projects.length === 0 ? (
            <div className="h-32 border border-dashed border-[#e7e5e4] rounded-xl flex flex-col items-center justify-center text-stone-400 text-xs gap-1.5">
              <FolderGit2 className="w-8 h-8 text-stone-300" />
              暂无项目，点击右上角关联仓库
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map((p) => {
                const unresolvedCount = p.vulnerabilities.filter(v => v.status === "unresolved").length;
                const isSelected = selectedProjectId === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedProjectId(p.id)}
                    className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col gap-3 ${
                      isSelected
                        ? "bg-white border-blue-600 shadow-[0_8px_30px_rgb(0,0,0,0.03)]"
                        : "bg-white border-[#e7e5e4] hover:border-[#d6d3d1] hover:bg-[#fafaf9]"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? "bg-blue-50 text-blue-600" : "bg-stone-100 text-[#78716c]"}`}>
                          <FolderGit2 className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-[#1c1917] truncate max-w-[150px]">{p.name}</h4>
                          <span className="text-[10px] px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded border border-stone-200 font-semibold mt-1 inline-block">
                            {p.language}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDelete(e, p.id)}
                        className="p-1.5 text-stone-400 hover:text-red-600 rounded-lg hover:bg-stone-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-xs border-t border-[#f5f5f4] pt-2.5">
                      <span className="text-[#78716c] font-medium flex items-center gap-1">
                        <GitBranch className="w-3 h-3" />
                        {p.branch}
                      </span>
                      {p.status === "scanning" ? (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-full border border-blue-100 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-ping"></span>
                          扫描中 {p.progress}%
                        </span>
                      ) : unresolvedCount > 0 ? (
                        <span className="px-2 py-0.5 bg-red-50 text-red-700 text-[10px] font-bold rounded-full border border-red-100">
                          {unresolvedCount} 个漏洞
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-semibold rounded-full border border-emerald-100">
                          安全
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 审计工作区 (右侧 8 栏) */}
        <div className="lg:col-span-8 space-y-6">
          {project ? (
            <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-6">
              {/* 工作区头部 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#f5f5f4] pb-5">
                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-[#1c1917] flex items-center gap-2">
                    {project.name}
                    <span className="text-xs font-semibold px-2 py-0.5 bg-stone-100 text-stone-600 rounded-md border border-stone-200">
                      {project.language}
                    </span>
                  </h3>
                  <p className="text-xs text-[#78716c] font-medium truncate max-w-md">
                    Git 仓库：{project.repoUrl}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => startScan(project.id)}
                    disabled={project.status === "scanning"}
                    className="px-4 py-2 bg-blue-700 text-white rounded-lg text-xs font-bold hover:bg-blue-800 disabled:bg-blue-300 transition-colors shadow-sm flex items-center gap-1.5"
                  >
                    {project.status === "scanning" ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        AI 挖掘中 {project.progress}%
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        启动 AI 漏洞挖掘
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 扫描日志面板 (如果正在扫描) */}
              {project.status === "scanning" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#57534e]">
                    <span>AI 引擎分析进度</span>
                    <span>{project.progress}%</span>
                  </div>
                  <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full transition-all duration-300" style={{ width: `${project.progress}%` }}></div>
                  </div>
                  <div className="bg-stone-950 rounded-xl p-4 font-mono text-xs text-stone-300 overflow-y-auto max-h-40 border border-stone-800 space-y-1.5">
                    {project.scanLogs.map((log, idx) => (
                      <p key={idx} className="leading-relaxed">
                        <span className="text-blue-500 font-semibold">[AI-VULN-SCAN]</span> {log}
                      </p>
                    ))}
                    <p className="text-blue-400 animate-pulse">[AI-VULN-SCAN] 正在进行语义深度分析推理...</p>
                  </div>
                </div>
              )}

              {/* 扫描完成后的摘要信息 */}
              {project.status === "completed" && (
                <div className="flex items-center gap-3 p-3 bg-emerald-50/50 border border-emerald-100 rounded-lg text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-emerald-800 font-medium">
                    AI 审计完成 · 共发现 {project.vulnerabilities.length} 个安全问题 · 
                    {project.vulnerabilities.filter(v => v.status === "unresolved").length} 个待处理
                  </span>
                </div>
              )}

              {/* 漏洞列表展示 (非扫描状态) */}
              {project.status !== "scanning" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-[#1c1917]">
                      AI 审计漏洞列表（共 {project.vulnerabilities.filter(v => v.status === "unresolved").length} 个未解决）
                    </h4>
                    <span className="text-xs text-[#78716c] font-medium">
                      最近审计：{project.lastScanTime ? new Date(project.lastScanTime).toLocaleString("zh-CN") : "尚未扫描"}
                    </span>
                  </div>

                  {project.vulnerabilities.length === 0 ? (
                    <div className="h-44 border border-dashed border-[#e7e5e4] rounded-xl flex flex-col items-center justify-center text-stone-400 text-xs gap-1.5">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                      暂无安全漏洞，点击启动 AI 漏洞挖掘进行全库深度扫描
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {project.vulnerabilities.map((vuln) => {
                        const isFixed = vuln.status === "fixed";
                        const isIgnored = vuln.status === "ignored";
                        const backendId = vuln._backendId;
                        const pocState = backendId ? pocStates[backendId] : undefined;
                        const hasPoc = pocState?.scriptCode || vuln.pocScriptCode;
                        const isPocExpanded = backendId ? expandedPoc.has(backendId) : false;

                        return (
                          <div 
                            key={vuln.id} 
                            className={`border rounded-xl p-5 space-y-4 transition-all duration-200 ${
                              isFixed 
                                ? "bg-emerald-50/10 border-emerald-200 opacity-75" 
                                : isIgnored 
                                ? "bg-stone-50 border-stone-200 opacity-50"
                                : "bg-white border-[#e7e5e4]"
                            }`}
                          >
                            {/* 漏洞头部 */}
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    vuln.severity === "critical" 
                                      ? "bg-red-100 text-red-700 border border-red-200" 
                                      : vuln.severity === "high"
                                      ? "bg-orange-100 text-orange-700 border border-orange-200"
                                      : vuln.severity === "medium"
                                      ? "bg-yellow-100 text-yellow-700 border border-yellow-200"
                                      : "bg-blue-100 text-blue-700 border border-blue-200"
                                  }`}>
                                    {vuln.severity.toUpperCase()}
                                  </span>
                                  <span className="text-xs text-stone-500 font-semibold">{vuln.cwe}</span>
                                  <span className="text-xs text-stone-400">|</span>
                                  <span className="text-xs text-stone-500 font-medium truncate max-w-xs">{vuln.owasp}</span>
                                </div>
                                <h5 className="text-sm font-bold text-[#1c1917]">{vuln.title}</h5>
                                <p className="text-xs text-stone-500 font-medium">
                                  代码位置：<span className="font-mono text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">{vuln.file} : L{vuln.line}</span>
                                </p>
                              </div>

                              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                                {!isFixed && !isIgnored && (
                                  <>
                                    {/* 生成 PoC 按钮 */}
                                    {backendId && (
                                      <button
                                        onClick={() => hasPoc ? togglePocPanel(backendId) : handleGeneratePoc(vuln)}
                                        disabled={pocState?.loading}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${
                                          hasPoc
                                            ? "bg-purple-100 text-purple-700 hover:bg-purple-200 border border-purple-200"
                                            : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                      >
                                        {pocState?.loading ? (
                                          <>
                                            <span className="w-3.5 h-3.5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></span>
                                            生成中...
                                          </>
                                        ) : hasPoc ? (
                                          <>
                                            <Bug className="w-3.5 h-3.5" />
                                            {isPocExpanded ? "收起 PoC" : "查看 PoC"}
                                            {isPocExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                          </>
                                        ) : (
                                          <>
                                            <Zap className="w-3.5 h-3.5" />
                                            生成 PoC
                                          </>
                                        )}
                                      </button>
                                    )}
                                    <button
                                      onClick={() => fixVulnerability(project.id, vuln.id)}
                                      className="px-3 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                                    >
                                      <Sparkles className="w-3.5 h-3.5" />
                                      AI 修复
                                    </button>
                                    <button
                                      onClick={() => ignoreVulnerability(project.id, vuln.id)}
                                      className="px-3 py-1.5 border border-[#e7e5e4] hover:bg-stone-50 text-[#57534e] rounded-lg text-xs font-semibold transition-colors"
                                    >
                                      忽略
                                    </button>
                                  </>
                                )}
                                {isFixed && (
                                  <span className="px-3 py-1.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-200 flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    AI 已修复并验证
                                  </span>
                                )}
                                {isIgnored && (
                                  <span className="px-3 py-1.5 bg-stone-100 text-stone-500 text-xs font-semibold rounded-lg border border-stone-200">
                                    已忽略
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 漏洞详情与数据流 (如果未修复) */}
                            {!isFixed && !isIgnored && (
                              <div className="border-t border-[#f5f5f4] pt-4 space-y-4">
                                <p className="text-xs text-[#57534e] leading-relaxed">
                                  <strong>漏洞描述</strong>：{vuln.description}
                                </p>

                                {/* 静态数据流追踪图 */}
                                {vuln.dataFlow && vuln.dataFlow.length > 0 && (
                                  <div className="space-y-2.5">
                                    <div className="text-xs font-bold text-[#1c1917] flex items-center gap-1">
                                      <Terminal className="w-3.5 h-3.5 text-blue-600" />
                                      静态数据流追踪图（污点可达分析）
                                    </div>
                                    <div className="space-y-2 pl-3 border-l-2 border-blue-100">
                                      {vuln.dataFlow.map((step) => (
                                        <div key={step.step} className="text-xs flex items-start gap-3">
                                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">
                                            {step.step}
                                          </span>
                                          <div className="space-y-0.5">
                                            <div className="flex items-center gap-2">
                                              <span className="font-mono text-[#1c1917] bg-stone-50 border border-stone-200 px-1 py-0.5 rounded text-[10px]">{step.file} : L{step.line}</span>
                                              <span className="text-[10px] text-blue-600 font-semibold">{step.note}</span>
                                            </div>
                                            <pre className="bg-stone-900 text-stone-300 p-2 rounded-md font-mono text-[11px] leading-relaxed border border-stone-800 max-w-xl overflow-x-auto">
                                              <code>{step.code}</code>
                                            </pre>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* AI 推理与修复对比 */}
                                <div className="bg-blue-50/20 border border-blue-100/50 rounded-xl p-4 space-y-3">
                                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-700">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    AI 大模型深度审计与修复补丁
                                  </div>
                                  <p className="text-xs text-stone-600 leading-relaxed italic">
                                    <strong>AI 审计推导</strong>：{vuln.aiReasoning}
                                  </p>
                                  {(vuln.codeSnippet || vuln.fixedCode) && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                                      <div className="space-y-1">
                                        <span className="text-[10px] font-bold text-red-600 block">当前缺陷代码：</span>
                                        <pre className="bg-stone-900 text-stone-300 p-3 rounded-lg font-mono text-[11px] leading-relaxed border border-stone-800 overflow-x-auto max-h-36">
                                          <code>{vuln.codeSnippet || "（代码片段未提取）"}</code>
                                        </pre>
                                      </div>
                                      <div className="space-y-1">
                                        <span className="text-[10px] font-bold text-emerald-600 block">AI 修复补丁：</span>
                                        <pre className="bg-stone-900 text-stone-300 p-3 rounded-lg font-mono text-[11px] leading-relaxed border border-stone-800 overflow-x-auto max-h-36">
                                          <code>{vuln.fixedCode || "（修复建议：" + vuln.suggestedFix + "）"}</code>
                                        </pre>
                                      </div>
                                    </div>
                                  )}
                                  {!vuln.codeSnippet && !vuln.fixedCode && vuln.suggestedFix && (
                                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-xs text-emerald-800 leading-relaxed">
                                      <strong>修复建议：</strong>{vuln.suggestedFix}
                                    </div>
                                  )}
                                </div>

                                {/* PoC 展示面板 */}
                                {backendId && isPocExpanded && (
                                  <div className="border border-purple-200 rounded-xl overflow-hidden">
                                    {/* PoC 面板头部 */}
                                    <div className="flex items-center justify-between px-4 py-3 bg-purple-50 border-b border-purple-100">
                                      <div className="flex items-center gap-2">
                                        <Bug className="w-4 h-4 text-purple-600" />
                                        <span className="text-xs font-bold text-purple-800">
                                          漏洞利用 PoC（Proof of Concept）
                                        </span>
                                        {(pocState?.generatedAt || vuln.pocGeneratedAt) && (
                                          <span className="flex items-center gap-1 text-[10px] text-purple-500">
                                            <Clock className="w-3 h-3" />
                                            {new Date(pocState?.generatedAt || vuln.pocGeneratedAt!).toLocaleString("zh-CN")}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded-full border border-red-200 font-bold">
                                          ⚠ 仅供安全研究使用
                                        </span>
                                      </div>
                                    </div>

                                    {/* PoC 内容 */}
                                    {pocState?.loading ? (
                                      <div className="p-6 flex flex-col items-center justify-center gap-3 bg-purple-50/30">
                                        <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                                        <p className="text-xs text-purple-600 font-medium">AI 正在生成漏洞利用 PoC...</p>
                                        <p className="text-[10px] text-purple-400">分析漏洞特征 · 构建攻击向量 · 生成验证脚本</p>
                                      </div>
                                    ) : pocState?.error ? (
                                      <div className="p-4 bg-red-50 text-xs text-red-700 flex items-center gap-2">
                                        <Shield className="w-4 h-4 shrink-0" />
                                        {pocState.error}
                                      </div>
                                    ) : (pocState?.description || vuln.pocDescription) ? (
                                      <div className="p-4 space-y-4 bg-white">
                                        {/* PoC 描述 */}
                                        <div className="space-y-2">
                                          <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700">
                                            <Shield className="w-3.5 h-3.5 text-purple-500" />
                                            攻击原理与利用步骤
                                          </div>
                                          <div className="text-xs text-stone-600 leading-relaxed bg-purple-50/30 border border-purple-100 rounded-lg p-3 whitespace-pre-wrap">
                                            {pocState?.description || vuln.pocDescription}
                                          </div>
                                        </div>

                                        {/* PoC 脚本代码 */}
                                        {(pocState?.scriptCode || vuln.pocScriptCode) && (
                                          <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                              <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700">
                                                <Code className="w-3.5 h-3.5 text-purple-500" />
                                                可执行 PoC 脚本
                                              </div>
                                              <button
                                                onClick={() => handleCopyPoc(pocState?.scriptCode || vuln.pocScriptCode || "", backendId)}
                                                className="flex items-center gap-1 text-[10px] px-2 py-1 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-md transition-colors font-semibold"
                                              >
                                                <Copy className="w-3 h-3" />
                                                {copiedId === backendId ? "已复制！" : "复制代码"}
                                              </button>
                                            </div>
                                            <pre className="bg-stone-950 text-green-400 p-4 rounded-lg font-mono text-[11px] leading-relaxed border border-stone-800 overflow-x-auto max-h-80 relative">
                                              <code>{pocState?.scriptCode || vuln.pocScriptCode}</code>
                                            </pre>
                                          </div>
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
                                )}

                                {/* PoC 生成中的内联状态（面板未展开时） */}
                                {backendId && pocState?.loading && !isPocExpanded && (
                                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
                                    <span className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin shrink-0"></span>
                                    AI 正在生成漏洞利用 PoC，请稍候...
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="h-96 border border-dashed border-[#e7e5e4] rounded-xl flex flex-col items-center justify-center text-stone-400 text-xs gap-1.5 bg-white">
              <FolderGit2 className="w-10 h-10 text-stone-300" />
              请在左侧选择一个项目工作区，或点击右上角关联新的代码仓库。
            </div>
          )}
        </div>
      </div>

      {/* 关联仓库模态弹窗 - 使用 Portal 挂载到 body，确保全屏居中 */}
      {showAddModal && createPortal(
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999] animate-fadeIn"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowAddModal(false); setSubmitError(""); } }}
        >
          <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 w-full max-w-md shadow-2xl space-y-4">
            {/* 弹窗标题 */}
            <div className="flex items-center justify-between border-b border-[#f5f5f4] pb-3">
              <h3 className="text-base font-bold text-[#1c1917]">关联代码仓库</h3>
              <button 
                onClick={() => { setShowAddModal(false); setSubmitError(""); }}
                className="p-1.5 hover:bg-stone-50 rounded-lg text-stone-400 hover:text-stone-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 来源类型切换 */}
            <div className="flex gap-2 p-1 bg-stone-100 rounded-lg">
              <button
                type="button"
                onClick={() => { setSourceType("git"); setSubmitError(""); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-bold transition-all ${
                  sourceType === "git"
                    ? "bg-white text-blue-700 shadow-sm border border-[#e7e5e4]"
                    : "text-stone-500 hover:text-stone-700"
                }`}
              >
                <Link className="w-3.5 h-3.5" />
                Git 仓库 URL
              </button>
              <button
                type="button"
                onClick={() => { setSourceType("archive"); setSubmitError(""); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-bold transition-all ${
                  sourceType === "archive"
                    ? "bg-white text-blue-700 shadow-sm border border-[#e7e5e4]"
                    : "text-stone-500 hover:text-stone-700"
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                上传压缩包
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 项目名称 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#57534e]">项目名称 *</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="例如：payment-service"
                  className="w-full px-3 py-2 border border-[#e7e5e4] rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  required
                />
              </div>

              {/* Git URL 输入 */}
              {sourceType === "git" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#57534e]">Git 仓库 URL *</label>
                  <input
                    value={repoUrl}
                    onChange={e => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/org/repo.git"
                    className="w-full px-3 py-2 border border-[#e7e5e4] rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  />
                </div>
              )}

              {/* 压缩包上传区域 */}
              {sourceType === "archive" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#57534e]">代码压缩包 *</label>
                  <div
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                      archiveDragOver
                        ? "border-blue-400 bg-blue-50"
                        : archiveFile
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-[#e7e5e4] hover:border-blue-300 hover:bg-stone-50"
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setArchiveDragOver(true); }}
                    onDragLeave={() => setArchiveDragOver(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setArchiveDragOver(false);
                      const file = e.dataTransfer.files[0];
                      if (file) setArchiveFile(file);
                    }}
                  >
                    {archiveFile ? (
                      <div className="flex items-center justify-center gap-2 text-emerald-700">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="text-xs font-semibold">{archiveFile.name} {(archiveFile.size / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="w-8 h-8 text-stone-300 mx-auto" />
                        <p className="text-xs text-stone-500">点击选择或拖拽压缩包到此处</p>
                        <p className="text-[10px] text-stone-400">支持 .zip / .tar / .tar.gz / .tgz，最大 50MB</p>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".zip,.tar,.tar.gz,.tgz"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) setArchiveFile(f); }}
                    />
                  </div>
                </div>
              )}

              {/* 编程语言 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#57534e]">主要编程语言</label>
                <select
                  value={lang}
                  onChange={e => setLang(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e7e5e4] rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
                >
                  {["Java", "Python", "JavaScript", "TypeScript", "Go", "C/C++", "PHP", "Ruby", "Rust", "C#"].map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              {submitError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{submitError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setSubmitError(""); }}
                  className="flex-1 px-4 py-2 border border-[#e7e5e4] text-[#57534e] rounded-lg text-xs font-semibold hover:bg-stone-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-blue-700 text-white rounded-lg text-xs font-bold hover:bg-blue-800 disabled:bg-blue-300 transition-colors flex items-center justify-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      处理中...
                    </>
                  ) : sourceType === "archive" ? (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      上传并创建项目
                    </>
                  ) : (
                    <>
                      <ArrowRight className="w-3.5 h-3.5" />
                      确认关联
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
