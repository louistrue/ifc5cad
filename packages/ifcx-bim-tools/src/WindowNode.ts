// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type I18nKeys,
    type IDocument,
    type IShape,
    ParameterShapeNode,
    Plane,
    type Result,
    XYZ,
    property,
    serializable,
    serialze,
} from "chili-core";

/**
 * A parametric window node defined by a base insertion point and glazing dimensions.
 *
 * The window frame is a rectangular prism (width × thickness × height) placed
 * with its lower-left corner at the insertion point and offset upward by sillHeight.
 *
 * IFC classification: IfcWindow / IfcWindowType (emitted by IFCXSerializer on export).
 */
@serializable(["document", "baseX", "baseY", "baseZ", "width", "thickness", "height", "sillHeight"])
export class WindowNode extends ParameterShapeNode {
    override display(): I18nKeys {
        return "body.window";
    }

    // ── Insertion point (lower-left corner at floor level) ────────────────────

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
    @property("window.thickness")
    get thickness(): number {
        return this.getPrivateValue("thickness");
    }
    set thickness(v: number) {
        this.setPropertyEmitShapeChanged("thickness", v);
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
    @property("window.sillHeight")
    get sillHeight(): number {
        return this.getPrivateValue("sillHeight");
    }
    set sillHeight(v: number) {
        this.setPropertyEmitShapeChanged("sillHeight", v);
    }

    /** IFC entity type marker — read by IFCXSerializer on export. */
    readonly ifcType = "IfcWindow";

    constructor(
        document: IDocument,
        baseX: number,
        baseY: number,
        baseZ: number,
        width = 1.2,
        thickness = 0.2,
        height = 1.5,
        sillHeight = 0.8,
    ) {
        super(document);
        this.setPrivateValue("baseX", baseX);
        this.setPrivateValue("baseY", baseY);
        this.setPrivateValue("baseZ", baseZ);
        this.setPrivateValue("width", width);
        this.setPrivateValue("thickness", thickness);
        this.setPrivateValue("height", height);
        this.setPrivateValue("sillHeight", sillHeight);
    }

    protected generateShape(): Result<IShape> {
        // Raise origin by sill height so the window sits at the correct level.
        const origin = new XYZ(this.baseX, this.baseY, this.baseZ + this.sillHeight);
        const plane = new Plane(origin, XYZ.unitZ, XYZ.unitX);
        return this.document.application.shapeFactory.box(plane, this.width, this.thickness, this.height);
    }
}
