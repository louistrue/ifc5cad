// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type GeometryNode, Plane, Precision, XYZ, command, property } from "chili-core";
import { CreateCommand, PointOnPlaneStep, PointStep, type IStep } from "chili";
import { SlabNode } from "./SlabNode";

/**
 * Two-click slab creation tool — always horizontal (Z-up), thickness from settings.
 *
 * Workflow:
 *  1. Click first corner of the slab footprint (sets elevation and start).
 *  2. Click opposite corner — second click is constrained to the horizontal
 *     plane at the elevation set in step 1, so the slab is always level.
 *
 * Thickness is taken directly from the tool's property panel; there is no
 * third drag step. The slab grows downward from the clicked elevation by
 * the specified thickness.
 *
 * IFC semantics: IfcSlabType + Pset_SlabCommon are emitted on IFCX export.
 */
@command({
    key: "bim.slab",
    icon: "icon-box",
})
export class SlabCommand extends CreateCommand {
    private _thickness = 0.3;

    @property("slab.thickness")
    get thickness(): number {
        return this._thickness;
    }
    set thickness(v: number) {
        this.setProperty("thickness", v);
    }

    protected override getSteps(): IStep[] {
        return [
            // Step 0: free 3D pick — sets the slab elevation and first corner
            new PointStep("prompt.pickFistPoint"),
            // Step 1: constrained to horizontal plane at step-0 Z level
            new PointOnPlaneStep("prompt.pickNextPoint", this.getStep2Data),
        ];
    }

    private readonly getStep2Data = () => {
        const start = this.stepDatas[0].point!;
        return {
            refPoint: () => start,
            // Horizontal plane at the same elevation as the first point
            plane: () => new Plane(start, XYZ.unitZ, XYZ.unitX),
            preview: this.previewSlab,
        };
    };

    private readonly previewSlab = (end: XYZ | undefined) => {
        const start = this.stepDatas[0].point!;
        if (!end) return [this.meshPoint(start)];
        const { plane, dx, dy } = this.slabRect(end);
        if (dx < Precision.Distance || dy < Precision.Distance) return [this.meshPoint(start)];
        return [
            this.meshPoint(start),
            this.meshPoint(end),
            // Negative thickness: slab grows downward from the clicked level
            this.meshCreatedShape("box", plane, dx, dy, -this._thickness),
        ];
    };

    /**
     * Compute an axis-aligned, always-horizontal rect from start → end.
     * Both points share the same Z because step 1 uses PointOnPlaneStep.
     * dx and dy are always positive; origin is the lower-left XY corner.
     */
    private slabRect(end: XYZ): { plane: Plane; dx: number; dy: number } {
        const start = this.stepDatas[0].point!;
        const dx = Math.abs(end.x - start.x);
        const dy = Math.abs(end.y - start.y);
        const originX = Math.min(start.x, end.x);
        const originY = Math.min(start.y, end.y);
        const origin = new XYZ(originX, originY, start.z);
        const plane = new Plane(origin, XYZ.unitZ, XYZ.unitX);
        return { plane, dx, dy };
    }

    protected override geometryNode(): GeometryNode {
        const end = this.stepDatas[1].point!;
        const { plane, dx, dy } = this.slabRect(end);
        return new SlabNode(this.document, plane, dx, dy, this._thickness);
    }
}
