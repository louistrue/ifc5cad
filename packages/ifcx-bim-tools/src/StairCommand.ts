// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type GeometryNode, Plane, Precision, XYZ, command, property } from "chili-core";
import { CreateCommand, type IStep, PointStep } from "chili";
import { StairNode } from "./StairNode";

/**
 * Two-click stair creation tool.
 *
 * Usage:
 *  1. Click the bottom-front point of the stair (foot of first riser).
 *  2. Click the top-landing point — the stair bounding box is created.
 *
 * Width is editable before clicking. After creation all properties are editable
 * on the StairNode in the Properties panel.
 *
 * IFC semantics: IfcStairType + Pset_StairCommon are emitted on IFCX export.
 */
@command({
    key: "bim.stair",
    icon: "icon-box",
})
export class StairCommand extends CreateCommand {
    private _width = 1.2;

    @property("stair.width")
    get width(): number {
        return this._width;
    }
    set width(v: number) {
        this.setProperty("width", v);
    }

    protected override getSteps(): IStep[] {
        return [
            new PointStep("prompt.pickFistPoint"),
            new PointStep("prompt.pickNextPoint", this.getStep2Data),
        ];
    }

    private readonly getStep2Data = () => {
        const base = this.stepDatas[0].point!;
        return {
            refPoint: () => base,
            preview: this.previewStair,
        };
    };

    private readonly previewStair = (top: XYZ | undefined) => {
        const base = this.stepDatas[0].point!;
        if (top === undefined) return [this.meshPoint(base)];

        const runVec = top.sub(base);
        const runLength = runVec.length();
        if (runLength < Precision.Distance) return [this.meshPoint(base)];

        const rise = Math.abs(top.z - base.z);
        if (rise < Precision.Distance) return [this.meshPoint(base), this.meshPoint(top)];

        const xvec = runVec.normalize()!;
        const xvecForPlane = Math.abs(xvec.z) > 1 - Precision.Distance ? XYZ.unitX : xvec;
        const yvec = XYZ.unitZ.cross(xvecForPlane).normalize()!;
        const origin = base.sub(yvec.multiply(this._width / 2));
        const plane = new Plane(origin, XYZ.unitZ, xvecForPlane);

        const horizontalRun = Math.sqrt(runVec.x ** 2 + runVec.y ** 2);
        const dx = horizontalRun < Precision.Distance ? runLength : horizontalRun;

        return [
            this.meshPoint(base),
            this.meshPoint(top),
            this.meshCreatedShape("box", plane, dx, this._width, rise),
        ];
    };

    protected override geometryNode(): GeometryNode {
        const base = this.stepDatas[0].point!;
        const top = this.stepDatas[1].point!;
        return new StairNode(this.document, base, top, this._width);
    }
}
