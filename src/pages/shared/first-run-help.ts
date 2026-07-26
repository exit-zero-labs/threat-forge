/**
 * The one place the downloads page and the support page agree on where first-run
 * help lives, so the link and the section it targets cannot drift apart.
 *
 * This exists only while the desktop builds are unsigned (#50, #51). When Developer ID
 * notarization and Windows signing land, delete this module along with the section it
 * anchors and the line on the downloads page that points at it.
 */
export const FIRST_RUN_HELP_PATH = "/support";
export const FIRST_RUN_HELP_ANCHOR = "opening-for-the-first-time";
