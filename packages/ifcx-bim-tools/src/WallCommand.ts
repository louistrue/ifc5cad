// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type GeometryNode, Plane, Precision, XYZ, command, property } from "chili-core";
import { CreateCommand, type IStep, PointStep } from "chili";
import { WallNode } from "./WallNode";

/**
 * Two-click wall creation tool.
 *
 * Usage:
 *  1. Click to place the wall start point.
 *  2. Click to place the wall end point — wall is created.
 *
 * Height and thickness can be changed in the Properties panel before clicking.
 * After creation, both are editable on the WallNode in the Properties panel.
 *
 * IFC semantics are applied by IFCXSerializer on export (IfcWallType + Pset_WallCommon).
 */
@command({
    key: "bim.wall",
    icon: "icon-box",
})
export class WallCommand extends CreateCommand {
    private _height = 3.0;
    private _thickness = 0.2;

    @property("wall.height")
    get height(): number {
        return this._height;
    }
    set height(v: number) {
        this.setProperty("height", v);
    }

    @property("wall.thickness")
    get thickness(): number {
        return this._thickness;
    }
    set thickness(v: number) {
        this.setProperty("thickness", v);
    }

    protected override getSteps(): IStep[] {
        return [
            new PointStep("prompt.pickFistPoint"),
            new PointStep("prompt.pickNextPoint", this.getStep2Data),
        ];
    }

    private readonly getStep2Data = () => {
        const start = this.stepDatas[0].point!;
        return {
            refPoint: () => start,
            preview: this.previewWall,
        };
    };

    private readonly previewWall = (end: XYZ | undefined) => {
        const start = this.stepDatas[0].point!;
        if (end === undefined) {
            return [this.meshPoint(start)];
        }

        const wallVec = end.sub(start);
        const length = wallVec.length();
        if (length < Precision.Distance) {
            return [this.meshPoint(start)];
        }

        const xvec = wallVec.normalize()!;
        const normal = XYZ.unitZ;
        const xvecForPlane = Math.abs(xvec.z) > 1 - Precision.Distance ? XYZ.unitX : xvec;
        const yvec = normal.cross(xvecForPlane).normalize()!;
        const origin = start.sub(yvec.multiply(this._thickness / 2));
        const plane = new Plane(origin, normal, xvecForPlane);

        return [
            this.meshPoint(start),
            this.meshPoint(end),
            this.meshCreatedShape("box", plane, length, this._thickness, this._height),
        ];
    };

    protected override geometryNode(): GeometryNode {
        const start = this.stepDatas[0].point!;
        const end = this.stepDatas[1].point!;
        return new WallNode(this.document, start, end, this._height, this._thickness);
    }
}
