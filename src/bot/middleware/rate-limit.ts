import { MiddlewareFn } from "grammy";
import { env } from "../../config/env";
import { createRateLimiter } from "../../utils/rate-limit";

const MESSAGE_LIMIT_MS = 3_000;

export function createMessageRateLimitMiddleware(): MiddlewareFn<any> {
  const limiter = createRateLimiter(MESSAGE_LIMIT_MS);

  return async (ctx, next) => {
    if (!ctx.message || !ctx.from || ctx.from.id === env.ADMIN_ID) {
      await next();
      return;
    }

    if (limiter.isLimited(ctx.from.id)) {
      return;
    }

    await next();
  };
}
