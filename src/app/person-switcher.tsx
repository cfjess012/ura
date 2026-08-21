"use client";

import * as React from "react";
import { switchPerson } from "@/app/actions";
import { ROLE_LABEL, type Person } from "@/lib/people";

/**
 * Pilot persona switch. Choosing a person switches immediately — a control
 * that needs a second confirming click reads as broken, because the
 * interface does not respond to the action the person took (§24.3).
 *
 * It says what it is: a demonstration device, not a sign-in.
 */
export function PersonSwitcher({ people, current }: { people: Person[]; current: Person }) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [switching, setSwitching] = React.useState(false);

  return (
    <form action={switchPerson} ref={formRef} className="persona">
      <label className="persona-label" htmlFor="personId">
        <span className="persona-label-top">Working as</span>
        <span className="persona-role">{ROLE_LABEL[current.role]}</span>
      </label>
      <select
        id="personId"
        name="personId"
        defaultValue={current.id}
        disabled={switching}
        aria-label="Working as — choose a person (pilot, not a sign-in)"
        onChange={(event) => {
          setSwitching(true);
          event.currentTarget.form?.requestSubmit();
        }}
      >
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name} · {ROLE_LABEL[person.role]}
          </option>
        ))}
      </select>
      {/* Without JavaScript the select cannot submit itself, so the button
          stays as the fallback rather than the primary path. */}
      <noscript>
        <button type="submit" className="persona-go">
          Switch
        </button>
      </noscript>
      <span role="status" aria-live="polite" className="sr-only">
        {switching ? "Switching person…" : `Working as ${current.name}, ${ROLE_LABEL[current.role]}`}
      </span>
    </form>
  );
}
