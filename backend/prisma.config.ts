// backend/prisma.config.ts

import { defineConfig, env } from "prisma/config";
import "dotenv/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  
  // Datasource URL for migrations
  datasource: {
    url: env("DATABASE_URL"),
  },
  
  // ✅ Client config for direct connection (NO accelerateUrl)

    // ✅ Use direct adapter for local PostgreSQL
   
});