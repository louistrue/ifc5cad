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
 * A parametric door node defined by a base insertion point and opening dimensions.
 *
 * The door leaf is modelled as a rectangular prism (width × thickness × height)
 * placed with its lower-left corner at the insertion point.
 *
 * IFC classification: IfcDoor / IfcDoorType (emitted by IFCXSerializer on export).
 */
@serializable(["document", "baseX", "baseY", "baseZ", "width", "thickness", "height"])
export class DoorNode extends ParameterShapeNode {
    override display(): I18nKeys {
        return "body.door";
    }

    // ── Insertion point ───────────────────────────────────────────────────────

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
    @property("door.width")
    get width(): number {
        return this.getPrivateValue("width");
    }
    set width(v: number) {
        this.setPropertyEmitShapeChanged("width", v);
    }

    @serialze()
    @property("door.thickness")
    get thickness(): number {
        return this.getPrivateValue("thickness");
    }
    set thickness(v: number) {
        this.setPropertyEmitShapeChanged("thickness", v);
    }

    @serialze()
    @property("door.height")
    get height(): number {
        return this.getPrivateValue("height");
    }
    set height(v: number) {
        this.setPropertyEmitShapeChanged("height", v);
    }

    /** IFC entity type marker — read by IFCXSerializer on export. */
    readonly ifcType = "IfcDoor";

    constructor(
        document: IDocument,
        baseX: number,
        baseY: number,
        baseZ: number,
        width = 0.9,
        thickness = 0.2,
        height = 2.1,
    ) {
        super(document);
        this.setPrivateValue("baseX", baseX);
        this.setPrivateValue("baseY", baseY);
        this.setPrivateValue("baseZ", baseZ);
        this.setPrivateValue("width", width);
        this.setPrivateValue("thickness", thickness);
        this.setPrivateValue("height", height);
    }

    protected generateShape(): Result<IShape> {
        const origin = new XYZ(this.baseX, this.baseY, this.baseZ);
        const plane = new Plane(origin, XYZ.unitZ, XYZ.unitX);
        return this.document.application.shapeFactory.box(plane, this.width, this.thickness, this.height);
    }
}
