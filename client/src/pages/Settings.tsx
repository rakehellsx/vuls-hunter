import React from "react";
import { useApp } from "@/contexts/AppContext";
import { 
  Settings as SettingsIcon, 
  GitBranch, 
  Cpu, 
  Code, 
  MessageSquare, 
  ShieldCheck,
  Check,
  X
} from "lucide-react";

export default function Settings() {
  const { integrations, toggleIntegration } = useApp();

  const integrationList = [
    {
      key: "git" as const,
      name: "Git 代码仓库自动同步",
      desc: "支持关联 GitHub、GitLab 及 SVN。开启后，每次代码提交（Commit）或 Pull Request 将自动触发 AI 增量安全审计。",
      icon: GitBranch,
    },
    {
      key: "jenkins" as const,
      name: "Jenkins CI/CD 流水线集成",
      desc: "将 AI 漏洞挖掘引擎无缝嵌入持续集成流水线中。在构建（Build）阶段自动执行代码拦截，防止带病代码交付。",
      icon: Cpu,
    },
    {
      key: "jira" as const,
      name: "Jira / 禅道缺陷同步",
      desc: "AI 自动审计发现的高危漏洞，可一键自动同步至 Jira 等项目管理工具，指派给对应开发人员跟进。",
      icon: Code,
    },
    {
      key: "vscode" as const,
      name: "IDE 插件端（VS Code / IntelliJ）",
      desc: "支持安全左移至编码阶段。开发者在编写代码时，通过 IDE 插件实时获取 AI 智能漏洞预警与修复建议。",
      icon: ShieldCheck,
    },
    {
      key: "dingtalk" as const,
      name: "消息推送（钉钉 / 企微 / 邮件）",
      desc: "安全审计任务完成或发现紧急高危漏洞时，自动向相关安全组推送实时告警与修复简报。",
      icon: MessageSquare,
    },
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 头部标题 */}
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight text-[#1c1917]">系统集成与管理</h2>
        <p className="text-sm text-[#78716c]">
          管理 AI 漏洞挖掘平台的第三方工具集成。支持一键对接主流代码仓库、CI/CD 流水线、项目管理工具及 IDE 插件。
        </p>
      </div>

      {/* 第三方对接列表 */}
      <div className="bg-white border border-[#e7e5e4] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)] space-y-6">
        <h3 className="text-base font-bold text-[#1c1917] flex items-center gap-2 border-b border-[#f5f5f4] pb-4">
          <SettingsIcon className="w-5 h-5 text-blue-600" />
          第三方集成生态 (Integrations Ecosystem)
        </h3>

        <div className="divide-y divide-[#f5f5f4]">
          {integrationList.map((item) => {
            const Icon = item.icon;
            const isEnabled = integrations[item.key];
            return (
              <div key={item.key} className="py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 first:pt-0 last:pb-0">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isEnabled ? "bg-blue-50 text-blue-600 border border-blue-100" : "bg-stone-100 text-[#78716c] border border-stone-200"
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-[#1c1917]">{item.name}</h4>
                    <p className="text-xs text-[#78716c] leading-relaxed max-w-xl">
                      {item.desc}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => toggleIntegration(item.key)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-1.5 shrink-0 border ${
                    isEnabled
                      ? "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                      : "bg-white border-[#e7e5e4] text-[#57534e] hover:bg-[#fafaf9]"
                  }`}
                >
                  {isEnabled ? (
                    <>
                      <Check className="w-4.5 h-4.5" />
                      已启用
                    </>
                  ) : (
                    <>
                      <X className="w-4.5 h-4.5" />
                      未启用
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
