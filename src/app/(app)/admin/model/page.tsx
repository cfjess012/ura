import { currentPerson } from "@/lib/current-person";
import { canAdminister, ROLE_LABEL } from "@/lib/people";
import { processModel } from "@/lib/process-model";
import { ProcessMap } from "./process-map";

export const dynamic = "force-dynamic";

/**
 * How an assessment moves (FR-48). The whole process as a map an
 * administrator can walk — every screen as a stop, in the words of the
 * person on it — for the requester's journey and for the risk assessor's.
 *
 * The model is built here on the server from the instrument data and
 * handed to the map as plain values; nothing about the process is typed
 * into the page, so it cannot drift from what the product does.
 */
export default async function ModelPage() {
  const person = await currentPerson();
  if (!canAdminister(person.role)) {
    return (
      <main>
        <p className="eyebrow">Administration</p>
        <h1 className="display" style={{ textAlign: "left" }}>
          This page is for administrators.
        </h1>
        <p className="lede" style={{ textAlign: "left" }}>
          You are currently working as <strong>{person.name}</strong> (
          {ROLE_LABEL[person.role]}). Switch to an administrator in the bar
          above to see the process map.
        </p>
      </main>
    );
  }
  return (
    <main className="model-page">
      <div className="model-head">
        <p className="eyebrow">Administration</p>
        <h1 className="display" style={{ textAlign: "left" }}>
          How an assessment moves.
        </h1>
        <p className="lede" style={{ textAlign: "left", margin: "0 0 1.2rem" }}>
          Every stop is a screen, in the words of the person on it — what they
          see, the rules that decide what happens, and what it leaves behind.
          The numbers on the map are counted from the instrument, never typed.
        </p>
      </div>
      <ProcessMap
        models={{
          requester: processModel("requester"),
          assessor: processModel("assessor"),
        }}
      />
    </main>
  );
}
