// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Config, type Plane, XYZ } from "chili-core";
import { ViewUtils } from "chili-vis";
import type { ISnap, MouseAndDetected, SnapResult } from "../snap";

export abstract class PlaneSnapBase implements ISnap {
    removeDynamicObject(): void {}
    clear(): void {}
    abstract snap(data: MouseAndDetected): SnapResult | undefined;

    constructor(readonly refPoint?: () => XYZ) {}

    protected snapAtPlane(plane: Plane, data: MouseAndDetected): SnapResult | undefined {
        plane = ViewUtils.ensurePlane(data.view, plane);
        const ray = data.view.rayAt(data.mx, data.my);
        let point = plane.intersectRay(ray);
        if (!point) return undefined;

        if (Config.instance.gridSnap) {
            point = PlaneSnapBase.quantizeToGrid(point, plane);
        }

        const distance = this.refPoint ? this.refPoint().distanceTo(point) : undefined;

        return {
            view: data.view,
            point,
            distance,
            shapes: [],
        };
    }

    static quantizeToGrid(point: XYZ, plane: Plane): XYZ {
        const g = Config.instance.gridSize;
        const local = point.sub(plane.origin);
        const s = Math.round(local.dot(plane.xvec) / g) * g;
        const t = Math.round(local.dot(plane.yvec) / g) * g;
        return plane.origin.add(plane.xvec.multiply(s)).add(plane.yvec.multiply(t));
    }
}

export class WorkplaneSnap extends PlaneSnapBase {
    snap(data: MouseAndDetected): SnapResult | undefined {
        return this.snapAtPlane(data.view.workplane, data);
    }
}

export class PlaneSnap extends PlaneSnapBase {
    constructor(
        readonly plane: (point: XYZ) => Plane,
        refPoint?: () => XYZ,
    ) {
        super(refPoint);
    }

    snap(data: MouseAndDetected): SnapResult | undefined {
        const point = data.view.screenToWorld(data.mx, data.my);
        const plane = this.plane(point);
        const result = this.snapAtPlane(plane, data);
        if (result) {
            result.plane = plane;
        }
        return result;
    }
}
