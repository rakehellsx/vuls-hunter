import React from "react";
import { useApp } from "@/contexts/AppContext";
import { 
  History, 
  User, 
  Terminal, 
  CheckCircle2, 
  AlertTriangle 
} from "lucide-react";

export default function Audit() {
  const { auditLogs } = useApp();

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 头部标题 */}
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight text-[#1c1917]">系统安全日志审计</h2>
        <p className="text-sm text-[#78716c]">
          记录平台所有的操作日志、引擎调用状态以及策略变更。支持完整的安全合规追踪，防止内部越权或敏感配置篡改。
        </p>
      </div>

      {/* 日志列表 */}
      <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-4">
        {auditLogs.length === 0 ? (
          <div className="text-center py-12 text-[#78716c]">
            <History className="w-10 h-10 mx-auto mb-3 text-[#d6d3d1]" />
            <p className="text-sm font-medium">暂无审计日志</p>
            <p className="text-xs mt-1">执行操作后，日志将自动记录</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-[#e7e5e4] text-[#78716c] font-semibold text-xs uppercase">
                  <th className="py-3 px-4">事件 ID</th>
                  <th className="py-3 px-4">操作时间</th>
                  <th className="py-3 px-4">操作账户</th>
                  <th className="py-3 px-4">事件描述</th>
                  <th className="py-3 px-4">操作 IP</th>
                  <th className="py-3 px-4 text-right">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f5f5f4] font-mono text-xs">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#fafaf9] transition-colors">
                    <td className="py-3.5 px-4 font-bold text-stone-500">{log.id}</td>
                    <td className="py-3.5 px-4 text-stone-600">
                      {new Date(log.time).toLocaleString("zh-CN")}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 font-semibold text-[#1c1917]">
                        <User className="w-3.5 h-3.5 text-stone-400" />
                        {log.user || "system"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-sans text-sm text-[#1c1917] font-medium">{log.action}</td>
                    <td className="py-3.5 px-4 text-stone-500">{log.ip}</td>
                    <td className="py-3.5 px-4 text-right">
                      {log.status === "success" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 font-sans font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          成功
                        </span>
                      ) : log.status === "failed" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-50 border border-red-100 text-red-700 font-sans font-bold">
                          <Terminal className="w-3.5 h-3.5" />
                          失败
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-100 text-amber-700 font-sans font-bold">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          警告
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
