// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type I18nKeys,
    type IDocument,
    type IShape,
    ParameterShapeNode,
    Plane,
    Precision,
    Result,
    XYZ,
    property,
    serializable,
    serialze,
} from "chili-core";

/**
 * A parametric stair node defined by a base point, top-landing point, and stair width.
 *
 * The geometry is a bounding-box solid spanning from the foot point to the top-landing
 * point. This correctly represents the overall stair volume for clash detection and
 * IFCX export while keeping shape generation simple and robust.
 *
 * Typical authoring workflow: place the stair bounding box, then add detailed
 * geometry via linked geometry or sub-element decomposition in a future phase.
 *
 * IFC classification: IfcStair / IfcStairType (emitted by IFCXSerializer on export).
 */
@serializable([
    "document",
    "baseX",
    "baseY",
    "baseZ",
    "topX",
    "topY",
    "topZ",
    "width",
])
export class StairNode extends ParameterShapeNode {
    override display(): I18nKeys {
        return "body.stair";
    }

    // ── Base (bottom-front) point ─────────────────────────────────────────────

    @serialze()
    @property("common.location")
    get baseX(): number {
        return this.getPrivateValue("baseX");
    }
    set baseX(v: number) {
        this.setPropertyEmitShapeChanged("baseX", v);
    }

    @serialze()
    get baseY(): number {
        return this.getPrivateValue("baseY");
    }
    set baseY(v: number) {
        this.setPropertyEmitShapeChanged("baseY", v);
    }

    @serialze()
    get baseZ(): number {
        return this.getPrivateValue("baseZ");
    }
    set baseZ(v: number) {
        this.setPropertyEmitShapeChanged("baseZ", v);
    }

    // ── Top (upper-landing) point ─────────────────────────────────────────────

    @serialze()
    get topX(): number {
        return this.getPrivateValue("topX");
    }
    set topX(v: number) {
        this.setPropertyEmitShapeChanged("topX", v);
    }

    @serialze()
    get topY(): number {
        return this.getPrivateValue("topY");
    }
    set topY(v: number) {
        this.setPropertyEmitShapeChanged("topY", v);
    }

    @serialze()
    get topZ(): number {
        return this.getPrivateValue("topZ");
    }
    set topZ(v: number) {
        this.setPropertyEmitShapeChanged("topZ", v);
    }

    // ── Width ─────────────────────────────────────────────────────────────────

    @serialze()
    @property("stair.width")
    get width(): number {
        return this.getPrivateValue("width");
    }
    set width(v: number) {
        this.setPropertyEmitShapeChanged("width", v);
    }

    /** IFC entity type marker — read by IFCXSerializer on export. */
    readonly ifcType = "IfcStair";

    constructor(
        document: IDocument,
        base: XYZ,
        top: XYZ,
        width = 1.2,
    ) {
        super(document);
        this.setPrivateValue("baseX", base.x);
        this.setPrivateValue("baseY", base.y);
        this.setPrivateValue("baseZ", base.z);
        this.setPrivateValue("topX", top.x);
        this.setPrivateValue("topY", top.y);
        this.setPrivateValue("topZ", top.z);
        this.setPrivateValue("width", width);
    }

    protected generateShape(): Result<IShape> {
        const base = new XYZ(this.baseX, this.baseY, this.baseZ);
        const top = new XYZ(this.topX, this.topY, this.topZ);

        const runVec = top.sub(base);
        const runLength = runVec.length();

        if (runLength < Precision.Distance) {
            return Result.err("Stair base and top points are too close");
        }

        const rise = top.z - base.z;
        if (Math.abs(rise) < Precision.Distance) {
            return Result.err("Stair base and top points must have different elevations");
        }

        // Build the bounding box along the stair run direction.
        const xvec = runVec.normalize()!;
        const xvecForPlane = Math.abs(xvec.z) > 1 - Precision.Distance ? XYZ.unitX : xvec;
        const yvec = XYZ.unitZ.cross(xvecForPlane).normalize()!;

        // Origin at base, centered on stair width.
        const origin = base.sub(yvec.multiply(this.width / 2));
        const plane = new Plane(origin, XYZ.unitZ, xvecForPlane);

        // dx = horizontal run length, dy = width, dz = rise
        const horizontalRun = Math.sqrt(runVec.x ** 2 + runVec.y ** 2);
        return this.document.application.shapeFactory.box(
            plane,
            horizontalRun < Precision.Distance ? runLength : horizontalRun,
            this.width,
            Math.abs(rise),
        );
    }
}
