import { env } from "../../config/env";

if (!Number.isFinite(env.ADMIN_ID) || !Number.isInteger(env.ADMIN_ID) || env.ADMIN_ID <= 0) {
  throw new Error("ADMIN_ID must be a positive integer");
}

export function isAdmin(ctx: any) {
  return ctx.from?.id === env.ADMIN_ID;
}

export function isAdminIdValid() {
  return Number.isFinite(env.ADMIN_ID) && Number.isInteger(env.ADMIN_ID) && env.ADMIN_ID > 0;
}

export function assertAdmin(ctx: any) {
  return isAdmin(ctx);
}
