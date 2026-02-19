// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type IStep, MultistepCommand, PointStep, SelectShapeStep } from "chili";
import {
    command,
    type IFace,
    Plane,
    Precision,
    property,
    type ShapeMeshData,
    ShapeType,
    Transaction,
    VisualState,
    XYZ,
} from "chili-core";
import { WallNode } from "./WallNode";
import { WindowNode } from "./WindowNode";

/**
 * Place a window relative to a host wall face.
 *
 * Workflow:
 *  1. Click a vertical wall face → face normal is captured.
 *  2. Click the horizontal centre of the opening on that face → window is created,
 *     flush with the outer face, raised from floor level by sillHeight.
 *
 * Thickness is automatically read from the host WallNode when available.
 * The window node is inserted as a sibling of the wall node in the scene tree.
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
            // Step 0: select the wall face → get its outward normal + host node
            new SelectShapeStep(ShapeType.Face, "prompt.select.faces", {
                selectedState: VisualState.faceTransparent,
            }),
            // Step 1: pick the window centre on that face
            new PointStep("prompt.pickFistPoint", this.getPositionData, true),
        ];
    }

    /** Builds the PointStep snap data once the face has been selected (step 0 done). */
    private readonly getPositionData = () => {
        const face = this.stepDatas[0]?.shapes[0]?.shape as IFace | undefined;
        if (!face) return {};
        const [, faceNormal] = face.normal(0, 0);
        return {
            preview: (pt: XYZ | undefined): ShapeMeshData[] => this.previewWindow(pt, faceNormal),
        };
    };

    private previewWindow(pt: XYZ | undefined, faceNormal: XYZ): ShapeMeshData[] {
        if (!pt) return [];
        const xvec = faceNormal.cross(XYZ.unitZ);
        if (xvec.length() < Precision.Distance) return [];
        const xvecNorm = xvec.normalize()!;
        const thickness = this.hostThickness();
        const bottomZ = pt.z + this._sillHeight;
        const winPos = new XYZ(pt.x, pt.y, bottomZ);
        const origin = winPos.sub(xvecNorm.multiply(this._width / 2)).sub(faceNormal.multiply(thickness));
        const plane = new Plane(origin, XYZ.unitZ, xvecNorm);
        return [
            this.meshPoint(pt),
            this.meshCreatedShape("box", plane, this._width, thickness, this._height),
        ];
    }

    protected override executeMainTask(): void {
        Transaction.execute(this.document, `excute ${Object.getPrototypeOf(this).data.name}`, () => {
            const shapeData = this.stepDatas[0].shapes[0];
            const face = shapeData.shape as IFace;
            const [, faceNormal] = face.normal(0, 0);
            const clickPoint = this.stepDatas[1].point!;
            const hostNode = shapeData.owner.node;
            const thickness = this.hostThickness();

            const windowNode = new WindowNode(
                this.document,
                clickPoint,
                faceNormal,
                this._width,
                this._height,
                thickness,
                this._sillHeight,
            );

            // Insert immediately after the host wall in the scene tree
            if (hostNode.parent) {
                hostNode.parent.insertAfter(hostNode, windowNode);
            } else {
                this.document.modelManager.addNode(windowNode);
            }

            this.document.visual.update();
        });
    }

    /** Read wall thickness from host WallNode; fall back to command property. */
    private hostThickness(): number {
        const node = this.stepDatas[0]?.shapes[0]?.owner?.node;
        if (node instanceof WallNode) return node.thickness;
        return this._thickness;
    }
}
