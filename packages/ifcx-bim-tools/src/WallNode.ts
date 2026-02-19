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
 * A parametric wall node defined by a start point, end point, height, and thickness.
 *
 * The wall is centered on the start-to-end centerline. Geometry is a rectangular
 * prism produced by the OCC shapeFactory.box().
 *
 * IFC classification: IfcWall / IfcWallType (attached by WallCommand via IFCXSerializer).
 */
@serializable(["document", "startX", "startY", "startZ", "endX", "endY", "endZ", "height", "thickness"])
export class WallNode extends ParameterShapeNode {
    override display(): I18nKeys {
        return "body.wall";
    }

    // ── Start point ───────────────────────────────────────────────────────────

    @serialze()
    @property("common.location")
    get startX(): number {
        return this.getPrivateValue("startX");
    }
    set startX(v: number) {
        this.setPropertyEmitShapeChanged("startX", v);
    }

    @serialze()
    get startY(): number {
        return this.getPrivateValue("startY");
    }
    set startY(v: number) {
        this.setPropertyEmitShapeChanged("startY", v);
    }

    @serialze()
    get startZ(): number {
        return this.getPrivateValue("startZ");
    }
    set startZ(v: number) {
        this.setPropertyEmitShapeChanged("startZ", v);
    }

    // ── End point ─────────────────────────────────────────────────────────────

    @serialze()
    get endX(): number {
        return this.getPrivateValue("endX");
    }
    set endX(v: number) {
        this.setPropertyEmitShapeChanged("endX", v);
    }

    @serialze()
    get endY(): number {
        return this.getPrivateValue("endY");
    }
    set endY(v: number) {
        this.setPropertyEmitShapeChanged("endY", v);
    }

    @serialze()
    get endZ(): number {
        return this.getPrivateValue("endZ");
    }
    set endZ(v: number) {
        this.setPropertyEmitShapeChanged("endZ", v);
    }

    // ── Dimensions ────────────────────────────────────────────────────────────

    @serialze()
    @property("wall.height")
    get height(): number {
        return this.getPrivateValue("height");
    }
    set height(v: number) {
        this.setPropertyEmitShapeChanged("height", v);
    }

    @serialze()
    @property("wall.thickness")
    get thickness(): number {
        return this.getPrivateValue("thickness");
    }
    set thickness(v: number) {
        this.setPropertyEmitShapeChanged("thickness", v);
    }

    // ── IFC type marker (used by IFCXSerializer) ──────────────────────────────

    /** The IFC entity type for this wall. Serialized for round-trip export. */
    readonly ifcType = "IfcWall";

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(
        document: IDocument,
        start: XYZ,
        end: XYZ,
        height = 3.0,
        thickness = 0.2,
    ) {
        super(document);
        this.setPrivateValue("startX", start.x);
        this.setPrivateValue("startY", start.y);
        this.setPrivateValue("startZ", start.z);
        this.setPrivateValue("endX", end.x);
        this.setPrivateValue("endY", end.y);
        this.setPrivateValue("endZ", end.z);
        this.setPrivateValue("height", height);
        this.setPrivateValue("thickness", thickness);
    }

    // ── Shape generation ──────────────────────────────────────────────────────

    protected generateShape(): Result<IShape> {
        const start = new XYZ(this.startX, this.startY, this.startZ);
        const end = new XYZ(this.endX, this.endY, this.endZ);

        const wallVec = end.sub(start);
        const length = wallVec.length();

        if (length < Precision.Distance) {
            return Result.err("Wall start and end points are too close");
        }

        // Wall direction (X axis of box)
        const xvec = wallVec.normalize()!;

        // Perpendicular direction in horizontal plane: yvec = Z × xvec
        // (Plane constructor uses yvec = normal.cross(xvec))
        const normal = XYZ.unitZ;

        // Ensure xvec is not parallel to Z (vertical wall — fallback to X)
        const xvecForPlane = Math.abs(xvec.z) > 1 - Precision.Distance ? XYZ.unitX : xvec;

        // Plane origin offset so the wall centerline aligns with start→end.
        // yvec = normal.cross(xvec) — shift origin by -thickness/2 in yvec direction.
        const yvec = normal.cross(xvecForPlane).normalize()!;
        const origin = start.sub(yvec.multiply(this.thickness / 2));

        const plane = new Plane(origin, normal, xvecForPlane);

        return this.document.application.shapeFactory.box(plane, length, this.thickness, this.height);
    }
}
