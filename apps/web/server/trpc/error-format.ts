/**
 * Bounded tRPC error response (slice 005, security review F2).
 *
 * The default shape puts the whole `ZodError.message` (every issue, as JSON)
 * into `message`, and outside production a stack that repeats it. On
 * zod 3.25.76 a bad array yields one issue per element, so a 1 MiB body
 * produced a 116–233 MB response. This keeps at most 20 issues plus the
 * count, drops the stack in every environment, and cuts any message.
 *
 * It bounds the response, not the parse: Zod still builds every issue, which
 * the tRPC body limit bounds (server/http/body-limit.ts). No `@/` imports, so
 * the measurement script can load it under plain Node.
 */
import { ZodError } from "zod";

export const MAX_ERROR_ISSUES = 20;
export const MAX_ERROR_MESSAGE_CHARS = 500;
const MAX_ISSUE_PATH = 10;
const MAX_ISSUE_MESSAGE_CHARS = 200;

type Shape = {
  message: string;
  code: number;
  data: { stack?: string } & Record<string, unknown>;
};

export function boundErrorShape<S extends Shape>({ shape, error }: { shape: S; error: { cause?: unknown } }) {
  const { stack: _stack, ...data } = shape.data;
  const zod = error.cause instanceof ZodError ? error.cause : null;
  if (!zod) {
    return { ...shape, message: shape.message.slice(0, MAX_ERROR_MESSAGE_CHARS), data };
  }
  return {
    ...shape,
    message: "Invalid input",
    data: {
      ...data,
      zodIssues: zod.issues.slice(0, MAX_ERROR_ISSUES).map((i) => ({
        code: i.code,
        path: i.path.slice(0, MAX_ISSUE_PATH),
        message: i.message.slice(0, MAX_ISSUE_MESSAGE_CHARS),
      })),
      zodIssueCount: zod.issues.length,
    },
  };
}
