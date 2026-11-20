// dsh-transcript-turbo — host entry.
//
// The bundle's real work is the client-side CSS injection; the host side only
// declares the volatile configuration schema so the DSH settings service can
// project a form for this plugin's row (namespace = row id "transcript-turbo")
// in Plugin Manager, and so volatile writes update in place without remounting
// the fiber.
//
// IMPORTANT: the schema library must be @deepseek-ai/schemastery (the DSH
// build), NOT the public `schemastery` package. Only DSH's build wraps a
// meta.volatile field in a cosmokit Volatile reference; the loader's
// volatile-commit path walks those references, so a schema built with the
// public package would silently drop every live preference write.
import z from '@deepseek-ai/schemastery';

const PrefsSchema = z.object({
  // A. Offscreen containment for transcript blocks (the big win on long
  //    transcripts). Default on.
  containment: z.boolean().default(true),
  // B. Idle spinner quieting (state-dot SVG -> compositor opacity pulse).
  //    Default on.
  spinnerQuiet: z.boolean().default(true),
  // C. Freeze running-row shimmer animations. Default on.
  shimmerFreeze: z.boolean().default(true),
});

const volatilePrefs = Object.fromEntries(
  Object.entries(PrefsSchema.dict ?? {}).map(([k, f]) => [k, f.volatile()]),
);

export const Config = z.object(volatilePrefs);

export function apply() {}
