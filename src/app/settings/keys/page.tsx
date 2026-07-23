import { TopNav } from "@/components/app/TopNav";
import { KeysManager } from "@/components/settings/KeysManager";

export const dynamic = "force-dynamic";

export default function KeysPage() {
  return (
    <div className="min-h-screen">
      <TopNav active="keys" />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">LLM API keys</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bring your own key. Nothing is preloaded — add a key to start chatting.
          Keys are encrypted at rest and never shown again after saving.
        </p>
        <div className="mt-6">
          <KeysManager />
        </div>
      </main>
    </div>
  );
}
