// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { FolderNode, Mesh, MeshNode, type IDocument, type INode } from "chili-core";
import type { IIfcLiteDocument, IIfcLiteEntity } from "./ifcLiteDocument";
import { parseEntityReference, parseReferenceList, splitTopLevel, unquote } from "./ifcLiteParser";

const IFC_REL_AGGREGATES = "IFCRELAGGREGATES";
const IFC_REL_CONTAINED = "IFCRELCONTAINEDINSPATIALSTRUCTURE";
const IFC_PROJECT = "IFCPROJECT";

interface ITransform3D {
    origin: [number, number, number];
    xAxis: [number, number, number];
    yAxis: [number, number, number];
    zAxis: [number, number, number];
}

interface ITriMeshData {
    points: number[][];
    triangles: number[][];
}

const IDENTITY_TRANSFORM: ITransform3D = {
    origin: [0, 0, 0],
    xAxis: [1, 0, 0],
    yAxis: [0, 1, 0],
    zAxis: [0, 0, 1],
};

export class IfcLiteImporter {
    static import(ifc: IIfcLiteDocument, document: IDocument): FolderNode {
        const root = new FolderNode(document, "IFC");
        const byId = new Map<number, IIfcLiteEntity>(ifc.entities.map((x) => [x.id, x]));
        const children = buildChildrenMap(ifc.entities);

        const project = ifc.entities.find((x) => x.type === IFC_PROJECT);
        if (!project) {
            root.add(new FolderNode(document, "IFC Model"));
            return root;
        }

        const projectNode = createTreeNode(document, byId, children, project.id, new Set<number>());
        root.add(projectNode);
        return root;
    }
}

function buildChildrenMap(entities: IIfcLiteEntity[]): Map<number, number[]> {
    const map = new Map<number, number[]>();

    for (const entity of entities) {
        if (entity.type === IFC_REL_AGGREGATES) {
            const parent = parseEntityReference(entity.args[4] ?? "");
            const refs = parseReferenceList(entity.args[5] ?? "");
            if (parent !== undefined) map.set(parent, [...(map.get(parent) ?? []), ...refs]);
        }

        if (entity.type === IFC_REL_CONTAINED) {
            const refs = parseReferenceList(entity.args[4] ?? "");
            const parent = parseEntityReference(entity.args[5] ?? "");
            if (parent !== undefined) map.set(parent, [...(map.get(parent) ?? []), ...refs]);
        }
    }

    return map;
}

function createTreeNode(
    document: IDocument,
    byId: Map<number, IIfcLiteEntity>,
    childMap: Map<number, number[]>,
    entityId: number,
    visited: Set<number>,
): INode {
    const entity = byId.get(entityId);
    const node = createIfcNode(document, entity, byId);

    if (!entity || visited.has(entityId)) {
        return node;
    }

    visited.add(entityId);

    if (node instanceof FolderNode) {
        for (const childId of childMap.get(entityId) ?? []) {
            node.add(createTreeNode(document, byId, childMap, childId, visited));
        }
    }

    return node;
}

function createIfcNode(
    document: IDocument,
    entity: IIfcLiteEntity | undefined,
    byId: Map<number, IIfcLiteEntity>,
): INode {
    const name = toDisplayName(entity);

    if (entity) {
        const mesh = tryExtractMesh(entity, byId);
        if (mesh) {
            return new MeshNode(document, mesh, name);
        }
    }

    return new FolderNode(document, name);
}

function tryExtractMesh(entity: IIfcLiteEntity, byId: Map<number, IIfcLiteEntity>): Mesh | undefined {
    const productShapeRef = parseEntityReference(entity.args[6] ?? "");
    if (productShapeRef === undefined) return undefined;

    const productShape = byId.get(productShapeRef);
    if (!productShape || productShape.type !== "IFCPRODUCTDEFINITIONSHAPE") return undefined;

    const reps = parseReferenceList(productShape.args[2] ?? "");
    for (const repRef of reps) {
        const rep = byId.get(repRef);
        if (!rep || rep.type !== "IFCSHAPEREPRESENTATION") continue;

        const repItems = parseReferenceList(rep.args[3] ?? "");
        for (const itemRef of repItems) {
            const mesh = meshFromRepresentationItem(itemRef, byId, new Set<number>());
            if (mesh) {
                return mesh;
            }
        }
    }

    return undefined;
}

