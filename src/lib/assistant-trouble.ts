/**
 * What to tell somebody when the assistant could not answer, and the reason
 * has nothing to do with what they wrote or uploaded.
 *
 * All of this used to arrive as one sentence — "I could not draft one just
 * then — that is about me, not your document. Worth trying again." Honest
 * about whose fault it was, useless about what to do next: a rejected API
 * key and a rate limit are both worth *not* trying again, and somebody
 * retrying a dead service three times learns nothing except that the
 * product is broken.
 *
 * So each reason gets its own sentence, in one place, because the same
 * trouble reaches people through the upload panel, the rewrite button and
 * the chat, and three wordings of one fault is how a demo starts sounding
 * unsure of itself.
 *
 * The distinction that matters to a person is not the HTTP status. It is
 * whether waiting helps: `retryable` says so, and nothing else should have
 * to work it out again.
 */
import type { Trouble } from "./agent-contract";

export type TroubleTold = {
  /** One sentence, addressed to whoever is looking at the screen. */
  message: string;
  /** Whether trying the same thing again could plausibly work. */
  retryable: boolean;
};

/**
 * Nobody outside this file writes these sentences.
 *
 * They name the assistant rather than "the API" or "the model": to a
 * requester filling in an assessment, an Anthropic rate limit and a stopped
 * container are the same event — the help went away — and the sentence they
 * need is what it means for their work, not which box is unhappy.
 */
const TOLD: Record<Trouble, TroubleTold> = {
  unreachable: {
    message:
      "The assistant isn’t running, so nothing was drafted. Your work is untouched — carry on and write it yourself, or ask whoever set this up to start the assistant.",
    retryable: false,
  },
  auth: {
    message:
      "The assistant’s access to Claude was rejected — usually an expired or missing API key. That needs someone to fix the key; trying again won’t help. Your work is untouched.",
    retryable: false,
  },
  rate: {
    message:
      "Claude is rate-limiting us at the moment, so the assistant had to stop. Give it a minute and try again — nothing you wrote was lost.",
    retryable: true,
  },
  overloaded: {
    message:
      "Claude is overloaded right now and couldn’t answer. This usually clears in a moment — try again shortly. Nothing you wrote was lost.",
    retryable: true,
  },
  network: {
    message:
      "The assistant couldn’t reach Claude — that looks like a network problem on our side, not anything you did. Your work is untouched.",
    retryable: true,
  },
  unavailable: {
    message:
      "The assistant answered with nothing usable just then. That’s about us, not your document — worth trying once more. Nothing you wrote was lost.",
    retryable: true,
  },
};

/** Is this one of the troubles, rather than a judgement about their text? */
export function isTrouble(why: string): why is Trouble {
  return why in TOLD;
}

/** The sentence for a trouble, and whether trying again could help. */
export function tellTrouble(why: Trouble): TroubleTold {
  return TOLD[why];
}
