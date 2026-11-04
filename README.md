---
tags: ai_generated
---

# iamlostwhatisthischeckbox

Plugin Obsidian minimal : en Live Preview, un clic sur une case à cocher la fait passer au **statut suivant d'un cycle choisi**, au lieu du simple « vide / coché ».

Exemple avec le cycle `[ ] [D] [x]` : `- [ ]` → `- [D]` → `- [x]` → `- [ ]`…

Seul le caractère entre crochets change : ni date, ni propriété ajoutée (contrairement au plugin Tasks, dont le mécanisme de clic est repris).

## Réglages
- **Cycle des statuts** : les statuts dans l'ordre, entre crochets, par exemple `[ ] [D] [x]`.
- Une case dont le statut n'est pas dans le cycle garde le comportement normal d'Obsidian.

## Commande
- **Statut suivant de la case** : même cycle, sur la ligne du curseur. À lier à un raccourci clavier ; utile en mode source.

## Installation
Copier le dossier `iamlostwhatisthischeckbox/` (`main.js` et `manifest.json`) dans `<vault>/.obsidian/plugins/`, puis activer le plugin dans les réglages d'Obsidian.

## Limites connues
- Cases dans les callouts ignorées (comme Tasks).
- Mode lecture non géré : seulement Live Preview et la commande.
- JavaScript brut, sans étape de build : version « quick and dirty ».
