import { requireUserPage } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { providerStatus } from "@/server/providers";
import { PageHeader } from "@/components/page-header";
import { AssistantChat } from "@/components/assistant-chat";

export const metadata = { title: "Assistant" };

export default async function AssistantPage({ params }: { params: Promise<{ wid: string }> }) {
  const user = await requireUserPage();
  const { wid } = await params;
  const ws = await requireWorkspace(user.id, wid);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Assistant" description={`Ask about “${ws.name}”. Answers use your workspace data and say which facts are verified, reported or estimated.`} />
      <AssistantChat workspaceId={wid} configured={Boolean(providerStatus().llm)} />
    </div>
  );
}
