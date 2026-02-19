// Part of the Chili3d Project, under the AGPL-3.0 License.
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
 * A parametric beam node defined by a start point, end point, and cross-section dimensions.
 *
 * The rectangular section (width × depth) is centered on the start-to-end axis.
 *  - width  : horizontal dimension perpendicular to the beam direction
 *  - depth  : vertical dimension (beam height in the structural sense)
 *
 * The box plane is built so that:
 *   xvec = normalized start → end    (dx = span length)
 *   yvec = Z × xvec (horizontal perp) (dy = width)
 *   zvec = xvec × yvec = ~ Z         (dz = depth)
 *
 * Origin is shifted -width/2 in yvec and -depth/2 in Z so the section is centred.
 *
 * IFC classification: IfcBeam / IfcBeamType (emitted by IFCXSerializer on export).
 */
@serializable(["document", "startX", "startY", "startZ", "endX", "endY", "endZ", "width", "depth"])
export class BeamNode extends ParameterShapeNode {
    override display(): I18nKeys {
        return "body.beam";
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

    // ── Cross-section dimensions ───────────────────────────────────────────────

    @serialze()
    @property("beam.width")
    get width(): number {
        return this.getPrivateValue("width");
    }
    set width(v: number) {
        this.setPropertyEmitShapeChanged("width", v);
    }

    @serialze()
    @property("beam.depth")
    get depth(): number {
        return this.getPrivateValue("depth");
    }
    set depth(v: number) {
        this.setPropertyEmitShapeChanged("depth", v);
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(
        document: IDocument,
        start: XYZ,
        end: XYZ,
        width = 0.2,
        depth = 0.3,
    ) {
        super(document);
        this.setPrivateValue("ifcType", "IfcBeam");
        this.setPrivateValue("startX", start.x);
        this.setPrivateValue("startY", start.y);
        this.setPrivateValue("startZ", start.z);
        this.setPrivateValue("endX", end.x);
        this.setPrivateValue("endY", end.y);
        this.setPrivateValue("endZ", end.z);
        this.setPrivateValue("width", width);
        this.setPrivateValue("depth", depth);
    }

    // ── Shape generation ──────────────────────────────────────────────────────

    protected generateShape(): Result<IShape> {
        const start = new XYZ(this.startX, this.startY, this.startZ);
        const end = new XYZ(this.endX, this.endY, this.endZ);

        const beamVec = end.sub(start);
        const span = beamVec.length();

        if (span < Precision.Distance) {
            return Result.err("Beam start and end points are too close");
        }

        // Beam direction (X axis of the box)
        const xvec = beamVec.normalize()!;

        // Avoid degenerate cross-product when beam is vertical
        const xvecForPlane = Math.abs(xvec.z) > 1 - Precision.Distance ? XYZ.unitX : xvec;

        // yvec = Z × xvec  →  horizontal direction perpendicular to beam
        const yvec = XYZ.unitZ.cross(xvecForPlane).normalize()!;

        // Shift origin so the cross-section is centred on the beam axis:
        //   -width/2 in yvec direction
        //   -depth/2 in Z direction
        const origin = start
            .sub(yvec.multiply(this.width / 2))
            .sub(XYZ.unitZ.multiply(this.depth / 2));

        const plane = new Plane(origin, XYZ.unitZ, xvecForPlane);

        return this.document.application.shapeFactory.box(plane, span, this.width, this.depth);
    }
}
