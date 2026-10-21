// Concatenates supabase/migrations/*.sql into supabase/bundle.sql so it can be pasted into the
// Supabase SQL Editor in one go. Migrations stay the source of truth; bundle.sql is generated.
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("supabase/migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const out = files.map((f) => `-- ===== ${f} =====\n${fs.readFileSync(path.join(dir, f), "utf8")}`).join("\n\n");
fs.writeFileSync(path.resolve("supabase/bundle.sql"), out);
console.log(`Wrote supabase/bundle.sql from ${files.length} migrations.`);
