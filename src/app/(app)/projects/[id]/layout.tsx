import { agentTransport } from "@/lib/agent";
import { conversationFor } from "@/app/agent-actions";
import { openProject } from "@/lib/project-access";
import { Assistant } from "./assistant";

/**
 * Every screen of one assessment, plus the assistant.
 *
 * Mounted here rather than on a page so it is available wherever a person
 * is working — the question they want to ask about is rarely the one on the
 * screen they happen to be looking at.
 *
 * It is absent entirely when no agent is connected: SPEC §7 requires that
 * an unshipped capability stays unreachable, and a widget explaining that
 * it cannot help is worse than no widget.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const transport = agentTransport();
  // Never offer it on an assessment this person cannot open — the panel
  // would be answering questions about somebody else's record.
  const access = transport.available
    ? await openProject(id)
    : { ok: false as const };

  return (
    <>
      {children}
      {transport.available && access.ok && (
        <Assistant projectId={id} initial={await conversationFor(id)} />
      )}
    </>
  );
}
