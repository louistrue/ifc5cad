// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { FaceMeshData, IDocument, INode, INodeLinkedList } from "chili-core";
import { GeometryNode, NodeUtils } from "chili-core";
import type { IFCXDocument, IFCXNode } from "./IFCXDocument";

/**
 * The standard IFCX schema references used in every document.
 * Schemas are from the buildingSMART IFC5 development repository.
 */
const STANDARD_SCHEMAS: IFCXDocument["schemas"] = {
    "bsi::ifc::v5a::schema": {
        uri: "https://ifc5.technical.buildingsmart.org/schemas/bsi/ifc/v5a/schema.json",
    },
    "bsi::ifc::v5a::prop": {
        uri: "https://ifc5.technical.buildingsmart.org/schemas/bsi/ifc/v5a/prop.json",
    },
    usd: {
        uri: "https://ifc5.technical.buildingsmart.org/schemas/usd.json",
    },
};

/**
 * Identity transform for USD Xform component.
 * Represents no transformation (origin, no rotation, unit scale).
 */
const IDENTITY_XFORM = {
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    scale: [1, 1, 1],
};

/**
 * Default IFC class assigned to geometry nodes with no specific IFC type.
 * IfcBuildingElementProxy is the official fallback for generic elements.
 */
const IFC_ELEMENT_PROXY = {
    code: "IfcBuildingElementProxy",
    uri: "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/IfcBuildingElementProxy",
};

/**
 * Maps the ifcType marker (set by BIM-tool nodes) to IFCX schema key + default data.
 *
 * Duck-typed against the `ifcType` property on geometry nodes to avoid circular
 * imports between ifcx-core and ifcx-bim-tools.
 */
/** Base URI for buildingSMART IFC class identifiers (IFC4.3). */
const IFC_CLASS_URI_BASE = "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/";

const IFC_TYPE_DEFAULTS: Record<
    string,
    {
        /** IFC instance class code (used for bsi::ifc::class). */
        classCode: string;
        /** IFCX typed-schema key emitted as an additional component. */
        schemaKey: string;
        typeData: Record<string, unknown>;
        psetKey?: string;
        psetData?: Record<string, unknown>;
    }
> = {
    IfcWall: {
        classCode: "IfcWall",
        schemaKey: "bsi::ifc::v5a::schema::IfcWallType",
        typeData: { predefinedType: "STANDARD" },
        psetKey: "bsi::ifc::v5a::prop::Pset_WallCommon",
        psetData: { IsExternal: false, LoadBearing: false, FireRating: "", ThermalTransmittance: null },
    },
    IfcSlab: {
        classCode: "IfcSlab",
        schemaKey: "bsi::ifc::v5a::schema::IfcSlabType",
        typeData: { predefinedType: "FLOOR" },
        psetKey: "bsi::ifc::v5a::prop::Pset_SlabCommon",
        psetData: { IsExternal: false, LoadBearing: false, FireRating: "" },
    },
    IfcColumn: {
        classCode: "IfcColumn",
        schemaKey: "bsi::ifc::v5a::schema::IfcColumnType",
        typeData: { predefinedType: "COLUMN" },
        psetKey: "bsi::ifc::v5a::prop::Pset_ColumnCommon",
        psetData: { IsExternal: false, LoadBearing: true },
    },
    IfcBeam: {
        classCode: "IfcBeam",
        schemaKey: "bsi::ifc::v5a::schema::IfcBeamType",
        typeData: { predefinedType: "BEAM" },
        psetKey: "bsi::ifc::v5a::prop::Pset_BeamCommon",
        psetData: { IsExternal: false, LoadBearing: true },
    },
    IfcDoor: {
        classCode: "IfcDoor",
        schemaKey: "bsi::ifc::v5a::schema::IfcDoorType",
        typeData: { predefinedType: "DOOR" },
        psetKey: "bsi::ifc::v5a::prop::Pset_DoorCommon",
        psetData: { IsExternal: false, HandicapAccessible: false, FireRating: "" },
    },
    IfcWindow: {
        classCode: "IfcWindow",
        schemaKey: "bsi::ifc::v5a::schema::IfcWindowType",
        typeData: { predefinedType: "WINDOW" },
        psetKey: "bsi::ifc::v5a::prop::Pset_WindowCommon",
        psetData: { IsExternal: false, FireRating: "", ThermalTransmittance: null },
    },
    IfcStair: {
        classCode: "IfcStair",
        schemaKey: "bsi::ifc::v5a::schema::IfcStairType",
        typeData: { predefinedType: "STRAIGHT_RUN_STAIR" },
        psetKey: "bsi::ifc::v5a::prop::Pset_StairCommon",
        psetData: { RequiredHeadroom: null, HandicapAccessible: false, FireExit: false },
    },
};

