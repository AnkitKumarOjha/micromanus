"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PROVIDERS, modelsForProvider, providerLabel } from "@/lib/models";
import type { Provider } from "@/lib/types";
import { X } from "lucide-react";

export interface CreatedChat {
  id: string;
  title: string;
  provider: Provider;
  model_id: string;
  updated_at: string;
}

export function NewChatDialog({
  availableProviders,
  onClose,
  onCreated,
}: {
  availableProviders: Provider[];
  onClose: () => void;
  onCreated: (chat: CreatedChat) => void;
}) {
  const first = availableProviders[0];
  const [provider, setProvider] = useState<Provider | undefined>(first);
  const [modelId, setModelId] = useState<string>(
    first ? (modelsForProvider(first)[0]?.modelId ?? "") : "",
  );
  const [customModel, setCustomModel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustom = provider === "custom";
  const models = provider ? modelsForProvider(provider) : [];

  async function create() {
    if (!provider) return;
    const chosenModel = isCustom ? customModel.trim() : modelId;
    if (!chosenModel) {
      setError("Pick or enter a model.");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, modelId: chosenModel }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create chat");
      } else {
        onCreated(data.chat);
      }
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New chat</h2>
          <button onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {availableProviders.length === 0 ? (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              You don&apos;t have any API keys yet. Add one to start a chat.
            </p>
            <a href="/settings/keys">
              <Button className="w-full">Add an API key</Button>
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Provider</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={provider}
                onChange={(e) => {
                  const p = e.target.value as Provider;
                  setProvider(p);
                  const first = modelsForProvider(p)[0]?.modelId ?? "";
                  setModelId(first);
                }}
              >
                {PROVIDERS.filter((p) =>
                  availableProviders.includes(p.id),
                ).map((p) => (
                  <option key={p.id} value={p.id}>
                    {providerLabel(p.id)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Model</label>
              {isCustom ? (
                <Input
                  placeholder="model id (e.g. my-model)"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                />
              ) : (
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                >
                  {models.map((m) => (
                    <option key={m.modelId} value={m.modelId}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              The provider and model are fixed for this thread.
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button className="w-full" onClick={create} disabled={creating}>
              {creating ? <Spinner /> : null} Create chat
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
