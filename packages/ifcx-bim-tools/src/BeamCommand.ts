// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type GeometryNode, Plane, Precision, XYZ, command, property } from "chili-core";
import { CreateCommand, type IStep, PointStep } from "chili";
import { BeamNode } from "./BeamNode";

/**
 * Two-click beam creation tool.
 *
 * Usage:
 *  1. Click to place the beam start point.
 *  2. Click to place the beam end point — beam is created.
 *
 * Width (horizontal cross-section) and depth (vertical cross-section) can be
 * set in the Properties panel before clicking. After creation both are editable
 * on the BeamNode.
 *
 * IFC semantics: IfcBeamType + Pset_BeamCommon are emitted on IFCX export.
 */
@command({
    key: "bim.beam",
    icon: "icon-box",
})
export class BeamCommand extends CreateCommand {
    private _width = 0.2;
    private _depth = 0.3;

    @property("beam.width")
    get width(): number {
        return this._width;
    }
    set width(v: number) {
        this.setProperty("width", v);
    }

    @property("beam.depth")
    get depth(): number {
        return this._depth;
    }
    set depth(v: number) {
        this.setProperty("depth", v);
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
            preview: this.previewBeam,
        };
    };

    private readonly previewBeam = (end: XYZ | undefined) => {
        const start = this.stepDatas[0].point!;
        if (end === undefined) {
            return [this.meshPoint(start)];
        }

        const beamVec = end.sub(start);
        const span = beamVec.length();
        if (span < Precision.Distance) {
            return [this.meshPoint(start)];
        }

        const xvec = beamVec.normalize()!;
        const xvecForPlane = Math.abs(xvec.z) > 1 - Precision.Distance ? XYZ.unitX : xvec;
        const yvec = XYZ.unitZ.cross(xvecForPlane).normalize()!;
        const origin = start
            .sub(yvec.multiply(this._width / 2))
            .sub(XYZ.unitZ.multiply(this._depth / 2));
        const plane = new Plane(origin, XYZ.unitZ, xvecForPlane);

        return [
            this.meshPoint(start),
            this.meshPoint(end),
            this.meshCreatedShape("box", plane, span, this._width, this._depth),
        ];
    };

    protected override geometryNode(): GeometryNode {
        const start = this.stepDatas[0].point!;
        const end = this.stepDatas[1].point!;
        return new BeamNode(this.document, start, end, this._width, this._depth);
    }
}
