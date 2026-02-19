// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type I18nKeys,
    type IDocument,
    type IShape,
    type IShapeFactory,
    ParameterShapeNode,
    Precision,
    Result,
    XYZ,
    type XYZLike,
    property,
    serializable,
    serialze,
} from "chili-core";

/**
 * Parametric stair node with true stepped profile geometry.
 *
 * The stair is defined by a base point (foot of first riser) and a top point
 * (top-landing edge). The shape is built by:
 *   1. Computing numSteps from the rise and target riserHeight.
 *   2. Building a closed stepped profile (polygon) in the run-direction / Z plane.
 *   3. Converting the wire to a face and extruding it by the stair width.
 *
 * Properties are fully editable: changing any value regenerates the geometry.
 *
 * IFC classification: IfcStair / IfcStairType (emitted by IFCXSerializer).
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
    "riserHeight",
    "thickness",
])
export class StairNode extends ParameterShapeNode {
    override display(): I18nKeys {
        return "body.stair";
    }

    // ── Base (foot of first riser) ─────────────────────────────────────────

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

    // ── Top (upper-landing edge) ───────────────────────────────────────────

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

    // ── Dimensions ─────────────────────────────────────────────────────────

    @serialze()
    @property("stair.width")
    get width(): number {
        return this.getPrivateValue("width");
    }
    set width(v: number) {
        if (v > 0) this.setPropertyEmitShapeChanged("width", v);
    }

    @serialze()
    @property("stair.riserHeight")
    get riserHeight(): number {
        return this.getPrivateValue("riserHeight");
    }
    set riserHeight(v: number) {
        if (v > 0) this.setPropertyEmitShapeChanged("riserHeight", v);
    }

    @serialze()
    @property("stair.thickness")
    get thickness(): number {
        return this.getPrivateValue("thickness");
    }
    set thickness(v: number) {
        if (v > 0) this.setPropertyEmitShapeChanged("thickness", v);
    }

    constructor(
        document: IDocument,
        base: XYZ,
        top: XYZ,
        width = 1.2,
        riserHeight = 0.18,
        thickness = 0.15,
    ) {
        super(document);
        this.setPrivateValue("ifcType", "IfcStair");
        this.setPrivateValue("baseX", base.x);
        this.setPrivateValue("baseY", base.y);
        this.setPrivateValue("baseZ", base.z);
        this.setPrivateValue("topX", top.x);
        this.setPrivateValue("topY", top.y);
        this.setPrivateValue("topZ", top.z);
        this.setPrivateValue("width", width);
        this.setPrivateValue("riserHeight", riserHeight);
        this.setPrivateValue("thickness", thickness);
    }

    protected generateShape(): Result<IShape> {
        const base = new XYZ(this.baseX, this.baseY, this.baseZ);
        const top = new XYZ(this.topX, this.topY, this.topZ);
        return StairNode.buildStairShape(
            this.document.application.shapeFactory,
            base,
            top,
            this.width,
            this.riserHeight,
            this.thickness,
        );
    }

    /**
     * Build stepped stair solid from base/top points.
     * Shared between StairNode (geometry) and StairCommand (preview).
     */
    static buildStairShape(
        factory: IShapeFactory,
        base: XYZ,
        top: XYZ,
        width: number,
        targetRiserHeight: number,
        thickness: number,
    ): Result<IShape> {
        // Auto-detect direction: ensure rise is always positive (base = lower point)
        const [actualBase, actualTop] = top.z < base.z ? [top, base] : [base, top];

        const rise = actualTop.z - actualBase.z;
        if (Math.abs(rise) < Precision.Distance) {
            return Result.err("Stair must have a height difference");
        }

        const runVec2D = new XYZ(actualTop.x - actualBase.x, actualTop.y - actualBase.y, 0);
        const horizontalRun = runVec2D.length();
        if (horizontalRun < Precision.Distance) {
            return Result.err("Stair must have horizontal distance");
        }

        const numSteps = Math.max(1, Math.round(Math.abs(rise) / targetRiserHeight));
        const actualRiser = Math.abs(rise) / numSteps;
        const actualTread = horizontalRun / numSteps;

        // Run direction (horizontal, normalised)
        const runDir = runVec2D.normalize()!;
        // Width direction (perpendicular to run, horizontal)
        const widthDir = XYZ.unitZ.cross(runDir).normalize()!;

        // Profile origin: offset by -width/2 in width direction
        const profileOrigin = actualBase.sub(widthDir.multiply(width / 2));

        // Build stepped profile in the run-Z plane
        const pts = StairNode.stairProfilePoints(
            profileOrigin,
            runDir,
            numSteps,
            actualTread,
            actualRiser,
            thickness,
        );

        const wire = factory.polygon(pts);
        if (!wire.isOk) return Result.err(`Stair profile failed: ${wire.error}`);

        const face = wire.value.toFace();
        if (!face.isOk) {
            wire.value.dispose();
            return Result.err(`Stair face failed: ${face.error}`);
        }

        const extrudeVec = widthDir.multiply(width);
        const solid = factory.prism(face.value, extrudeVec);
        face.value.dispose();
        return solid;
    }

    /**
     * Compute the closed stair profile polygon points with structural thickness.
     *
     * Side view (X = run direction, Z = up):
     * ```
     *         ┌──┐
     *      ┌──┘  │
     *   ┌──┘     │
     *   │        │
     *   └────────┘  ← parallel soffit (offset perpendicular to stair diagonal)
     * ```
     * The soffit runs parallel to the stair diagonal, offset inward by `thickness`
     * measured perpendicular to that diagonal — giving the stair structural depth.
     */
    static stairProfilePoints(
        origin: XYZ,
        runDir: XYZ,
        numSteps: number,
        tread: number,
        riser: number,
        thickness: number,
    ): XYZLike[] {
        const totalRun = numSteps * tread;
        const totalRise = numSteps * riser;
        const diagLen = Math.sqrt(totalRun * totalRun + totalRise * totalRise);
        // Components of the unit normal perpendicular to the stair diagonal (pointing inward/downward)
        const sinA = totalRise / diagLen; // run-axis component of inward normal
        const cosA = totalRun / diagLen;  // Z-axis component of inward normal

        const pts: XYZLike[] = [];

        // ── Stepped top profile (front face) ─────────────────────────────────
        // Start at the foot of the first riser (base point at floor level)
        pts.push(origin);

        // Stepped profile: for each step go up (riser) then forward (tread)
        for (let i = 0; i < numSteps; i++) {
            pts.push(
                origin
                    .add(runDir.multiply(i * tread))
                    .add(XYZ.unitZ.multiply((i + 1) * riser)),
            );
            pts.push(
                origin
                    .add(runDir.multiply((i + 1) * tread))
                    .add(XYZ.unitZ.multiply((i + 1) * riser)),
            );
        }

        // ── Parallel soffit (back face, inset by thickness) ───────────────────
        // back-bottom corner: perpendicular offset from last tread end
        pts.push(
            origin
                .add(runDir.multiply(totalRun + thickness * sinA))
                .add(XYZ.unitZ.multiply(totalRise - thickness * cosA)),
        );
        // front-bottom corner: perpendicular offset from origin
        pts.push(
            origin
                .add(runDir.multiply(thickness * sinA))
                .add(XYZ.unitZ.multiply(-thickness * cosA)),
        );
        // Polygon closes from front-bottom back to origin.
        return pts;
    }
}
