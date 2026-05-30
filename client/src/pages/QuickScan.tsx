import React, { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { 
  Play, 
  Terminal, 
  ShieldAlert, 
  Code, 
  ArrowRight, 
  CheckCircle,
  HelpCircle,
  Sparkles
} from "lucide-react";

export default function QuickScan() {
  const { triggerQuickScan, quickScanResult, fixVulnerability } = useApp();
  const [code, setCode] = useState<string>(
    `# 这是一个高危的 SQL 拼接示例代码\nusername = get_username_from_request()\nquery = f"SELECT * FROM users WHERE name = '{username}'"\ncursor.execute(query)`
  );
  const [lang, setLang] = useState<string>("Python");

  const loadExample = (type: "sql" | "cmd") => {
    if (type === "sql") {
      setCode(
        `# 这是一个高危的 SQL 拼接示例代码\nusername = get_username_from_request()\nquery = f"SELECT * FROM users WHERE name = '{username}'"\ncursor.execute(query)`
      );
      setLang("Python");
    } else {
      setCode(
        `// 这是一个高危的任意系统命令注入示例代码\npackage main\nimport "os/exec"\n\nfunc pingHost(ip string) {\n    cmd := exec.Command("sh", "-c", "ping -c 4 " + ip)\n    cmd.Run()\n}`
      );
      setLang("Go");
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 头部标题 */}
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight text-[#1c1917]">快速代码片段检测</h2>
        <p className="text-sm text-[#78716c]">
          在无需绑定代码仓库的情况下，直接粘贴单文件或函数片段，由 AI 自动审计引擎进行秒级数据流可达性与语义缺陷分析。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 代码输入区 (左侧 7 栏) */}
        <div className="lg:col-span-7 bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <select 
                value={lang} 
                onChange={(e) => setLang(e.target.value)}
                className="px-3 py-1.5 border border-[#e7e5e4] rounded-lg text-xs font-bold text-[#1c1917] bg-[#fafaf9] focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                <option value="Python">Python</option>
                <option value="Java">Java</option>
                <option value="Go">Go</option>
                <option value="C/C++">C/C++</option>
                <option value="JavaScript">JavaScript</option>
              </select>
              <div className="h-4 w-[1px] bg-[#e7e5e4]"></div>
              <span className="text-xs text-[#78716c] font-semibold">加载漏洞范例：</span>
              <button 
                onClick={() => loadExample("sql")}
                className="text-xs font-bold text-blue-700 hover:underline"
              >
                SQL 注入
              </button>
              <button 
                onClick={() => loadExample("cmd")}
                className="text-xs font-bold text-blue-700 hover:underline"
              >
                命令执行
              </button>
            </div>
            
            <button 
              onClick={() => triggerQuickScan(code, lang)}
              disabled={quickScanResult.status === "scanning"}
              className="px-4 py-2 bg-blue-700 text-white rounded-lg text-xs font-bold hover:bg-blue-800 disabled:bg-blue-300 transition-colors shadow-sm flex items-center gap-1.5"
            >
              {quickScanResult.status === "scanning" ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  AI 正在挖掘...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  开始 AI 审计
                </>
              )}
            </button>
          </div>

          {/* 文本域代码编辑器 */}
          <div className="relative border border-[#e7e5e4] rounded-xl overflow-hidden bg-[#1e1e1e] font-mono text-sm text-stone-200">
            <div className="h-8 bg-[#252526] border-b border-[#1e1e1e] px-4 flex items-center justify-between text-xs text-stone-400 select-none">
              <span>{lang.toLowerCase()}_vulnerability_test.{lang === "Go" ? "go" : "py"}</span>
              <span>UTF-8</span>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="请在此处粘贴需要审计的代码片段..."
              className="w-full h-80 p-6 bg-transparent resize-none focus:outline-none leading-relaxed text-stone-200 font-mono"
              spellCheck="false"
            />
          </div>
        </div>

        {/* 运行日志与结果 (右侧 5 栏) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* AI 运行日志 */}
          <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] flex-1 flex flex-col space-y-4">
            <h3 className="text-sm font-bold text-[#1c1917] flex items-center gap-2">
              <Terminal className="w-4 h-4 text-blue-600" />
              AI 分析引擎终端日志
            </h3>

            <div className="flex-1 bg-stone-950 rounded-xl p-4 font-mono text-xs text-stone-300 overflow-y-auto space-y-2 h-44 border border-stone-800">
              {quickScanResult.status === "idle" ? (
                <p className="text-stone-500 italic">等待启动快速检测任务...</p>
              ) : (
                quickScanResult.logs.map((log, idx) => (
                  <p key={idx} className="leading-relaxed">
                    <span className="text-blue-500 font-semibold">[AI-ENGINE]</span> {log}
                  </p>
                ))
              )}
              {quickScanResult.status === "scanning" && (
                <p className="text-blue-400 animate-pulse">正在进行深度语义建模，请稍候...</p>
              )}
            </div>
          </div>

          {/* 检测结果简报 */}
          <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] flex-1 space-y-4">
            <h3 className="text-sm font-bold text-[#1c1917] flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-600" />
              检测结果简报
            </h3>

            {quickScanResult.status === "idle" && (
              <div className="h-28 border border-dashed border-[#e7e5e4] rounded-xl flex flex-col items-center justify-center text-stone-400 text-xs gap-1">
                <HelpCircle className="w-6 h-6 text-stone-300" />
                粘贴代码并点击开始 AI 审计以查看结果
              </div>
            )}

            {quickScanResult.status === "scanning" && (
              <div className="h-28 border border-dashed border-blue-200 rounded-xl flex flex-col items-center justify-center text-blue-600 text-xs gap-2 bg-blue-50/20">
                <span className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
                安全大模型正在全力挖掘潜在的零日漏洞...
              </div>
            )}

            {quickScanResult.status === "completed" && (
              <div className="space-y-4">
                {quickScanResult.vulnerabilities.length === 0 ? (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-emerald-800">安全审计通过</h4>
                      <p className="text-xs text-emerald-600 mt-0.5 leading-relaxed">
                        AI 分析引擎在当前代码片段中未检测到明显的 SQL 注入、命令注入或越权漏洞。
                      </p>
                    </div>
                  </div>
                ) : (
                  quickScanResult.vulnerabilities.map((vuln) => (
                    <div key={vuln.id} className="p-4 rounded-xl bg-red-50/50 border border-red-100 flex flex-col gap-3">
                      <div className="flex items-start gap-3">
                        <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-xs font-bold text-red-800">{vuln.title}</h4>
                          <p className="text-xs text-red-700/80 mt-1 leading-relaxed">
                            {vuln.description}
                          </p>
                        </div>
                      </div>

                      {/* 修复对比 */}
                      <div className="border-t border-red-100 pt-3 space-y-2.5">
                        <div className="flex items-center gap-1 text-xs font-bold text-blue-700">
                          <Sparkles className="w-3.5 h-3.5" />
                          AI 智能感知修复方案：
                        </div>
                        <pre className="bg-stone-900 text-stone-200 p-3 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed border border-stone-800 max-h-36">
                          <code>{vuln.fixedCode}</code>
                        </pre>
                        <p className="text-[11px] text-stone-500 leading-relaxed italic">
                          <strong>AI 推理依据</strong>：{vuln.aiReasoning}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
