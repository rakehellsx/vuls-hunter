import React, { useState, useEffect } from "react";
import { useApp, Project } from "@/contexts/AppContext";
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
  RefreshCw
} from "lucide-react";

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
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [lang, setLang] = useState("Java");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // Selected project object
  const project = projects.find(p => p.id === selectedProjectId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !repoUrl) return;
    const prevCount = projects.length;
    await addProject(name, repoUrl, lang);
    setName("");
    setRepoUrl("");
    setShowAddModal(false);
    // 新建后自动选中（通过 useEffect 触发，此处 projects 还未更新，延迟一帧）
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteProject(id);
    // 如果删除的是当前选中项，useEffect 会自动切换到第一个
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

                              <div className="flex items-center gap-2 shrink-0">
                                {!isFixed && !isIgnored && (
                                  <>
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

      {/* 关联仓库模态弹窗 */}
      {showAddModal && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}
        >
          <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#f5f5f4] pb-3">
              <h3 className="text-base font-bold text-[#1c1917]">关联代码仓库</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1.5 hover:bg-stone-50 rounded-lg text-stone-400 hover:text-stone-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#57534e]">项目/仓库名称</label>
                <input
                  type="text"
                  required
                  placeholder="例如：Secured-Payment-Gateway"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e7e5e4] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-[#fafaf9]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#57534e]">Git 仓库 URL (HTTPS/SSH)</label>
                <input
                  type="text"
                  required
                  placeholder="https://github.com/org/repo.git"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e7e5e4] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-[#fafaf9]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#57534e]">主要开发语言</label>
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e7e5e4] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-[#fafaf9]"
                >
                  <option value="Java">Java</option>
                  <option value="Python">Python</option>
                  <option value="Go">Go</option>
                  <option value="C/C++">C/C++</option>
                  <option value="JavaScript">JavaScript</option>
                  <option value="TypeScript">TypeScript</option>
                  <option value="PHP">PHP</option>
                  <option value="Ruby">Ruby</option>
                </select>
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 border border-[#e7e5e4] text-[#57534e] rounded-lg text-xs font-semibold hover:bg-[#fafaf9] transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-700 text-white rounded-lg text-xs font-bold hover:bg-blue-800 transition-colors shadow-sm"
                >
                  确认关联
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
