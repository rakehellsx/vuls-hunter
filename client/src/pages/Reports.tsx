import React, { useState, useEffect, useCallback } from "react";
import { useApp } from "@/contexts/AppContext";
import { 
  FileText, 
  Download, 
  ExternalLink, 
  Calendar, 
  Folder,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { reportsApi } from "@/lib/api";
import { marked } from "marked";

// Configure marked for security
marked.setOptions({ breaks: true });

export default function Reports() {
  const { reports, refreshData } = useApp();
  const [previewMd, setPreviewMd] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Escape 键关闭预览 Modal
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape" && previewMd) {
      setPreviewMd(null);
    }
  }, [previewMd]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshData();
    setIsRefreshing(false);
  };

  const handleDownload = async (report: typeof reports[0]) => {
    if (!report._backendId) {
      toast.info(`报告 ${report.id} 尚未关联后端数据`);
      return;
    }
    setLoadingId(report.id + "-dl");
    try {
      const md = await reportsApi.getMarkdown(report._backendId);
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.id}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`安全审计报告 ${report.id} 已开始下载！`);
    } catch (err) {
      toast.error(`下载失败: ${err}`);
    } finally {
      setLoadingId(null);
    }
  };

  const handlePreview = async (report: typeof reports[0]) => {
    if (!report._backendId) {
      toast.info("该报告暂无详细内容");
      return;
    }
    setLoadingId(report.id + "-pv");
    try {
      const md = await reportsApi.getMarkdown(report._backendId);
      setPreviewMd(md);
      setPreviewTitle(report.id);
    } catch (err) {
      toast.error(`加载报告失败: ${err}`);
    } finally {
      setLoadingId(null);
    }
  };

  const getGrade = (report: typeof reports[0]) => {
    return report.complianceGrade || (
      report.vulnerabilityCount.critical === 0 && report.vulnerabilityCount.high === 0 ? "A+" : "D-"
    );
  };

  const isPassed = (report: typeof reports[0]) => {
    const grade = getGrade(report);
    return ["A+", "A", "B+", "B"].includes(grade);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 头部标题 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-[#1c1917]">安全审计报告管理</h2>
          <p className="text-sm text-[#78716c]">
            系统每次安全审计完成后，均会自动生成符合行业标准的深度安全审计报告。支持一键导出为 Markdown 格式。
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

      {/* 报告列表表格 */}
      <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-4">
        {reports.length === 0 ? (
          <div className="text-center py-12 text-[#78716c]">
            <FileText className="w-10 h-10 mx-auto mb-3 text-[#d6d3d1]" />
            <p className="text-sm font-medium">暂无审计报告</p>
            <p className="text-xs mt-1">完成一次安全扫描后，报告将自动生成</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-[#e7e5e4] text-[#78716c] font-semibold text-xs uppercase">
                  <th className="py-3 px-4">报告 ID</th>
                  <th className="py-3 px-4">关联项目</th>
                  <th className="py-3 px-4">审计完成时间</th>
                  <th className="py-3 px-4">漏洞统计 (严重 / 高 / 中 / 低)</th>
                  <th className="py-3 px-4">合规评级</th>
                  <th className="py-3 px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f5f5f4]">
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-[#fafaf9] transition-colors">
                    <td className="py-4 px-4 font-mono text-xs font-bold text-blue-700">{r.id}</td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <Folder className="w-4 h-4 text-[#78716c]" />
                        <span className="font-semibold text-[#1c1917]">{r.projectName}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-[#57534e] text-xs">
                      <div className="inline-flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-stone-400" />
                        {new Date(r.scanTime).toLocaleString("zh-CN")}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-md border border-red-200">
                          {r.vulnerabilityCount.critical}
                        </span>
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-bold rounded-md border border-orange-200">
                          {r.vulnerabilityCount.high}
                        </span>
                        <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded-md border border-yellow-200">
                          {r.vulnerabilityCount.medium}
                        </span>
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-md border border-blue-200">
                          {r.vulnerabilityCount.low}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      {isPassed(r) ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold">
                          <CheckCircle2 className="w-3 h-3" />
                          通过 ({getGrade(r)})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-50 border border-red-100 text-red-700 text-xs font-bold">
                          <AlertTriangle className="w-3 h-3" />
                          整改中 ({getGrade(r)})
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleDownload(r)}
                          disabled={loadingId === r.id + "-dl"}
                          className="p-1.5 border border-[#e7e5e4] hover:bg-white hover:text-blue-700 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                          title="下载 Markdown 报告"
                        >
                          {loadingId === r.id + "-dl" ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button 
                          onClick={() => handlePreview(r)}
                          disabled={loadingId === r.id + "-pv"}
                          className="p-1.5 border border-[#e7e5e4] hover:bg-white hover:text-blue-700 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                          title="在线预览"
                        >
                          {loadingId === r.id + "-pv" ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ExternalLink className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 报告预览 Modal：支持 backdrop 点击关闭 + Escape 关闭 */}
      {previewMd && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setPreviewMd(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-[#e7e5e4] shrink-0">
              <h3 className="font-bold text-[#1c1917] flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                {previewTitle}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const report = reports.find(r => r.id === previewTitle);
                    if (report) handleDownload(report);
                  }}
                  className="p-1.5 hover:bg-[#f5f5f4] rounded-lg transition-colors text-[#78716c] hover:text-blue-700"
                  title="下载此报告"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPreviewMd(null)}
                  className="p-1.5 hover:bg-[#f5f5f4] rounded-lg transition-colors"
                  title="关闭 (Esc)"
                >
                  <X className="w-4 h-4 text-[#78716c]" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-6 flex-1">
              <div 
                className="report-preview"
                dangerouslySetInnerHTML={{ __html: marked(previewMd || '') as string }}
              />
            </div>
            <div className="p-3 border-t border-[#f5f5f4] text-center shrink-0">
              <span className="text-xs text-[#a8a29e]">按 Esc 或点击背景关闭</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
