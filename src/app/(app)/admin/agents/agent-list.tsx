"use client";

import * as React from "react";

type Node = {
  name: string;
  status: string;
  what: string;
  trigger: string;
  access: string;
  gist: string;
  full: string;
  where: string;
};
type Group = { group: string; side: string; nodes: Node[] };

export function AgentList({
  build,
  runtime,
  generated,
}: {
  build: Group[];
  runtime: Group[];
  generated: string;
}) {
  const [filter, setFilter] = React.useState<"all" | "live" | "dormant">("all");
  const shown = (node: Node) => filter === "all" || node.status === filter;

  return (
    <>
      <div className="agent-filters" role="group" aria-label="Filter agents">
        {(
          [
            ["all", "All"],
            ["live", "Working today"],
            ["dormant", "Designed, not built"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="chip-btn"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="agent-cols">
        <section>
          <h2 className="card-heading">
            Build-time — never sees an assessment
          </h2>
          {build.map((g) => (
            <GroupBlock key={g.group} group={g} shown={shown} />
          ))}
        </section>
        <section>
          <h2 className="card-heading">
            Runtime — would read assessment content
          </h2>
          {runtime.map((g) => (
            <GroupBlock key={g.group} group={g} shown={shown} />
          ))}
        </section>
      </div>

      <p className="meta" style={{ marginTop: "1.5rem" }}>
        Generated from the codebase on {generated}. The instructions shown are
        the files themselves, not summaries of them.
      </p>
    </>
  );
}

function GroupBlock({
  group,
  shown,
}: {
  group: Group;
  shown: (n: Node) => boolean;
}) {
  const nodes = group.nodes.filter(shown);
  if (nodes.length === 0) return null;
  return (
    <>
      <p>{group.group}</p>
      {nodes.map((node) => (
        <AgentCard key={node.name} node={node} />
      ))}
    </>
  );
}

function AgentCard({ node }: { node: Node }) {
  const [open, setOpen] = React.useState(false);
  return (
    <article className={`agent-card ${node.status}`}>
      <button
        type="button"
        className="agent-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="agent-top">
          <span className="agent-name">{node.name}</span>
          <span className={`agent-chip ${node.status}`}>
            {node.status === "live" ? "Working today" : "Not built"}
          </span>
        </span>
        <span className="agent-what">{node.what}</span>
      </button>
      {open && (
        <div className="agent-detail">
          <p>
            <span className="label">When it runs</span>
            {node.trigger}
          </p>
          <p>
            <span className="label">What it can see</span>
            {node.access}
          </p>
          <details>
            <summary>Read its full instructions</summary>
            <pre>{node.full}</pre>
          </details>
          <p className="meta">
            <code>{node.where}</code>
          </p>
        </div>
      )}
    </article>
  );
}
