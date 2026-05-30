import React from "react";
import { useApp } from "@/contexts/AppContext";
import { 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  Code, 
  TrendingUp, 
  Layers,
  ArrowRight,
  Sparkles
} from "lucide-react";

export default function Overview() {
  const { projects, rules, reports, setActiveTab } = useApp();

  // Calculate stats
  const totalProjects = projects.length;
  const totalRules = rules.length;
  
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let totalFixed = 0;

  projects.forEach(p => {
    p.vulnerabilities.forEach(v => {
      if (v.status === "fixed") {
        totalFixed++;
      } else if (v.status === "unresolved") {
        if (v.severity === "critical") criticalCount++;
        if (v.severity === "high") highCount++;
        if (v.severity === "medium") mediumCount++;
        if (v.severity === "low") lowCount++;
      }
    });
  });

  const activeVulnerabilities = criticalCount + highCount + mediumCount + lowCount;

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 欢迎与 Banner */}
      <div className="relative overflow-hidden bg-white border border-[#e7e5e4] rounded-2xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex items-center justify-between">
        <div className="space-y-3 max-w-xl z-10">
          <h2 className="text-2xl font-bold tracking-tight text-[#1c1917]">
            欢迎使用 AI-Vuln Scanner 漏洞挖掘系统
          </h2>
          <p className="text-sm text-[#78716c] leading-relaxed">
            基于先进的<strong>神经符号（Neuro-Symbolic）混合架构</strong>。结合静态分析的精准可达性分析，以及大语言模型对跨文件业务逻辑与新型 AI 生态安全（提示词注入、智能体越权）的深度语义推理，实现极低误报率的代码级闭环审计。
          </p>
          <div className="pt-2 flex gap-4">
            <button 
              onClick={() => setActiveTab("chat-agent")}
              className="px-4 py-2 bg-blue-700 text-white rounded-lg text-xs font-bold hover:bg-blue-800 transition-colors shadow-sm flex items-center gap-1.5"
            >
              进入智能对话挖掘
              <Sparkles className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={() => setActiveTab("quick-scan")}
              className="px-4 py-2 border border-[#e7e5e4] text-[#57534e] rounded-lg text-xs font-semibold hover:bg-[#fafaf9] transition-colors"
            >
              快速检测代码
            </button>
          </div>
        </div>
        
        {/* Banner 插图 */}
        <div className="hidden lg:block w-72 h-44 relative">
          <img 
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663645103499/i2dDD5vnGvfCZmc5MHhs8N/hero-banner-EQ3Eoy2ncn3bbHxhcQ23sA.webp" 
            alt="AI Cybersecurity Banner"
            className="w-full h-full object-cover rounded-xl border border-[#e7e5e4]"
          />
        </div>
      </div>

      {/* 指标卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* 活动漏洞 */}
        <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-bold text-[#78716c] uppercase tracking-wider">未解决漏洞</p>
            <h3 className="text-3xl font-extrabold text-red-600 tracking-tight">{activeVulnerabilities}</h3>
            <p className="text-xs text-[#a8a29e] font-medium">包含严重/高危漏洞</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        {/* 已修复漏洞 */}
        <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-bold text-[#78716c] uppercase tracking-wider">AI 自动修复</p>
            <h3 className="text-3xl font-extrabold text-emerald-600 tracking-tight">{totalFixed}</h3>
            <p className="text-xs text-emerald-600 font-semibold inline-flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              修复率 {activeVulnerabilities + totalFixed > 0 ? Math.round((totalFixed / (activeVulnerabilities + totalFixed)) * 100) : 0}%
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* 项目数 */}
        <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-bold text-[#78716c] uppercase tracking-wider">审计项目数</p>
            <h3 className="text-3xl font-extrabold text-[#1c1917] tracking-tight">{totalProjects}</h3>
            <p className="text-xs text-[#a8a29e] font-medium">支持多语言微服务</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        {/* 规则数 */}
        <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-bold text-[#78716c] uppercase tracking-wider">安全规则库</p>
            <h3 className="text-3xl font-extrabold text-[#1c1917] tracking-tight">{totalRules}</h3>
            <p className="text-xs text-[#a8a29e] font-medium">CWE/OWASP 标准规则</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <Code className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 下方两栏布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 漏洞等级分布 (左侧两栏) */}
        <div className="lg:col-span-2 bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#1c1917]">活动漏洞风险评级</h3>
            <span className="text-xs text-[#78716c] font-medium">排除已修复与忽略漏洞</span>
          </div>

          <div className="grid grid-cols-4 gap-4 text-center">
            <div className="p-4 rounded-xl bg-red-50/50 border border-red-100/50">
              <span className="text-xs font-bold text-red-700 block mb-1">CRITICAL</span>
              <span className="text-2xl font-extrabold text-red-600">{criticalCount}</span>
            </div>
            <div className="p-4 rounded-xl bg-orange-50/50 border border-orange-100/50">
              <span className="text-xs font-bold text-orange-700 block mb-1">HIGH</span>
              <span className="text-2xl font-extrabold text-orange-600">{highCount}</span>
            </div>
            <div className="p-4 rounded-xl bg-yellow-50/50 border border-yellow-100/50">
              <span className="text-xs font-bold text-yellow-700 block mb-1">MEDIUM</span>
              <span className="text-2xl font-extrabold text-yellow-600">{mediumCount}</span>
            </div>
            <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100/50">
              <span className="text-xs font-bold text-blue-700 block mb-1">LOW</span>
              <span className="text-2xl font-extrabold text-blue-600">{lowCount}</span>
            </div>
          </div>

          {/* 漏洞评级可视化 */}
          <div className="space-y-3">
            <div className="h-3 w-full bg-stone-100 rounded-full overflow-hidden flex">
              <div className="bg-red-600" style={{ width: `${activeVulnerabilities > 0 ? (criticalCount / activeVulnerabilities) * 100 : 0}%` }}></div>
              <div className="bg-orange-500" style={{ width: `${activeVulnerabilities > 0 ? (highCount / activeVulnerabilities) * 100 : 0}%` }}></div>
              <div className="bg-yellow-500" style={{ width: `${activeVulnerabilities > 0 ? (mediumCount / activeVulnerabilities) * 100 : 0}%` }}></div>
              <div className="bg-blue-500" style={{ width: `${activeVulnerabilities > 0 ? (lowCount / activeVulnerabilities) * 100 : 0}%` }}></div>
            </div>
            <div className="flex justify-between text-xs text-[#78716c] font-medium">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-600"></span> 严重 (Critical)</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span> 高危 (High)</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span> 中危 (Medium)</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-50"></span> 低危 (Low)</span>
            </div>
          </div>
        </div>

        {/* 规则分类统计 (右侧一栏) */}
        <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-6">
          <h3 className="text-base font-bold text-[#1c1917]">规则库类型占比</h3>
          <div className="space-y-4">
            {/* 安全缺陷 */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold text-[#57534e]">
                <span>安全缺陷 (Security Flaws)</span>
                <span>{rules.filter(r => r.type === "security").length} 条</span>
              </div>
              <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full" style={{ width: `${(rules.filter(r => r.type === "security").length / totalRules) * 100}%` }}></div>
              </div>
            </div>
            {/* 质量缺陷 */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold text-[#57534e]">
                <span>质量缺陷 (Code Quality)</span>
                <span>{rules.filter(r => r.type === "quality").length} 条</span>
              </div>
              <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(rules.filter(r => r.type === "quality").length / totalRules) * 100}%` }}></div>
              </div>
            </div>
            {/* 编码规范 */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold text-[#57534e]">
                <span>标准规范 (Standards)</span>
                <span>{rules.filter(r => r.type === "standard").length} 条</span>
              </div>
              <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(rules.filter(r => r.type === "standard").length / totalRules) * 100}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 审计项目实时列表 */}
      <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[#1c1917]">最新审计项目</h3>
          <button 
            onClick={() => setActiveTab("projects")}
            className="text-xs font-bold text-blue-700 hover:underline inline-flex items-center gap-1"
          >
            管理全部项目
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-[#e7e5e4] text-[#78716c] font-semibold text-xs uppercase">
                <th className="py-3 px-4">项目名称</th>
                <th className="py-3 px-4">主要语言</th>
                <th className="py-3 px-4">最近扫描时间</th>
                <th className="py-3 px-4">未解决漏洞</th>
                <th className="py-3 px-4">当前状态</th>
                <th className="py-3 px-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f5f5f4]">
              {projects.slice(0, 3).map(p => {
                const unresolvedCount = p.vulnerabilities.filter(v => v.status === "unresolved").length;
                return (
                  <tr key={p.id} className="hover:bg-[#fafaf9] transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-[#1c1917]">{p.name}</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 bg-stone-100 text-stone-700 text-xs font-semibold rounded-md border border-stone-200">
                        {p.language}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-[#57534e] text-xs">{p.lastScanTime}</td>
                    <td className="py-3.5 px-4">
                      {unresolvedCount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-50 border border-red-100 text-red-700 text-xs font-bold">
                          <AlertTriangle className="w-3 h-3" />
                          {unresolvedCount} 个高危
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold">
                          安全
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {p.status === "scanning" ? (
                        <span className="inline-flex items-center gap-1 text-blue-600 font-semibold text-xs">
                          <span className="w-2 h-2 bg-blue-600 rounded-full animate-ping"></span>
                          深度审计中 {p.progress}%
                        </span>
                      ) : (
                        <span className="text-[#78716c] text-xs">空闲</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button 
                        onClick={() => {
                          setActiveTab("projects");
                        }}
                        className="px-3 py-1.5 border border-[#e7e5e4] hover:bg-white hover:text-blue-700 rounded-lg text-xs font-bold transition-colors"
                      >
                        进入工作区
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
