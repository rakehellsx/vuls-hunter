import React, { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { rulesApi } from "@/lib/api";
import { toast } from "sonner";
import { 
  BookOpen, 
  Plus, 
  Trash2, 
  Code, 
  ShieldAlert, 
  AlertTriangle, 
  X,
  Sparkles,
  Lock,
  Zap
} from "lucide-react";

export default function Rules() {
  const { rules, addRule, deleteRule, refreshData } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [compilingId, setCompilingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [lang, setLang] = useState("Python");
  const [severity, setSeverity] = useState<"critical" | "high" | "medium" | "low">("critical");
  const [cwe, setCwe] = useState("");
  const [description, setDescription] = useState("");
  const [exampleBad, setExampleBad] = useState("");
  const [exampleGood, setExampleGood] = useState("");
  const [type, setType] = useState<"security" | "quality" | "standard">("security");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !cwe || !description) return;
    addRule({
      name,
      lang,
      severity,
      cwe,
      description,
      exampleBad,
      exampleGood,
      type
    });
    setName("");
    setCwe("");
    setDescription("");
    setExampleBad("");
    setExampleGood("");
    setShowAddModal(false);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 头部标题 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-[#1c1917]">安全规则库管理</h2>
          <p className="text-sm text-[#78716c]">
            管理与自定义平台的漏洞挖掘检测规则。平台规则库兼容 CWE、OWASP Top 10 以及 CERT 标准，并支持自然语言智能编译。
          </p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-blue-700 text-white rounded-lg text-xs font-bold hover:bg-blue-800 transition-colors shadow-sm flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          创建自定义规则
        </button>
      </div>

      {/* 规则网格列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {rules.map((rule) => (
          <div 
            key={rule.id} 
            className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] flex flex-col justify-between gap-4 hover:border-[#d6d3d1] transition-all duration-200"
          >
            <div className="space-y-3">
              {/* 规则头部 */}
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      rule.severity === "critical" 
                        ? "bg-red-100 text-red-700 border border-red-200" 
                        : "bg-orange-100 text-orange-700 border border-orange-200"
                    }`}>
                      {rule.severity.toUpperCase()}
                    </span>
                    <span className="text-xs text-stone-500 font-semibold">{rule.cwe}</span>
                    <span className="text-xs text-stone-400">|</span>
                    <span className="text-xs text-stone-500 font-semibold">{rule.lang}</span>
                  </div>
                  <h4 className="text-sm font-bold text-[#1c1917]">{rule.name}</h4>
                </div>

                {rule.isBuiltin ? (
                  <span className="p-1.5 text-stone-300 rounded-lg" title="内置规则不可删除">
                    <Lock className="w-3.5 h-3.5" />
                  </span>
                ) : (
                  <button
                    onClick={() => deleteRule(rule.id)}
                    className="p-1.5 text-stone-400 hover:text-red-600 rounded-lg hover:bg-stone-50 transition-colors"
                    title="删除规则"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <p className="text-xs text-[#57534e] leading-relaxed">
                {rule.description}
              </p>

              {/* 范例对比 */}
              {(rule.exampleBad || rule.exampleGood) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-red-600 block">缺陷代码范例：</span>
                    <pre className="bg-stone-900 text-stone-300 p-2.5 rounded-lg font-mono text-[10px] leading-relaxed border border-stone-800 overflow-x-auto max-h-24">
                      <code>{rule.exampleBad}</code>
                    </pre>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-emerald-600 block">安全代码范例：</span>
                    <pre className="bg-stone-900 text-stone-300 p-2.5 rounded-lg font-mono text-[10px] leading-relaxed border border-stone-800 overflow-x-auto max-h-24">
                      <code>{rule.exampleGood}</code>
                    </pre>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-[#f5f5f4] pt-3 flex items-center justify-between text-xs text-[#78716c] font-medium">
              <span className="flex items-center gap-1.5">
                {rule.isBuiltin && <Lock className="w-3 h-3 text-stone-400" title="内置规则" />}
                规则 ID：{rule.id}
              </span>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100 font-semibold">
                  {rule.type === "security" ? "安全缺陷" : rule.type === "quality" ? "质量缺陷" : "标准规范"}
                </span>
                {!rule.isBuiltin && rule._backendId && (
                  <button
                    onClick={async () => {
                      setCompilingId(rule.id);
                      try {
                        await rulesApi.compileWithAI(rule._backendId!);
                        toast.success(`规则 "${rule.name}" AI 编译增强完成！`);
                        await refreshData();
                      } catch {
                        toast.error("AI 编译失败，请检查 API 配置");
                      } finally {
                        setCompilingId(null);
                      }
                    }}
                    disabled={compilingId === rule.id}
                    className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded border border-amber-100 font-semibold hover:bg-amber-100 transition-colors flex items-center gap-1 disabled:opacity-50"
                    title="使用 AI 增强规则描述和示例"
                  >
                    {compilingId === rule.id ? (
                      <><Zap className="w-3 h-3 animate-spin" />编译中...</>
                    ) : (
                      <><Sparkles className="w-3 h-3" />AI 增强</>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 创建规则模态弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#f5f5f4] pb-3">
              <h3 className="text-base font-bold text-[#1c1917] flex items-center gap-1.5">
                <BookOpen className="w-5 h-5 text-blue-600" />
                创建自定义安全规则
              </h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1.5 hover:bg-stone-50 rounded-lg text-stone-400 hover:text-stone-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#57534e]">规则名称</label>
                  <input
                    type="text"
                    required
                    placeholder="例如：不安全的哈希算法使用"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e7e5e4] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-[#fafaf9]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#57534e]">CWE 编号 / 安全标识</label>
                  <input
                    type="text"
                    required
                    placeholder="例如：CWE-328"
                    value={cwe}
                    onChange={(e) => setCwe(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e7e5e4] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-[#fafaf9]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#57534e]">适配语言</label>
                  <select
                    value={lang}
                    onChange={(e) => setLang(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e7e5e4] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-[#fafaf9]"
                  >
                    <option value="Python">Python</option>
                    <option value="Java">Java</option>
                    <option value="Go">Go</option>
                    <option value="C/C++">C/C++</option>
                    <option value="JavaScript">JavaScript</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#57534e]">严重等级</label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as any)}
                    className="w-full px-3 py-2 border border-[#e7e5e4] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-[#fafaf9]"
                  >
                    <option value="critical">严重 (Critical)</option>
                    <option value="high">高危 (High)</option>
                    <option value="medium">中危 (Medium)</option>
                    <option value="low">低危 (Low)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#57534e]">规则类型</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-[#e7e5e4] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-[#fafaf9]"
                  >
                    <option value="security">安全缺陷</option>
                    <option value="quality">质量缺陷</option>
                    <option value="standard">标准规范</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#57534e]">规则缺陷描述</label>
                <textarea
                  required
                  rows={2}
                  placeholder="详细描述该漏洞规则的触发场景与潜在危害..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e7e5e4] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-[#fafaf9] resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-red-600">缺陷代码范例</label>
                  <textarea
                    rows={3}
                    placeholder="hash = md5.new(data)"
                    value={exampleBad}
                    onChange={(e) => setExampleBad(e.target.value)}
                    className="w-full p-3 border border-[#e7e5e4] rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-600 bg-[#fafaf9] resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-emerald-600">安全代码范例</label>
                  <textarea
                    rows={3}
                    placeholder="hash = sha256.new(data)"
                    value={exampleGood}
                    onChange={(e) => setExampleGood(e.target.value)}
                    className="w-full p-3 border border-[#e7e5e4] rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-600 bg-[#fafaf9] resize-none"
                  />
                </div>
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
                  className="flex-1 py-2 bg-blue-700 text-white rounded-lg text-xs font-bold hover:bg-blue-800 transition-colors shadow-sm flex items-center justify-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  智能编译并发布
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
