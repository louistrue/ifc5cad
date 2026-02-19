// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type GeometryNode, Precision, type XYZ, command, property } from "chili-core";
import { LengthAtAxisStep, RectCommandBase, type IStep, type LengthAtAxisSnapData } from "chili";
import { SlabNode } from "./SlabNode";

/**
 * Three-click slab creation tool.
 *
 * Usage:
 *  1. Click first corner of the slab footprint.
 *  2. Click opposite corner — footprint is defined.
 *  3. Drag downward / type value to set thickness.
 *
 * After creation, thickness is editable in the Properties panel.
 *
 * IFC semantics: IfcSlabType + Pset_SlabCommon are emitted on IFCX export.
 */
@command({
    key: "bim.slab",
    icon: "icon-box",
})
export class SlabCommand extends RectCommandBase {
    private _thickness = 0.2;

    @property("slab.thickness")
    get thickness(): number {
        return this._thickness;
    }
    set thickness(v: number) {
        this.setProperty("thickness", v);
    }

    protected override getSteps(): IStep[] {
        return [...super.getSteps(), new LengthAtAxisStep("prompt.pickNextPoint", this.getThicknessData)];
    }

    private readonly getThicknessData = (): LengthAtAxisSnapData => {
        const plane = this.stepDatas[1].plane ?? this.stepDatas[0].view.workplane;
        return {
            point: this.stepDatas[1].point!,
            direction: plane.normal.multiply(-1),
            preview: this.previewSlab,
        };
    };

    private readonly previewSlab = (end: XYZ | undefined) => {
        if (!end) return [];
        const rect = this.rectDataFromTwoSteps();
        const plane = this.stepDatas[1].plane ?? this.stepDatas[0].view.workplane;
        const h = end.sub(this.stepDatas[1].point!).dot(plane.normal);
        const t = Math.abs(h);
        const thickness = t < Precision.Distance ? this._thickness : t;
        return [this.meshCreatedShape("box", rect.plane, rect.dx, rect.dy, -thickness)];
    };

    protected override geometryNode(): GeometryNode {
        const rect = this.rectDataFromTwoSteps();
        const p3 = this.stepDatas[2].point!;
        const plane = this.stepDatas[1].plane ?? this.stepDatas[0].view.workplane;
        const h = p3.sub(this.stepDatas[1].point!).dot(plane.normal);
        const thickness = Math.abs(h) < Precision.Distance ? this._thickness : Math.abs(h);
        return new SlabNode(this.document, rect.plane, rect.dx, rect.dy, thickness);
    }
}
