// Part of the Chili3d Project, under the AGPL-3.0 License.
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
 * A parametric window node placed relative to a host wall face.
 *
 * Geometry is a rectangular prism centred horizontally at the insertion point,
 * flushed to the outer wall face, spanning the full wall thickness, and raised
 * from the floor level by the sill height.
 *
 *  pos        = horizontal centre of the window opening at floor level, on
 *               the outer wall face (sillHeight is added internally)
 *  normal     = wall face outward normal (horizontal for a vertical wall)
 *  sillHeight = distance from floor to bottom of the glazing (default 0.9 m)
 *
 * IFC classification: IfcWindow / IfcWindowType (emitted by IFCXSerializer on export).
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
    "sillHeight",
])
export class WindowNode extends ParameterShapeNode {
    override display(): I18nKeys {
        return "body.window";
    }

    // ── Insertion point (horizontal centre at floor level on outer wall face) ─

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
    @property("window.width")
    get width(): number {
        return this.getPrivateValue("width");
    }
    set width(v: number) {
        this.setPropertyEmitShapeChanged("width", v);
    }

    @serialze()
    @property("window.height")
    get height(): number {
        return this.getPrivateValue("height");
    }
    set height(v: number) {
        this.setPropertyEmitShapeChanged("height", v);
    }

    @serialze()
    @property("window.thickness")
    get thickness(): number {
        return this.getPrivateValue("thickness");
    }
    set thickness(v: number) {
        this.setPropertyEmitShapeChanged("thickness", v);
    }

    @serialze()
    @property("window.sillHeight")
    get sillHeight(): number {
        return this.getPrivateValue("sillHeight");
    }
    set sillHeight(v: number) {
        this.setPropertyEmitShapeChanged("sillHeight", v);
    }

    constructor(
        document: IDocument,
        pos: XYZ,
        normal: XYZ,
        width = 1.2,
        height = 1.5,
        thickness = 0.2,
        sillHeight = 0.9,
    ) {
        super(document);
        this.setPrivateValue("ifcType", "IfcWindow");
        this.setPrivateValue("posX", pos.x);
        this.setPrivateValue("posY", pos.y);
        this.setPrivateValue("posZ", pos.z);
        this.setPrivateValue("normalX", normal.x);
        this.setPrivateValue("normalY", normal.y);
        this.setPrivateValue("normalZ", normal.z);
        this.setPrivateValue("width", width);
        this.setPrivateValue("height", height);
        this.setPrivateValue("thickness", thickness);
        this.setPrivateValue("sillHeight", sillHeight);
    }

    protected generateShape(): Result<IShape> {
        const normal = new XYZ(this.normalX, this.normalY, this.normalZ).normalize();
        if (!normal) return Result.err("Window normal is zero-length");

        const xvec = normal.cross(XYZ.unitZ);
        if (xvec.length() < Precision.Distance) {
            return Result.err("Cannot place a window on a horizontal surface");
        }
        const xvecNorm = xvec.normalize()!;

        // Raise origin by sill height; pull inward by thickness
        const bottomZ = this.posZ + this.sillHeight;
        const pos = new XYZ(this.posX, this.posY, bottomZ);

        const origin = pos.sub(xvecNorm.multiply(this.width / 2)).sub(normal.multiply(this.thickness));

        const plane = new Plane(origin, XYZ.unitZ, xvecNorm);
        return this.document.application.shapeFactory.box(plane, this.width, this.thickness, this.height);
    }
}
