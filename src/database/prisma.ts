import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { env } from "../config/env";

// Audit #15: DATABASE_URL уже валидирован в config/env.ts, этот check — defense-in-depth
if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL .env fayli ichida topilmadi!");
}

export const pool = new Pool({ connectionString: env.DATABASE_URL });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });
