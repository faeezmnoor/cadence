import { Logger } from "next-axiom";

/**
 * Structured logger. In production with AXIOM_TOKEN set, logs ship to Axiom.
 * In dev or without a token, next-axiom falls back to console output.
 *
 * Prefer this over console.log in server code so we get queryable logs
 * for digest runs, cost events, and feedback.
 */
export const log = new Logger();
