// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type I18nKeys,
    type IDocument,
    type IShape,
    ParameterShapeNode,
    Plane,
    Precision,
    property,
    Result,
    serializable,
    serialze,
    XYZ,
} from "chili-core";

/**
 * A parametric door node placed relative to a host wall face.
 *
 * Geometry is a rectangular prism centred horizontally at the insertion point,
 * flushed to the outer wall face, and spanning the full wall thickness inward.
 *
 *  pos    = centre of the door opening at floor level, on the outer wall face
 *  normal = wall face outward normal (horizontal for a vertical wall)
 *
 * Orientation derivation (same convention as WallNode):
 *   xvec  = normal × Z    → along the wall run (door width direction)
 *   yvec  = Z × xvec      → faceNormal direction (door thickness / wall depth)
 *   plane normal = Z       → door height direction
 *
 * IFC classification: IfcDoor / IfcDoorType (emitted by IFCXSerializer on export).
 */
@serializable([
    "document",
    "posX",
    "posY",
    "posZ",
    "normalX",
    "normalY",
    "normalZ",
    "width",
    "height",
    "thickness",
])
export class DoorNode extends ParameterShapeNode {
    override display(): I18nKeys {
        return "body.door";
    }

    // ── Insertion point (centre-bottom on outer wall face) ────────────────────

    @serialze()
    @property("common.location")
    get posX(): number {
        return this.getPrivateValue("posX");
    }
    set posX(v: number) {
        this.setPropertyEmitShapeChanged("posX", v);
    }

    @serialze()
    get posY(): number {
        return this.getPrivateValue("posY");
    }
    set posY(v: number) {
        this.setPropertyEmitShapeChanged("posY", v);
    }

    @serialze()
    get posZ(): number {
        return this.getPrivateValue("posZ");
    }
    set posZ(v: number) {
        this.setPropertyEmitShapeChanged("posZ", v);
    }

    // ── Wall face outward normal ───────────────────────────────────────────────

    @serialze()
    get normalX(): number {
        return this.getPrivateValue("normalX");
    }
    set normalX(v: number) {
        this.setPropertyEmitShapeChanged("normalX", v);
    }

    @serialze()
    get normalY(): number {
        return this.getPrivateValue("normalY");
    }
    set normalY(v: number) {
        this.setPropertyEmitShapeChanged("normalY", v);
    }

    @serialze()
    get normalZ(): number {
        return this.getPrivateValue("normalZ");
    }
    set normalZ(v: number) {
        this.setPropertyEmitShapeChanged("normalZ", v);
    }

    // ── Dimensions ────────────────────────────────────────────────────────────

    @serialze()
    @property("door.width")
    get width(): number {
        return this.getPrivateValue("width");
    }
    set width(v: number) {
        this.setPropertyEmitShapeChanged("width", v);
    }

    @serialze()
    @property("door.height")
    get height(): number {
        return this.getPrivateValue("height");
    }
    set height(v: number) {
        this.setPropertyEmitShapeChanged("height", v);
    }

    @serialze()
    @property("door.thickness")
    get thickness(): number {
        return this.getPrivateValue("thickness");
    }
    set thickness(v: number) {
        this.setPropertyEmitShapeChanged("thickness", v);
    }

    /** IFC entity type marker — read by IFCXSerializer on export. */
    readonly ifcType = "IfcDoor";

    constructor(document: IDocument, pos: XYZ, normal: XYZ, width = 0.9, height = 2.1, thickness = 0.2) {
        super(document);
        this.setPrivateValue("posX", pos.x);
        this.setPrivateValue("posY", pos.y);
        this.setPrivateValue("posZ", pos.z);
        this.setPrivateValue("normalX", normal.x);
        this.setPrivateValue("normalY", normal.y);
        this.setPrivateValue("normalZ", normal.z);
        this.setPrivateValue("width", width);
        this.setPrivateValue("height", height);
        this.setPrivateValue("thickness", thickness);
    }

    protected generateShape(): Result<IShape> {
        const normal = new XYZ(this.normalX, this.normalY, this.normalZ).normalize();
        if (!normal) return Result.err("Door normal is zero-length");

        // Wall run direction: perpendicular to normal in horizontal plane.
        // xvec = normal × Z  (same derivation as WallNode yvec = Z.cross(xvec))
        const xvec = normal.cross(XYZ.unitZ);
        if (xvec.length() < Precision.Distance) {
            return Result.err("Cannot place a door on a horizontal surface");
        }
        const xvecNorm = xvec.normalize()!;

        // yvec = Z × xvec = faceNormal direction (door depth into wall)
        // Verified: for normal=+X, xvec=−Y, yvec=Z×(−Y)=+X ✓
        const pos = new XYZ(this.posX, this.posY, this.posZ);

        // Origin: shift left by width/2 to centre, pull back by thickness so
        // the box spans from (face − thickness) inward back to the face surface.
        const origin = pos.sub(xvecNorm.multiply(this.width / 2)).sub(normal.multiply(this.thickness));

        const plane = new Plane(origin, XYZ.unitZ, xvecNorm);
        // dx=width along xvec, dy=thickness along yvec=faceNormal, dz=height along Z
        return this.document.application.shapeFactory.box(plane, this.width, this.thickness, this.height);
    }
}
