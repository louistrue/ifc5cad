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
import { DoorNode } from "./DoorNode";
import { WallNode } from "./WallNode";

/**
 * Place a door relative to a host wall face.
 *
 * Workflow:
 *  1. Click a vertical wall face → face normal is captured.
 *  2. Click the horizontal centre of the opening on that face → door is created,
 *     flush with the outer face and spanning the full wall thickness.
 *
 * Thickness is automatically read from the host WallNode when available;
 * otherwise the command's own thickness property is used as a fallback.
 *
 * The door node is inserted as a sibling of the wall node in the scene tree.
 */
@command({
    key: "bim.door",
    icon: "icon-box",
})
export class DoorCommand extends MultistepCommand {
    private _width = 0.9;
    private _height = 2.1;
    private _thickness = 0.2;

    @property("door.width")
    get width(): number {
        return this._width;
    }
    set width(v: number) {
        this.setProperty("width", v);
    }

    @property("door.height")
    get height(): number {
        return this._height;
    }
    set height(v: number) {
        this.setProperty("height", v);
    }

    @property("door.thickness")
    get thickness(): number {
        return this._thickness;
    }
    set thickness(v: number) {
        this.setProperty("thickness", v);
    }

    protected override getSteps(): IStep[] {
        return [
            // Step 0: select the wall face → get its outward normal + host node
            new SelectShapeStep(ShapeType.Face, "prompt.select.faces", {
                selectedState: VisualState.faceTransparent,
            }),
            // Step 1: pick the door centre on that face
            new PointStep("prompt.pickFistPoint", this.getPositionData, true),
        ];
    }

    /** Builds the PointStep snap data once the face has been selected (step 0 done). */
    private readonly getPositionData = () => {
        const face = this.stepDatas[0]?.shapes[0]?.shape as IFace | undefined;
        if (!face) return {};
        const [, faceNormal] = face.normal(0, 0);
        return {
            preview: (pt: XYZ | undefined): ShapeMeshData[] => this.previewDoor(pt, faceNormal),
        };
    };

    private previewDoor(pt: XYZ | undefined, faceNormal: XYZ): ShapeMeshData[] {
        if (!pt) return [];
        const xvec = faceNormal.cross(XYZ.unitZ);
        if (xvec.length() < Precision.Distance) return [];
        const xvecNorm = xvec.normalize()!;
        const thickness = this.hostThickness();
        const origin = pt.sub(xvecNorm.multiply(this._width / 2)).sub(faceNormal.multiply(thickness));
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

            const doorNode = new DoorNode(
                this.document,
                clickPoint,
                faceNormal,
                this._width,
                this._height,
                thickness,
            );

            // Insert immediately after the host wall in the scene tree
            if (hostNode.parent) {
                hostNode.parent.insertAfter(hostNode, doorNode);
            } else {
                this.document.modelManager.addNode(doorNode);
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
