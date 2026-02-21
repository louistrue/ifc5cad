// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { FolderNode, Matrix4, Mesh, MeshNode, type IDocument, type INode } from "chili-core";
import type { IIfcLiteDocument, IIfcLiteEntity } from "./ifcLiteDocument";
import { parseEntityReference, parseReferenceList, splitTopLevel, unquote } from "./ifcLiteParser";

const IFC_REL_AGGREGATES = "IFCRELAGGREGATES";
const IFC_REL_CONTAINED = "IFCRELCONTAINEDINSPATIALSTRUCTURE";
const IFC_PROJECT = "IFCPROJECT";

interface IRawMesh {
    points: number[][];
    triangles: number[][];
}

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

    const placementMatrix = resolveObjectPlacement(byId, parseEntityReference(entity.args[5] ?? ""));

    const reps = parseReferenceList(productShape.args[2] ?? "");
    for (const repRef of reps) {
        const rep = byId.get(repRef);
        if (!rep || rep.type !== "IFCSHAPEREPRESENTATION") continue;

        const repItems = parseReferenceList(rep.args[3] ?? "");
        for (const itemRef of repItems) {
            const rawMesh = meshFromRepresentationItem(itemRef, byId, new Set<number>());
            if (!rawMesh) continue;

            applyMatrix(rawMesh.points, placementMatrix);
            return buildSurfaceMesh(rawMesh.points, rawMesh.triangles);
        }
    }

    return undefined;
}

function meshFromRepresentationItem(
    itemRef: number,
    byId: Map<number, IIfcLiteEntity>,
    visited: Set<number>,
): IRawMesh | undefined {
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
        const firstOperand = parseEntityReference(item.args[1] ?? "");
        if (firstOperand !== undefined) {
            return meshFromRepresentationItem(firstOperand, byId, visited);
        }
        return undefined;
    }

    if (item.type === "IFCMAPPEDITEM") {
        const sourceRef = parseEntityReference(item.args[0] ?? "");
        const transformRef = parseEntityReference(item.args[1] ?? "");
        if (sourceRef === undefined) return undefined;

        const map = byId.get(sourceRef);
        if (!map || map.type !== "IFCREPRESENTATIONMAP") return undefined;

        const repRef = parseEntityReference(map.args[1] ?? "");
        if (repRef === undefined) return undefined;

        const rep = byId.get(repRef);
        if (!rep || rep.type !== "IFCSHAPEREPRESENTATION") return undefined;

        const mapMatrix = resolveCartesianTransformation(byId, transformRef);
        const repItems = parseReferenceList(rep.args[3] ?? "");
        for (const ref of repItems) {
            const rawMesh = meshFromRepresentationItem(ref, byId, visited);
            if (!rawMesh) continue;
            applyMatrix(rawMesh.points, mapMatrix);
            return rawMesh;
        }
    }

    return undefined;
}

function meshFromTriangulatedFaceSet(
    faceSet: IIfcLiteEntity,
    byId: Map<number, IIfcLiteEntity>,
): IRawMesh | undefined {
    const pointListRef = parseEntityReference(faceSet.args[0] ?? "");
    if (pointListRef === undefined) return undefined;

    const pointList = byId.get(pointListRef);
    if (!pointList || pointList.type !== "IFCCARTESIANPOINTLIST3D") return undefined;

    const points = parsePointTupleList(pointList.args[0] ?? "");
    const triangles = parseTriangleTupleList(faceSet.args[3] ?? "");
    if (points.length === 0 || triangles.length === 0) return undefined;

    return { points, triangles };
}

function meshFromFacetedBrep(brep: IIfcLiteEntity, byId: Map<number, IIfcLiteEntity>): IRawMesh | undefined {
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

            triangulatePolygon(polygon, triangles);
        }
    }

    if (points.length === 0 || triangles.length === 0) {
        return undefined;
    }

    return { points, triangles };
}

