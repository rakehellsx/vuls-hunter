import React, { useState, useEffect } from "react";
import {
  Settings as SettingsIcon,
  Plus,
  Trash2,
  CheckCircle,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Zap,
  Star,
  Save,
  RefreshCw,
  Bot,
  Link,
  Key,
  Cpu,
  Server,
  Globe,
  Layers,
  MessageSquare,
  ScanLine,
} from "lucide-react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface LLMProvider {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  api_key_masked?: string;
  model: string;
  enabled: boolean;
  is_default: boolean;
  provider_type?: string;
  opencode_server_url?: string;
  opencode_provider_id?: string;
  opencode_model_id?: string;
}

interface LLMSettings {
  providers: LLMProvider[];
  active_provider_id: string | null;
}

interface OpenCodeSettings {
  server_url: string;
  api_key: string;
  enabled: boolean;
}

type TestStatus = "idle" | "testing" | "success" | "failed";

// ─────────────────────────────────────────────
// Preset LLM providers (OpenAI-compatible only)
// ─────────────────────────────────────────────

const PRESET_PROVIDERS: Array<Partial<LLMProvider> & { name: string }> = [
  { name: "OpenAI", base_url: "https://api.openai.com/v1", model: "gpt-4o", provider_type: "openai_compatible" },
  { name: "DeepSeek", base_url: "https://api.deepseek.com/v1", model: "deepseek-chat", provider_type: "openai_compatible" },
  { name: "Groq", base_url: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", provider_type: "openai_compatible" },
  { name: "Ollama (本地)", base_url: "http://localhost:11434/v1", model: "llama3", provider_type: "openai_compatible" },
];

// ─────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────

async function fetchLLMSettings(): Promise<LLMSettings> {
  const resp = await fetch("/api/settings/llm");
  if (!resp.ok) throw new Error("加载 LLM 配置失败");
  return resp.json();
}

async function saveLLMSettings(settings: LLMSettings): Promise<void> {
  const resp = await fetch("/api/settings/llm", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providers: settings.providers, active_provider_id: settings.active_provider_id }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "保存失败" }));
    throw new Error(err.detail || "保存失败");
  }
}

async function testLLMProvider(provider: LLMProvider): Promise<string> {
  const resp = await fetch("/api/settings/llm/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(provider),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.detail || "连接失败");
  return data.message;
}

async function fetchOpenCodeSettings(): Promise<OpenCodeSettings> {
  const resp = await fetch("/api/settings/opencode");
  if (!resp.ok) throw new Error("加载 OpenCode 配置失败");
  return resp.json();
}

async function saveOpenCodeSettings(cfg: OpenCodeSettings): Promise<void> {
  const resp = await fetch("/api/settings/opencode", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "保存失败" }));
    throw new Error(err.detail || "保存失败");
  }
}

