// iamlostwhatisthischeckbox: clicking a checkbox (Live Preview or Reading mode) moves it to the next status of a custom cycle.
// Plain JavaScript, no build step (quick and dirty). Click mechanism borrowed from Tasks
// (a CodeMirror extension that intercepts the click), without dates or added properties.
const { FuzzySuggestModal, Menu, Notice, Plugin, PluginSettingTab, Setting } = require("obsidian");
const { ViewPlugin } = require("@codemirror/view");

// A status = a name, its checkbox character, and the character that follows it on click (like Tasks)
const DEFAULT_SETTINGS = {
  statuses: [
    { name: "To do", symbol: " ", next: "x" },
    { name: "Done", symbol: "x", next: " " },
  ],
};

// Obsidian's two native statuses: always present, characters fixed, not deletable (rows flagged "locked")
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

// Previous character: the status whose next is the current one, or null. Several can lead to the
// same one (e.g. "x" and "A" both → " "): the last row wins, so custom rows beat the locked ones
function previousStatus(statuses, current) {
  const status = [...statuses].reverse().find((s) => s.symbol !== "" && s.next === current);
  return status ? status.symbol : null;
}

// Applies compute(current) → new character (or null to skip) to every checkbox line the selection touches
function applyToSelection(view, compute) {
  const { state } = view;
  const seen = new Set();
  const changes = [];
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      const line = state.doc.line(n);
      const m = TASK.exec(line.text);
      const symbol = m && compute(m[2]);
      if (symbol == null) continue;
      const from = line.from + m[1].length;
      changes.push({ from, to: from + m[2].length, insert: symbol });
    }
  }
  if (changes.length) view.dispatch({ changes });
}

// Keyboard version of the right-click menu: fuzzy list of the complete statuses
class StatusPicker extends FuzzySuggestModal {
  constructor(app, statuses, onPick) {
    super(app);
    this.statuses = statuses.filter((s) => s.symbol !== "" && s.name.trim() !== "");
    this.onPick = onPick;
    this.setPlaceholder("Pick a checkbox status");
  }
  getItems() { return this.statuses; }
  getItemText(status) { return `[${status.symbol}] ${status.name}`; }
  onChooseItem(status) { this.onPick(status.symbol); }
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
    // " " and "x" (Obsidian's own statuses) always exist and carry the lock, wherever they sit
    LOCKED.forEach((symbol, i) => {
      const found = statuses.find((s) => s.symbol === symbol);
      if (found) found.locked = true;
      else statuses.splice(i, 0, { ...DEFAULT_SETTINGS.statuses[i], locked: true });
    });
    this.settings = { statuses };
    this.registerEditorExtension(checkboxExtension(this));
    this.registerMarkdownPostProcessor(readingMode(this));

    // Keyboard commands, on every checkbox line of the selection (editor.cm: CodeMirror 6 EditorView,
    // undocumented but stable)
    this.addCommand({
      id: "cycle-checkbox-status",
      name: "Cycle checkbox status",
      editorCallback: (editor) => applyToSelection(editor.cm, (c) => nextStatus(this.settings.statuses, c)),
    });
    this.addCommand({
      id: "previous-checkbox-status",
      name: "Previous checkbox status",
      editorCallback: (editor) => applyToSelection(editor.cm, (c) => previousStatus(this.settings.statuses, c)),
    });
    this.addCommand({
      id: "pick-checkbox-status",
      name: "Pick checkbox status",
      editorCallback: (editor) =>
        new StatusPicker(this.app, this.settings.statuses, (symbol) => applyToSelection(editor.cm, () => symbol)).open(),
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
          if (status.locked && status.symbol === " ") return t.setPlaceholder("space").setDisabled(true);
          if (status.locked) return t.setValue(status.symbol).setDisabled(true);
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
        // Reorder any row, locked ones included (the menu and "Previous" follow this order)
        .addExtraButton((b) => {
          b.setIcon("arrow-up").setTooltip("Move up");
          if (i === 0) return b.extraSettingsEl.style.visibility = "hidden";
          b.onClick(() => {
            statuses.splice(i - 1, 0, statuses.splice(i, 1)[0]);
            this.display();
          });
        })
        .addExtraButton((b) => {
          b.setIcon("arrow-down").setTooltip("Move down");
          if (i === statuses.length - 1) return b.extraSettingsEl.style.visibility = "hidden";
          b.onClick(() => {
            statuses.splice(i + 1, 0, statuses.splice(i, 1)[0]);
            this.display();
          });
        })
        .addExtraButton((b) => {
          // Locked rows cannot be deleted: the icon stays, invisible, to keep the columns aligned
          if (status.locked) return b.setIcon("trash").extraSettingsEl.style.visibility = "hidden";
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

  // Closing the settings without saving drops the draft, and says so if it had changes
  hide() {
    if (this.draft && JSON.stringify(this.draft) !== JSON.stringify(this.plugin.settings.statuses)) {
      new Notice("Unsaved checkbox status changes discarded");
    }
    this.draft = null;
  }
}
