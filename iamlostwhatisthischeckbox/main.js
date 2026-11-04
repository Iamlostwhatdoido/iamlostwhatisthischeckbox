// iamlostwhatisthischeckbox: clicking a checkbox in Live Preview moves it to the next status of a custom cycle.
// Plain JavaScript, no build step (quick and dirty). Click mechanism borrowed from Tasks
// (a CodeMirror extension that intercepts the click), without dates or added properties.
const { Menu, Notice, Plugin, PluginSettingTab, Setting } = require("obsidian");
const { ViewPlugin } = require("@codemirror/view");

// A status = a name, its checkbox character, and the character that follows it on click (like Tasks)
const DEFAULT_SETTINGS = {
  statuses: [
    { name: "To do", symbol: " ", next: "x" },
    { name: "Done", symbol: "x", next: " " },
  ],
};

// Obsidian's two native statuses: always the first two rows, characters fixed, not deletable
const LOCKED = [" ", "x"];

// Start of a checkbox line: indent, quotes/callouts (>), bullet or number, then "[c]"
const TASK = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)(.)\]/;

// A single character; an empty field stays empty (invalid until filled, a space is typed as " ")
const toSymbol = (value) => (value === "" ? "" : [...value][0]);

// Next character, or null if the status is not declared or has no next (Obsidian keeps control)
function nextStatus(statuses, current) {
  const status = statuses.find((s) => s.symbol === current);
  return status && status.next !== "" ? status.next : null;
}

// Writes a status character on the line (no-op if the line is no longer a checkbox)
function setStatus(view, line, symbol) {
  const m = TASK.exec(line.text);
  if (!m) return;
  const from = line.from + m[1].length;
  view.dispatch({ changes: { from, to: from + m[2].length, insert: symbol } });
}

// Replaces the status character of the line by the next one; returns the new status, or null
function cycleLine(view, line, statuses) {
  const m = TASK.exec(line.text);
  if (!m) return null;
  const next = nextStatus(statuses, m[2]);
  if (next === null) return null;
  setStatus(view, line, next);
  return next;
}

// The checkbox's task line, or null if the event is not on a usable checkbox
function checkboxLine(view, evt) {
  const box = evt.target;
  if (!(box instanceof HTMLInputElement) || box.type !== "checkbox") return null;
  // Like Tasks: leave callouts alone (line position is unreliable there)
  if (box.closest(".callout-content")) return null;
  const line = view.state.doc.lineAt(view.posAtDOM(box));
  return TASK.test(line.text) ? line : null;
}

// Menu of every complete status, the current one ticked; apply(symbol) writes the choice
function showStatusMenu(evt, statuses, current, apply) {
  const menu = new Menu();
  for (const status of statuses) {
    if (status.symbol === "" || status.name.trim() === "") continue;
    menu.addItem((item) =>
      item
        .setTitle(`[${status.symbol}] ${status.name}`)
        .setChecked(status.symbol === current)
        .onClick(() => apply(status.symbol))
    );
  }
  menu.showAtMouseEvent(evt);
}

// Reading mode: no editor, so the status is written in the file itself, on the checkbox's line
function readingMode(plugin) {
  return (el, ctx) => {
    // File line of a rendered checkbox: section start + the li's line offset (as Tasks does)
    const target = (evt) => {
      const box = evt.target;
      if (!(box instanceof HTMLInputElement) || box.type !== "checkbox") return null;
      if (box.closest(".callout")) return null; // callouts: unreliable line offsets, left alone
      const li = box.closest("li[data-line]");
      const info = ctx.getSectionInfo(el);
      if (!li || !info) return null;
      return { line: info.lineStart + Number(li.getAttribute("data-line")), current: li.getAttribute("data-task") || " " };
    };

    const write = (lineNo, symbol) => {
      const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
      if (!file) return;
      plugin.app.vault.process(file, (data) => {
        const lines = data.split("\n");
        const m = TASK.exec(lines[lineNo] ?? "");
        if (!m) return data; // the line moved meanwhile: change nothing
        lines[lineNo] = lines[lineNo].slice(0, m[1].length) + symbol + lines[lineNo].slice(m[1].length + m[2].length);
        return lines.join("\n");
      });
    };

    // Capture phase on the section: runs before Obsidian's own checkbox handler, and stops it
    el.addEventListener("click", (evt) => {
      const t = target(evt);
      const next = t && nextStatus(plugin.settings.statuses, t.current);
      if (next == null) return; // undeclared status: Obsidian's default toggle
      evt.preventDefault();
      evt.stopPropagation();
      write(t.line, next);
    }, true);

    el.addEventListener("contextmenu", (evt) => {
      const t = target(evt);
      if (!t) return;
      evt.preventDefault();
      evt.stopPropagation();
      showStatusMenu(evt, plugin.settings.statuses, t.current, (symbol) => write(t.line, symbol));
    }, true);
  };
}

