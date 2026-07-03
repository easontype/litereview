"use client";

import { useEffect, useState } from "react";
import { Plus, Trash, PlugsConnected } from "@phosphor-icons/react";

type ProviderKind = "claude-cli" | "anthropic" | "openai" | "openai-compatible" | "gemini" | "mock";

interface ProviderView {
  id: string;
  kind: ProviderKind;
  label: string;
  baseUrl: string | null;
  models: string[];
  hasKey: boolean;
  keyPreview: string | null;
  builtin: boolean;
  /** 使用者這次輸入的新 key（空字串 = 沿用既有） */
  newKey: string;
}

type Seats = Record<string, { providerId: string; model: string }>;

const SEAT_ORDER = ["keypoints", "compare", "reviewer", "proponent", "opponent", "judge"] as const;
const SEAT_LABEL: Record<string, string> = {
  keypoints: "找重點",
  compare: "比較",
  reviewer: "審查員",
  proponent: "辯論正方",
  opponent: "辯論反方",
  judge: "辯論裁判",
};

const KIND_LABEL: Record<ProviderKind, string> = {
  "claude-cli": "Claude Code CLI",
  anthropic: "Anthropic API",
  openai: "OpenAI",
  "openai-compatible": "OpenAI 相容端點",
  gemini: "Google Gemini",
  mock: "Mock（測試用）",
};

const KIND_MODEL_PLACEHOLDER: Record<string, string> = {
  anthropic: "例：claude-sonnet-5, claude-haiku-4-5",
  openai: "例：gpt-5, gpt-5-mini",
  "openai-compatible": "例：deepseek-chat（依端點而定）",
  gemini: "例：gemini-2.5-pro, gemini-2.5-flash",
  mock: "例：mock-1（任意字串）",
};

/** module scope：只在點擊事件觸發，不在 render 期間呼叫（react-hooks/purity 對元件內函式誤判）。 */
let providerIdSeq = 0;
function freshProviderId(): string {
  return `p_${Date.now().toString(36)}_${providerIdSeq++}`;
}

