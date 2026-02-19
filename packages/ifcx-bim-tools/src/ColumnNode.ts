// Part of the Chili3d Project, under the AGPL-3.0 License.
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
 * A parametric column node defined by a base center point and cross-section dimensions.
 *
 * The rectangular section (width × depth) is centered on the base point and
 * extruded vertically by height. OCC geometry via shapeFactory.box().
 *
 * IFC classification: IfcColumn / IfcColumnType (emitted by IFCXSerializer on export).
 */
@serializable(["document", "baseX", "baseY", "baseZ", "width", "depth", "height"])
export class ColumnNode extends ParameterShapeNode {
    override display(): I18nKeys {
        return "body.column";
    }

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

    @serialze()
    @property("column.width")
    get width(): number {
        return this.getPrivateValue("width");
    }
    set width(v: number) {
        this.setPropertyEmitShapeChanged("width", v);
    }

    @serialze()
    @property("column.depth")
    get depth(): number {
        return this.getPrivateValue("depth");
    }
    set depth(v: number) {
        this.setPropertyEmitShapeChanged("depth", v);
    }

    @serialze()
    @property("column.height")
    get height(): number {
        return this.getPrivateValue("height");
    }
    set height(v: number) {
        this.setPropertyEmitShapeChanged("height", v);
    }

    constructor(
        document: IDocument,
        baseX: number,
        baseY: number,
        baseZ: number,
        width = 0.3,
        depth = 0.3,
        height = 3.0,
    ) {
        super(document);
        this.setPrivateValue("ifcType", "IfcColumn");
        this.setPrivateValue("baseX", baseX);
        this.setPrivateValue("baseY", baseY);
        this.setPrivateValue("baseZ", baseZ);
        this.setPrivateValue("width", width);
        this.setPrivateValue("depth", depth);
        this.setPrivateValue("height", height);
    }

    protected generateShape(): Result<IShape> {
        // Box origin: offset from base center so section is centered.
        const origin = new XYZ(this.baseX - this.width / 2, this.baseY - this.depth / 2, this.baseZ);
        const plane = new Plane(origin, XYZ.unitZ, XYZ.unitX);
        return this.document.application.shapeFactory.box(plane, this.width, this.depth, this.height);
    }
}
