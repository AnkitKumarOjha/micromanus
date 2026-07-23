"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PROVIDERS, modelsForProvider, providerLabel } from "@/lib/models";
import type { Provider } from "@/lib/types";
import { X } from "lucide-react";

export function NewChatDialog({
  availableProviders,
  onClose,
  onStart,
}: {
  availableProviders: Provider[];
  onClose: () => void;
  // Selects provider + model for a new thread. The chat row is NOT created
  // here — it's created on the first message send (see ChatShell).
  onStart: (provider: Provider, modelId: string) => void;
}) {
  const first = availableProviders[0];
  const [provider, setProvider] = useState<Provider | undefined>(first);
  const [modelId, setModelId] = useState<string>(
    first ? (modelsForProvider(first)[0]?.modelId ?? "") : "",
  );
  const [customModel, setCustomModel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isCustom = provider === "custom";
  const models = provider ? modelsForProvider(provider) : [];

  function start() {
    if (!provider) return;
    const chosenModel = isCustom ? customModel.trim() : modelId;
    if (!chosenModel) {
      setError("Pick or enter a model.");
      return;
    }
    setError(null);
    onStart(provider, chosenModel);
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
              The provider and model are fixed for this thread. The chat is
              created when you send your first message.
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button className="w-full" onClick={start}>
              Start chat
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