export default function SettingsPage() {
  const [providers, setProviders] = useState<ProviderView[] | null>(null);
  const [seats, setSeats] = useState<Seats>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [zoteroHasKey, setZoteroHasKey] = useState(false);
  const [zoteroInput, setZoteroInput] = useState("");

  useEffect(() => {
    let ignore = false;
    fetch("/api/settings/llm")
      .then((r) => r.json())
      .then((json) => {
        if (ignore) return;
        setProviders(
          json.providers.map((p: Omit<ProviderView, "newKey">) => ({ ...p, newKey: "" }))
        );
        setSeats(json.seats);
      });
    fetch("/api/settings/zotero")
      .then((r) => r.json())
      .then((json) => {
        if (!ignore) setZoteroHasKey(json.hasKey);
      });
    return () => {
      ignore = true;
    };
  }, []);

  function updateProvider(id: string, patch: Partial<ProviderView>) {
    setProviders((prev) => prev!.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function addProvider(kind: ProviderKind) {
    const id = freshProviderId();
    setProviders((prev) => [
      ...(prev ?? []),
      {
        id,
        kind,
        label: KIND_LABEL[kind],
        baseUrl: null,
        models: [],
        hasKey: false,
        keyPreview: null,
        builtin: false,
        newKey: "",
      },
    ]);
  }

  function removeProvider(id: string) {
    setProviders((prev) => prev!.filter((p) => p.id !== id));
    setSeats((prev) => {
      const next = { ...prev };
      for (const seat of SEAT_ORDER) {
        if (next[seat]?.providerId === id) {
          next[seat] = { providerId: "claude-cli", model: "claude-sonnet-5" };
        }
      }
      return next;
    });
  }

  async function save(): Promise<boolean> {
    if (!providers) return false;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/settings/llm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providers: providers.map((p) => ({
            id: p.id,
            kind: p.kind,
            label: p.label,
            baseUrl: p.baseUrl,
            models: p.models,
            ...(p.newKey.trim() ? { apiKey: p.newKey.trim() } : {}),
          })),
          seats,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "儲存失敗");
      setNotice({ tone: "ok", text: "已儲存" });
      setProviders((prev) =>
        prev!.map((p) => (p.newKey.trim() ? { ...p, hasKey: true, keyPreview: `••••${p.newKey.trim().slice(-4)}`, newKey: "" } : p))
      );
      return true;
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "儲存失敗" });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function testProvider(id: string) {
    setTestResults((prev) => ({ ...prev, [id]: "測試中…" }));
    const saved = await save(); // 先存再測，確保測的是最新設定
    if (!saved) {
      setTestResults((prev) => ({ ...prev, [id]: "先修正儲存錯誤再測試" }));
      return;
    }
    try {
      const res = await fetch("/api/settings/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: id }),
      });
      const json = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [id]: json.ok ? `✓ ${json.model} 連線正常` : `✗ ${json.error}`,
      }));
    } catch {
      setTestResults((prev) => ({ ...prev, [id]: "✗ 測試請求失敗" }));
    }
  }

  async function saveZoteroKey(e: React.FormEvent) {
    e.preventDefault();
    if (!zoteroInput.trim()) return;
    const res = await fetch("/api/settings/zotero", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: zoteroInput.trim() }),
    });
    if (res.ok) {
      setZoteroHasKey(true);
      setZoteroInput("");
    }
  }

  async function clearZoteroKey() {
    await fetch("/api/settings/zotero", { method: "DELETE" });
    setZoteroHasKey(false);
  }

  if (!providers) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-8 pt-10">
        <p className="text-sm text-steel">載入中…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-8 pb-24 pt-10">
      <h1 className="font-serif text-[30px] font-bold leading-[1.25] tracking-[-0.3px]">設定</h1>
      <p className="mt-1.5 text-sm text-slate">
        模型供應商與座位調配 · API key 只存在本機 SQLite，不會進版控或上傳
      </p>

      {/* ── 模型供應商 ─────────────────────────── */}
      <section className="mt-8">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-steel">
          模型供應商
        </h2>

        <div className="mt-3 flex flex-col gap-3">
          {providers.map((p) => (
            <div key={p.id} className="rounded-md border border-hairline bg-canvas p-4">
              <div className="flex items-center gap-2">
                <input
                  value={p.label}
                  disabled={p.builtin}
                  onChange={(e) => updateProvider(p.id, { label: e.target.value })}
                  className="h-8 min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-1 text-sm font-semibold outline-none transition-colors focus:border-hairline-strong disabled:text-ink"
                />
                <span className="shrink-0 rounded-xs bg-primary-soft px-2 py-0.5 font-mono text-[11px] text-primary">
                  {KIND_LABEL[p.kind]}
                </span>
                {!p.builtin && (
                  <button
                    type="button"
                    onClick={() => removeProvider(p.id)}
                    title="移除"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-sm text-slate transition-colors hover:bg-black/5 hover:text-error"
                  >
                    <Trash size={14} />
                  </button>
                )}
              </div>

              {p.builtin ? (
                <p className="mt-2 text-[13px] leading-[1.6] text-slate">
                  走你本機 Claude Code 登入的訂閱 token，零額外花費。內建、不可移除，是所有座位的預設。
                </p>
              ) : (
                <div className="mt-3 flex flex-col gap-2.5">
                  {p.kind !== "mock" && (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-slate">
                        API key{p.hasKey && p.keyPreview ? `（已設定 ${p.keyPreview}，留空沿用）` : ""}
                      </span>
                      <input
                        type="password"
                        value={p.newKey}
                        onChange={(e) => updateProvider(p.id, { newKey: e.target.value })}
                        placeholder={p.hasKey ? "輸入新 key 以更換" : "貼上 API key"}
                        className="h-8 rounded-sm border border-hairline-strong bg-canvas px-2.5 text-sm outline-none placeholder:text-steel focus:border-primary focus:ring-2 focus:ring-primary-tint"
                      />
                    </label>
                  )}
                  {p.kind === "openai-compatible" && (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-slate">Base URL</span>
                      <input
                        value={p.baseUrl ?? ""}
                        onChange={(e) => updateProvider(p.id, { baseUrl: e.target.value })}
                        placeholder="例：https://api.deepseek.com"
                        className="h-8 rounded-sm border border-hairline-strong bg-canvas px-2.5 font-mono text-[13px] outline-none placeholder:text-steel focus:border-primary focus:ring-2 focus:ring-primary-tint"
                      />
                    </label>
                  )}
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate">模型清單（逗號分隔，第一個為預設）</span>
                    <input
                      value={p.models.join(", ")}
                      onChange={(e) =>
                        updateProvider(p.id, {
                          models: e.target.value.split(",").map((m) => m.trim()).filter(Boolean),
                        })
                      }
                      placeholder={KIND_MODEL_PLACEHOLDER[p.kind] ?? ""}
                      className="h-8 rounded-sm border border-hairline-strong bg-canvas px-2.5 font-mono text-[13px] outline-none placeholder:text-steel focus:border-primary focus:ring-2 focus:ring-primary-tint"
                    />
                  </label>
                </div>
              )}

              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => testProvider(p.id)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-hairline-strong px-2.5 text-xs font-medium transition-colors hover:border-slate"
                >
                  <PlugsConnected size={13} />
                  測試連線
                </button>
                {testResults[p.id] && (
                  <span
                    className={`text-xs ${testResults[p.id].startsWith("✓") ? "text-success" : testResults[p.id].startsWith("✗") ? "text-error" : "text-slate"}`}
                  >
                    {testResults[p.id]}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate">新增：</span>
          {(["openai", "gemini", "anthropic", "openai-compatible", "mock"] as ProviderKind[]).map(
            (kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => addProvider(kind)}
                className="inline-flex h-7 items-center gap-1 rounded-sm border border-dashed border-hairline-strong px-2.5 text-xs font-medium text-slate transition-colors hover:border-slate hover:text-ink"
              >
                <Plus size={12} />
                {KIND_LABEL[kind]}
              </button>
            )
          )}
        </div>
      </section>

      {/* ── 座位指派 ─────────────────────────── */}
      <section className="mt-9">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-steel">
          座位指派
        </h2>
        <p className="mt-1.5 text-[13px] leading-[1.6] text-slate">
          每個功能可獨立指定供應商與模型。辯論建議讓反方或裁判用非 Claude 模型，避免自我偏好。
        </p>
        <div className="mt-3 divide-y divide-hairline border-y border-hairline">
          {SEAT_ORDER.map((seat) => {
            const assignment = seats[seat] ?? { providerId: "claude-cli", model: "claude-sonnet-5" };
            const provider = providers.find((p) => p.id === assignment.providerId);
            return (
              <div key={seat} className="flex items-center gap-3 py-2.5">
                <span className="w-[88px] shrink-0 text-sm font-medium">{SEAT_LABEL[seat]}</span>
                <select
                  value={assignment.providerId}
                  onChange={(e) => {
                    const next = providers.find((p) => p.id === e.target.value);
                    setSeats((prev) => ({
                      ...prev,
                      [seat]: { providerId: e.target.value, model: next?.models[0] ?? "" },
                    }));
                  }}
                  className="h-8 min-w-0 flex-1 rounded-sm border border-hairline-strong bg-canvas px-2 text-[13px] outline-none focus:border-primary"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <select
                  value={assignment.model}
                  onChange={(e) =>
                    setSeats((prev) => ({
                      ...prev,
                      [seat]: { ...assignment, model: e.target.value },
                    }))
                  }
                  className="h-8 min-w-0 flex-1 rounded-sm border border-hairline-strong bg-canvas px-2 font-mono text-[12px] outline-none focus:border-primary"
                >
                  {(provider?.models ?? []).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  {provider && provider.models.length === 0 && <option value="">（先填模型清單）</option>}
                </select>
              </div>
            );
          })}
        </div>
      </section>

      <div className="sticky bottom-6 mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-sm bg-primary px-5 py-2 text-sm font-medium text-on-primary shadow-[var(--shadow-medium)] transition-colors hover:bg-primary-pressed disabled:cursor-not-allowed disabled:bg-hairline disabled:text-steel"
        >
          {saving ? "儲存中…" : "儲存設定"}
        </button>
        {notice && (
          <span className={`text-sm ${notice.tone === "ok" ? "text-success" : "text-error"}`}>
            {notice.text}
          </span>
        )}
      </div>

      {/* ── Zotero ─────────────────────────── */}
      <section className="mt-10">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-steel">
          Zotero
        </h2>
        <p className="mt-1.5 text-[13px] leading-[1.6] text-slate">
          回寫筆記需要具寫入權限的 Zotero API key（
          <a
            href="https://www.zotero.org/settings/keys/new"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            前往建立
          </a>
          ）。匯入不需要 key，只要本機 Zotero 開著。
        </p>
        {zoteroHasKey ? (
          <div className="mt-3 flex items-center gap-3">
            <span className="text-sm text-success">✓ 已設定 API key</span>
            <button
              type="button"
              onClick={clearZoteroKey}
              className="rounded-sm border border-hairline-strong px-2.5 py-1 text-xs font-medium text-slate transition-colors hover:border-slate hover:text-error"
            >
              移除
            </button>
          </div>
        ) : (
          <form onSubmit={saveZoteroKey} className="mt-3 flex max-w-[420px] gap-2">
            <input
              type="password"
              value={zoteroInput}
              onChange={(e) => setZoteroInput(e.target.value)}
              placeholder="貼上 Zotero API key"
              className="h-8 min-w-0 flex-1 rounded-sm border border-hairline-strong bg-canvas px-2.5 text-sm outline-none placeholder:text-steel focus:border-primary focus:ring-2 focus:ring-primary-tint"
            />
            <button
              type="submit"
              className="h-8 shrink-0 rounded-sm bg-primary px-3 text-xs font-medium text-on-primary transition-colors hover:bg-primary-pressed"
            >
              儲存
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
