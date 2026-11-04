// iamlostwhatisthischeckbox: clicking a checkbox in Live Preview moves it to the next status of a custom cycle.
// Plain JavaScript, no build step (quick and dirty). Click mechanism borrowed from Tasks
// (a CodeMirror extension that intercepts the click), without dates or added properties.
const { Plugin, PluginSettingTab, Setting } = require("obsidian");
const { ViewPlugin } = require("@codemirror/view");

// A status = a name, its checkbox character, and the character that follows it on click (like Tasks)
const DEFAULT_SETTINGS = {
  statuses: [
    { name: "To do", symbol: " ", next: "x" },
    { name: "Done", symbol: "x", next: " " },
  ],
};

// Start of a checkbox line: indent, quotes/callouts (>), bullet or number, then "[c]"
const TASK = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)(.)\]/;

// Cleared field = space (the empty checkbox), otherwise a single character
const toSymbol = (value) => (value === "" ? " " : [...value][0]);

// Next character, or null if the status is not declared or has no next (Obsidian keeps control)
function nextStatus(statuses, current) {
  const status = statuses.find((s) => s.symbol === current);
  return status && status.next !== "" ? status.next : null;
}

// Replaces the status character of the line; returns the new status, or null
function cycleLine(view, line, statuses) {
  const m = TASK.exec(line.text);
  if (!m) return null;
  const next = nextStatus(statuses, m[2]);
  if (next === null) return null;
  const from = line.from + m[1].length;
  view.dispatch({ changes: { from, to: from + m[2].length, insert: next } });
  return next;
}

const checkboxExtension = (plugin) =>
  ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        this.onClick = (evt) => {
          const box = evt.target;
          if (!(box instanceof HTMLInputElement) || box.type !== "checkbox") return;
          // Like Tasks: leave callouts alone (line position is unreliable there)
          if (box.closest(".callout-content")) return;
          const line = view.state.doc.lineAt(view.posAtDOM(box));
          const statuses = plugin.settings.statuses;
          if (nextStatus(statuses, TASK.exec(line.text)?.[2]) === null) return;
          evt.preventDefault();
          const next = cycleLine(view, line, statuses);
          // Resync the displayed checkbox with the text after the redraw
          window.setTimeout(() => { box.checked = next !== " "; }, 1);
        };
        view.dom.addEventListener("click", this.onClick);
      }
      destroy() {
        this.view.dom.removeEventListener("click", this.onClick);
      }
    }
  );

module.exports = class IamlostCheckboxPlugin extends Plugin {
  async onload() {
    const data = (await this.loadData()) || {};
    this.settings = { statuses: data.statuses || DEFAULT_SETTINGS.statuses.map((s) => ({ ...s })) };
    this.registerEditorExtension(checkboxExtension(this));

    // Same cycle from the keyboard, on the cursor's line (useful in source mode)
    this.addCommand({
      id: "cycle-checkbox-status",
      name: "Cycle checkbox status",
      editorCallback: (editor) => {
        const cm = editor.cm; // CodeMirror 6 EditorView (undocumented, but stable)
        const line = cm.state.doc.lineAt(cm.state.selection.main.head);
        cycleLine(cm, line, this.settings.statuses);
      },
    });

    this.addSettingTab(new CycleSettingTab(this.app, this));
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
};

class CycleSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    const statuses = this.plugin.settings.statuses;
    containerEl.empty();
    containerEl.createEl("p", {
      text: "One status per row: its name, its checkbox character, and the next character on click. A cleared character field means a space (empty checkbox). A checkbox whose character is not declared keeps Obsidian's default behavior.",
    });

    statuses.forEach((status, i) => {
      const row = new Setting(containerEl)
        .addText((t) => {
          t.setPlaceholder("Name").setValue(status.name).onChange(async (v) => {
            status.name = v;
            await this.plugin.saveSettings();
          });
          t.inputEl.style.flex = "1"; // the name takes the freed width
        })
        .addText((t) => {
          t.setPlaceholder("Char").setValue(status.symbol).onChange(async (v) => {
            status.symbol = toSymbol(v);
            await this.plugin.saveSettings();
          });
          t.inputEl.maxLength = 1;
          t.inputEl.size = 3;
        })
        .addText((t) => {
          t.setPlaceholder("Next").setValue(status.next).onChange(async (v) => {
            status.next = toSymbol(v);
            await this.plugin.saveSettings();
          });
          t.inputEl.maxLength = 1;
          t.inputEl.size = 3;
        })
        .addExtraButton((b) =>
          b.setIcon("trash").setTooltip("Delete this status").onClick(async () => {
            statuses.splice(i, 1);
            await this.plugin.saveSettings();
            this.display();
          })
        );
      // No label on the left: the empty area goes away, the fields fill the row
      row.infoEl.remove();
    });

    new Setting(containerEl).addButton((b) =>
      b.setButtonText("Add a status").onClick(async () => {
        // Blank row: inert until its characters are filled in
        statuses.push({ name: "", symbol: "", next: "" });
        await this.plugin.saveSettings();
        this.display();
      })
    );
  }
}
