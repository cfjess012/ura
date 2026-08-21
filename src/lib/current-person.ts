/**
 * Who is using the platform right now — the executor side of identity
 * (§26.1). The cookie is a pilot device; everything downstream depends only
 * on the Person and its role, so replacing this with single sign-on later
 * touches this file alone.
 */
import { cookies } from "next/headers";
import type { Person } from "./people";
import { peopleStore } from "./repo";

export const PERSON_COOKIE = "ura_person";

/** The signed-in person, falling back to the first requester for a pilot. */
export async function currentPerson(): Promise<Person> {
  const jar = await cookies();
  const chosen = jar.get(PERSON_COOKIE)?.value;
  const store = peopleStore();
  if (chosen) {
    const person = await store.get(chosen);
    if (person) return person;
  }
  const everyone = await store.list();
  const fallback = everyone.find((p) => p.role === "requester") ?? everyone[0];
  if (!fallback) throw new Error("No people are seeded — run pnpm db:migrate");
  return fallback;
}
