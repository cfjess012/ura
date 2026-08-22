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

/**
 * The signed-in person, falling back to a sign-in persona for the pilot.
 *
 * Both halves are deliberate. The cookie must name someone who can actually
 * sign in — the employee directory is full of people who exist to be chosen
 * as an owner and were never personas, and honouring a cookie naming one of
 * them would let anybody assume an identity the front door never offered.
 * And the fallback picks from the sign-in people rather than the first
 * requester in the whole directory, which after S4.5 was Alison Grant.
 */
export async function currentPerson(): Promise<Person> {
  const jar = await cookies();
  const chosen = jar.get(PERSON_COOKIE)?.value;
  const store = peopleStore();
  const signIns = await store.signIns();
  if (chosen) {
    const person = signIns.find((p) => p.id === chosen);
    if (person) return person;
  }
  const fallback = signIns.find((p) => p.role === "requester") ?? signIns[0];
  if (!fallback) throw new Error("No sign-in people are seeded — run pnpm db:migrate");
  return fallback;
}
