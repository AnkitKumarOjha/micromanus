"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { PROVIDERS } from "@/lib/models";
import { providerLabel } from "@/lib/models";
import type { Provider } from "@/lib/types";
import { Trash2, KeyRound, CheckCircle2, XCircle } from "lucide-react";

interface CredentialView {
  id: string;
  provider: Provider;
  label: string | null;
  masked: string;
  base_url: string | null;
  created_at: string;
}

export function KeysManager() {
  const [creds, setCreds] = useState<CredentialView[]>([]);
  const [loading, setLoading] = useState(true);

  const [provider, setProvider] = useState<Provider>("anthropic");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  const [testState, setTestState] = useState<
    "idle" | "testing" | "ok" | "fail"
  >("idle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providerCfg = PROVIDERS.find((p) => p.id === provider)!;

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/credentials", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setCreds(data.credentials ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setApiKey("");
    setLabel("");
    setBaseUrl("");
    setTestState("idle");
    setError(null);
  }

  async function testConnection() {
    setError(null);
    setTestState("testing");
    try {
      const res = await fetch("/api/credentials/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey, baseUrl: baseUrl || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setTestState("ok");
      } else {
        setTestState("fail");
        setError(data.error ?? "Connection test failed");
      }
    } catch {
      setTestState("fail");
      setError("Network error during test");
    }
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          label: label || undefined,
          apiKey,
          baseUrl: baseUrl || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
      } else {
        resetForm();
        await load();
      }
    } catch {
      setError("Network error while saving");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const prev = creds;
    setCreds((c) => c.filter((x) => x.id !== id));
    const res = await fetch(`/api/credentials/${id}`, { method: "DELETE" });
    if (!res.ok) setCreds(prev); // rollback on failure
  }

  return (
    <div className="space-y-6">
      {/* Saved keys */}
      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Saved keys
        </h2>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Loading…
          </div>
        ) : creds.length === 0 ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
              <KeyRound className="h-5 w-5" />
              No keys yet. Add one below to start chatting.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {creds.map((c) => (
              <Card key={c.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {providerLabel(c.provider)}
                      </span>
                      {c.label && (
                        <span className="text-xs text-muted-foreground">
                          · {c.label}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                      {c.masked}
                      {c.base_url ? ` · ${c.base_url}` : ""}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(c.id)}
                    aria-label="Delete key"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add key */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h2 className="text-sm font-medium">Add a key</h2>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Provider</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as Provider);
                setTestState("idle");
                setBaseUrl("");
              }}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Label (optional)
            </label>
            <Input
              placeholder="e.g. Personal Claude key"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">API key</label>
            <Input
              type="password"
              placeholder={providerCfg.keyPlaceholder}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTestState("idle");
              }}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Base URL{" "}
              {providerCfg.requiresBaseUrl ? "(required)" : "(optional override)"}
            </label>
            <Input
              placeholder={
                providerCfg.defaultBaseUrl ?? "https://your-endpoint/v1"
              }
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                setTestState("idle");
              }}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={testConnection}
              disabled={
                testState === "testing" ||
                apiKey.trim() === "" ||
                (providerCfg.requiresBaseUrl && baseUrl.trim() === "")
              }
            >
              {testState === "testing" ? <Spinner /> : null}
              {testState === "ok" ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : testState === "fail" ? (
                <XCircle className="h-4 w-4 text-destructive" />
              ) : null}
              Test connection
            </Button>
            <Button
              onClick={save}
              disabled={
                saving ||
                apiKey.trim() === "" ||
                (providerCfg.requiresBaseUrl && baseUrl.trim() === "")
              }
            >
              {saving ? <Spinner /> : null}
              Save key
            </Button>
            {testState === "ok" && (
              <span className="text-sm text-green-600">Connection OK</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Saving also runs a live validation request. The key is encrypted
            (AES-256-GCM) before storage and never returned to the browser again.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