/**
 * Converts a Chili3D FaceMeshData to a usd::usdgeom::mesh attribute object.
 * points: array of [x, y, z] triples.
 * faceVertexIndices: flat triangle index list.
 * faceVertexCounts: all 3s (pure triangle mesh).
 */
function faceMeshToUsdGeomMesh(faces: FaceMeshData): Record<string, unknown> {
    const points: number[][] = [];
    for (let i = 0; i < faces.position.length; i += 3) {
        points.push([faces.position[i], faces.position[i + 1], faces.position[i + 2]]);
    }
    const faceVertexIndices = Array.from(faces.index);
    const faceVertexCounts = new Array(faces.index.length / 3).fill(3);
    return { points, faceVertexIndices, faceVertexCounts };
}

/**
 * Generates a UUID v4 string.
 * Uses Web Crypto API when available; falls back to Math.random().
 */
function generateUUID(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Ensures a key is unique within a record by appending a numeric suffix.
 */
function uniqueKey(record: Record<string, string>, key: string): string {
    if (!(key in record)) return key;
    let i = 2;
    while (`${key}_${i}` in record) i++;
    return `${key}_${i}`;
}

/**
 * Recursively walks a Chili3D node and all its descendants,
 * converting each to an IFCXNode and pushing into the output array.
 * Returns the IFCX path (= Chili3D node ID) of the processed node.
 */
function walkNode(node: INode, output: IFCXNode[]): string {
    const id = node.id;
    const children: Record<string, string> = {};

    if (NodeUtils.isLinkedListNode(node)) {
        const container = node as INodeLinkedList;
        let child = container.firstChild;
        while (child !== undefined) {
            const childPath = walkNode(child, output);
            const safeKey = uniqueKey(children, child.name);
            children[safeKey] = childPath;
            child = child.nextSibling;
        }
    }

    const attributes: Record<string, unknown> = {
        "usd::Xform": IDENTITY_XFORM,
    };

    // Geometry nodes get IFC classification and optional mesh geometry.
    // BIM-tool nodes declare their ifcType (e.g. "IfcWall") via a property;
    // all other geometry nodes fall back to IfcBuildingElementProxy.
    if (node instanceof GeometryNode) {
        const ifcType = (node as unknown as { ifcType?: string }).ifcType;
        const ifcDef = ifcType ? IFC_TYPE_DEFAULTS[ifcType] : undefined;

        if (ifcDef) {
            // BIM element: emit the standard `bsi::ifc::class` instance attribute
            // so viewers can identify the element type, plus the v5a typed schema
            // component for richer data and the property set.
            attributes["bsi::ifc::class"] = {
                code: ifcDef.classCode,
                uri: `${IFC_CLASS_URI_BASE}${ifcDef.classCode}`,
            };
            attributes[ifcDef.schemaKey] = ifcDef.typeData;
            if (ifcDef.psetKey && ifcDef.psetData) {
                attributes[ifcDef.psetKey] = { ...ifcDef.psetData };
            }
        } else {
            // Generic geometry: fallback IFC class
            attributes["bsi::ifc::class"] = IFC_ELEMENT_PROXY;
        }

        const faces = node.mesh.faces;
        if (faces && faces.index.length > 0) {
            attributes["usd::usdgeom::mesh"] = faceMeshToUsdGeomMesh(faces);
        }
    }

    const ifcxNode: IFCXNode = {
        path: id,
        ...(Object.keys(children).length > 0 ? { children } : {}),
        attributes,
    };

    output.push(ifcxNode);
    return id;
}

/**
 * Serializes a Chili3D document to IFCX format.
 *
 * Phase 0 implementation: converts the scene graph structure and wraps it
 * in a standard IFC spatial hierarchy (Project → Site → Building → Storey).
 *
 * Geometry tessellation (usd::Mesh components) will be added in Phase 1
 * once the WASM OCC kernel bridge is integrated.
 */
export class IFCXSerializer {
    /**
     * Converts a Chili3D IDocument to an IFCXDocument.
     *
     * @param document - The active Chili3D document
     * @param author - Author string for the file header (defaults to "IFCstudio")
     * @returns A complete IFCXDocument ready for JSON serialization
     */
    static serialize(document: IDocument, author = "IFCstudio"): IFCXDocument {
        const nodes: IFCXNode[] = [];
        const timestamp = new Date().toISOString();

        // Collect scene nodes from the Chili3D document tree
        const storeyChildren: Record<string, string> = {};
        const rootNode = document.modelManager.rootNode;

        if (rootNode) {
            let topChild = rootNode.firstChild;
            while (topChild !== undefined) {
                const childPath = walkNode(topChild, nodes);
                const safeKey = uniqueKey(storeyChildren, topChild.name);
                storeyChildren[safeKey] = childPath;
                topChild = topChild.nextSibling;
            }
        }

        // Generate stable IDs for the spatial hierarchy
        const storeyId = generateUUID();
        const buildingId = generateUUID();
        const siteId = generateUUID();
        const projectId = generateUUID();

        // IFC Storey — contains all modelled elements from this document
        nodes.push({
            path: storeyId,
            ...(Object.keys(storeyChildren).length > 0 ? { children: storeyChildren } : {}),
            attributes: {
                "bsi::ifc::v5a::schema::IfcBuildingStoreyType": {
                    Name: document.name,
                    Elevation: 0.0,
                },
                "usd::Xform": IDENTITY_XFORM,
            },
        });

        // IFC Building
        nodes.push({
            path: buildingId,
            children: { [document.name]: storeyId },
            attributes: {
                "bsi::ifc::v5a::schema::IfcBuildingType": {
                    Name: document.name,
                },
                "usd::Xform": IDENTITY_XFORM,
            },
        });

        // IFC Site
        nodes.push({
            path: siteId,
            children: { Building: buildingId },
            attributes: {
                "bsi::ifc::v5a::schema::IfcSiteType": {
                    Name: "Site",
                },
                "usd::Xform": IDENTITY_XFORM,
            },
        });

        // IFC Project (root of the spatial hierarchy)
        nodes.push({
            path: projectId,
            children: { Site: siteId },
            attributes: {
                "bsi::ifc::v5a::schema::IfcProjectType": {
                    Name: document.name,
                    Description: `Exported from IFCstudio on ${timestamp}`,
                    Phase: "Design",
                },
            },
        });

        return {
            header: {
                id: document.name,
                ifcxVersion: "ifcx_alpha",
                dataVersion: "1.0.0",
                author,
                timestamp,
            },
            imports: [],
            schemas: STANDARD_SCHEMAS,
            data: nodes,
        };
    }

    /**
     * Serializes an IFCXDocument to a JSON string.
     * Pass `pretty: true` (default) for human-readable output.
     */
    static toJSON(doc: IFCXDocument, pretty = true): string {
        return JSON.stringify(doc, null, pretty ? 2 : undefined);
    }

    /**
     * Deserializes an IFCXDocument from a JSON string or a pre-parsed object.
     * Throws if the document is structurally invalid.
     */
    static fromJSON(json: string | Record<string, unknown>): IFCXDocument {
        const obj: Record<string, unknown> = typeof json === "string" ? JSON.parse(json) : json;

        if (!obj["header"] || !obj["schemas"] || !Array.isArray(obj["data"])) {
            throw new Error("Invalid IFCX file: missing required fields (header, schemas, data)");
        }

        const header = obj["header"] as Record<string, unknown>;
        if (!header["ifcxVersion"]) {
            throw new Error("Invalid IFCX file: missing or invalid header.ifcxVersion");
        }
        if (header["ifcxVersion"] !== "ifcx_alpha") {
            throw new Error(`Unsupported IFCX version: ${header["ifcxVersion"]}`);
        }

        // Normalise: imports is optional in older files
        if (!Array.isArray(obj["imports"])) {
            obj["imports"] = [];
        }

        return obj as unknown as IFCXDocument;
    }
}
