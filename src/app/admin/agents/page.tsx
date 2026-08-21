import agents from "@/data/agents.json";
import { currentPerson } from "@/lib/current-person";
import { canAdminister, ROLE_LABEL } from "@/lib/people";
import { AgentList } from "./agent-list";

export const dynamic = "force-dynamic";

type AgentData = {
  generated: string;
  groups: {
    group: string;
    side: "build" | "runtime";
    nodes: {
      name: string;
      status: string;
      what: string;
      trigger: string;
      access: string;
      gist: string;
      full: string;
      where: string;
    }[];
  }[];
};

/**
 * AI transparency (FR-24). Every agent that touches this platform, what
 * triggers it, what it can reach, and what it may never do — readable by a
 * person who did not build it.
 *
 * The data is generated from the repository at build time
 * (scripts/build-agent-map.mjs) and imported, never read from disk at
 * request time (§26.1). A test fails the build if it is stale.
 */
export default async function AgentsPage() {
  const person = await currentPerson();
  if (!canAdminister(person.role)) {
    return (
      <main>
        <p className="eyebrow">Administration</p>
        <h1 className="display" style={{ textAlign: "left" }}>
          This page is for administrators.
        </h1>
        <p className="lede" style={{ textAlign: "left" }}>
          You are currently working as <strong>{person.name}</strong> ({ROLE_LABEL[person.role]}).
          Switch to an administrator in the bar above to see the agent transparency page.
        </p>
      </main>
    );
  }
  const data = agents as AgentData;
  const build = data.groups.filter((g) => g.side === "build");
  const runtime = data.groups.filter((g) => g.side === "runtime");
  const live = data.groups.flatMap((g) => g.nodes).filter((n) => n.status === "live").length;
  const registered = data.groups.flatMap((g) => g.nodes).length - live;

  return (
    <main>
      <p className="eyebrow">Administration · AI transparency</p>
      <h1 className="display" style={{ textAlign: "left" }}>
        Every agent, and what it may never do.
      </h1>
      <p className="lede" style={{ margin: "0 0 1.4rem", textAlign: "left" }}>
        {live} agents work on this platform today and {registered} more are designed but not built.
        Each one below says when it runs, what it can reach, and the guardrails it operates under.
        Nothing here decides anything on its own — every agent proposes, and a named person
        accepts.
      </p>

      <div className="note" role="note">
        <p className="note-title">
          <span aria-hidden="true">ⓘ</span> Two kinds of agent, and the difference matters
        </p>
        <p className="note-body">
          <strong>Build-time</strong> agents help construct and check this software; they never see
          an assessment and never reach production. <strong>Runtime</strong> agents are product
          features that would read assessment content — all of them are registered and deliberately
          unbuilt, so nothing is reading your data today.
        </p>
      </div>

      <AgentList build={build} runtime={runtime} generated={data.generated} />

      <div className="reveal" style={{ marginTop: "1.5rem" }}>
        <p className="why">
          <span aria-hidden="true">↳</span> About this page
        </p>
        <p className="note-body">
          The role check above is real and enforced on the server — but the persona switcher is a
          pilot device, not a sign-in: anyone can switch to an administrator. That is deliberate for
          a demonstration, and it changes when single sign-on arrives. We would rather say so than
          imply a protection that is not there.
        </p>
      </div>
    </main>
  );
}
