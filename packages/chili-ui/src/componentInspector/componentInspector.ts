// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { div, Expander, label, span } from "chili-controls";
import { type IDocument, type INode, type IView, Localize, PubSub } from "chili-core";
import style from "./componentInspector.module.css";

/** Minimal IFC component definition used for display in the inspector. */
interface IfcComponentDef {
    predefinedType: string;
    psetName: string;
    pset: Record<string, unknown>;
}

/**
 * Lookup table mirroring IFC_TYPE_DEFAULTS in IFCXSerializer.
 * Kept in sync manually — the source of truth for export semantics is IFCXSerializer.
 */
const IFC_COMPONENT_DEFS: Record<string, IfcComponentDef> = {
    IfcWall: {
        predefinedType: "STANDARD",
        psetName: "Pset_WallCommon",
        pset: { IsExternal: false, LoadBearing: false, FireRating: "", ThermalTransmittance: null },
    },
    IfcSlab: {
        predefinedType: "FLOOR",
        psetName: "Pset_SlabCommon",
        pset: { IsExternal: false, LoadBearing: false, FireRating: "" },
    },
    IfcColumn: {
        predefinedType: "COLUMN",
        psetName: "Pset_ColumnCommon",
        pset: { IsExternal: false, LoadBearing: true },
    },
    IfcBeam: {
        predefinedType: "BEAM",
        psetName: "Pset_BeamCommon",
        pset: { IsExternal: false, LoadBearing: true },
    },
    IfcDoor: {
        predefinedType: "DOOR",
        psetName: "Pset_DoorCommon",
        pset: { IsExternal: false, HandicapAccessible: false, FireRating: "" },
    },
    IfcWindow: {
        predefinedType: "WINDOW",
        psetName: "Pset_WindowCommon",
        pset: { IsExternal: false, FireRating: "", ThermalTransmittance: null },
    },
    IfcStair: {
        predefinedType: "STRAIGHT_RUN_STAIR",
        psetName: "Pset_StairCommon",
        pset: { RequiredHeadroom: null, HandicapAccessible: false, FireExit: false },
    },
};

/** Ordered list of assignable IFC entity types shown in the dropdown. */
const IFC_TYPES = [
    "IfcWall",
    "IfcSlab",
    "IfcColumn",
    "IfcBeam",
    "IfcDoor",
    "IfcWindow",
    "IfcStair",
] as const;

/**
 * Component Inspector sidebar panel.
 *
 * Displays the IFCX component data that will be written on export for the
 * currently selected geometry node. All geometry nodes expose a mutable
 * `ifcType` property, so the inspector shows a dropdown that lets the user
 * assign or change the IFC class directly. Non-geometry nodes (folders, groups)
 * show a subtle "No IFC component" placeholder.
 *
 * Subscribes to the same `showProperties` and `activeViewChanged` events as
 * PropertyView so it stays in sync.
 */
export class ComponentInspector extends HTMLElement {
    private readonly panel = div({ className: style.panel });
    private _currentNode: INode | undefined;

    constructor(props: { className: string }) {
        super();
        this.classList.add(props.className, style.root);
        this.append(
            label({
                className: style.header,
                textContent: new Localize("ifc.component"),
            }),
            this.panel,
        );
        PubSub.default.sub("showProperties", this.handleShowProperties);
        PubSub.default.sub("activeViewChanged", this.handleActiveViewChanged);
    }

    private readonly handleActiveViewChanged = (view: IView | undefined) => {
        if (view) {
            const nodes = view.document.selection.getSelectedNodes();
            this.handleShowProperties(view.document, nodes);
        } else {
            this.clear();
            this.showEmpty();
        }
    };

    private readonly handleShowProperties = (_document: IDocument, nodes: INode[]) => {
        this.clear();
        this._currentNode = nodes[0];
        if (!this._currentNode) {
            this.showEmpty();
            return;
        }
        // Show the IFC class dropdown for any geometry node (duck-typed by ifcType property).
        if ("ifcType" in this._currentNode) {
            this.renderWithDropdown(this._currentNode as INode & { ifcType?: string });
        } else {
            this.showEmpty();
        }
    };

    private renderWithDropdown(node: INode & { ifcType?: string }) {
        const currentType = node.ifcType;

        // Select element for IFC class assignment
        const select = document.createElement("select");
        select.className = style.select;

        const noneOption = document.createElement("option");
        noneOption.value = "";
        noneOption.textContent = "— None —";
        if (!currentType) noneOption.selected = true;
        select.appendChild(noneOption);

        for (const type of IFC_TYPES) {
            const option = document.createElement("option");
            option.value = type;
            option.textContent = type;
            if (type === currentType) option.selected = true;
            select.appendChild(option);
        }

        this.panel.append(
            div(
                { className: style.assignRow },
                span({ className: style.propName, textContent: new Localize("ifc.assignClass") }),
                select,
            ),
        );

        // Detail section rendered below the dropdown
        const detail = div({ className: style.detail });
        this.panel.append(detail);

        if (currentType) {
            this.renderComponentDetail(detail, currentType);
        }

        select.addEventListener("change", () => {
            const newType = select.value || undefined;
            (node as any).ifcType = newType;
            while (detail.lastElementChild) detail.removeChild(detail.lastElementChild);
            if (newType) {
                this.renderComponentDetail(detail, newType);
            }
        });
    }

    private renderComponentDetail(container: HTMLElement, ifcType: string) {
        const def = IFC_COMPONENT_DEFS[ifcType];

        // IFC entity type badge
        container.append(span({ className: style.badge, textContent: ifcType }));

        // Type Properties expander (predefined type)
        const typeExpander = new Expander("ifc.typeProperties");
        typeExpander.contenxtPanel.append(
            this.propRow("predefinedType", def?.predefinedType ?? "—"),
        );
        container.append(typeExpander);

        if (!def) return;

        // Property Set expander
        const psetExpander = new Expander("ifc.propertySet");
        psetExpander.contenxtPanel.append(
            span({ textContent: def.psetName, className: style.propName, style: "margin-bottom:4px;" }),
            ...Object.entries(def.pset).map(([k, v]) => this.propRow(k, v)),
        );
        container.append(psetExpander);
    }

    private clear() {
        while (this.panel.lastElementChild) {
            this.panel.removeChild(this.panel.lastElementChild);
        }
    }

    private showEmpty() {
        this.panel.append(
            span({
                className: style.empty,
                textContent: new Localize("ifc.noComponent"),
            }),
        );
    }

    private propRow(name: string, value: unknown): HTMLDivElement {
        let valueClass = style.propValue;
        let displayValue: string;
        if (value === null || value === undefined) {
            displayValue = "—";
            valueClass = `${style.propValue} ${style.propValueNull}`;
        } else if (typeof value === "boolean") {
            displayValue = value ? "true" : "false";
            valueClass = `${style.propValue} ${value ? style.propValueTrue : style.propValueFalse}`;
        } else if (value === "") {
            displayValue = '""';
            valueClass = `${style.propValue} ${style.propValueNull}`;
        } else {
            displayValue = String(value);
        }
        return div(
            { className: style.row },
            span({ className: style.propName, textContent: name }),
            span({ className: valueClass, textContent: displayValue }),
        );
    }
}

customElements.define("chili-component-inspector", ComponentInspector);
