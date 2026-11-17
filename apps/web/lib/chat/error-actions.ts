/**
 * What the chat error bubble may offer for each server error code (slice
 * 005, security review F5). Pure, shared by the client and its test.
 *
 * `payload_too_large` (413 from server/http/body-limit.ts) is refused before
 * any write, and resending the same thread would be refused again, so it gets
 * no Retry; the client drops the unsent message instead, so the user can
 * send a shorter one.
 */

/** Must equal the `code` in payloadTooLargeResponse() (pinned by test). */
export const PAYLOAD_TOO_LARGE_CODE = "payload_too_large";

export function offersRetry(code: string): boolean {
  return code !== PAYLOAD_TOO_LARGE_CODE;
}

/** The thread without its trailing user message (the one the server refused). */
export function withoutUnsentMessage<T extends { role: string }>(messages: T[]): T[] {
  return messages.at(-1)?.role === "user" ? messages.slice(0, -1) : messages;
}
