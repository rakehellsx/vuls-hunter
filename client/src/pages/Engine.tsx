import React from "react";
import { 
  Cpu, 
  Activity, 
  Database, 
  RefreshCw, 
  Network, 
  Layers,
  Sparkles
} from "lucide-react";
import { toast } from "sonner";

export default function Engine() {
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 编译前端 */}
        <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1c1917] flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              编译前端 (Tree-sitter)
            </h3>
            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-100">
              运行中
            </span>
          </div>
          <p className="text-xs text-[#78716c] leading-relaxed">
            负责对源代码进行高精度词法与语法解析，自动构建 AST 抽象语法树，支持多语言语法树合并。
          </p>
          <div className="border-t border-[#f5f5f4] pt-3 flex justify-between text-xs text-[#57534e]">
            <span>当前版本: V4.2.1-Core</span>
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
            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-100">
              运行中
            </span>
          </div>
          <p className="text-xs text-[#78716c] leading-relaxed">
            构建跨文件的控制流图 (CFG) 与函数调用图 (CG)，进行高精度别名分析与敏感数据流（污点）追踪。
          </p>
          <div className="border-t border-[#f5f5f4] pt-3 flex justify-between text-xs text-[#57534e]">
            <span>指向敏感度: 高</span>
            <span className="font-semibold text-blue-600">QPS: 12,400</span>
          </div>
        </div>

        {/* AI 大模型推理内核 */}
        <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1c1917] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              AI 大模型推理内核
            </h3>
            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-100">
              运行中
            </span>
          </div>
          <p className="text-xs text-[#78716c] leading-relaxed">
            基于 360 安全大模型 & DeepSeek-R1 混合推理。负责对数据流路径进行语义级漏洞审计与误报降噪过滤。
          </p>
          <div className="border-t border-[#f5f5f4] pt-3 flex justify-between text-xs text-[#57534e]">
            <span>当前基座: 32B-Instruct</span>
            <span className="font-semibold text-blue-600">延迟: ~1.2s</span>
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
          {/* CPU / GPU 算力 */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-[#57534e]">
              <span>GPU 算力负载 (Nvidia L20)</span>
              <span>42%</span>
            </div>
            <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full" style={{ width: "42%" }}></div>
            </div>
          </div>

          {/* 内存 */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-[#57534e]">
              <span>内存占用 (128GB Cluster)</span>
              <span>68%</span>
            </div>
            <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full" style={{ width: "68%" }}></div>
            </div>
          </div>

          {/* RAG 向量库 */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-[#57534e]">
              <span>RAG 安全知识向量库</span>
              <span>94% 命中率</span>
            </div>
            <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: "94%" }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
