import { authorityFor } from "@/lib/policy";

/**
 * Why this question is being asked — with the authority that requires it,
 * quoted (SPEC §22.1, instrument-to-obligation traceability).
 *
 * "Because the routing rules say so" answers a different question from the
 * one people actually ask. This answers theirs: a named policy, its
 * reference and version, and the clause in its own words. The quote is
 * verbatim or it does not appear — a paraphrased policy is not a policy.
 *
 * The alignment is authored data ratified by a human, never something a
 * model decided while the page rendered. An authority a model invented
 * would be worse than no authority at all.
 */
export function WhyAsked({ questionId }: { questionId: string }) {
  const authority = authorityFor(questionId);
  if (!authority) return null;
  const { policy, clause, expect: expected } = authority;
  return (
    <details className="why-asked">
      <summary>
        <span className="why-asked-tag">Why you are asked this</span>
        <span className="why-asked-cite">
          {policy.name} · {clause.id}
        </span>
      </summary>
      <blockquote className="why-asked-quote">“{clause.text}”</blockquote>
      <p className="help">
        {policy.reference} version {policy.version}, in force since{" "}
        {policy.effective}. It expects <strong>{expected}</strong> here —{" "}
        {authority.because}.
      </p>
      <p className="help">
        Answering otherwise is not blocked. It raises a finding a Risk Assessor
        settles, and the clause and your answer are shown side by side when they
        do.
      </p>
    </details>
  );
}
