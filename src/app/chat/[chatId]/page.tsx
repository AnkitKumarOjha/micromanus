import { TopNav } from "@/components/app/TopNav";
import { ChatShell } from "@/components/chat/ChatShell";

export const dynamic = "force-dynamic";

export default function ChatThreadPage({
  params,
}: {
  params: { chatId: string };
}) {
  return (
    <div className="min-h-screen">
      <TopNav active="chat" />
      <ChatShell initialChatId={params.chatId} />
    </div>
  );
}
