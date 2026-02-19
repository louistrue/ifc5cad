// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type GeometryNode, Plane, Precision, XYZ, command, property } from "chili-core";
import { CreateCommand, LengthAtAxisStep, PointStep, type IStep, type LengthAtAxisSnapData, type SnapResult } from "chili";
import { ColumnNode } from "./ColumnNode";

/**
 * Two-click column creation tool.
 *
 * Usage:
 *  1. Click the base center point of the column.
 *  2. Drag upward / type a value to set the column height.
 *
 * Width and depth default to 0.3 m and are editable in the Properties panel
 * before clicking (or afterwards on the created ColumnNode).
 *
 * IFC semantics: IfcColumnType + Pset_ColumnCommon are emitted on IFCX export.
 */
@command({
    key: "bim.column",
    icon: "icon-box",
})
export class ColumnCommand extends CreateCommand {
    private _width = 0.3;
    private _depth = 0.3;

    @property("column.width")
    get width(): number {
        return this._width;
    }
    set width(v: number) {
        this.setProperty("width", v);
    }

    @property("column.depth")
    get depth(): number {
        return this._depth;
    }
    set depth(v: number) {
        this.setProperty("depth", v);
    }

    protected override getSteps(): IStep[] {
        return [
            new PointStep("prompt.pickFistPoint"),
            new LengthAtAxisStep("prompt.pickNextPoint", this.getHeightData),
        ];
    }

    private readonly getHeightData = (): LengthAtAxisSnapData => {
        const base = this.stepDatas[0].point!;
        return {
            point: base,
            direction: XYZ.unitZ,
            preview: this.previewColumn,
            prompt: (snap: SnapResult) => {
                const pt = snap.point;
                if (!pt) return "";
                const h = Math.abs(pt.sub(base).dot(XYZ.unitZ));
                return `H=${h.toFixed(2)} m  W=${this._width.toFixed(2)} m  D=${this._depth.toFixed(2)} m`;
            },
        };
    };

    private readonly previewColumn = (end: XYZ | undefined) => {
        const base = this.stepDatas[0].point!;
        const h = end
            ? (Math.abs(end.sub(base).dot(XYZ.unitZ)) < Precision.Distance ? 3.0 : end.sub(base).dot(XYZ.unitZ))
            : 3.0;
        const origin = base.sub(new XYZ(this._width / 2, this._depth / 2, 0));
        const plane = new Plane(origin, XYZ.unitZ, XYZ.unitX);
        return [this.meshPoint(base), this.meshCreatedShape("box", plane, this._width, this._depth, h)];
    };

    private getHeight(): number {
        const p = this.stepDatas[1]?.point;
        if (!p) return 3.0;
        const h = p.sub(this.stepDatas[0].point!).dot(XYZ.unitZ);
        return Math.abs(h) < Precision.Distance ? 3.0 : h;
    }

    protected override geometryNode(): GeometryNode {
        const base = this.stepDatas[0].point!;
        return new ColumnNode(this.document, base.x, base.y, base.z, this._width, this._depth, this.getHeight());
    }
}
