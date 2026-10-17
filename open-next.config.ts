import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every route is dynamic (per-user data), so no incremental cache / R2 bucket is needed.
export default defineCloudflareConfig({});