function meshFromRepresentationItem(
    itemRef: number,
    byId: Map<number, IIfcLiteEntity>,
    visited: Set<number>,
): Mesh | undefined {
    if (visited.has(itemRef)) {
        return undefined;
    }
    visited.add(itemRef);

    const item = byId.get(itemRef);
    if (!item) return undefined;

    if (item.type === "IFCTRIANGULATEDFACESET") {
        return meshFromTriangulatedFaceSet(item, byId);
    }

    if (item.type === "IFCFACETEDBREP") {
        return meshFromFacetedBrep(item, byId);
    }

    if (item.type === "IFCEXTRUDEDAREASOLID") {
        return meshFromExtrudedAreaSolid(item, byId);
    }

    if (item.type === "IFCBOOLEANCLIPPINGRESULT" || item.type === "IFCBOOLEANRESULT") {
        const firstOperandRef = parseEntityReference(item.args[1] ?? "");
        if (firstOperandRef !== undefined) {
            return meshFromRepresentationItem(firstOperandRef, byId, visited);
        }
    }

    if (item.type === "IFCMAPPEDITEM") {
        const sourceRef = parseEntityReference(item.args[0] ?? "");
        if (sourceRef === undefined) return undefined;

        const map = byId.get(sourceRef);
        if (!map || map.type !== "IFCREPRESENTATIONMAP") return undefined;

        const repRef = parseEntityReference(map.args[1] ?? "");
        if (repRef === undefined) return undefined;

        const rep = byId.get(repRef);
        if (!rep || rep.type !== "IFCSHAPEREPRESENTATION") return undefined;

        const repItems = parseReferenceList(rep.args[3] ?? "");
        for (const ref of repItems) {
            const mesh = meshFromRepresentationItem(ref, byId, visited);
            if (mesh) return mesh;
        }
    }

    return undefined;
}

function meshFromTriangulatedFaceSet(faceSet: IIfcLiteEntity, byId: Map<number, IIfcLiteEntity>): Mesh | undefined {
    const pointListRef = parseEntityReference(faceSet.args[0] ?? "");
    if (pointListRef === undefined) return undefined;

    const pointList = byId.get(pointListRef);
    if (!pointList || pointList.type !== "IFCCARTESIANPOINTLIST3D") return undefined;

    const points = parsePointTupleList(pointList.args[0] ?? "");
    const coordIndex = parseTriangleTupleList(faceSet.args[3] ?? "");
    if (points.length === 0 || coordIndex.length === 0) return undefined;

    return buildSurfaceMesh(points, coordIndex);
}

