// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { FolderNode, Mesh, MeshNode, type IDocument, type INode } from "chili-core";
import type { IIfcLiteDocument, IIfcLiteEntity } from "./ifcLiteDocument";
import { parseEntityReference, parseReferenceList, unquote } from "./ifcLiteParser";

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
    if (!entity || visited.has(entityId)) {
        return new FolderNode(document, toDisplayName(entity));
    }

    visited.add(entityId);

    const mesh = buildMeshFromEntity(entity, byId);
    if (mesh) {
        return new MeshNode(document, mesh, toDisplayName(entity));
    }

    const node = new FolderNode(document, toDisplayName(entity));
    for (const childId of childMap.get(entityId) ?? []) {
        node.add(createTreeNode(document, byId, childMap, childId, visited));
    }

    return node;
}

function buildMeshFromEntity(entity: IIfcLiteEntity, byId: Map<number, IIfcLiteEntity>): Mesh | undefined {
    const representationRef = parseEntityReference(entity.args[6] ?? "");
    if (representationRef === undefined) {
        return undefined;
    }

    const productShape = byId.get(representationRef);
    if (!productShape || productShape.type !== "IFCPRODUCTDEFINITIONSHAPE") {
        return undefined;
    }

    const repRefs = parseReferenceList(productShape.args[2] ?? "");
    for (const repRef of repRefs) {
        const shapeRepresentation = byId.get(repRef);
        if (!shapeRepresentation || shapeRepresentation.type !== "IFCSHAPEREPRESENTATION") {
            continue;
        }

        const itemRefs = parseReferenceList(shapeRepresentation.args[3] ?? "");
        for (const itemRef of itemRefs) {
            const triSet = byId.get(itemRef);
            if (!triSet || triSet.type !== "IFCTRIANGULATEDFACESET") {
                continue;
            }

            const mesh = buildMeshFromTriangulatedFaceSet(triSet, byId);
            if (mesh) {
                return mesh;
            }
        }
    }

    return undefined;
}

function buildMeshFromTriangulatedFaceSet(entity: IIfcLiteEntity, byId: Map<number, IIfcLiteEntity>): Mesh | undefined {
    const pointListRef = parseEntityReference(entity.args[0] ?? "");
    if (pointListRef === undefined) {
        return undefined;
    }

    const pointList = byId.get(pointListRef);
    if (!pointList || pointList.type !== "IFCCARTESIANPOINTLIST3D") {
        return undefined;
    }

    const points = parsePointList(pointList.args[0] ?? "");
    const indices = parseCoordIndex(entity.args[3] ?? "");
    if (points.length === 0 || indices.length === 0) {
        return undefined;
    }

    const mesh = Mesh.createSurface(points.length / 3, indices.length);
    mesh.position.set(points);
    mesh.index.set(indices);
    return mesh;
}

function parsePointList(value: string): number[] {
    const trimmed = value.trim();
    if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) {
        return [];
    }

    const points: number[] = [];
    const tuples = splitTopLevel(trimmed.slice(1, -1));
    for (const tuple of tuples) {
        const values = splitTopLevel(tuple.trim().slice(1, -1));
        if (values.length < 3) continue;
        points.push(parseIfcNumber(values[0]), parseIfcNumber(values[1]), parseIfcNumber(values[2]));
    }
    return points;
}

function parseCoordIndex(value: string): number[] {
    const trimmed = value.trim();
    if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) {
        return [];
    }

    const faces = splitTopLevel(trimmed.slice(1, -1));
    const indices: number[] = [];
    for (const face of faces) {
        const values = splitTopLevel(face.trim().slice(1, -1));
        if (values.length < 3) continue;
        indices.push(
            Number.parseInt(values[0], 10) - 1,
            Number.parseInt(values[1], 10) - 1,
            Number.parseInt(values[2], 10) - 1,
        );
    }
    return indices.filter((x) => Number.isFinite(x) && x >= 0);
}

function splitTopLevel(value: string): string[] {
    const result: string[] = [];
    let current = "";
    let depth = 0;
    let inString = false;

    for (let i = 0; i < value.length; i++) {
        const ch = value[i];

        if (ch === "'" && value[i - 1] !== "\\") {
            inString = !inString;
            current += ch;
            continue;
        }

        if (!inString) {
            if (ch === "(") depth++;
            if (ch === ")") depth--;
            if (ch === "," && depth === 0) {
                result.push(current.trim());
                current = "";
                continue;
            }
        }

        current += ch;
    }

    if (current.trim().length > 0) {
        result.push(current.trim());
    }

    return result;
}

function parseIfcNumber(value: string): number {
    const normalized = value.trim().replace(/D/gi, "E");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function toDisplayName(entity: IIfcLiteEntity | undefined): string {
    if (!entity) return "Unknown";

    const name = unquote(entity.args[2] ?? "");
    if (name.length > 0) {
        return `${entity.type} - ${name}`;
    }
    return entity.type;
}
