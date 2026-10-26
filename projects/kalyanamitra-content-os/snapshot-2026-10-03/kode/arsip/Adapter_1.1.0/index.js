import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { getAgentScopedMediaLocalRoots } from "openclaw/plugin-sdk/media-local-roots";
import { extractOriginalFilename } from "openclaw/plugin-sdk/media-runtime";
import { resolveAgentIdFromSessionKey } from "openclaw/plugin-sdk/routing";

import { registerKalyanamitraImport } from "./lifecycle.js";

export default definePluginEntry({
  id: "kalyanamitra-content-pack-import",
  name: "Kalyanamitra Content Pack Import",
  description: "Import canonical content packs as private Content OS drafts without a model call.",
  register(api) {
    registerKalyanamitraImport(api, {
      env: process.env,
      extractOriginalFilename,
      fetchImpl: globalThis.fetch,
      getTrustedRoots: () => getAgentScopedMediaLocalRoots(api.config, "kalyanamitra"),
      resolveAgentIdFromSessionKey,
      // Kept lazy so a missing dependency cannot prevent the claim hooks from registering.
      rootFactory: async (...args) => (await import("@openclaw/fs-safe/root")).root(...args),
    });
  },
});