function meshFromExtrudedAreaSolid(
    extruded: IIfcLiteEntity,
    byId: Map<number, IIfcLiteEntity>,
): IRawMesh | undefined {
    const sweptAreaRef = parseEntityReference(extruded.args[0] ?? "");
    if (sweptAreaRef === undefined) return undefined;

    const profile = resolveProfilePolygon(byId, sweptAreaRef);
    if (!profile || profile.length < 3) return undefined;

    const solidPlacement = resolveAxis2Placement3D(byId, parseEntityReference(extruded.args[1] ?? ""));
    const dir = resolveDirection(byId, parseEntityReference(extruded.args[2] ?? "")) ?? [0, 0, 1];
    const depth = Number.parseFloat(extruded.args[3] ?? "0");
    if (!Number.isFinite(depth) || Math.abs(depth) < 1e-9) return undefined;

    const unitDir = normalize(dir);
    const extrudeVector: [number, number, number] = [unitDir[0] * depth, unitDir[1] * depth, unitDir[2] * depth];

    const points: number[][] = [];
    const triangles: number[][] = [];

    for (const p of profile) {
        points.push([p[0], p[1], p[2]]);
    }
    for (const p of profile) {
        points.push([p[0] + extrudeVector[0], p[1] + extrudeVector[1], p[2] + extrudeVector[2]]);
    }

    const n = profile.length;

    for (let i = 1; i + 1 < n; i++) {
        triangles.push([0, i + 1, i]);
        triangles.push([n, n + i, n + i + 1]);
    }

    for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        triangles.push([i, next, n + next]);
        triangles.push([i, n + next, n + i]);
    }

    applyMatrix(points, solidPlacement);
    return { points, triangles };
}

function resolveProfilePolygon(byId: Map<number, IIfcLiteEntity>, profileRef: number): number[][] | undefined {
    const profile = byId.get(profileRef);
    if (!profile) return undefined;

    if (profile.type === "IFCRECTANGLEPROFILEDEF") {
        const x = Number.parseFloat(profile.args[3] ?? "0");
        const y = Number.parseFloat(profile.args[4] ?? "0");
        if (!Number.isFinite(x) || !Number.isFinite(y) || x === 0 || y === 0) return undefined;
        const halfX = x / 2;
        const halfY = y / 2;
        return [
            [-halfX, -halfY, 0],
            [halfX, -halfY, 0],
            [halfX, halfY, 0],
            [-halfX, halfY, 0],
        ];
    }

    if (profile.type === "IFCARBITRARYCLOSEDPROFILEDEF") {
        const curveRef = parseEntityReference(profile.args[2] ?? "");
        if (curveRef === undefined) return undefined;
        return resolvePolylineCurve(byId, curveRef);
    }

    return undefined;
}

function resolvePolylineCurve(byId: Map<number, IIfcLiteEntity>, curveRef: number): number[][] | undefined {
    const curve = byId.get(curveRef);
    if (!curve || curve.type !== "IFCPOLYLINE") {
        return undefined;
    }

    const points: number[][] = [];
    for (const ref of parseReferenceList(curve.args[0] ?? "")) {
        const point = byId.get(ref);
        if (!point || point.type !== "IFCCARTESIANPOINT") continue;
        const coords = parseNumberTuple(point.args[0] ?? "");
        if (coords.length >= 3) {
            points.push([coords[0], coords[1], coords[2]]);
        }
    }

    if (points.length > 1) {
        const first = points[0];
        const last = points.at(-1)!;
        if (samePoint(first, last)) {
            points.pop();
        }
    }

    return points.length >= 3 ? points : undefined;
}

function resolveObjectPlacement(byId: Map<number, IIfcLiteEntity>, placementRef: number | undefined): Matrix4 {
    if (placementRef === undefined) return Matrix4.identity();

    const placement = byId.get(placementRef);
    if (!placement || placement.type !== "IFCLOCALPLACEMENT") return Matrix4.identity();

    const parent = resolveObjectPlacement(byId, parseEntityReference(placement.args[0] ?? ""));
    const local = resolveAxis2Placement3D(byId, parseEntityReference(placement.args[1] ?? ""));
    return parent.multiply(local);
}

function resolveAxis2Placement3D(byId: Map<number, IIfcLiteEntity>, ref: number | undefined): Matrix4 {
    if (ref === undefined) return Matrix4.identity();

    const axis = byId.get(ref);
    if (!axis || axis.type !== "IFCAXIS2PLACEMENT3D") {
        return Matrix4.identity();
    }

    const location = resolvePoint(byId, parseEntityReference(axis.args[0] ?? "")) ?? [0, 0, 0];
    const zAxis = normalize(resolveDirection(byId, parseEntityReference(axis.args[1] ?? "")) ?? [0, 0, 1]);
    const xSeed = normalize(resolveDirection(byId, parseEntityReference(axis.args[2] ?? "")) ?? [1, 0, 0]);

    let yAxis = normalize(cross(zAxis, xSeed));
    let xAxis = normalize(cross(yAxis, zAxis));

    if (!isFiniteVector(xAxis) || !isFiniteVector(yAxis) || !isFiniteVector(zAxis)) {
        xAxis = [1, 0, 0];
        yAxis = [0, 1, 0];
    }

    return Matrix4.fromArray([
        xAxis[0],
        xAxis[1],
        xAxis[2],
        0,
        yAxis[0],
        yAxis[1],
        yAxis[2],
        0,
        zAxis[0],
        zAxis[1],
        zAxis[2],
        0,
        location[0],
        location[1],
        location[2],
        1,
    ]);
}

