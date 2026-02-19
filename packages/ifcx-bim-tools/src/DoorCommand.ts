// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type GeometryNode, Plane, XYZ, command, property } from "chili-core";
import { CreateCommand, type IStep, PointStep } from "chili";
import { DoorNode } from "./DoorNode";

/**
 * Single-click door placement tool.
 *
 * Usage:
 *  1. Set width, thickness, and height in the Properties panel (optional).
 *  2. Click to place the door — its lower-left corner lands at the picked point.
 *
 * IFC semantics: IfcDoorType + Pset_DoorCommon are emitted on IFCX export.
 */
@command({
    key: "bim.door",
    icon: "icon-box",
})
export class DoorCommand extends CreateCommand {
    private _width = 0.9;
    private _thickness = 0.2;
    private _height = 2.1;

    @property("door.width")
    get width(): number {
        return this._width;
    }
    set width(v: number) {
        this.setProperty("width", v);
    }

    @property("door.thickness")
    get thickness(): number {
        return this._thickness;
    }
    set thickness(v: number) {
        this.setProperty("thickness", v);
    }

    @property("door.height")
    get height(): number {
        return this._height;
    }
    set height(v: number) {
        this.setProperty("height", v);
    }

    protected override getSteps(): IStep[] {
        return [new PointStep("prompt.pickFistPoint", () => ({ preview: this.previewDoor }))];
    }

    private readonly previewDoor = (pt: XYZ | undefined) => {
        if (pt === undefined) return [];
        const plane = new Plane(pt, XYZ.unitZ, XYZ.unitX);
        return [
            this.meshPoint(pt),
            this.meshCreatedShape("box", plane, this._width, this._thickness, this._height),
        ];
    };

    protected override geometryNode(): GeometryNode {
        const base = this.stepDatas[0].point!;
        return new DoorNode(this.document, base.x, base.y, base.z, this._width, this._thickness, this._height);
    }
}
