// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// IFC Spatial Panel — shows the IFC spatial hierarchy
// (IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey) above the
// scene tree. All level names are editable via double-click.

import { div, setSVGIcon, span, svg } from "chili-controls";
import { type IDocument, Transaction } from "chili-core";
import style from "./ifcSpatialPanel.module.css";

/**
 * Creates one collapsible row of the IFC spatial hierarchy.
 *
 * @param ifcType     - IFC class badge text (e.g. "IfcProject")
 * @param initialName - Starting name text
 * @param content     - Child element nested inside this level
 * @param onRename    - Called with the new name when the user commits an edit
 * @param onNameEl    - Receives the nameEl span so callers can update it externally
 */
function createSpatialRow(
    ifcType: string,
    initialName: string,
    content: HTMLElement,
    onRename?: (newName: string) => void,
    onNameEl?: (el: HTMLSpanElement) => void,
): HTMLDivElement {
    let expanded = true;

    const contentEl = div({ className: style.levelContent }, content);

    const expandIcon = svg({
        icon: "icon-angle-down",
        className: style.expandIcon,
        onclick: (e: MouseEvent) => {
            e.stopPropagation();
            expanded = !expanded;
            setSVGIcon(expandIcon, expanded ? "icon-angle-down" : "icon-angle-right");
            contentEl.classList.toggle(style.collapsed, !expanded);
        },
    });

    const badge = span({ className: style.ifcBadge, textContent: ifcType });
    const nameEl = span({ className: style.levelName, textContent: initialName });
    onNameEl?.(nameEl);

    // Inline editing on double-click
    nameEl.addEventListener("dblclick", (e: MouseEvent) => {
        e.stopPropagation();
        const inp = document.createElement("input");
        inp.type = "text";
        inp.value = nameEl.textContent ?? "";
        inp.className = style.levelNameInput;

        let done = false;
        const commit = () => {
            if (done) return;
            done = true;
            const next = inp.value.trim();
            if (next) {
                nameEl.textContent = next;
                onRename?.(next);
            }
            inp.replaceWith(nameEl);
        };

        inp.addEventListener("blur", commit);
        inp.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") { ev.preventDefault(); commit(); }
            else if (ev.key === "Escape") { done = true; inp.replaceWith(nameEl); }
        });

        nameEl.replaceWith(inp);
        inp.select();
        inp.focus();
    });

    const header = div(
        { className: style.levelHeader },
        expandIcon,
        badge,
        nameEl,
    );

    return div({ className: style.level }, header, contentEl);
}

/**
 * IFC Spatial Panel — wraps the scene Tree in the IFC spatial hierarchy.
 *
 * - IfcProject / IfcBuilding / IfcBuildingStorey names update document.name
 *   and re-sync when document.name changes from elsewhere (e.g. Properties panel).
 * - IfcSite name is panel-local (editable, not yet mapped to a model property).
 *
 * Visual indentation comes from CSS (each `.levelContent` adds left padding),
 * so the tree content is naturally nested at the deepest level.
 */
export class IfcSpatialPanel extends HTMLElement {
    private _projectNameEl: HTMLSpanElement | undefined;
    private _buildingNameEl: HTMLSpanElement | undefined;
    private _storeyNameEl: HTMLSpanElement | undefined;

    private readonly _onDocPropertyChanged: (property: keyof IDocument) => void;

    constructor(private readonly _document: IDocument, tree: HTMLElement) {
        super();
        this.className = style.root;

        const docName = _document.name;

        // Build from innermost to outermost
        let content: HTMLElement = tree;

        content = createSpatialRow(
            "IfcBuildingStorey", docName, content,
            (name) => {
                if (this._storeyNameEl) this._storeyNameEl.textContent = name;
                // Storey name is panel-local; update document.name only if user
                // explicitly edits via the Project level.
            },
            (el) => { this._storeyNameEl = el; },
        );

        content = createSpatialRow(
            "IfcBuilding", docName, content,
            (name) => {
                if (this._buildingNameEl) this._buildingNameEl.textContent = name;
            },
            (el) => { this._buildingNameEl = el; },
        );

        content = createSpatialRow(
            "IfcSite", "Site", content,
            undefined,  // Site keeps its own value
            undefined,
        );

        content = createSpatialRow(
            "IfcProject", docName, content,
            (name) => {
                Transaction.execute(_document, `rename: ${_document.name}`, () => {
                    _document.name = name;
                });
                // Keep building / storey in sync too
                if (this._buildingNameEl) this._buildingNameEl.textContent = name;
                if (this._storeyNameEl) this._storeyNameEl.textContent = name;
            },
            (el) => { this._projectNameEl = el; },
        );

        this.append(content);

        // Keep Project (and companions) in sync when document.name changes externally
        this._onDocPropertyChanged = (property) => {
            if (property === "name") {
                if (this._projectNameEl) this._projectNameEl.textContent = _document.name;
                if (this._buildingNameEl) this._buildingNameEl.textContent = _document.name;
                if (this._storeyNameEl) this._storeyNameEl.textContent = _document.name;
            }
        };
        _document.onPropertyChanged(this._onDocPropertyChanged as any);
    }

    override disconnectedCallback() {
        this._document.removePropertyChanged(this._onDocPropertyChanged as any);
    }
}

customElements.define("ifc-spatial-panel", IfcSpatialPanel);