function meshFromFacetedBrep(brep: IIfcLiteEntity, byId: Map<number, IIfcLiteEntity>): Mesh | undefined {
    const shellRef = parseEntityReference(brep.args[0] ?? "");
    if (shellRef === undefined) return undefined;

    const shell = byId.get(shellRef);
    if (!shell || shell.type !== "IFCCLOSEDSHELL") return undefined;

    const triangles: number[][] = [];
    const points: number[][] = [];
    const pointIndex = new Map<string, number>();

    const faceRefs = parseReferenceList(shell.args[0] ?? "");
    for (const faceRef of faceRefs) {
        const face = byId.get(faceRef);
        if (!face || face.type !== "IFCFACE") continue;

        const bounds = parseReferenceList(face.args[0] ?? "");
        for (const boundRef of bounds) {
            const bound = byId.get(boundRef);
            if (!bound || (bound.type !== "IFCFACEOUTERBOUND" && bound.type !== "IFCFACEBOUND")) continue;

            const loopRef = parseEntityReference(bound.args[0] ?? "");
            if (loopRef === undefined) continue;

            const loop = byId.get(loopRef);
            if (!loop || loop.type !== "IFCPOLYLOOP") continue;

            const polygon: number[] = [];
            const pointRefs = parseReferenceList(loop.args[0] ?? "");
            for (const pRef of pointRefs) {
                const p = byId.get(pRef);
                if (!p || p.type !== "IFCCARTESIANPOINT") continue;
                const coords = parseNumberTuple(p.args[0] ?? "");
                if (coords.length < 3) continue;
                const key = `${coords[0]},${coords[1]},${coords[2]}`;
                let idx = pointIndex.get(key);
                if (idx === undefined) {
                    idx = points.length;
                    points.push([coords[0], coords[1], coords[2]]);
                    pointIndex.set(key, idx);
                }
                polygon.push(idx);
            }

            for (let i = 1; i + 1 < polygon.length; i++) {
                triangles.push([polygon[0], polygon[i], polygon[i + 1]]);
            }
        }
    }

    if (points.length === 0 || triangles.length === 0) {
        return undefined;
    }

    return buildSurfaceMesh(points, triangles);
}

function meshFromExtrudedAreaSolid(solid: IIfcLiteEntity, byId: Map<number, IIfcLiteEntity>): Mesh | undefined {
    const profileRef = parseEntityReference(solid.args[0] ?? "");
    if (profileRef === undefined) return undefined;

    const profile = byId.get(profileRef);
    if (!profile) return undefined;

    const base2D = parseProfile2D(profile, byId);
    if (!base2D || base2D.length < 3) return undefined;

    const depth = Number.parseFloat((solid.args[3] ?? "0").trim());
    if (!Number.isFinite(depth) || depth <= 0) return undefined;

    const directionRef = parseEntityReference(solid.args[2] ?? "");
    const direction = directionRef !== undefined ? parseDirection(byId.get(directionRef)) : [0, 0, 1];

    const positionRef = parseEntityReference(solid.args[1] ?? "");
    const placement = positionRef !== undefined ? parseAxis2Placement3D(byId.get(positionRef), byId) : IDENTITY_TRANSFORM;

    const points: number[][] = [];
    const triangles: number[][] = [];

    const extrudeVector: [number, number, number] = [
        direction[0] * depth,
        direction[1] * depth,
        direction[2] * depth,
    ];

    for (const point of base2D) {
        const localBottom: [number, number, number] = [point[0], point[1], 0];
        const localTop: [number, number, number] = [
            point[0] + extrudeVector[0],
            point[1] + extrudeVector[1],
            extrudeVector[2],
        ];
        points.push(applyPlacement(localBottom, placement));
        points.push(applyPlacement(localTop, placement));
    }

    const count = base2D.length;

    // bottom / top caps
    for (let i = 1; i + 1 < count; i++) {
        triangles.push([0, i * 2, (i + 1) * 2]);
        triangles.push([1, (i + 1) * 2 + 1, i * 2 + 1]);
    }

    // side quads
    for (let i = 0; i < count; i++) {
        const next = (i + 1) % count;
        const b0 = i * 2;
        const t0 = b0 + 1;
        const b1 = next * 2;
        const t1 = b1 + 1;
        triangles.push([b0, b1, t1]);
        triangles.push([b0, t1, t0]);
    }

    return buildSurfaceMesh(points, triangles);
}