const checkboxExtension = (plugin) =>
  ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;

        // Left click: next status of the cycle
        this.onClick = (evt) => {
          const line = checkboxLine(view, evt);
          if (!line) return;
          const statuses = plugin.settings.statuses;
          if (nextStatus(statuses, TASK.exec(line.text)[2]) === null) return;
          evt.preventDefault();
          const next = cycleLine(view, line, statuses);
          // Resync the displayed checkbox with the text after the redraw
          window.setTimeout(() => { evt.target.checked = next !== " "; }, 1);
        };

        // Right click: menu of every complete status, the current one ticked
        this.onContextMenu = (evt) => {
          const line = checkboxLine(view, evt);
          if (!line) return;
          evt.preventDefault();
          evt.stopPropagation();
          const current = TASK.exec(line.text)[2];
          showStatusMenu(evt, plugin.settings.statuses, current, (symbol) =>
            setStatus(view, view.state.doc.line(line.number), symbol)
          );
        };

        view.dom.addEventListener("click", this.onClick);
        view.dom.addEventListener("contextmenu", this.onContextMenu);
      }
      destroy() {
        this.view.dom.removeEventListener("click", this.onClick);
        this.view.dom.removeEventListener("contextmenu", this.onContextMenu);
      }
    }
  );

module.exports = class IamlostCheckboxPlugin extends Plugin {
  async onload() {
    const data = (await this.loadData()) || {};
    const statuses = data.statuses || DEFAULT_SETTINGS.statuses.map((s) => ({ ...s }));
    // " " and "x" (Obsidian's own statuses) always come first, in that order: moved up, or recreated
    LOCKED.forEach((symbol, i) => {
      const found = statuses.findIndex((s) => s.symbol === symbol);
      const status = found < 0 ? { ...DEFAULT_SETTINGS.statuses[i] } : statuses.splice(found, 1)[0];
      statuses.splice(i, 0, status);
    });
    this.settings = { statuses };
    this.registerEditorExtension(checkboxExtension(this));
    this.registerMarkdownPostProcessor(readingMode(this));

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

  // Edits go to a draft; the plugin only sees them once "Save" is clicked
  display() {
    if (!this.draft) this.draft = this.plugin.settings.statuses.map((s) => ({ ...s }));
    const { containerEl } = this;
    const statuses = this.draft;
    const checks = []; // [input, () => is the field valid?]
    let saveButton;
    containerEl.empty();
    new Setting(containerEl).setName("Checkbox statuses").setHeading();
    containerEl.createEl("p", {
      text: "One status per row: its name, its checkbox character, and the next character on click. Type a space for the empty checkbox. A checkbox whose character is not declared keeps Obsidian's default behavior. Changes apply once saved.",
    });

    // Sanity check: empty fields and duplicate characters turn red, and Save stays disabled
    const validate = () => {
      let ok = true;
      for (const [input, isValid] of checks) {
        const valid = isValid();
        input.style.borderColor = valid ? "" : "var(--text-error)";
        ok = ok && valid;
      }
      saveButton.setDisabled(!ok);
    };
    const unique = (status) => statuses.filter((s) => s.symbol === status.symbol).length === 1;

    statuses.forEach((status, i) => {
      const row = new Setting(containerEl)
        .addText((t) => {
          t.setPlaceholder("Name").setValue(status.name).onChange((v) => { status.name = v; validate(); });
          t.inputEl.style.flex = "1"; // the name takes the freed width
          checks.push([t.inputEl, () => status.name.trim() !== ""]);
        })
        .addText((t) => {
          t.inputEl.maxLength = 1;
          t.inputEl.size = 3;
          // Locked rows: Obsidian's native characters are fixed
          if (i === 0) return t.setPlaceholder("space").setDisabled(true);
          if (i < LOCKED.length) return t.setValue(status.symbol).setDisabled(true);
          t.setPlaceholder("Char").setValue(status.symbol).onChange((v) => { status.symbol = toSymbol(v); validate(); });
          checks.push([t.inputEl, () => status.symbol !== "" && unique(status)]);
        })
        .then((s) => s.controlEl.createSpan({ text: "→" })) // visual only, between Char and Next
        .addText((t) => {
          t.setPlaceholder("Next").setValue(status.next).onChange((v) => { status.next = toSymbol(v); validate(); });
          t.inputEl.maxLength = 1;
          t.inputEl.size = 3;
          checks.push([t.inputEl, () => status.next !== ""]);
        })
        .addExtraButton((b) => {
          // Locked rows cannot be deleted: the icon stays, invisible, to keep the columns aligned
          if (i < LOCKED.length) return b.setIcon("trash").extraSettingsEl.style.visibility = "hidden";
          b.setIcon("trash").setTooltip("Delete this status").onClick(() => {
            statuses.splice(i, 1);
            this.display();
          });
        });
      // No label on the left: the empty area goes away, the fields fill the row
      row.infoEl.remove();
    });

    new Setting(containerEl)
      .addButton((b) =>
        b.setButtonText("Add a status").onClick(() => {
          statuses.push({ name: "", symbol: "", next: "" });
          this.display();
        })
      )
      .addButton((b) => {
        saveButton = b;
        b.setButtonText("Save").setCta().onClick(async () => {
          this.plugin.settings.statuses = statuses.map((s) => ({ ...s }));
          await this.plugin.saveSettings();
          new Notice("Checkbox statuses saved");
        });
      });

    validate();
  }

  // Closing the settings without saving drops the draft
  hide() {
    this.draft = null;
  }
}
