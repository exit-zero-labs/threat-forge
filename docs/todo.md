# Threat Forge - TODO List

Shared execution plan for humans and LLM agents. Update this file before, during, and after every work session.

---

## TODO List - High Level

NOTE: No backwards compatibility is needed to be maintained, so feel free to make breaking changes to the file format, etc.

- **Support same node connector**: Support the ability to add connectors between points on the same node. The attachment points can be the same or different points on the component node.
- **Add authoring**: Add settings for name and email. And record authoring changes (lastEdit (unix time stamp), editBy: name+email), created By etc. Make it easy for git blame
- **File naming**: The top left corner should reflect the file name. Double clicking on the file name in the top left should enter file name edit mode and if a new file, then on escape key / exit of focus should trigger save as dialog. If existing file, should save as a new file of that name (”Save as” functionality basically).
- **File format**: I want to change the file format to be <name>.threatforge.yaml to <name>.thf
- **Theme selection improvements**: Have a top left preference: Light, Dark, & System (as is). Then “For light theme:” choose the light theme. “For dark theme:” choose the dark theme. So 1 light theme and 1 dark theme is always selected. Also, add more themes. Look up very popular VSCode / other coding related themes.
- **Undo/Redo for Connectors**: After deleting a connector from for example the left attachment point of a component A to the top attachment point of component B, hitting undo doesn’t restore the connector back to the exact same attachment points. Also not able to delete connectors by hitting backspace if there’s properties on them.
- **Empty state / new open**: The shield icon when app is opened needs to be replaced with the actual brand logo. A footer should also be added to the page with things like instructions, github links, ownership info of "Exit Zero Labs LLC", etc. I want to add a small touch of finesse to the empty state page to make it more engaging and informative for users when they first open the app or have no files open. Lets add dissappearing messages or tips that fade in and out every few seconds with cool quotes or sayings or tips about threat modeling, security, etc. For example: "A chain is only as strong as its weakest link - identify and strengthen your weak points with Threat Forge!" or "Threat modeling is like a game of chess - anticipate your opponent's moves and stay one step ahead with Threat Forge!" or "Don't let vulnerabilities sneak up on you - use Threat Forge to visualize and mitigate risks before they become a problem!" or "Threat modeling is not a one-time task, it's an ongoing process - keep your defenses up with Threat Forge!" or "With great power comes great responsibility - use Threat Forge to take control of your security and protect what matters most!". Build a solid robust set of these messages and have them rotate randomly on the empty state page to keep it fresh and engaging for users.
- **Scrollbars**: Currently the scrollbars are not following the dark theme on windows and linux. Need to implement custom scrollbars that follow the theme. The horizontally scrolling library section area also needs a bit more padding for scrollbars to be visible and not overlapping with the content.
- **Settings panel improvements**: The settings panel font is quite small and hard to read. Remove the "?" icon from next to the settings button and make sure the "Shortcuts" section in the settings panel is comprehensive and up to date with all the shortcuts in the app. Also add a new "Support" section in the settings panel with links to the github repo, contact email, etc. (email is "admin@exitzerolabs.com).
- **Left and right panes**: Lets make these draggable / adjustable width. We should have a minimum and a maximum width for each pane to prevent them from being resized too small or too large (the hiding feature should still stay in tact). We can add a small grab handle on the borders of the panes to indicate that they are draggable and to make it easier for users to adjust the width. The grab handle can be a thin vertical bar with a different color or a small icon that appears when hovering over the border.
- **Minimap**: The mini map right now is a bit too big (only ever so slightly) and has no ability to be hidden. Lets add a toggle in the settings to show/hide the mini map and also make it slightly smaller so it’s not taking up as much screen real estate, but still useful for navigation. Also add a quick hide icon on the map itself in the bottom left corner for easy access to hiding it (can be revealed again through the settings). Lets also add a subtle border around the mini map to help it stand out from the canvas and make it easier to see.
- **More library components**: Add more library components for users to choose from when building out their threat models. All library components also need to be made available via the Cmd+K menu for quick placement (only when permissible).
- **Component bugs**: Right now when a component is focused and an arrow key is used to move it, it loses focus. When not focused, the arrow keys need to be able to move the canvas around (currently they do nothing when not focused).

---

## Items:
