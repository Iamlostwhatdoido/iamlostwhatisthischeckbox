---
tags: ai_generated
---

# iamlostwhatisthischeckbox

Minimal Obsidian plugin: in Live Preview, clicking a checkbox moves it to the **next status of a custom cycle**, instead of the plain "empty / checked" toggle.

Example: `- [ ]` → `- [D]` → `- [x]` → `- [ ]`…

Only the character between the brackets changes: no date, no added property (unlike the Tasks plugin, whose click mechanism is borrowed).

## Settings
- One row per status: **name**, **checkbox character**, **next character** on click. Add as many as you want.
- A cleared character field means a space (empty checkbox).
- A checkbox whose character is not declared keeps Obsidian's default behavior.

## Command
- **Cycle checkbox status**: same cycle, on the cursor's line. Bind it to a hotkey; useful in source mode.

## Installation
Copy the `iamlostwhatisthischeckbox/` folder (`main.js` and `manifest.json`) into `<vault>/.obsidian/plugins/`, then enable the plugin in Obsidian's settings.

## Known limits
- Checkboxes inside callouts are ignored (like Tasks).
- Reading mode is not handled: Live Preview and the command only.
- Plain JavaScript, no build step: "quick and dirty" version.
