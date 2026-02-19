// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type GeometryNode,
    Precision,
    type ShapeMeshData,
    XYZ,
    command,
    property,
} from "chili-core";
import { CreateCommand, type IStep, PointStep, type SnapResult } from "chili";
import { StairNode } from "./StairNode";

/**
 * Two-click parametric stair creation tool with live stepped preview.
 *
 * Workflow:
 *  1. Click the base point (foot of first riser).
 *  2. Move cursor to set run direction + height — a real-time stepped profile
 *     preview updates as you move. Click to confirm.
 *
 * Width, riser height, and structural thickness are editable in the property
 * panel before the second click. After creation, all properties remain editable
 * on the StairNode.
 *
 * IFC semantics: IfcStairType + Pset_StairCommon are emitted on IFCX export.
 */
@command({
    key: "bim.stair",
    icon: "icon-box",
})
export class StairCommand extends CreateCommand {
    private _width = 1.2;
    private _riserHeight = 0.18;
    private _thickness = 0.15;

    @property("stair.width")
    get width(): number {
        return this._width;
    }
    set width(v: number) {
        this.setProperty("width", v);
    }

    @property("stair.riserHeight")
    get riserHeight(): number {
        return this._riserHeight;
    }
    set riserHeight(v: number) {
        if (v > 0) this.setProperty("riserHeight", v);
    }

    @property("stair.thickness")
    get thickness(): number {
        return this._thickness;
    }
    set thickness(v: number) {
        if (v > 0) this.setProperty("thickness", v);
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
            prompt: (snap: SnapResult) => {
                const pt = snap.point;
                if (!pt) return "";
                const rise = Math.abs(pt.z - base.z);
                const run = new XYZ(pt.x - base.x, pt.y - base.y, 0).length();
                if (rise < Precision.Distance || run < Precision.Distance) return "";
                const n = Math.max(1, Math.round(rise / this._riserHeight));
                return `Run=${run.toFixed(2)} m  Rise=${rise.toFixed(2)} m  Steps=${n}`;
            },
        };
    };

    private readonly previewStair = (top: XYZ | undefined): ShapeMeshData[] => {
        const base = this.stepDatas[0].point!;
        if (!top) return [this.meshPoint(base)];

        const rise = top.z - base.z;
        const runVec2D = new XYZ(top.x - base.x, top.y - base.y, 0);
        const horizontalRun = runVec2D.length();

        if (
            Math.abs(rise) < Precision.Distance ||
            horizontalRun < Precision.Distance
        ) {
            return [this.meshPoint(base), this.meshPoint(top)];
        }

        try {
            const shape = StairNode.buildStairShape(
                this.application.shapeFactory,
                base,
                top,
                this._width,
                this._riserHeight,
                this._thickness,
            );

            if (!shape.isOk) {
                return [this.meshPoint(base), this.meshPoint(top)];
            }

            return [
                this.meshPoint(base),
                this.meshPoint(top),
                this.meshShape(shape),
            ];
        } catch {
            return [this.meshPoint(base), this.meshPoint(top)];
        }
    };

    protected override geometryNode(): GeometryNode {
        const base = this.stepDatas[0].point!;
        const top = this.stepDatas[1].point!;
        return new StairNode(
            this.document,
            base,
            top,
            this._width,
            this._riserHeight,
            this._thickness,
        );
    }
}
