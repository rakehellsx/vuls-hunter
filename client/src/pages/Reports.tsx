import React from "react";
import { useApp } from "@/contexts/AppContext";
import { 
  FileText, 
  Download, 
  ExternalLink, 
  Calendar, 
  Folder,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";
import { toast } from "sonner";

export default function Reports() {
  const { reports } = useApp();

  const handleDownload = (reportName: string) => {
    toast.success(`安全审计报告 ${reportName} 已成功生成 PDF/Markdown，开始自动下载...`);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 头部标题 */}
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight text-[#1c1917]">安全审计报告管理</h2>
        <p className="text-sm text-[#78716c]">
          系统每次安全审计完成后，均会自动生成符合行业标准的深度安全审计报告。支持一键导出为 PDF、Markdown 及 CSV 格式。
        </p>
      </div>

      {/* 报告列表表格 */}
      <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-4">
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
              {reports.map((r) => {
                const totalVulns = r.vulnerabilityCount.critical + r.vulnerabilityCount.high + r.vulnerabilityCount.medium + r.vulnerabilityCount.low;
                const isPassed = r.vulnerabilityCount.critical === 0 && r.vulnerabilityCount.high === 0;

                return (
                  <tr key={r.id} className="hover:bg-[#fafaf9] transition-colors">
                    <td className="py-4 px-4 font-mono text-xs font-bold text-blue-700">{r.id}</td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <Folder className="w-4 h-4 text-[#78716c]" />
                        <span className="font-semibold text-[#1c1917]">{r.projectName}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-[#57534e] text-xs inline-flex items-center gap-1.5 mt-1">
                      <Calendar className="w-3.5 h-3.5 text-stone-400" />
                      {r.scanTime}
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
                      {isPassed ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold">
                          <CheckCircle2 className="w-3 h-3" />
                          通过 (A+)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-50 border border-red-100 text-red-700 text-xs font-bold animate-pulse">
                          <AlertTriangle className="w-3 h-3" />
                          整改中 (D-)
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleDownload(r.projectName)}
                          className="p-1.5 border border-[#e7e5e4] hover:bg-white hover:text-blue-700 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1"
                          title="下载 PDF 报告"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => toast.info(`正在跳转查看在线审计报告详情: ${r.fileUrl}`)}
                          className="p-1.5 border border-[#e7e5e4] hover:bg-white hover:text-blue-700 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1"
                          title="在线预览"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
