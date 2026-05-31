import React, { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { 
  ClipboardList, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw,
  Filter,
  Search,
  User
} from "lucide-react";

export default function Audit() {
  const { auditLogs, refreshData } = useApp();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterLevel, setFilterLevel] = useState<"all" | "success" | "warning" | "failed">("all");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshData();
    setIsRefreshing(false);
    setPage(1);
  };

  const filtered = auditLogs.filter((log) => {
    const matchLevel = filterLevel === "all" || log.status === filterLevel;
    const matchSearch = !searchText || 
      log.action.toLowerCase().includes(searchText.toLowerCase()) ||
      (log.user || "").toLowerCase().includes(searchText.toLowerCase());
    return matchLevel && matchSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 头部标题 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-[#1c1917]">系统操作审计日志</h2>
          <p className="text-sm text-[#78716c]">
            记录平台所有操作日志、引擎调用状态与策略变更，提供完整的安全合规追踪链路。
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-3 py-2 border border-[#e7e5e4] text-[#57534e] rounded-lg text-xs font-semibold hover:bg-[#fafaf9] transition-colors flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          刷新
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-[#e7e5e4] rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs text-[#78716c] font-medium">成功操作</p>
            <p className="text-xl font-extrabold text-emerald-600">
              {auditLogs.filter(l => l.status === "success").length}
            </p>
          </div>
        </div>
        <div className="bg-white border border-[#e7e5e4] rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs text-[#78716c] font-medium">警告事件</p>
            <p className="text-xl font-extrabold text-amber-600">
              {auditLogs.filter(l => l.status === "warning").length}
            </p>
          </div>
        </div>
        <div className="bg-white border border-[#e7e5e4] rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-600">
            <XCircle className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs text-[#78716c] font-medium">失败操作</p>
            <p className="text-xl font-extrabold text-red-600">
              {auditLogs.filter(l => l.status === "failed").length}
            </p>
          </div>
        </div>
      </div>

      {/* 日志表格 */}
      <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-4">
        {/* 筛选栏 */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
            <input
              type="text"
              placeholder="搜索操作描述或用户..."
              value={searchText}
              onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 border border-[#e7e5e4] rounded-lg text-xs bg-[#fafaf9] focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-stone-400" />
            {(["all", "success", "warning", "failed"] as const).map((level) => (
              <button
                key={level}
                onClick={() => { setFilterLevel(level); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filterLevel === level
                    ? "bg-blue-600 text-white"
                    : "border border-[#e7e5e4] text-[#57534e] hover:bg-[#fafaf9]"
                }`}
              >
                {level === "all" ? "全部" : level === "success" ? "成功" : level === "warning" ? "警告" : "失败"}
              </button>
            ))}
          </div>
          <span className="text-xs text-[#78716c] font-medium ml-auto">
            共 {filtered.length} 条
          </span>
        </div>

        {auditLogs.length === 0 ? (
          <div className="text-center py-16 text-[#78716c]">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 text-[#d6d3d1]" />
            <p className="text-sm font-medium">暂无审计日志</p>
            <p className="text-xs mt-1">执行操作后，日志将自动记录在此处</p>
          </div>
        ) : paginated.length === 0 ? (
          <div className="text-center py-12 text-[#78716c]">
            <Search className="w-8 h-8 mx-auto mb-2 text-[#d6d3d1]" />
            <p className="text-sm font-medium">未找到匹配的日志记录</p>
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
                  <th className="py-3 px-4">来源 IP</th>
                  <th className="py-3 px-4 text-right">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f5f5f4]">
                {paginated.map((log) => (
                  <tr key={log.id} className="hover:bg-[#fafaf9] transition-colors">
                    <td className="py-3.5 px-4 font-mono text-xs font-bold text-stone-500">
                      #{log.id}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[#57534e] font-mono whitespace-nowrap">
                      {new Date(log.time).toLocaleString("zh-CN")}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#1c1917]">
                        <User className="w-3.5 h-3.5 text-stone-400" />
                        {log.user || "system"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[#1c1917] font-medium max-w-xs">
                      {log.action}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono text-[#78716c]">
                      {log.ip}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {log.status === "success" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold">
                          <CheckCircle2 className="w-3 h-3" />
                          成功
                        </span>
                      ) : log.status === "failed" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-50 border border-red-100 text-red-700 text-xs font-bold">
                          <XCircle className="w-3 h-3" />
                          失败
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-100 text-amber-700 text-xs font-bold">
                          <AlertTriangle className="w-3 h-3" />
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

        {/* 分页控件 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 border-t border-[#f5f5f4]">
            <span className="text-xs text-[#78716c]">
              第 {page} / {totalPages} 页，共 {filtered.length} 条
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-[#e7e5e4] rounded-lg text-xs font-semibold text-[#57534e] hover:bg-[#fafaf9] disabled:opacity-40 transition-colors"
              >
                上一页
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 border border-[#e7e5e4] rounded-lg text-xs font-semibold text-[#57534e] hover:bg-[#fafaf9] disabled:opacity-40 transition-colors"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
