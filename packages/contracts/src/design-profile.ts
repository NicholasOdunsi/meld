import { z } from "zod";

export const MAX_PROFILE_BYTES = 65536;
export const MAX_PROFILE_COLORS = 64;
export const MAX_PROFILE_TYPE_STEPS = 16;
export const MAX_PROFILE_SPACING_STEPS = 16;
export const MAX_PROFILE_RADII = 12;
export const MAX_PROFILE_COMPONENTS = 80;
export const MAX_COMPONENT_RULE_BYTES = 2048;

const encoder = new TextEncoder();
const byteLength = (v: string) => encoder.encode(v).length;

// A token identifier that is safe to interpolate into a CSS custom-property
// name: lowercase, no separators that could break out of `--ds-...`.
const TokenName = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]{0,39}$/, "token name must be kebab-case");

// A permissive CSS colour: hex, rg[b]a(), hsl[a](), or a bare CSS keyword.
const CssColor = z
  .string()
  .trim()
  .regex(
    /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,%\s/]+\)|hsla?\([0-9.,%\s/]+\)|[a-zA-Z]+)$/,
    "must be a CSS colour",
  );

const NamedPx = z
  .object({ name: TokenName, px: z.number().int().min(0).max(4096) })
  .strict();

function uniqueNames(field: string) {
  return (items: { name: string }[], ctx: z.RefinementCtx) => {
    const seen = new Set<string>();
    for (const [i, item] of items.entries()) {
      if (seen.has(item.name)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate ${field} name: ${item.name}`,
          path: [i, "name"],
        });
      }
      seen.add(item.name);
    }
  };
}

export const DesignProfileSchema = z
  .object({
    colors: z
      .array(z.object({ name: TokenName, value: CssColor }).strict())
      .max(MAX_PROFILE_COLORS)
      .superRefine(uniqueNames("colour")),
    typeScale: z
      .array(NamedPx)
      .max(MAX_PROFILE_TYPE_STEPS)
      .superRefine(uniqueNames("type step")),
    spacing: z
      .array(NamedPx)
      .max(MAX_PROFILE_SPACING_STEPS)
      .superRefine(uniqueNames("spacing step")),
    radii: z
      .array(NamedPx)
      .max(MAX_PROFILE_RADII)
      .superRefine(uniqueNames("radius")),
    components: z
      .array(
        z
          .object({
            name: TokenName,
            rules: z
              .string()
              .trim()
              .min(1)
              .refine(
                (v) => byteLength(v) <= MAX_COMPONENT_RULE_BYTES,
                {
                  message: `component rules exceed ${MAX_COMPONENT_RULE_BYTES} bytes`,
                },
              ),
          })
          .strict(),
      )
      .max(MAX_PROFILE_COMPONENTS)
      .superRefine(uniqueNames("component")),
  })
  .strict()
  .refine((p) => byteLength(JSON.stringify(p)) <= MAX_PROFILE_BYTES, {
    message: `profile exceeds ${MAX_PROFILE_BYTES} bytes`,
  });
export type DesignProfile = z.infer<typeof DesignProfileSchema>;

// What the connector returns for a design_profile_distill task: the validated
// profile DATA plus the token CSS Meld compiled from it (never the model).
export const DesignProfileDistillResultSchema = z
  .object({
    profile: DesignProfileSchema,
    tokenCss: z.string().max(MAX_PROFILE_BYTES),
  })
  .strict();
export type DesignProfileDistillResult = z.infer<
  typeof DesignProfileDistillResultSchema
>;
