// iamlostwhatisthischeckbox : clic sur une case en Live Preview → statut suivant d'un cycle choisi.
// Plugin en JavaScript brut, sans étape de build (quick and dirty). Mécanisme repris de Tasks
// (extension CodeMirror qui intercepte le clic), sans dates ni propriétés ajoutées.
const { Plugin, PluginSettingTab, Setting } = require("obsidian");
const { ViewPlugin } = require("@codemirror/view");

const DEFAULT_SETTINGS = { cycle: "[ ] [x]" };

// Début de ligne d'une case : retrait, citations/callouts (>), puce ou numéro, puis "[c]"
const TASK = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)(.)\]/;

// "[ ] [D] [x]" → [" ", "D", "x"]
function parseCycle(text) {
  return [...text.matchAll(/\[(.)\]/g)].map((m) => m[1]);
}

// Statut suivant, ou null si le statut n'est pas dans le cycle (Obsidian garde la main)
function nextStatus(statuses, current) {
  const i = statuses.indexOf(current);
  return i < 0 ? null : statuses[(i + 1) % statuses.length];
}

// Remplace le caractère de statut de la ligne ; renvoie le nouveau statut, ou null
function cycleLine(view, line, statuses) {
  const m = TASK.exec(line.text);
  if (!m) return null;
  const next = nextStatus(statuses, m[2]);
  if (next === null) return null;
  const from = line.from + m[1].length;
  view.dispatch({ changes: { from, to: from + 1, insert: next } });
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
          // Comme Tasks : on laisse les callouts tranquilles (position de ligne peu fiable)
          if (box.closest(".callout-content")) return;
          const line = view.state.doc.lineAt(view.posAtDOM(box));
          const statuses = parseCycle(plugin.settings.cycle);
          if (nextStatus(statuses, TASK.exec(line.text)?.[2]) === null) return;
          evt.preventDefault();
          const next = cycleLine(view, line, statuses);
          // La case affichée se resynchronise avec le texte après le redessin
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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.registerEditorExtension(checkboxExtension(this));

    // Même cycle au clavier, sur la ligne du curseur (utile en mode source)
    this.addCommand({
      id: "cycle-checkbox-status",
      name: "Statut suivant de la case",
      editorCallback: (editor) => {
        const cm = editor.cm; // EditorView de CodeMirror 6 (non documenté, mais stable)
        const line = cm.state.doc.lineAt(cm.state.selection.main.head);
        cycleLine(cm, line, parseCycle(this.settings.cycle));
      },
    });

    this.addSettingTab(new CycleSettingTab(this.app, this));
  }
};

class CycleSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName("Cycle des statuts")
      .setDesc("Statuts dans l'ordre, entre crochets. Après le dernier, retour au premier. Exemple : [ ] [D] [x]")
      .addText((text) =>
        text.setValue(this.plugin.settings.cycle).onChange(async (value) => {
          this.plugin.settings.cycle = value;
          await this.plugin.saveData(this.plugin.settings);
        })
      );
  }
}
