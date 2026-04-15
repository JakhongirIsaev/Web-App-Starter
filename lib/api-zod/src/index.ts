// NOTE: Only the Zod schemas from ./generated/api are re-exported.
// The orval-generated TypeScript types in ./generated/types collide by name
// (e.g. `CreateClientBody` exists as both `z.object(...)` and `interface`).
// Consumers should use `z.infer<typeof Schema>` or `z.input<typeof Schema>`
// on the Zod schemas when a TS type is needed.
export * from "./generated/api";
export * from "./ai";
