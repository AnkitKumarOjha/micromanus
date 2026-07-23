import { TopNav } from "@/components/app/TopNav";
import { ChatShell } from "@/components/chat/ChatShell";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <div className="min-h-screen">
      <TopNav active="chat" />
      <ChatShell />
    </div>
  );
}