function parseProfile2D(profile: IIfcLiteEntity, byId: Map<number, IIfcLiteEntity>): number[][] | undefined {
    if (profile.type === "IFCRECTANGLEPROFILEDEF") {
        const x = Number.parseFloat((profile.args[3] ?? "0").trim());
        const y = Number.parseFloat((profile.args[4] ?? "0").trim());
        if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) return undefined;
        const hx = x / 2;
        const hy = y / 2;
        return [
            [-hx, -hy],
            [hx, -hy],
            [hx, hy],
            [-hx, hy],
        ];
    }

    if (profile.type === "IFCARBITRARYCLOSEDPROFILEDEF" || profile.type === "IFCARBITRARYPROFILEDEFWITHVOIDS") {
        const curveRef = parseEntityReference(profile.args[1] ?? "");
        if (curveRef === undefined) return undefined;
        return parseCurve2D(byId.get(curveRef), byId);
    }

    if (profile.type === "IFCCIRCLEPROFILEDEF") {
        const radius = Number.parseFloat((profile.args[3] ?? "0").trim());
        if (!Number.isFinite(radius) || radius <= 0) return undefined;
        const steps = 24;
        const result: number[][] = [];
        for (let i = 0; i < steps; i++) {
            const t = (Math.PI * 2 * i) / steps;
            result.push([Math.cos(t) * radius, Math.sin(t) * radius]);
        }
        return result;
    }

    return undefined;
}

function parseCurve2D(curve: IIfcLiteEntity | undefined, byId: Map<number, IIfcLiteEntity>): number[][] | undefined {
    if (!curve) return undefined;

    if (curve.type === "IFCPOLYLINE") {
        const refs = parseReferenceList(curve.args[0] ?? "");
        const points = refs
            .map((ref) => parsePoint2D(byId.get(ref)))
            .filter((p): p is number[] => p !== undefined);
        return sanitizeLoop(points);
    }

    if (curve.type === "IFCINDEXEDPOLYCURVE") {
        const pointListRef = parseEntityReference(curve.args[0] ?? "");
        if (pointListRef === undefined) return undefined;

        const pointList = byId.get(pointListRef);
        if (!pointList) return undefined;

        if (pointList.type === "IFCCARTESIANPOINTLIST2D") {
            return sanitizeLoop(parsePointTupleList2D(pointList.args[0] ?? ""));
        }

        if (pointList.type === "IFCCARTESIANPOINTLIST3D") {
            return sanitizeLoop(parsePointTupleList(pointList.args[0] ?? "").map((p) => [p[0], p[1]]));
        }
    }

    return undefined;
}

function sanitizeLoop(points: number[][]): number[][] | undefined {
    if (points.length < 3) return undefined;
    const first = points[0];
    const last = points[points.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
        points = points.slice(0, -1);
    }
    return points.length >= 3 ? points : undefined;
}

function parsePoint2D(point: IIfcLiteEntity | undefined): number[] | undefined {
    if (!point || point.type !== "IFCCARTESIANPOINT") return undefined;
    const coords = parseNumberTuple(point.args[0] ?? "");
    if (coords.length < 2) return undefined;
    return [coords[0], coords[1]];
}

function parseDirection(direction: IIfcLiteEntity | undefined): [number, number, number] {
    if (!direction || direction.type !== "IFCDIRECTION") {
        return [0, 0, 1];
    }
    const coords = parseNumberTuple(direction.args[0] ?? "");
    if (coords.length < 3) return [0, 0, 1];
    return normalize([coords[0], coords[1], coords[2]]);
}

function parseAxis2Placement3D(
    placement: IIfcLiteEntity | undefined,
    byId: Map<number, IIfcLiteEntity>,
): ITransform3D {
    if (!placement || placement.type !== "IFCAXIS2PLACEMENT3D") {
        return IDENTITY_TRANSFORM;
    }

    const locationRef = parseEntityReference(placement.args[0] ?? "");
    const location: [number, number, number] =
        locationRef !== undefined ? parsePoint3D(byId.get(locationRef)) : [0, 0, 0];

    const axisRef = parseEntityReference(placement.args[1] ?? "");
    const refDirectionRef = parseEntityReference(placement.args[2] ?? "");

    const zAxis = axisRef !== undefined ? parseDirection(byId.get(axisRef)) : ([0, 0, 1] as [number, number, number]);
    const xSeed =
        refDirectionRef !== undefined
            ? parseDirection(byId.get(refDirectionRef))
            : ([1, 0, 0] as [number, number, number]);

    let yAxis = normalize(cross(zAxis, xSeed));
    let xAxis = normalize(cross(yAxis, zAxis));

    if (!isFiniteVector(xAxis) || !isFiniteVector(yAxis)) {
        xAxis = [1, 0, 0];
        yAxis = [0, 1, 0];
    }

    return {
        origin: location,
        xAxis,
        yAxis,
        zAxis,
    };
}

