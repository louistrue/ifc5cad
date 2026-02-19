// Part of the IFCstudio Project, under the AGPL-3.0 License.
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
};

/**
 * Component Inspector sidebar panel.
 *
 * Displays the IFCX component data that will be written on export for the
 * currently selected BIM element. Subscribes to the same `showProperties`
 * and `activeViewChanged` events as PropertyView so it stays in sync.
 *
 * When no BIM element is selected the panel shows a subtle "No IFC component"
 * message so the user knows what the panel is for.
 */
export class ComponentInspector extends HTMLElement {
    private readonly panel = div({ className: style.panel });

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
        if (nodes.length === 0) {
            this.showEmpty();
            return;
        }
        // Use first selected node; only show IFC data if it carries an ifcType.
        const node = nodes[0];
        const ifcType = (node as unknown as { ifcType?: string }).ifcType;
        if (!ifcType) {
            this.showEmpty();
            return;
        }
        this.renderComponent(ifcType);
    };

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

    private renderComponent(ifcType: string) {
        const def = IFC_COMPONENT_DEFS[ifcType];

        // IFC entity type badge
        this.panel.append(span({ className: style.badge, textContent: ifcType }));

        // Type Properties expander (predefined type)
        const typeExpander = new Expander("ifc.typeProperties");
        typeExpander.contenxtPanel.append(
            this.propRow("predefinedType", def?.predefinedType ?? "—"),
        );
        this.panel.append(typeExpander);

        if (!def) return;

        // Property Set expander
        const psetExpander = new Expander("ifc.propertySet");
        psetExpander.contenxtPanel.append(
            span({ textContent: def.psetName, className: style.propName, style: "margin-bottom:4px;" }),
            ...Object.entries(def.pset).map(([k, v]) => this.propRow(k, v)),
        );
        this.panel.append(psetExpander);
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
