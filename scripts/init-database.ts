#!/usr/bin/env node

import { ensureDatabase } from "@/lib/admin/database";

process.env.TURSO_AUTO_MIGRATE = "true";
await ensureDatabase();
process.stdout.write("Admin database schema is ready.\n");
