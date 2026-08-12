"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  getAiSettings,
  listAiModels,
  removeAiSettings,
  saveAiSettings,
  testAiSettings,
  type AiModelOption,
  type AiProviderName,
  type AiSettingsSnapshot,
} from "../lib/ai-api";
const presets: Record<AiProviderName, AiModelOption[]> = {
  openai: [
    { id: "gpt-5.6-luna", name: "GPT-5.6 Luna — fastest / cheapest" },
    { id: "gpt-5.6-terra", name: "GPT-5.6 Terra — balanced" },
    { id: "gpt-5.6-sol", name: "GPT-5.6 Sol — highest quality" },
  ],
  anthropic: [
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5 — fastest" },
    { id: "claude-sonnet-5", name: "Claude Sonnet 5 — balanced" },
    { id: "claude-opus-5", name: "Claude Opus 5 — highest quality" },
  ],
  openrouter: [
    { id: "openrouter/free", name: "OpenRouter Free Router" },
    { id: "openai/gpt-5.6-terra", name: "OpenAI GPT-5.6 Terra" },
    { id: "anthropic/claude-sonnet-5", name: "Anthropic Claude Sonnet 5" },
  ],
  "openai-compatible": [],
};
const defaults: Record<AiProviderName, [string, string]> = {
  openai: ["gpt-5.6-luna", "gpt-5.6-terra"],
  anthropic: ["claude-haiku-4-5-20251001", "claude-sonnet-5"],
  openrouter: ["openrouter/free", "openrouter/free"],
  "openai-compatible": ["local-model", "local-model"],
};
function ModelField({
  label,
  value,
  models,
  onChange,
}: {
  label: string;
  value: string;
  models: AiModelOption[];
  onChange: (value: string) => void;
}) {
  const known = models.some((model) => model.id === value);
  const [custom, setCustom] = useState(!known);
  useEffect(
    () => setCustom(!models.some((model) => model.id === value)),
    [models, value],
  );
  return (
    <label>
      {label}
      <select
        value={custom ? "__custom" : value}
        onChange={(event) => {
          if (event.target.value === "__custom") setCustom(true);
          else {
            setCustom(false);
            onChange(event.target.value);
          }
        }}
      >
        <option value="" disabled>
          Select a model
        </option>
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
        <option value="__custom">Custom model ID…</option>
      </select>
      {custom ? (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Enter the exact model ID"
        />
      ) : null}
    </label>
  );
}
export function AiSettingsPanel({
  accessToken,
}: {
  accessToken: string | null;
}) {
  const [settings, setSettings] = useState<AiSettingsSnapshot | null>(null);
  const [provider, setProvider] = useState<AiProviderName>("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [classificationModel, setClassificationModel] = useState(
    defaults.openai[0],
  );
  const [draftingModel, setDraftingModel] = useState(defaults.openai[1]);
  const [discovered, setDiscovered] = useState<AiModelOption[]>([]);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<
    "save" | "test" | "remove" | "models" | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const models = useMemo(() => {
    const values = new Map<string, AiModelOption>();
    [...presets[provider], ...discovered].forEach((model) =>
      values.set(model.id, model),
    );
    return [...values.values()];
  }, [provider, discovered]);
  const loadModels = useCallback(async (token: string) => {
    setBusy("models");
    try {
      const values = await listAiModels(token);
      setDiscovered(values);
      setMessage(`Loaded ${values.length} models from the provider.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not load models. You can still enter a custom model ID.",
      );
    } finally {
      setBusy(null);
    }
  }, []);
  useEffect(() => {
    if (!accessToken) return;
    void getAiSettings(accessToken)
      .then((value) => {
        setSettings(value);
        if (value.provider) setProvider(value.provider);
        setBaseUrl(value.base_url ?? "");
        if (value.classification_model)
          setClassificationModel(value.classification_model);
        if (value.drafting_model) setDraftingModel(value.drafting_model);
        if (value.configured) void loadModels(accessToken);
      })
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load AI settings.",
        ),
      );
  }, [accessToken, loadModels]);
  function changeProvider(value: AiProviderName) {
    setProvider(value);
    setDiscovered([]);
    setBaseUrl(
      value === "openai-compatible" ? "http://localhost:11434/v1" : "",
    );
    setClassificationModel(defaults[value][0]);
    setDraftingModel(defaults[value][1]);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setBusy("save");
    setMessage(null);
    try {
      const saved = await saveAiSettings(accessToken, {
        provider,
        ...(key.trim() ? { api_key: key.trim() } : {}),
        ...(provider === "openai-compatible" ? { base_url: baseUrl } : {}),
        classification_model: classificationModel,
        drafting_model: draftingModel,
      });
      setSettings(saved);
      setKey("");
      setMessage("Provider and both model roles were saved locally.");
      await loadModels(accessToken);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save the provider.",
      );
    } finally {
      setBusy(null);
    }
  }
  async function test() {
    if (!accessToken) return;
    setBusy("test");
    setMessage(null);
    try {
      const tested = await testAiSettings(accessToken);
      setSettings(tested);
      setMessage(`Classification connection works (${tested.latency_ms} ms).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connection failed.");
    } finally {
      setBusy(null);
    }
  }
  async function remove() {
    if (!accessToken) return;
    setBusy("remove");
    try {
      await removeAiSettings(accessToken);
      setSettings({
        configured: false,
        provider: null,
        base_url: null,
        classification_model: null,
        drafting_model: null,
        key_suffix: null,
        validated_at: null,
      });
      setDiscovered([]);
      setMessage("Provider key and configuration removed from this device.");
    } finally {
      setBusy(null);
    }
  }
  const keyRequired =
    provider !== "openai-compatible" &&
    !(settings?.configured && settings.provider === provider);
  return (
    <section className="settings-shell">
      <div className="panel-heading">
        <div>
          <p className="page-kicker">Bring your own AI</p>
          <h2>AI provider gateway</h2>
          <p>
            Use OpenAI, Anthropic, OpenRouter, or any OpenAI-compatible
            endpoint. Keys stay encrypted on this device.
          </p>
        </div>
        <span
          className={`settings-status ${settings?.validated_at ? "status-ready" : ""}`}
        >
          {settings?.validated_at
            ? "Connected"
            : settings?.configured
              ? "Saved, not tested"
              : "Not configured"}
        </span>
      </div>
      <form className="settings-form" onSubmit={(event) => void save(event)}>
        <label>
          Provider
          <select
            value={provider}
            onChange={(event) =>
              changeProvider(event.target.value as AiProviderName)
            }
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="openrouter">OpenRouter — many hosted models</option>
            <option value="openai-compatible">
              OpenAI-compatible — LiteLLM, Ollama, LM Studio, Groq, Together…
            </option>
          </select>
        </label>
        {provider === "openai-compatible" ? (
          <label>
            Base URL
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="http://localhost:11434/v1"
            />
            <span className="field-note">
              Include the provider’s OpenAI-compatible `/v1` path when required.
            </span>
          </label>
        ) : null}
        <label>
          API key{" "}
          <span className="optional">
            {provider === "openai-compatible"
              ? "optional for local servers"
              : "required"}
          </span>
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder={
              settings?.provider === provider && settings.key_suffix
                ? `Saved key ending in ${settings.key_suffix}`
                : "Paste the provider API key"
            }
          />
        </label>
        <div className="model-role-grid">
          <ModelField
            label="Classification & analysis model"
            value={classificationModel}
            models={models}
            onChange={setClassificationModel}
          />
          <ModelField
            label="Drafting model"
            value={draftingModel}
            models={models}
            onChange={setDraftingModel}
          />
        </div>
        <div className="settings-actions">
          <button
            className="primary-action"
            disabled={(keyRequired && !key.trim()) || busy !== null}
          >
            {busy === "save" ? "Saving…" : "Save provider"}
          </button>
          <button
            className="secondary-action"
            type="button"
            disabled={!settings?.configured || busy !== null}
            onClick={() => accessToken && void loadModels(accessToken)}
          >
            {busy === "models" ? "Loading…" : "Refresh models"}
          </button>
          <button
            className="secondary-action"
            type="button"
            disabled={!settings?.configured || busy !== null}
            onClick={() => void test()}
          >
            {busy === "test" ? "Testing…" : "Test classification"}
          </button>
          {settings?.configured ? (
            <button
              className="text-danger"
              type="button"
              disabled={busy !== null}
              onClick={() => void remove()}
            >
              Remove
            </button>
          ) : null}
        </div>
        {message ? (
          <p className="settings-message" role="status">
            {message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
