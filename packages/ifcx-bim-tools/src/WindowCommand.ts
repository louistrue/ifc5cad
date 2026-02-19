// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type IStep, MultistepCommand, PointOnPlaneStep, SelectShapeStep } from "chili";
import {
    EditableShapeNode,
    type IFace,
    Plane,
    Precision,
    type ShapeMeshData,
    type ShapeNode,
    ShapeType,
    Transaction,
    VisualState,
    XYZ,
    command,
    property,
} from "chili-core";
import { WallNode } from "./WallNode";
import { WindowNode } from "./WindowNode";

/**
 * Place a window relative to a host wall face, with a boolean void cut.
 *
 * Workflow:
 *  1. Click a vertical wall face → face normal is captured; wall goes transparent.
 *  2. Click the horizontal centre of the opening ON THAT FACE — the cursor is
 *     constrained to the face plane so it cannot drift off the surface.
 *
 * On confirmation the command:
 *  a) Cuts the opening void from the host wall using booleanCut, replacing
 *     the wall solid with the result.
 *  b) Inserts a WindowNode (for IFC export + property editing) as a sibling.
 *
 * Falls back to plain insertion (no cut) if the boolean operation fails.
 * Wall thickness is read automatically from WallNode; otherwise the command
 * property is used.
 */
@command({
    key: "bim.window",
    icon: "icon-box",
})
export class WindowCommand extends MultistepCommand {
    private _width = 1.2;
    private _height = 1.5;
    private _thickness = 0.2;
    private _sillHeight = 0.9;

    @property("window.width")
    get width(): number {
        return this._width;
    }
    set width(v: number) {
        this.setProperty("width", v);
    }

    @property("window.height")
    get height(): number {
        return this._height;
    }
    set height(v: number) {
        this.setProperty("height", v);
    }

    @property("window.thickness")
    get thickness(): number {
        return this._thickness;
    }
    set thickness(v: number) {
        this.setProperty("thickness", v);
    }

    @property("window.sillHeight")
    get sillHeight(): number {
        return this._sillHeight;
    }
    set sillHeight(v: number) {
        this.setProperty("sillHeight", v);
    }

    protected override getSteps(): IStep[] {
        return [
            // Step 0: select the wall face — captures face normal + host node
            new SelectShapeStep(ShapeType.Face, "prompt.select.faces", {
                selectedState: VisualState.faceTransparent,
            }),
            // Step 1: pick window centre, constrained to the selected face plane
            new PointOnPlaneStep("prompt.pickFistPoint", this.getPositionData, true),
        ];
    }

    /** Always returns a valid PointSnapData with the face plane. */
    private readonly getPositionData = () => {
        const face = this.stepDatas[0]?.shapes[0]?.shape as IFace | undefined;
        const [facePoint, faceNormal] = face ? face.normal(0, 0) : [XYZ.zero, XYZ.unitX];
        const xvec = faceNormal.cross(XYZ.unitZ);
        const xvecNorm = xvec.length() > Precision.Distance ? xvec.normalize()! : XYZ.unitY;
        // The face plane: normal = faceNormal keeps all picks on the face surface
        const facePlane = new Plane(facePoint, faceNormal, xvecNorm);
        return {
            plane: () => facePlane,
            preview: (pt: XYZ | undefined): ShapeMeshData[] => this.previewWindow(pt, faceNormal),
        };
    };

    private previewWindow(pt: XYZ | undefined, faceNormal: XYZ): ShapeMeshData[] {
        if (!pt) return [];
        const xvec = faceNormal.cross(XYZ.unitZ);
        if (xvec.length() < Precision.Distance) return [];
        const xvecNorm = xvec.normalize()!;
        const t = this.hostThickness();
        const bottomZ = pt.z + this._sillHeight;
        const winPos = new XYZ(pt.x, pt.y, bottomZ);
        const origin = winPos.sub(xvecNorm.multiply(this._width / 2)).sub(faceNormal.multiply(t));
        const plane = new Plane(origin, XYZ.unitZ, xvecNorm);
        return [
            this.meshPoint(pt),
            this.meshCreatedShape("box", plane, this._width, t, this._height),
        ];
    }

    protected override executeMainTask(): void {
        Transaction.execute(this.document, `execute ${Object.getPrototypeOf(this).data.name}`, () => {
            const shapeData = this.stepDatas[0].shapes[0];
            const face = shapeData.shape as IFace;
            const [, faceNormal] = face.normal(0, 0);
            const clickPoint = this.stepDatas[1].point!;
            const hostNode = shapeData.owner.node;
            const thickness = this.hostThickness();

            // IFC element node — preserved as sibling for export and property editing
            const windowNode = new WindowNode(
                this.document,
                clickPoint,
                faceNormal,
                this._width,
                this._height,
                thickness,
                this._sillHeight,
            );

            this.cutAndInsert(hostNode, faceNormal, clickPoint, thickness, windowNode);
            this.document.visual.update();
        });
    }

    /**
     * Cut the opening void from the host wall, replace the wall solid with the
     * result, and insert the BIM element node as a sibling. Falls back to plain
     * sibling insertion if the boolean fails.
     *
     * The void spans the sill-to-top range in Z so only the glazed area is cut;
     * the sill zone below remains solid wall.
     */
    private cutAndInsert(
        hostNode: ReturnType<typeof Object.getPrototypeOf>,
        faceNormal: XYZ,
        centre: XYZ,
        thickness: number,
        elementNode: WindowNode,
    ): void {
        const eps = 0.005; // 5 mm clearance for clean boolean
        const xvec = faceNormal.cross(XYZ.unitZ);
        const xvecNorm = xvec.length() > Precision.Distance ? xvec.normalize()! : XYZ.unitY;

        // Void starts at the sill height, cuts only the glazed opening
        const voidBottomZ = centre.z + this._sillHeight;
        const voidOrigin = new XYZ(centre.x, centre.y, voidBottomZ)
            .sub(xvecNorm.multiply((this._width + eps) / 2))
            .sub(faceNormal.multiply(thickness + eps));
        const voidPlane = new Plane(voidOrigin, XYZ.unitZ, xvecNorm);
        const voidResult = this.document.application.shapeFactory.box(
            voidPlane,
            this._width + eps,
            thickness + 2 * eps,
            this._height + eps,
        );

        const hostShapeNode = hostNode as ShapeNode;
        if (voidResult.isOk && hostShapeNode.shape?.isOk) {
            const cutResult = this.document.application.shapeFactory.booleanCut(
                [hostShapeNode.shape.value],
                [voidResult.value],
            );
            if (cutResult.isOk) {
                const cutWall = new EditableShapeNode(
                    this.document,
                    hostNode.name,
                    cutResult,
                    hostShapeNode.materialId,
                );
                if (hostNode.parent) {
                    hostNode.parent.insertAfter(hostNode, cutWall);
                    hostNode.parent.insertAfter(cutWall, elementNode);
                    hostNode.parent.remove(hostNode);
                } else {
                    this.document.modelManager.addNode(cutWall);
                    this.document.modelManager.addNode(elementNode);
                }
                return;
            }
        }

        // Fallback: no cut, just place the element
        if (hostNode.parent) {
            hostNode.parent.insertAfter(hostNode, elementNode);
        } else {
            this.document.modelManager.addNode(elementNode);
        }
    }

    private hostThickness(): number {
        const node = this.stepDatas[0]?.shapes[0]?.owner?.node;
        if (node instanceof WallNode) return node.thickness;
        return this._thickness;
    }
}
