---
tags: ai_generated
---

# iamlostwhatisthischeckbox

Minimal Obsidian plugin: in Live Preview and Reading mode, clicking a checkbox moves it to the **next status of a custom cycle**, instead of the plain "empty / checked" toggle.

Example: `- [ ]` → `- [D]` → `- [x]` → `- [ ]`…

Only the character between the brackets changes: no date, no added property (unlike the Tasks plugin, whose click mechanism is borrowed).

## Settings
- One row per status: **name**, **checkbox character**, **next character** on click. Add as many as you want.
- Type a space for the empty checkbox. Empty fields and duplicate characters turn red, and **Save** stays disabled until every field is valid.
- The `[ ]` and `[x]` rows are Obsidian's own statuses: their characters are fixed and they cannot be deleted, but they can be moved. Default cycle: `[ ]` → `[x]` → `[ ]`.
- Every row can be reordered with the up and down arrows; the right-click menu follows this order.
- Changes apply once **Save** is clicked; closing the settings without saving drops them.
- A checkbox whose character is not declared keeps Obsidian's default behavior.

## Right-click menu
Right-click a checkbox (Live Preview or Reading mode) to pick any status from a menu (`[x] Done`…), the current one ticked. Works even on a checkbox whose character is not declared.

## Commands
Editor commands (source mode and Live Preview), applied to every checkbox line of the selection. Bind them to hotkeys.
- **Cycle checkbox status**: next status of the cycle.
- **Previous checkbox status**: one step back. When several statuses lead to the current one, the lowest row in the settings wins.
- **Pick checkbox status**: keyboard version of the right-click menu.

## Installation
Copy the `iamlostwhatisthischeckbox/` folder (`main.js` and `manifest.json`) into `<vault>/.obsidian/plugins/`, then enable the plugin in Obsidian's settings.

## Known limits
- Checkboxes inside callouts are ignored (like Tasks).
- Mobile: the right-click menu relies on a long press, not tested yet. **Pick checkbox status** is the fallback.
- Plain JavaScript, no build step: "quick and dirty" version.
