// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type GeometryNode, Plane, XYZ, command, property } from "chili-core";
import { CreateCommand, type IStep, PointStep } from "chili";
import { WindowNode } from "./WindowNode";

/**
 * Single-click window placement tool.
 *
 * Usage:
 *  1. Set width, thickness, height, and sill height in the Properties panel (optional).
 *  2. Click to place the window — the insertion point is the wall base at floor level;
 *     the window box is raised by sillHeight automatically.
 *
 * IFC semantics: IfcWindowType + Pset_WindowCommon are emitted on IFCX export.
 */
@command({
    key: "bim.window",
    icon: "icon-box",
})
export class WindowCommand extends CreateCommand {
    private _width = 1.2;
    private _thickness = 0.2;
    private _height = 1.5;
    private _sillHeight = 0.8;

    @property("window.width")
    get width(): number {
        return this._width;
    }
    set width(v: number) {
        this.setProperty("width", v);
    }

    @property("window.thickness")
    get thickness(): number {
        return this._thickness;
    }
    set thickness(v: number) {
        this.setProperty("thickness", v);
    }

    @property("window.height")
    get height(): number {
        return this._height;
    }
    set height(v: number) {
        this.setProperty("height", v);
    }

    @property("window.sillHeight")
    get sillHeight(): number {
        return this._sillHeight;
    }
    set sillHeight(v: number) {
        this.setProperty("sillHeight", v);
    }

    protected override getSteps(): IStep[] {
        return [new PointStep("prompt.pickFistPoint", () => ({ preview: this.previewWindow }))];
    }

    private readonly previewWindow = (pt: XYZ | undefined) => {
        if (pt === undefined) return [];
        const origin = new XYZ(pt.x, pt.y, pt.z + this._sillHeight);
        const plane = new Plane(origin, XYZ.unitZ, XYZ.unitX);
        return [
            this.meshPoint(pt),
            this.meshCreatedShape("box", plane, this._width, this._thickness, this._height),
        ];
    };

    protected override geometryNode(): GeometryNode {
        const base = this.stepDatas[0].point!;
        return new WindowNode(
            this.document,
            base.x,
            base.y,
            base.z,
            this._width,
            this._thickness,
            this._height,
            this._sillHeight,
        );
    }
}
