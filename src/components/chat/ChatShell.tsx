"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CREDITS_EVENT } from "@/components/app/CreditsBadge";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Markdown } from "./Markdown";
import { StepTrace } from "./StepTrace";
import { ArtifactCard } from "./ArtifactCard";
import { NewChatDialog } from "./NewChatDialog";
import { streamAgentRun } from "@/lib/stream";
import { displayNameFor, providerLabel } from "@/lib/models";
import type { AgentStep, DbMessage, Provider } from "@/lib/types";
import {
  Plus,
  Trash2,
  Menu,
  SendHorizonal,
  MessageSquare,
  Coins,
  X,
} from "lucide-react";

interface ChatListItem {
  id: string;
  title: string;
  provider: Provider;
  model_id: string;
  updated_at: string;
}

interface UIMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  steps?: AgentStep[];
  artifacts?: { id: string; title: string }[];
  running?: boolean;
  error?: string;
}

export function ChatShell({ initialChatId }: { initialChatId?: string }) {
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(
    initialChatId ?? null,
  );
  const [activeMeta, setActiveMeta] = useState<{
    provider: Provider;
    model_id: string;
  } | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [availableProviders, setAvailableProviders] = useState<Provider[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [outOfCredits, setOutOfCredits] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lastCost, setLastCost] = useState<number | null>(null);
  // A new thread the user has configured but not yet sent a message in. No DB
  // row exists for it until the first message; it's not shown in the sidebar.
  const [pending, setPending] = useState<{
    provider: Provider;
    model_id: string;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const loadChats = useCallback(async () => {
    const res = await fetch("/api/chats", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setChats(data.chats ?? []);
    }
  }, []);

  const loadProviders = useCallback(async () => {
    const res = await fetch("/api/credentials", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const providers = Array.from(
        new Set(
          (data.credentials ?? []).map(
            (c: { provider: Provider }) => c.provider,
          ),
        ),
      ) as Provider[];
      setAvailableProviders(providers);
    }
  }, []);

  const loadThread = useCallback(async (chatId: string) => {
    setLoadingThread(true);
    setLastCost(null);
    try {
      const res = await fetch(`/api/chats/${chatId}`, { cache: "no-store" });
      if (!res.ok) {
        setMessages([]);
        return;
      }
      const data = await res.json();
      setActiveMeta({
        provider: data.chat.provider,
        model_id: data.chat.model_id,
      });
      const arts = (data.artifacts ?? []) as {
        id: string;
        message_id: string | null;
        title: string | null;
      }[];
      const msgs: UIMessage[] = [];
      for (const m of data.messages as DbMessage[]) {
        if (m.role === "user") {
          msgs.push({ id: m.id, role: "user", content: m.content ?? "" });
        } else if (m.role === "assistant") {
          const steps = Array.isArray(m.tool_calls)
            ? (m.tool_calls as AgentStep[])
            : [];
          const artifacts = arts
            .filter((a) => a.message_id === m.id)
            .map((a) => ({ id: a.id, title: a.title ?? "Report" }));
          msgs.push({
            id: m.id,
            role: "assistant",
            content: m.content ?? "",
            steps,
            artifacts,
          });
        }
      }
      setMessages(msgs);
    } finally {
      setLoadingThread(false);
    }
  }, []);

  // Initial load.
  useEffect(() => {
    loadChats();
    loadProviders();
    if (initialChatId) loadThread(initialChatId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to newest.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function selectChat(id: string) {
    setActiveId(id);
    setPending(null);
    setSidebarOpen(false);
    window.history.replaceState({}, "", `/chat/${id}`);
    loadThread(id);
  }

  // Start a NEW thread: only capture provider/model. No DB row and no sidebar
  // entry yet — both are created on the first message send.
  function startNewChat(provider: Provider, modelId: string) {
    setShowNewChat(false);
    setPending({ provider, model_id: modelId });
    setActiveId(null);
    setActiveMeta({ provider, model_id: modelId });
    setMessages([]);
    setLastCost(null);
    window.history.replaceState({}, "", "/chat");
  }

  async function deleteChat(id: string) {
    const prev = chats;
    setChats((c) => c.filter((x) => x.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
      window.history.replaceState({}, "", `/chat`);
    }
    const res = await fetch(`/api/chats/${id}`, { method: "DELETE" });
    if (!res.ok) setChats(prev);
  }

  function handleStep(step: AgentStep) {
    if (step.type === "usage") {
      setLastCost(step.costTotalUsd);
      return;
    }
    if (step.type === "credits") {
      // Update the credit badge live, without a router.refresh() (which would
      // remount this shell and reload the thread).
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(CREDITS_EVENT, { detail: step.balance }),
        );
      }
      return;
    }
    setMessages((prev) => {
      const copy = [...prev];
      const idx = copy.length - 1;
      if (idx < 0 || copy[idx].role !== "assistant") return prev;
      const a = { ...copy[idx] };
      if (
        step.type === "tool_call" ||
        step.type === "tool_result" ||
        step.type === "status"
      ) {
        a.steps = [...(a.steps ?? []), step];
      } else if (step.type === "artifact") {
        a.steps = [...(a.steps ?? []), step];
        a.artifacts = [
          ...(a.artifacts ?? []),
          { id: step.artifactId, title: step.title },
        ];
      } else if (step.type === "assistant_final") {
        a.content = step.text;
      } else if (step.type === "error") {
        a.error = step.message;
      } else if (step.type === "done") {
        a.running = false;
      }
      copy[idx] = a;
      return copy;
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || sending || (!activeId && !pending)) return;
    setInput("");
    setSending(true);
    setLastCost(null);

    // First message of a new thread → create the chat row now, exactly once.
    let chatId = activeId;
    let createdChat: ChatListItem | null = null;
    if (!chatId && pending) {
      try {
        const res = await fetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: pending.provider,
            modelId: pending.model_id,
            title: text.length > 60 ? text.slice(0, 57) + "…" : text,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMessages([
            { role: "user", content: text },
            {
              role: "assistant",
              content: "",
              error: data.error ?? "Failed to create chat",
            },
          ]);
          setSending(false);
          return;
        }
        createdChat = data.chat as ChatListItem;
        chatId = createdChat.id;
        setChats((c) => [createdChat as ChatListItem, ...c]);
        setActiveId(chatId);
        setActiveMeta({
          provider: createdChat.provider,
          model_id: createdChat.model_id,
        });
        setPending(null);
        window.history.replaceState({}, "", `/chat/${chatId}`);
      } catch {
        setMessages([
          { role: "user", content: text },
          { role: "assistant", content: "", error: "Network error creating chat" },
        ]);
        setSending(false);
        return;
      }
    }
    if (!chatId) {
      setSending(false);
      return;
    }

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "", steps: [], artifacts: [], running: true },
    ]);

    const result = await streamAgentRun(chatId, text, handleStep);

    if (result.outOfCredits) {
      // Refused before anything was persisted; drop the optimistic pair.
      setMessages((prev) => prev.slice(0, prev.length - 2));
      setOutOfCredits(true);
      // If we just created the chat for this first message, it has no persisted
      // messages — delete it so no empty orphan row survives.
      if (createdChat) {
        const id = createdChat.id;
        setChats((c) => c.filter((x) => x.id !== id));
        setActiveId(null);
        setActiveMeta({
          provider: createdChat.provider,
          model_id: createdChat.model_id,
        });
        setPending({
          provider: createdChat.provider,
          model_id: createdChat.model_id,
        });
        setMessages([]);
        window.history.replaceState({}, "", "/chat");
        fetch(`/api/chats/${id}`, { method: "DELETE" });
      }
    } else {
      loadChats(); // refresh sidebar titles/order (no thread remount)
    }
    setSending(false);
  }

  const activeChat = chats.find((c) => c.id === activeId);
  const hasView = activeId !== null || pending !== null;

  return (
    <div className="flex h-[calc(100vh-57px)]">
      {/* Sidebar */}
      <aside
        className={
          "absolute z-30 h-[calc(100vh-57px)] w-72 shrink-0 border-r bg-background md:static md:z-auto " +
          (sidebarOpen ? "block" : "hidden md:block")
        }
      >
        <div className="flex items-center justify-between gap-2 p-3">
          <Button
            className="flex-1"
            onClick={() => setShowNewChat(true)}
            size="sm"
          >
            <Plus className="h-4 w-4" /> New chat
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="h-[calc(100%-56px)] overflow-y-auto px-2 pb-4">
          {chats.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              No chats yet. Create one to start researching.
            </p>
          ) : (
            <ul className="space-y-1">
              {chats.map((c) => (
                <li key={c.id}>
                  <div
                    className={
                      "group flex items-center gap-1 rounded-md px-2 py-2 text-sm " +
                      (activeId === c.id ? "bg-secondary" : "hover:bg-muted")
                    }
                  >
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => selectChat(c.id)}
                    >
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{c.title}</span>
                      </div>
                      <span className="ml-5 text-xs text-muted-foreground">
                        {displayNameFor(c.provider, c.model_id)}
                      </span>
                    </button>
                    <button
                      className="opacity-0 group-hover:opacity-100"
                      onClick={() => deleteChat(c.id)}
                      aria-label="Delete chat"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Main */}
      <section className="flex min-w-0 flex-1 flex-col">
        {/* mobile bar */}
        <div className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="truncate text-sm font-medium">
            {activeChat?.title ?? (pending ? "New chat" : "MicroManus")}
          </span>
        </div>

        {!hasView ? (
          <EmptyMain onNew={() => setShowNewChat(true)} />
        ) : (
          <>
            <div className="hidden items-center justify-between border-b px-4 py-2 md:flex">
              <span className="truncate text-sm font-medium">
                {activeChat?.title ?? "New chat"}
              </span>
              {activeMeta && (
                <span className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">
                  {providerLabel(activeMeta.provider)} ·{" "}
                  {displayNameFor(activeMeta.provider, activeMeta.model_id)}
                </span>
              )}
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-3xl px-4 py-6">
                {loadingThread ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner /> Loading thread…
                  </div>
                ) : messages.length === 0 ? (
                  <div className="mt-10 text-center text-sm text-muted-foreground">
                    <p className="mb-2 text-base font-medium text-foreground">
                      Ask the agent to research something
                    </p>
                    <p>
                      e.g. &ldquo;Research the main causes of the recent
                      California wildfires and write a report with sources.&rdquo;
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {messages.map((m, i) => (
                      <MessageBubble key={m.id ?? i} m={m} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Composer */}
            <div className="border-t bg-background p-3">
              <div className="mx-auto max-w-3xl">
                {lastCost !== null && (
                  <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Coins className="h-3 w-3" /> Last run cost on your key: $
                    {lastCost < 0.01 ? lastCost.toFixed(4) : lastCost.toFixed(2)}
                  </p>
                )}
                <div className="flex items-end gap-2">
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder="Ask a research question… (Enter to send, Shift+Enter for newline)"
                    className="max-h-40 min-h-[52px] resize-none"
                    disabled={sending}
                  />
                  <Button
                    onClick={send}
                    disabled={sending || input.trim() === ""}
                    size="icon"
                    className="h-[52px] w-[52px] shrink-0"
                  >
                    {sending ? (
                      <Spinner />
                    ) : (
                      <SendHorizonal className="h-5 w-5" />
                    )}
                  </Button>
                </div>
                <p className="mt-1 text-center text-xs text-muted-foreground">
                  1 credit per message. The agent searches the web and can
                  produce a PDF report.
                </p>
              </div>
            </div>
          </>
        )}
      </section>

      {showNewChat && (
        <NewChatDialog
          availableProviders={availableProviders}
          onClose={() => setShowNewChat(false)}
          onStart={startNewChat}
        />
      )}

      {outOfCredits && (
        <OutOfCreditsModal onClose={() => setOutOfCredits(false)} />
      )}
    </div>
  );
}

function MessageBubble({ m }: { m: UIMessage }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {m.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[95%]">
        <StepTrace steps={m.steps ?? []} running={m.running} />
        {m.error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {m.error}
          </div>
        ) : m.content ? (
          <Markdown>{m.content}</Markdown>
        ) : m.running ? (
          <p className="text-sm text-muted-foreground">Thinking…</p>
        ) : null}
        {(m.artifacts ?? []).map((a) => (
          <ArtifactCard key={a.id} artifactId={a.id} title={a.title} />
        ))}
      </div>
    </div>
  );
}

function EmptyMain({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <MessageSquare className="h-10 w-10 text-muted-foreground" />
      <div>
        <p className="text-lg font-medium">No chat selected</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Create a new chat, pick a provider + model from your saved keys, and
          start a deep-research conversation.
        </p>
      </div>
      <Button onClick={onNew}>
        <Plus className="h-4 w-4" /> New chat
      </Button>
    </div>
  );
}

function OutOfCreditsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-5 text-center shadow-lg">
        <Coins className="mx-auto mb-3 h-8 w-8" />
        <h2 className="text-lg font-semibold">You&apos;re out of credits</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Each agent run costs 1 credit. Top up to keep researching.
        </p>
        <div className="mt-4 flex gap-2">
          <a href="/paywall" className="flex-1">
            <Button className="w-full">Get more credits</Button>
          </a>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