async function testOpenCodeConnection(cfg: OpenCodeSettings): Promise<string> {
  const resp = await fetch("/api/settings/opencode/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.detail || "连接失败");
  return data.message;
}

// ─────────────────────────────────────────────
// OpenCode 独立配置卡片（智能对话专用）
// ─────────────────────────────────────────────

function OpenCodeSection() {
  const [cfg, setCfg] = useState<OpenCodeSettings>({
    server_url: "http://localhost:4096",
    api_key: "",
    enabled: true,
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState("");

  useEffect(() => {
    fetchOpenCodeSettings().then(setCfg).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleTest = async () => {
    setTestStatus("testing");
    setTestMessage("");
    try {
      const msg = await testOpenCodeConnection(cfg);
      setTestStatus("success");
      setTestMessage(msg);
    } catch (e: any) {
      setTestStatus("failed");
      setTestMessage(e.message || "连接失败");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveOpenCodeSettings(cfg);
      setSaveMsg({ type: "success", text: "OpenCode 配置已保存！" });
      const fresh = await fetchOpenCodeSettings();
      setCfg(fresh);
    } catch (e: any) {
      setSaveMsg({ type: "error", text: e.message || "保存失败" });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 4000);
    }
  };

  if (loading) return (
    <div className="flex items-center gap-2 text-stone-400 text-sm py-4">
      <Loader2 className="w-4 h-4 animate-spin" /> 加载 OpenCode 配置...
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-[#1c1917] flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-violet-600" /> 智能对话引擎配置
          </h2>
          <p className="text-sm text-[#78716c]">
            智能对话模块专用配置，使用 OpenCode Server 提供 AI 对话能力。与下方扫描引擎配置完全独立。
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveMsg && (
            <span className={`text-xs font-bold flex items-center gap-1 ${saveMsg.type === "success" ? "text-green-600" : "text-red-500"}`}>
              {saveMsg.type === "success" ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {saveMsg.text}
            </span>
          )}
          <button
            onClick={() => fetchOpenCodeSettings().then(setCfg)}
            className="p-2 border border-[#e7e5e4] rounded-lg text-stone-500 hover:text-stone-700 hover:border-stone-300 transition-colors bg-white"
            title="重新加载"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-violet-700 hover:bg-violet-800 disabled:bg-violet-300 text-white rounded-xl text-sm font-bold transition-colors shadow-sm flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 保存配置
          </button>
        </div>
      </div>

      {/* OpenCode card */}
      <div className={`border-2 rounded-xl p-5 transition-all duration-200 ${cfg.enabled ? "border-violet-400 bg-violet-50/30 shadow-sm" : "border-[#e7e5e4] bg-stone-50/50 opacity-70"}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${cfg.enabled ? "bg-violet-600 text-white border-violet-600" : "bg-violet-50 text-violet-400 border-violet-200"}`}>
              <Server className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#1c1917]">OpenCode Server</p>
              <span className="text-[10px] text-violet-500 bg-violet-100 px-1.5 py-0.5 rounded font-bold">智能对话专用</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCfg((prev) => ({ ...prev, enabled: !prev.enabled }))}
              className={`relative w-10 h-5 rounded-full transition-colors ${cfg.enabled ? "bg-violet-600" : "bg-stone-300"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${cfg.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
            {cfg.enabled && (
              <span className="text-[10px] text-violet-600 font-bold flex items-center gap-0.5">
                <Star className="w-2.5 h-2.5 fill-current" /> 已启用
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-stone-500 flex items-center gap-1 mb-1">
              <Globe className="w-3 h-3" /> Server 地址
            </label>
            <input
              type="url"
              value={cfg.server_url}
              onChange={(e) => setCfg((prev) => ({ ...prev, server_url: e.target.value }))}
              placeholder="http://localhost:4096"
              className="w-full px-3 py-2 text-sm border border-[#e7e5e4] rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono"
            />
            <p className="text-[10px] text-stone-400 mt-0.5">OpenCode Server 的 HTTP 地址（默认端口 4096）</p>
          </div>
          <div>
            <label className="text-xs font-bold text-stone-500 flex items-center gap-1 mb-1">
              <Key className="w-3 h-3" /> API Key <span className="text-stone-400 font-normal">(可选)</span>
            </label>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={cfg.api_key}
                onChange={(e) => setCfg((prev) => ({ ...prev, api_key: e.target.value }))}
                placeholder="如不需要认证可留空"
                className="w-full px-3 py-2 pr-10 text-sm border border-[#e7e5e4] rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-stone-400 mt-0.5">若 OpenCode Server 需要认证，请填写 API Key</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleTest}
            disabled={testStatus === "testing" || !cfg.server_url}
            className="px-3 py-1.5 text-xs font-bold border border-[#e7e5e4] rounded-lg hover:border-violet-400 hover:text-violet-600 transition-colors disabled:opacity-50 flex items-center gap-1.5 bg-white"
          >
            {testStatus === "testing" ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 测试中...</> : <><Zap className="w-3.5 h-3.5" /> 测试连接</>}
          </button>
          {testStatus === "success" && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> {testMessage}</span>}
          {testStatus === "failed" && <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {testMessage}</span>}
        </div>
      </div>

      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-1.5">
        <p className="text-xs font-bold text-violet-800">使用说明</p>
        <ul className="text-xs text-violet-700 space-y-1 list-disc list-inside">
          <li>智能对话模块<strong>固定使用</strong>此配置，不受下方扫描引擎配置影响</li>
          <li>先在服务器运行 <code className="bg-violet-100 px-1 rounded">opencode serve --hostname 0.0.0.0 --port 4096</code></li>
          <li>填写 Server 地址后点击「测试连接」确认可用，再点击「保存配置」</li>
          <li>API Key 为可选项，仅在 Server 开启认证时需要填写</li>
        </ul>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// LLM Provider Card（扫描引擎专用，OpenAI 兼容）
// ─────────────────────────────────────────────

function ProviderCard({
  provider, isActive, onUpdate, onDelete, onSetActive, onTest, testStatus, testMessage,
}: {
  provider: LLMProvider; isActive: boolean;
  onUpdate: (p: LLMProvider) => void; onDelete: () => void;
  onSetActive: () => void; onTest: () => void;
  testStatus: TestStatus; testMessage: string;
}) {
  const [showKey, setShowKey] = useState(false);
  const displayKey = showKey
    ? provider.api_key
    : (provider.api_key_masked || (provider.api_key ? "•".repeat(Math.min(provider.api_key.length, 24)) : ""));

  return (
    <div className={`border rounded-xl p-5 transition-all duration-200 ${isActive ? "border-blue-500 bg-blue-50/30 shadow-sm" : provider.enabled ? "border-[#e7e5e4] bg-white hover:border-stone-300" : "border-[#e7e5e4] bg-stone-50/50 opacity-60"}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${isActive ? "bg-blue-600 text-white border-blue-600" : "bg-white text-stone-600 border-[#e7e5e4]"}`}>
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <input
              type="text"
              value={provider.name}
              onChange={(e) => onUpdate({ ...provider, name: e.target.value })}
              className="text-sm font-bold text-[#1c1917] bg-transparent border-none outline-none focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1 w-44"
              placeholder="提供商名称"
            />
            {isActive && (
              <span className="text-[10px] text-blue-600 font-bold flex items-center gap-0.5">
                <Star className="w-2.5 h-2.5 fill-current" /> 当前使用
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onUpdate({ ...provider, enabled: !provider.enabled })}
            className={`relative w-10 h-5 rounded-full transition-colors ${provider.enabled ? "bg-blue-600" : "bg-stone-300"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${provider.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
          {!isActive && provider.enabled && (
            <button onClick={onSetActive} className="px-2.5 py-1 text-xs font-bold text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
              设为默认
            </button>
          )}
          {!provider.is_default && (
            <button onClick={onDelete} className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-stone-500 flex items-center gap-1 mb-1"><Link className="w-3 h-3" /> API Base URL</label>
          <input
            type="url"
            value={provider.base_url}
            onChange={(e) => onUpdate({ ...provider, base_url: e.target.value })}
            placeholder="https://api.openai.com/v1"
            className="w-full px-3 py-2 text-sm border border-[#e7e5e4] rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
          />
          <p className="text-[10px] text-stone-400 mt-0.5">填写 OpenAI 兼容的 base URL（不含 /chat/completions）</p>
        </div>
        <div>
          <label className="text-xs font-bold text-stone-500 flex items-center gap-1 mb-1"><Key className="w-3 h-3" /> API Key</label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={showKey ? provider.api_key : displayKey}
              onChange={(e) => { if (showKey) onUpdate({ ...provider, api_key: e.target.value }); }}
              onFocus={() => setShowKey(true)}
              placeholder="sk-..."
              className="w-full px-3 py-2 pr-10 text-sm border border-[#e7e5e4] rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            />
            <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-stone-500 flex items-center gap-1 mb-1"><Cpu className="w-3 h-3" /> 模型名称</label>
          <input
            type="text"
            value={provider.model}
            onChange={(e) => onUpdate({ ...provider, model: e.target.value })}
            placeholder="gpt-4o / deepseek-chat / llama3..."
            className="w-full px-3 py-2 text-sm border border-[#e7e5e4] rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={onTest}
          disabled={testStatus === "testing" || !provider.api_key || !provider.base_url}
          className="px-3 py-1.5 text-xs font-bold border border-[#e7e5e4] rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50 flex items-center gap-1.5 bg-white"
        >
          {testStatus === "testing" ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 测试中...</> : <><Zap className="w-3.5 h-3.5" /> 测试连接</>}
        </button>
        {testStatus === "success" && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> {testMessage}</span>}
        {testStatus === "failed" && <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {testMessage}</span>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// LLM Section（扫描引擎专用）
// ─────────────────────────────────────────────

function LLMSection() {
  const [settings, setSettings] = useState<LLMSettings>({ providers: [], active_provider_id: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [testStatuses, setTestStatuses] = useState<Record<string, { status: TestStatus; message: string }>>({});

  useEffect(() => {
    fetchLLMSettings().then(setSettings).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleUpdate = (id: string, updated: LLMProvider) =>
    setSettings((prev) => ({ ...prev, providers: prev.providers.map((p) => (p.id === id ? updated : p)) }));

  const handleDelete = (id: string) =>
    setSettings((prev) => ({
      ...prev,
      providers: prev.providers.filter((p) => p.id !== id),
      active_provider_id: prev.active_provider_id === id
        ? (prev.providers.find((p) => p.id !== id)?.id ?? null)
        : prev.active_provider_id,
    }));

  const handleSetActive = (id: string) => setSettings((prev) => ({ ...prev, active_provider_id: id }));

  const handleAddPreset = (preset: typeof PRESET_PROVIDERS[0]) => {
    const newId = `provider-${Date.now()}`;
    setSettings((prev) => ({
      ...prev,
      providers: [...prev.providers, {
        id: newId,
        name: preset.name,
        base_url: preset.base_url || "",
        api_key: "",
        model: preset.model || "",
        enabled: true,
        is_default: false,
        provider_type: "openai_compatible",
        opencode_server_url: "",
        opencode_provider_id: "openai",
        opencode_model_id: "gpt-4.1-mini",
      }],
    }));
  };

  const handleAddCustom = () => {
    const newId = `custom-${Date.now()}`;
    setSettings((prev) => ({
      ...prev,
      providers: [...prev.providers, {
        id: newId, name: "自定义提供商", base_url: "", api_key: "", model: "gpt-4o",
        enabled: true, is_default: false, provider_type: "openai_compatible",
        opencode_server_url: "", opencode_provider_id: "openai", opencode_model_id: "gpt-4.1-mini",
      }],
    }));
  };

  const handleTest = async (provider: LLMProvider) => {
    setTestStatuses((prev) => ({ ...prev, [provider.id]: { status: "testing", message: "" } }));
    try {
      const msg = await testLLMProvider(provider);
      setTestStatuses((prev) => ({ ...prev, [provider.id]: { status: "success", message: msg } }));
    } catch (e: any) {
      setTestStatuses((prev) => ({ ...prev, [provider.id]: { status: "failed", message: e.message || "连接失败" } }));
    }
  };

  const handleSave = async () => {
    setSaving(true); setSaveMsg(null);
    try {
      await saveLLMSettings(settings);
      setSaveMsg({ type: "success", text: "扫描引擎配置已保存！" });
      const fresh = await fetchLLMSettings();
      setSettings(fresh);
    } catch (e: any) {
      setSaveMsg({ type: "error", text: e.message || "保存失败" });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 4000);
    }
  };

  if (loading) return (
    <div className="flex items-center gap-2 text-stone-400 text-sm py-4">
      <Loader2 className="w-4 h-4 animate-spin" /> 加载扫描引擎配置...
    </div>
  );

  const activeProvider = settings.providers.find((p) => p.id === settings.active_provider_id);

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-[#1c1917] flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-blue-600" /> 扫描引擎 LLM 配置
          </h2>
          <p className="text-sm text-[#78716c]">
            漏洞扫描、规则编译等模块使用的 LLM 提供商配置，支持 OpenAI 兼容接口（DeepSeek、Groq、Ollama 等）。
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveMsg && (
            <span className={`text-xs font-bold flex items-center gap-1 ${saveMsg.type === "success" ? "text-green-600" : "text-red-500"}`}>
              {saveMsg.type === "success" ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {saveMsg.text}
            </span>
          )}
          <button
            onClick={() => fetchLLMSettings().then(setSettings)}
            className="p-2 border border-[#e7e5e4] rounded-lg text-stone-500 hover:text-stone-700 hover:border-stone-300 transition-colors bg-white"
            title="重新加载"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white rounded-xl text-sm font-bold transition-colors shadow-sm flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 保存配置
          </button>
        </div>
      </div>

      {/* Active provider banner */}
      {activeProvider && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <Star className="w-4 h-4 fill-current shrink-0 text-blue-600" />
          <div>
            <p className="text-sm font-bold text-blue-800">当前激活：{activeProvider.name}</p>
            <p className="text-xs text-blue-600">模型：{activeProvider.model} · {activeProvider.base_url}</p>
          </div>
        </div>
      )}

      {/* Provider cards */}
      <div className="space-y-4">
        {settings.providers.map((provider) => {
          const ts = testStatuses[provider.id] || { status: "idle" as TestStatus, message: "" };
          return (
            <ProviderCard
              key={provider.id}
              provider={provider}
              isActive={provider.id === settings.active_provider_id}
              onUpdate={(updated) => handleUpdate(provider.id, updated)}
              onDelete={() => handleDelete(provider.id)}
              onSetActive={() => handleSetActive(provider.id)}
              onTest={() => handleTest(provider)}
              testStatus={ts.status}
              testMessage={ts.message}
            />
          );
        })}
      </div>

      {/* Add provider */}
      <div className="border border-dashed border-[#e7e5e4] rounded-xl p-5 space-y-3">
        <p className="text-sm font-bold text-stone-600 flex items-center gap-2"><Plus className="w-4 h-4" /> 添加提供商</p>
        <div className="flex flex-wrap gap-2">
          {PRESET_PROVIDERS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => handleAddPreset(preset)}
              className="px-3 py-1.5 bg-white border border-[#e7e5e4] hover:border-blue-400 hover:text-blue-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 text-stone-600"
            >
              <Bot className="w-3.5 h-3.5" /> {preset.name}
            </button>
          ))}
          <button
            onClick={handleAddCustom}
            className="px-3 py-1.5 bg-white border border-dashed border-stone-300 hover:border-blue-400 hover:text-blue-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 text-stone-500"
          >
            <Plus className="w-3.5 h-3.5" /> 自定义
          </button>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1.5">
        <p className="text-xs font-bold text-amber-800">扫描引擎使用说明</p>
        <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
          <li>此配置仅用于漏洞扫描、规则编译等模块，<strong>不影响智能对话</strong></li>
          <li>支持 OpenAI、DeepSeek、Groq、Ollama 等 OpenAI 兼容接口</li>
          <li>Base URL 填写到 <code className="bg-amber-100 px-1 rounded">/v1</code> 即可，无需加 /chat/completions</li>
          <li>保存后立即生效，无需重启服务</li>
        </ul>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Settings page
// ─────────────────────────────────────────────

export default function Settings() {
  return (
    <div className="space-y-10 animate-fadeIn">
      {/* Page title */}
      <div className="flex items-center gap-2 pb-2 border-b border-[#e7e5e4]">
        <SettingsIcon className="w-5 h-5 text-stone-500" />
        <h1 className="text-lg font-bold text-[#1c1917]">模型设置</h1>
        <span className="text-xs text-stone-400 ml-1">两套配置相互独立，分别管理</span>
      </div>

      {/* Section 1: OpenCode (chat) */}
      <OpenCodeSection />

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-dashed border-[#e7e5e4]" /></div>
        <div className="relative flex justify-center">
          <span className="bg-[#fafaf9] px-4 text-xs text-stone-400 font-bold">扫描引擎配置（与智能对话独立）</span>
        </div>
      </div>

      {/* Section 2: LLM (scan engine) */}
      <LLMSection />
    </div>
  );
}