function resolveCartesianTransformation(
    byId: Map<number, IIfcLiteEntity>,
    ref: number | undefined,
): Matrix4 {
    if (ref === undefined) return Matrix4.identity();

    const tr = byId.get(ref);
    if (!tr || (tr.type !== "IFCCARTESIANTRANSFORMATIONOPERATOR3D" && tr.type !== "IFCCARTESIANTRANSFORMATIONOPERATOR3DNONUNIFORM")) {
        return Matrix4.identity();
    }

    const origin = resolvePoint(byId, parseEntityReference(tr.args[0] ?? "")) ?? [0, 0, 0];
    const xAxis = normalize(resolveDirection(byId, parseEntityReference(tr.args[1] ?? "")) ?? [1, 0, 0]);
    const yAxis = normalize(resolveDirection(byId, parseEntityReference(tr.args[2] ?? "")) ?? [0, 1, 0]);
    const zAxis = normalize(cross(xAxis, yAxis));
    const scale = Number.parseFloat(tr.args[3] ?? "1") || 1;

    return Matrix4.fromArray([
        xAxis[0] * scale,
        xAxis[1] * scale,
        xAxis[2] * scale,
        0,
        yAxis[0] * scale,
        yAxis[1] * scale,
        yAxis[2] * scale,
        0,
        zAxis[0] * scale,
        zAxis[1] * scale,
        zAxis[2] * scale,
        0,
        origin[0],
        origin[1],
        origin[2],
        1,
    ]);
}

function resolvePoint(byId: Map<number, IIfcLiteEntity>, pointRef: number | undefined): [number, number, number] | undefined {
    if (pointRef === undefined) return undefined;
    const point = byId.get(pointRef);
    if (!point || point.type !== "IFCCARTESIANPOINT") return undefined;

    const coords = parseNumberTuple(point.args[0] ?? "");
    if (coords.length < 3) return undefined;

    return [coords[0], coords[1], coords[2]];
}

function resolveDirection(byId: Map<number, IIfcLiteEntity>, dirRef: number | undefined): [number, number, number] | undefined {
    if (dirRef === undefined) return undefined;
    const dir = byId.get(dirRef);
    if (!dir || dir.type !== "IFCDIRECTION") return undefined;

    const coords = parseNumberTuple(dir.args[0] ?? "");
    if (coords.length < 3) return undefined;

    return [coords[0], coords[1], coords[2]];
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

function triangulatePolygon(polygon: number[], triangles: number[][]) {
    for (let i = 1; i + 1 < polygon.length; i++) {
        triangles.push([polygon[0], polygon[i], polygon[i + 1]]);
    }
}

function applyMatrix(points: number[][], matrix: Matrix4) {
    if (points.length === 0) return;

    const packed: number[] = [];
    for (const p of points) {
        packed.push(p[0], p[1], p[2]);
    }

    const transformed = matrix.ofPoints(packed);
    for (let i = 0; i < points.length; i++) {
        points[i][0] = transformed[i * 3];
        points[i][1] = transformed[i * 3 + 1];
        points[i][2] = transformed[i * 3 + 2];
    }
}

function normalize(v: [number, number, number]): [number, number, number] {
    const len = Math.hypot(v[0], v[1], v[2]);
    if (len < 1e-9) return [0, 0, 1];
    return [v[0] / len, v[1] / len, v[2] / len];
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function isFiniteVector(v: [number, number, number]) {
    return Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
}

function samePoint(a: number[], b: number[]) {
    return Math.abs(a[0] - b[0]) < 1e-8 && Math.abs(a[1] - b[1]) < 1e-8 && Math.abs(a[2] - b[2]) < 1e-8;
}

function toDisplayName(entity: IIfcLiteEntity | undefined): string {
    if (!entity) return "Unknown";

    const name = unquote(entity.args[2] ?? "");
    if (name.length > 0) {
        return `${entity.type} - ${name}`;
    }
    return entity.type;
}
