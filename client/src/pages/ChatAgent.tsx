import React, { useState, useRef, useEffect } from "react";
import { useApp, ChatMessage, ChatSession } from "@/contexts/AppContext";
import { 
  Send, 
  Sparkles, 
  Bot, 
  User, 
  Plus, 
  Trash2, 
  MessageSquare, 
  ArrowRight,
  ChevronRight,
  ShieldAlert
} from "lucide-react";
import { toast } from "sonner";

export default function ChatAgent() {
  const { 
    chatSessions, 
    activeSessionId, 
    setActiveSessionId, 
    createNewSession, 
    deleteSession, 
    sendChatMessage, 
    isChatTyping, 
    setActiveTab 
  } = useApp();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Active Session
  const activeSession = chatSessions.find(s => s.id === activeSessionId) || chatSessions[0];

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages, isChatTyping]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendChatMessage(input);
    setInput("");
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendChatMessage(suggestion);
  };

  const handleActionClick = (action: string) => {
    if (action.includes("Secured-Payment-Gateway") || action.includes("支付")) {
      setActiveTab("projects");
      toast.info("已为您自动切换到项目工作区：Secured-Payment-Gateway");
    } else if (action.includes("AI-Chat-Agent")) {
      setActiveTab("projects");
      toast.info("已为您自动切换到项目工作区：AI-Chat-Agent");
    } else if (action.includes("规则")) {
      setActiveTab("rules");
    } else if (action.includes("审计")) {
      setActiveTab("projects");
    } else if (action.includes("指标")) {
      setActiveTab("engine");
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn h-[calc(100vh-11rem)] flex flex-col">
      {/* 头部标题 */}
      <div className="space-y-1 shrink-0">
        <h2 className="text-xl font-bold tracking-tight text-[#1c1917] flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-600" />
          智能对话漏洞挖掘
        </h2>
        <p className="text-sm text-[#78716c]">
          通过自然语言智能体交互，引导底层 AI 漏洞挖掘引擎进行高精度、指向性的定向漏洞挖掘与安全审计。
        </p>
      </div>

      {/* 左右结构主面板 */}
      <div className="flex-1 bg-white border border-[#e7e5e4] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.01)] flex min-h-0 overflow-hidden">
        
        {/* 左侧会话历史列表 (w-72) */}
        <div className="w-72 border-r border-[#e7e5e4] flex flex-col justify-between bg-[#fafaf9] shrink-0">
          <div className="p-4 border-b border-[#e7e5e4] flex items-center justify-between">
            <span className="text-xs font-bold text-[#57534e] uppercase tracking-wider">历史挖掘会话</span>
            <button
              onClick={createNewSession}
              className="p-1.5 bg-white border border-[#e7e5e4] hover:border-blue-600 hover:text-blue-700 text-[#57534e] rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-1 shadow-sm"
              title="新建会话"
            >
              <Plus className="w-4 h-4" />
              新建
            </button>
          </div>

          {/* 会话列表滚动区 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {chatSessions.map((sess: ChatSession) => {
              const isActive = sess.id === activeSessionId;
              return (
                <div
                  key={sess.id}
                  onClick={() => setActiveSessionId(sess.id)}
                  className={`p-3 rounded-lg border transition-all duration-200 cursor-pointer flex flex-col gap-1.5 relative group ${
                    isActive
                      ? "bg-white border-blue-600 shadow-sm"
                      : "border-transparent hover:bg-stone-100/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <MessageSquare className={`w-4 h-4 shrink-0 ${isActive ? "text-blue-600" : "text-[#78716c]"}`} />
                      <span className={`text-xs font-bold truncate ${isActive ? "text-blue-700" : "text-[#1c1917]"}`}>
                        {sess.title}
                      </span>
                    </div>
                    {chatSessions.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession(sess.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-stone-400 hover:text-red-600 rounded hover:bg-stone-100 transition-all duration-200 shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-[#78716c] truncate leading-normal">
                    {sess.lastMessage}
                  </p>
                  <span className="text-[9px] text-stone-400 block text-right">
                    {sess.time}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右侧对话流 (Manus 风格) */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          {activeSession ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* 消息历史滚动区 */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {activeSession.messages.map((msg: ChatMessage) => {
                  const isAI = msg.sender === "ai";
                  return (
                    <div 
                      key={msg.id} 
                      className={`flex gap-4 max-w-3xl ${isAI ? "" : "ml-auto flex-row-reverse"}`}
                    >
                      {/* 头像 */}
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        isAI 
                          ? "bg-blue-50 text-blue-600 border-blue-100 shadow-sm" 
                          : "bg-stone-100 text-stone-600 border-stone-200"
                      }`}>
                        {isAI ? <Sparkles className="w-4 h-4" /> : <User className="w-4 h-4" />}
                      </div>

                      {/* 消息气泡 */}
                      <div className="space-y-2">
                        <div className={`p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-line shadow-[0_2px_8px_rgba(0,0,0,0.01)] ${
                          isAI 
                            ? "bg-[#fafaf9] border border-[#e7e5e4] text-[#1c1917] rounded-tl-none" 
                            : "bg-blue-600 text-white rounded-tr-none font-medium"
                        }`}>
                          {msg.text}
                        </div>

                        {/* AI 智能交互卡片（如果是 AI 且有推荐操作） */}
                        {isAI && msg.suggestions && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {msg.suggestions.map((sug: string, idx: number) => (
                              <button
                                key={idx}
                                onClick={() => handleActionClick(sug)}
                                className="px-3 py-1.5 bg-white border border-[#e7e5e4] hover:border-blue-600 hover:text-blue-700 rounded-lg text-xs font-bold transition-all duration-200 inline-flex items-center gap-1 shadow-sm"
                              >
                                {sug}
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            ))}
                          </div>
                        )}

                        <span className="text-[10px] text-stone-400 block px-1">
                          {msg.time}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* AI 输入状态 */}
                {isChatTyping && (
                  <div className="flex gap-4 max-w-3xl">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 shadow-sm flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 animate-spin" />
                    </div>
                    <div className="bg-[#fafaf9] border border-[#e7e5e4] p-4 rounded-2xl rounded-tl-none text-sm text-stone-500 inline-flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                      <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                      <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                      AI 智能体正在编译引导指令并分析控制流图谱...
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* 底部输入框 */}
              <div className="p-4 border-t border-[#e7e5e4] bg-[#fafaf9] shrink-0">
                {/* 快捷推荐提示词 */}
                {activeSession.messages[activeSession.messages.length - 1]?.sender === "ai" && !isChatTyping && activeSession.messages[activeSession.messages.length - 1]?.suggestions === undefined && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    <button
                      onClick={() => handleSuggestionClick("帮我扫描 Secured-Payment-Gateway 项目中的越权漏洞")}
                      className="px-2.5 py-1 bg-white border border-[#e7e5e4] hover:border-blue-500 hover:text-blue-700 rounded-full text-[11px] font-semibold text-stone-600 transition-colors"
                    >
                      🔍 扫描 Secured-Payment-Gateway 越权漏洞
                    </button>
                    <button
                      onClick={() => handleSuggestionClick("深度分析 AI-Chat-Agent 提示词注入风险")}
                      className="px-2.5 py-1 bg-white border border-[#e7e5e4] hover:border-blue-500 hover:text-blue-700 rounded-full text-[11px] font-semibold text-stone-600 transition-colors"
                    >
                      🧠 审计 AI-Chat-Agent 提示词注入风险
                    </button>
                    <button
                      onClick={() => handleSuggestionClick("查看当前全部检测规则")}
                      className="px-2.5 py-1 bg-white border border-[#e7e5e4] hover:border-blue-500 hover:text-blue-700 rounded-full text-[11px] font-semibold text-stone-600 transition-colors"
                    >
                      ⚙️ 查看当前规则配置
                    </button>
                  </div>
                )}

                <form onSubmit={handleSend} className="flex gap-3">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="请输入您的引导指令，例如：‘帮我扫描支付网关项目中的高危逻辑漏洞’..."
                    className="flex-1 px-4 py-2.5 border border-[#e7e5e4] rounded-xl text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-inner"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isChatTyping}
                    className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white rounded-xl text-sm font-bold transition-colors shadow-sm flex items-center gap-1.5"
                  >
                    <Send className="w-4 h-4" />
                    发送
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-stone-400 text-xs gap-1.5">
              <MessageSquare className="w-10 h-10 text-stone-300 animate-pulse" />
              请选择或创建一个会话历史以开始 AI 智能对话挖掘。
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
