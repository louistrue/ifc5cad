// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type I18nKeys,
    type IDocument,
    type IShape,
    ParameterShapeNode,
    type Plane,
    type Result,
    property,
    serializable,
    serialze,
} from "chili-core";

/**
 * A parametric slab node defined by a rectangular footprint plane and thickness.
 *
 * The slab extends downward (in the -normal direction) from the top surface.
 * Geometry is a rectangular prism produced by the OCC shapeFactory.box()
 * with a negative dz so it grows below the reference plane.
 *
 * IFC classification: IfcSlab / IfcSlabType (emitted by IFCXSerializer on export).
 */
@serializable(["document", "plane", "dx", "dy", "thickness"])
export class SlabNode extends ParameterShapeNode {
    override display(): I18nKeys {
        return "body.slab";
    }

    @serialze()
    get plane(): Plane {
        return this.getPrivateValue("plane");
    }

    @serialze()
    get dx(): number {
        return this.getPrivateValue("dx");
    }
    set dx(v: number) {
        this.setPropertyEmitShapeChanged("dx", v);
    }

    @serialze()
    get dy(): number {
        return this.getPrivateValue("dy");
    }
    set dy(v: number) {
        this.setPropertyEmitShapeChanged("dy", v);
    }

    @serialze()
    @property("slab.thickness")
    get thickness(): number {
        return this.getPrivateValue("thickness");
    }
    set thickness(v: number) {
        this.setPropertyEmitShapeChanged("thickness", v);
    }

    /** IFC entity type marker — read by IFCXSerializer on export. */
    readonly ifcType = "IfcSlab";

    constructor(document: IDocument, plane: Plane, dx: number, dy: number, thickness = 0.2) {
        super(document);
        this.setPrivateValue("plane", plane);
        this.setPrivateValue("dx", dx);
        this.setPrivateValue("dy", dy);
        this.setPrivateValue("thickness", thickness);
    }

    protected generateShape(): Result<IShape> {
        // Negative dz: slab grows downward from the reference plane (top surface).
        return this.document.application.shapeFactory.box(this.plane, this.dx, this.dy, -this.thickness);
    }
}
