// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// IFC Spatial Panel: shows the IFC spatial hierarchy
// (Project → Site → Building → Storey) above the scene tree.

import { div, setSVGIcon, span, svg } from "chili-controls";
import { Binding, type IDocument } from "chili-core";
import style from "./ifcSpatialPanel.module.css";

/** One level of the IFC spatial hierarchy shown in the panel. */
interface IfcLevel {
    /** Short IFC type label shown as a badge, e.g. "IfcProject" */
    ifcType: string;
    /** Human-readable name — static string or a live Binding */
    name: string | Binding;
    /** Whether the level starts expanded */
    defaultExpanded?: boolean;
}

/**
 * Creates a single collapsible IFC spatial row.
 * Re-uses the same visual language as TreeGroup.
 */
function createSpatialRow(
    ifcType: string,
    name: string | Binding,
    depth: number,
    content: HTMLElement,
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
    const nameEl = span({ className: style.levelName, textContent: name });

    const header = div(
        {
            className: style.levelHeader,
            style: `padding-left: ${4 + depth * 14}px`,
        },
        expandIcon,
        badge,
        nameEl,
    );

    return div({ className: style.level }, header, contentEl);
}

/**
 * IFC Spatial Panel — wraps the scene `Tree` in a visual representation
 * of the IFC spatial hierarchy (Project → Site → Building → Storey).
 *
 * The hierarchy reflects what would be emitted by IFCXSerializer:
 * - Project name → document.name
 * - Site name    → "Site" (fixed)
 * - Building     → document.name
 * - Storey       → document.name
 *
 * Names are kept live via Binding so renaming the document updates labels.
 */
export class IfcSpatialPanel extends HTMLElement {
    /**
     * @param document - The active IDocument (provides document name bindings)
     * @param tree     - Pre-created Tree instance owned by the caller (ProjectView)
     */
    constructor(document: IDocument, tree: HTMLElement) {
        super();
        this.className = style.root;

        const levels: IfcLevel[] = [
            { ifcType: "IfcProject", name: new Binding(document, "name") },
            { ifcType: "IfcSite", name: "Site" },
            { ifcType: "IfcBuilding", name: new Binding(document, "name") },
            { ifcType: "IfcBuildingStorey", name: new Binding(document, "name") },
        ];

        // Build from innermost level outward so each wraps the next
        let content: HTMLElement = tree;
        for (let i = levels.length - 1; i >= 0; i--) {
            content = createSpatialRow(levels[i].ifcType, levels[i].name, i, content);
        }

        this.append(content);
    }
}

customElements.define("ifc-spatial-panel", IfcSpatialPanel);
