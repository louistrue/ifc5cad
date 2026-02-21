// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { FolderNode, Mesh, MeshNode, type IDocument, type INode } from "chili-core";
import type { IIfcLiteDocument, IIfcLiteEntity } from "./ifcLiteDocument";
import { parseEntityReference, parseReferenceList, splitTopLevel, unquote } from "./ifcLiteParser";

const IFC_REL_AGGREGATES = "IFCRELAGGREGATES";
const IFC_REL_CONTAINED = "IFCRELCONTAINEDINSPATIALSTRUCTURE";
const IFC_PROJECT = "IFCPROJECT";
const IFC_PRODUCT_DEFINITION_SHAPE = "IFCPRODUCTDEFINITIONSHAPE";
const IFC_SHAPE_REPRESENTATION = "IFCSHAPEREPRESENTATION";
const IFC_TRIANGULATED_FACE_SET = "IFCTRIANGULATEDFACESET";
const IFC_CARTESIAN_POINT_LIST_3D = "IFCCARTESIANPOINTLIST3D";

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
    const children = childMap.get(entityId) ?? [];
    const node = createVisualNode(document, entity, byId);

    if (!entity || visited.has(entityId)) {
        return node;
    }

    visited.add(entityId);

    if (node instanceof FolderNode) {
        for (const childId of children) {
            node.add(createTreeNode(document, byId, childMap, childId, visited));
        }
    }

    return node;
}

function createVisualNode(
    document: IDocument,
    entity: IIfcLiteEntity | undefined,
    byId: Map<number, IIfcLiteEntity>,
): INode {
    if (!entity) {
        return new FolderNode(document, "Unknown");
    }

    const mesh = tryCreateMesh(entity, byId);
    if (mesh) {
        return new MeshNode(document, mesh, toDisplayName(entity));
    }

    return new FolderNode(document, toDisplayName(entity));
}

function tryCreateMesh(entity: IIfcLiteEntity, byId: Map<number, IIfcLiteEntity>): Mesh | undefined {
    const representationRef = parseEntityReference(entity.args[5] ?? "") ?? parseEntityReference(entity.args[6] ?? "");
    if (representationRef === undefined) {
        return undefined;
    }

    const productShape = byId.get(representationRef);
    if (!productShape || productShape.type !== IFC_PRODUCT_DEFINITION_SHAPE) {
        return undefined;
    }

    const shapeRepRefs = parseReferenceList(productShape.args[2] ?? "");
    for (const shapeRepRef of shapeRepRefs) {
        const shapeRep = byId.get(shapeRepRef);
        if (!shapeRep || shapeRep.type !== IFC_SHAPE_REPRESENTATION) {
            continue;
        }

        const itemRefs = parseReferenceList(shapeRep.args[3] ?? "");
        for (const itemRef of itemRefs) {
            const triangulated = byId.get(itemRef);
            if (!triangulated || triangulated.type !== IFC_TRIANGULATED_FACE_SET) {
                continue;
            }

            const mesh = triangulatedFaceSetToMesh(triangulated, byId);
            if (mesh) {
                return mesh;
            }
        }
    }

    return undefined;
}

function triangulatedFaceSetToMesh(
    triangulated: IIfcLiteEntity,
    byId: Map<number, IIfcLiteEntity>,
): Mesh | undefined {
    const pointListRef = parseEntityReference(triangulated.args[0] ?? "");
    if (pointListRef === undefined) {
        return undefined;
    }

    const pointList = byId.get(pointListRef);
    if (!pointList || pointList.type !== IFC_CARTESIAN_POINT_LIST_3D) {
        return undefined;
    }

    const points = parsePointList(pointList.args[0] ?? "");
    const indices = parseCoordIndex(triangulated.args[3] ?? "");

    if (points.length === 0 || indices.length === 0) {
        return undefined;
    }

    const mesh = Mesh.createSurface(points.length / 3, indices.length);
    mesh.position!.set(points);
    mesh.index!.set(indices);
    mesh.normal!.set(calculateNormals(points, indices));
    return mesh;
}

function parsePointList(value: string): Float32Array {
    const trimmed = value.trim();
    if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) {
        return new Float32Array();
    }

    const tuples = splitTopLevel(trimmed.slice(1, -1));
    const points: number[] = [];

    for (const tuple of tuples) {
        const t = tuple.trim();
        if (!t.startsWith("(") || !t.endsWith(")")) {
            continue;
        }

        const parts = splitTopLevel(t.slice(1, -1));
        if (parts.length < 3) {
            continue;
        }

        points.push(Number(parts[0]), Number(parts[1]), Number(parts[2]));
    }

    return new Float32Array(points);
}

function parseCoordIndex(value: string): Uint32Array {
    const trimmed = value.trim();
    if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) {
        return new Uint32Array();
    }

    const tuples = splitTopLevel(trimmed.slice(1, -1));
    const indices: number[] = [];

    for (const tuple of tuples) {
        const t = tuple.trim();
        if (!t.startsWith("(") || !t.endsWith(")")) {
            continue;
        }

        const parts = splitTopLevel(t.slice(1, -1));
        if (parts.length < 3) {
            continue;
        }

        // IFC indices are 1-based
        indices.push(Number(parts[0]) - 1, Number(parts[1]) - 1, Number(parts[2]) - 1);
    }

    return new Uint32Array(indices);
}

function calculateNormals(points: Float32Array, indices: Uint32Array): Float32Array {
    const normals = new Float32Array(points.length);

    for (let i = 0; i < indices.length; i += 3) {
        const i0 = indices[i] * 3;
        const i1 = indices[i + 1] * 3;
        const i2 = indices[i + 2] * 3;

        const ax = points[i1] - points[i0];
        const ay = points[i1 + 1] - points[i0 + 1];
        const az = points[i1 + 2] - points[i0 + 2];

        const bx = points[i2] - points[i0];
        const by = points[i2 + 1] - points[i0 + 1];
        const bz = points[i2 + 2] - points[i0 + 2];

        const nx = ay * bz - az * by;
        const ny = az * bx - ax * bz;
        const nz = ax * by - ay * bx;

        normals[i0] += nx;
        normals[i0 + 1] += ny;
        normals[i0 + 2] += nz;
        normals[i1] += nx;
        normals[i1 + 1] += ny;
        normals[i1 + 2] += nz;
        normals[i2] += nx;
        normals[i2 + 1] += ny;
        normals[i2 + 2] += nz;
    }

    for (let i = 0; i < normals.length; i += 3) {
        const nx = normals[i];
        const ny = normals[i + 1];
        const nz = normals[i + 2];
        const len = Math.hypot(nx, ny, nz);
        if (len > 1e-9) {
            normals[i] = nx / len;
            normals[i + 1] = ny / len;
            normals[i + 2] = nz / len;
        }
    }

    return normals;
}

function toDisplayName(entity: IIfcLiteEntity): string {
    const name = unquote(entity.args[2] ?? "");
    if (name.length > 0) {
        return `${entity.type} - ${name}`;
    }
    return entity.type;
}