function parsePoint3D(point: IIfcLiteEntity | undefined): [number, number, number] {
    if (!point || point.type !== "IFCCARTESIANPOINT") {
        return [0, 0, 0];
    }
    const coords = parseNumberTuple(point.args[0] ?? "");
    if (coords.length < 3) return [0, 0, 0];
    return [coords[0], coords[1], coords[2]];
}

function applyPlacement(point: [number, number, number], placement: ITransform3D): [number, number, number] {
    const [x, y, z] = point;
    return [
        placement.origin[0] +
            placement.xAxis[0] * x +
            placement.yAxis[0] * y +
            placement.zAxis[0] * z,
        placement.origin[1] +
            placement.xAxis[1] * x +
            placement.yAxis[1] * y +
            placement.zAxis[1] * z,
        placement.origin[2] +
            placement.xAxis[2] * x +
            placement.yAxis[2] * y +
            placement.zAxis[2] * z,
    ];
}

function normalize(v: [number, number, number]): [number, number, number] {
    const len = Math.hypot(v[0], v[1], v[2]);
    if (len === 0 || !Number.isFinite(len)) return [0, 0, 1];
    return [v[0] / len, v[1] / len, v[2] / len];
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
}

function isFiniteVector(v: [number, number, number]): boolean {
    return Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
}

function buildSurfaceMesh(points: number[][], triangles: number[][]): Mesh {
    const mesh = Mesh.createSurface(points.length, triangles.length * 3);

    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        mesh.position![i * 3] = p[0];
        mesh.position![i * 3 + 1] = p[1];
        mesh.position![i * 3 + 2] = p[2];
    }

    for (let i = 0; i < triangles.length; i++) {
        const t = triangles[i];
        mesh.index![i * 3] = t[0];
        mesh.index![i * 3 + 1] = t[1];
        mesh.index![i * 3 + 2] = t[2];
    }

    return mesh;
}

function parsePointTupleList(value: string): number[][] {
    return splitOuterTuple(value)
        .map(parseNumberTuple)
        .filter((x) => x.length >= 3)
        .map((x) => [x[0], x[1], x[2]]);
}

function parsePointTupleList2D(value: string): number[][] {
    return splitOuterTuple(value)
        .map(parseNumberTuple)
        .filter((x) => x.length >= 2)
        .map((x) => [x[0], x[1]]);
}

function parseTriangleTupleList(value: string): number[][] {
    return splitOuterTuple(value)
        .map(parseNumberTuple)
        .filter((x) => x.length >= 3)
        .map((x) => [Math.max(0, x[0] - 1), Math.max(0, x[1] - 1), Math.max(0, x[2] - 1)]);
}

function parseNumberTuple(value: string): number[] {
    const inner = value.trim().replace(/^\(/, "").replace(/\)$/, "");
    if (!inner) return [];
    return splitTopLevel(inner)
        .map((x) => Number.parseFloat(x.trim()))
        .filter((x) => Number.isFinite(x));
}

function splitOuterTuple(value: string): string[] {
    const trimmed = value.trim();
    if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) {
        return [];
    }
    return splitTopLevel(trimmed.slice(1, -1));
}

function toDisplayName(entity: IIfcLiteEntity | undefined): string {
    if (!entity) return "Unknown";

    const name = unquote(entity.args[2] ?? "");
    if (name.length > 0) {
        return `${entity.type} - ${name}`;
    }
    return entity.type;
}
