import React from "react";
import { useApp } from "@/contexts/AppContext";
import { 
  ShieldAlert, 
  LayoutDashboard, 
  Zap, 
  FolderGit2, 
  BookOpen, 
  FileText, 
  Settings, 
  History, 
  Cpu, 
  Bell,
  Sparkles
} from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { activeTab, setActiveTab } = useApp();

  const menuItems = [
    { id: "overview", label: "概览统计", icon: LayoutDashboard },
    { id: "chat-agent", label: "智能对话", icon: Sparkles },
    { id: "quick-scan", label: "快速检测", icon: Zap },
    { id: "projects", label: "项目管理", icon: FolderGit2 },
    { id: "rules", label: "规则管理", icon: BookOpen },
    { id: "reports", label: "报告管理", icon: FileText },
    { id: "engine", label: "引擎管理", icon: Cpu },
    { id: "audit", label: "日志审计", icon: History },
    { id: "settings", label: "模型设置", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#fafaf9] text-[#1c1917] flex font-sans antialiased">
      {/* 侧边栏 - 优化排版收窄至 w-56 (从 w-64) 以减少左侧空白，让主体区域更大 */}
      <aside className="w-56 bg-white border-r border-[#e7e5e4] flex flex-col justify-between sticky top-0 h-screen z-20">
        <div className="flex flex-col">
          {/* Logo */}
          <div className="p-5 border-b border-[#e7e5e4] flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/10 shrink-0">
              <ShieldAlert className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-sm tracking-tight text-[#1c1917] truncate">AI-Vuln Scanner</h1>
              <p className="text-[10px] text-[#78716c] font-medium truncate">AI 漏洞挖掘平台</p>
            </div>
          </div>

          {/* 导航菜单 */}
          <nav className="p-4 space-y-1.5 flex-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-[#f5f5f4] text-blue-700 shadow-sm shadow-stone-100 font-semibold"
                      : "text-[#57534e] hover:bg-[#fafaf9] hover:text-[#1c1917]"
                  }`}
                >
                  <Icon className={`w-4.5 h-4.5 ${isActive ? "text-blue-600" : "text-[#78716c]"}`} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* 侧边栏底部用户信息 */}
        <div className="p-4 border-t border-[#e7e5e4] bg-[#fafaf9]">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <div className="w-9 h-9 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 font-bold text-sm">
              AD
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#1c1917] truncate">Administrator</p>
              <p className="text-xs text-[#78716c] truncate">admin@manus.security</p>
            </div>
          </div>
        </div>
      </aside>

      {/* 主工作区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部通栏 */}
        <header className="h-16 bg-white border-b border-[#e7e5e4] px-8 flex items-center justify-between sticky top-0 z-10 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
              V3.0.0 PRO
            </span>
            <div className="h-4 w-[1px] bg-[#e7e5e4]"></div>
            <p className="text-xs text-[#78716c] font-medium">AI 漏洞挖掘平台</p>
          </div>

          <div className="flex items-center gap-4">
            {/* 消息通知 */}
            <button className="relative p-2 text-[#57534e] hover:bg-[#fafaf9] rounded-lg transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-600 rounded-full ring-2 ring-white"></span>
            </button>
            <div className="h-5 w-[1px] bg-[#e7e5e4]"></div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-xs font-bold text-emerald-600">AI 分析引擎就绪</span>
            </div>
          </div>
        </header>

        {/* 页面主内容 - 移除 mx-auto 居中，改为左对齐（紧贴侧边栏），并采用 w-full 撑满宽度，彻底消除左侧空白 */}
        <main className="flex-1 p-8 overflow-y-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
