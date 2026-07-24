# Registry ID manifest

`shipped-ids.json` is the **public ID floor** for the component/icon registry. Every ID it
lists has appeared in a released build and is therefore permanent:

- IDs are **appended, never removed or renamed.** A rename is expressed as a new entry whose
  `aliases` contains the old ID; a retirement is `status: "deprecated"`, not deletion.
- `componentIds` are `.thf` `element.type` values, `variantIds` are `.thf` `element.subtype`
  values, and `iconIds` are `.thf` `element.icon` values.

`src/lib/registry/id-stability.test.ts` enforces this file against the registry in both
directions: every manifest ID must resolve (directly or through an alias), and the
registry's ID set must equal the manifest set, so growth stays a reviewed one-line diff.

Adding an ID to the registry without appending it here fails with an actionable message,
and removing or renaming a registry ID fails by pointing at the deprecation rule. See
`docs/knowledge/component-registry.md`.
