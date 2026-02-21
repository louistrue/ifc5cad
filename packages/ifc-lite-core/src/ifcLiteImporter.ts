// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { FolderNode, Mesh, MeshNode, type IDocument, type INode } from "chili-core";
import type { IIfcLiteDocument, IIfcLiteEntity } from "./ifcLiteDocument";
import {
    parseEntityReference,
    parseReferenceList,
    splitTopLevel,
    unquote,
} from "./ifcLiteParser";

const IFC_REL_AGGREGATES = "IFCRELAGGREGATES";
const IFC_REL_CONTAINED = "IFCRELCONTAINEDINSPATIALSTRUCTURE";
const IFC_PROJECT = "IFCPROJECT";

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
            if (mesh) return mesh;
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
    return inner
        .split(",")
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
