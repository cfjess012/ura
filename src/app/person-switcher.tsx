import { switchPerson } from "@/app/actions";
import { ROLE_LABEL, ROLE_SUMMARY, type Person } from "@/lib/people";

/**
 * Pilot persona switch. It says what it is: a demonstration device, not a
 * sign-in. A half-built login that looks like security is worse than none —
 * the same reason the transparency page states it is unrestricted.
 */
export function PersonSwitcher({ people, current }: { people: Person[]; current: Person }) {
  return (
    <form action={switchPerson} className="persona">
      <span className="persona-who">
        <span className="persona-name">{current.name}</span>
        <span className="persona-role">{ROLE_LABEL[current.role]}</span>
      </span>
      <label className="sr-only" htmlFor="personId">
        Switch person (pilot — not a sign-in)
      </label>
      <select id="personId" name="personId" defaultValue={current.id}>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name} · {ROLE_LABEL[person.role]}
          </option>
        ))}
      </select>
      <button type="submit" className="persona-go">
        Switch
      </button>
      <span className="sr-only">{ROLE_SUMMARY[current.role]}</span>
    </form>
  );
}
