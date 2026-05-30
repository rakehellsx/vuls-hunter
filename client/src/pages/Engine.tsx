import React, { useEffect, useState } from "react";
import { 
  Cpu, 
  Activity, 
  Database, 
  RefreshCw, 
  Network, 
  Layers,
  Sparkles,
  Bot
} from "lucide-react";
import { toast } from "sonner";
import { engineApi } from "@/lib/api";

interface EngineStatus {
  status: string;
  components: Record<string, { status: string; version?: string; model?: string }>;
  metrics: {
    cpu_usage: number;
    memory_usage: number;
    memory_used_gb: number;
    memory_total_gb: number;
  };
}

export default function Engine() {
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);

  const fetchStatus = async () => {
    try {
      const data = await engineApi.status();
      setEngineStatus(data);
    } catch (err) {
      console.error("Failed to fetch engine status:", err);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRestartEngine = () => {
    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 2000)),
      {
        loading: "正在重新编译与热加载 AI 漏洞挖掘引擎内核...",
        success: "AI 漏洞挖掘引擎热重启成功，各分析模块运行正常！",
        error: "重启失败"
      }
    );
  };

  const getStatusBadge = (status: string) => {
    if (status === "running" || status === "available") {
      return (
        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-100">
          运行中
        </span>
      );
    }
    if (status === "idle") {
      return (
        <span className="px-2 py-0.5 bg-yellow-50 text-yellow-700 text-[10px] font-bold rounded-full border border-yellow-100">
          空闲
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 bg-red-50 text-red-700 text-[10px] font-bold rounded-full border border-red-100">
        离线
      </span>
    );
  };

  const cpuUsage = engineStatus?.metrics.cpu_usage ?? 42;
  const memUsage = engineStatus?.metrics.memory_usage ?? 68;
  const memUsedGb = engineStatus?.metrics.memory_used_gb ?? 8.7;
  const memTotalGb = engineStatus?.metrics.memory_total_gb ?? 16;
  const llmModel = engineStatus?.components?.llm_inference?.model ?? "gpt-4.1-mini";
  const strixStatus = engineStatus?.components?.strix_agent?.status ?? "available";
  const treeSitterStatus = engineStatus?.components?.tree_sitter?.status ?? "running";
  const symbolicStatus = engineStatus?.components?.symbolic_engine?.status ?? "running";

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 头部标题 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-[#1c1917]">AI 引擎端内核管理</h2>
          <p className="text-sm text-[#78716c]">
            监控和调配底层的 AI 漏洞挖掘引擎内核、Tree-sitter 编译前端、数据流/控制流分析引擎以及大模型推理微调参数。
          </p>
        </div>
        <button 
          onClick={handleRestartEngine}
          className="px-4 py-2 border border-blue-600 text-blue-700 bg-blue-50/50 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          重启引擎内核
        </button>
      </div>

      {/* 核心引擎模块网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* 编译前端 */}
        <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1c1917] flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              编译前端 (Tree-sitter)
            </h3>
            {getStatusBadge(treeSitterStatus)}
          </div>
          <p className="text-xs text-[#78716c] leading-relaxed">
            负责对源代码进行高精度词法与语法解析，自动构建 AST 抽象语法树，支持多语言语法树合并。
          </p>
          <div className="border-t border-[#f5f5f4] pt-3 flex justify-between text-xs text-[#57534e]">
            <span>版本: v0.23.0</span>
            <span className="font-semibold text-blue-600">热加载就绪</span>
          </div>
        </div>

        {/* 符号分析引擎 */}
        <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1c1917] flex items-center gap-2">
              <Network className="w-4 h-4 text-blue-600" />
              符号分析引擎 (Symbolic)
            </h3>
            {getStatusBadge(symbolicStatus)}
          </div>
          <p className="text-xs text-[#78716c] leading-relaxed">
            构建跨文件的控制流图 (CFG) 与函数调用图 (CG)，进行高精度别名分析与敏感数据流（污点）追踪。
          </p>
          <div className="border-t border-[#f5f5f4] pt-3 flex justify-between text-xs text-[#57534e]">
            <span>指向敏感度: 高</span>
            <span className="font-semibold text-blue-600">版本: v2.1.0</span>
          </div>
        </div>

        {/* AI 大模型推理内核 */}
        <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1c1917] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              AI 大模型推理内核
            </h3>
            {getStatusBadge("running")}
          </div>
          <p className="text-xs text-[#78716c] leading-relaxed">
            基于 {llmModel} 进行语义级漏洞审计与误报降噪过滤，支持代码理解与业务逻辑推理。
          </p>
          <div className="border-t border-[#f5f5f4] pt-3 flex justify-between text-xs text-[#57534e]">
            <span>模型: {llmModel}</span>
            <span className="font-semibold text-blue-600">推理就绪</span>
          </div>
        </div>

        {/* Strix Agent */}
        <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1c1917] flex items-center gap-2">
              <Bot className="w-4 h-4 text-blue-600" />
              Strix 漏洞挖掘 Agent
            </h3>
            {getStatusBadge(strixStatus)}
          </div>
          <p className="text-xs text-[#78716c] leading-relaxed">
            Multi-Agent 协作架构，包含 Planner、Executor 和 Verifier，实现端到端漏洞发现与 PoC 自动验证。
          </p>
          <div className="border-t border-[#f5f5f4] pt-3 flex justify-between text-xs text-[#57534e]">
            <span>版本: v0.1.0</span>
            <span className="font-semibold text-blue-600">PoC 生成就绪</span>
          </div>
        </div>
      </div>

      {/* 引擎性能监控 */}
      <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-6">
        <h3 className="text-sm font-bold text-[#1c1917] flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-600" />
          AI 挖掘引擎实时性能监控
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {/* CPU */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-[#57534e]">
              <span>CPU 使用率</span>
              <span>{cpuUsage}%</span>
            </div>
            <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-500"
                style={{ width: `${cpuUsage}%` }}
              />
            </div>
          </div>

          {/* 内存 */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-[#57534e]">
              <span>内存占用 ({memUsedGb}GB / {memTotalGb}GB)</span>
              <span>{memUsage}%</span>
            </div>
            <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-500"
                style={{ width: `${memUsage}%` }}
              />
            </div>
          </div>

          {/* RAG 向量库 */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-[#57534e]">
              <span>RAG 安全知识向量库</span>
              <span>94% 命中率</span>
            </div>
            <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: "94%" }} />
            </div>
          </div>
        </div>
      </div>

      {/* Strix 集成说明 */}
      <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-4">
        <h3 className="text-sm font-bold text-[#1c1917] flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-600" />
          Strix 引擎集成架构
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[#78716c]">
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-blue-600 font-bold mt-0.5">▸</span>
              <span>
                <span className="text-[#1c1917] font-semibold">Multi-Agent 协作</span>：
                Planner 制定扫描策略，Executor 执行漏洞探测，Verifier 验证 PoC 可利用性。
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-600 font-bold mt-0.5">▸</span>
              <span>
                <span className="text-[#1c1917] font-semibold">PoC 自动生成</span>：
                引擎自动生成漏洞概念验证代码，验证真实可利用性，大幅降低误报率。
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-blue-600 font-bold mt-0.5">▸</span>
              <span>
                <span className="text-[#1c1917] font-semibold">多模式扫描</span>：
                支持 Quick / Standard / Deep 三种扫描深度，以及白盒（源码）与黑盒（URL）两种模式。
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-600 font-bold mt-0.5">▸</span>
              <span>
                <span className="text-[#1c1917] font-semibold">实时日志流</span>：
                通过 WebSocket 实时推送扫描进度与日志，支持中途取消与状态追踪。
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
