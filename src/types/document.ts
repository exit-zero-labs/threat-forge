/**
 * Opaque workspace identity for an open document.
 *
 * The brand makes "document identity is independent of the file path" a compile-time
 * property: a `filePath`, title, or any other plain string cannot be passed where a
 * document identity is required.
 *
 * Document ids exist only at runtime and in workspace metadata. They are never derived
 * from a file path, title, or model content, and are never written to a `.thf` file.
 */
export type DocumentId = string & { readonly __brand: "DocumentId" };
