// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// IFCX (IFC5) document type definitions.
// Based on the IFCX alpha format from buildingSMART International.
// Specification: https://github.com/buildingSMART/IFC5-development

/**
 * The IFCX format version string.
 * Currently in alpha — schema may change as IFC5 is standardized.
 */
export type IFCXVersion = "ifcx_alpha";

/**
 * Document header with authoring metadata.
 */
export interface IFCXHeader {
    /** IFCX format version */
    ifcxVersion: IFCXVersion;
    /** Author or authoring application */
    author: string;
    /** ISO 8601 timestamp of creation/modification */
    timestamp: string;
}

/**
 * A schema reference within an IFCX document.
 * Schemas are identified by a qualified key (e.g. "bsi::ifc::v5a::schema").
 * The schema itself can be referenced by URI or inlined as a JSON Schema value.
 */
export interface IFCXSchema {
    /** URI to the JSON Schema definition */
    uri?: string;
    /** Inline JSON Schema value (alternative to uri) */
    value?: Record<string, unknown>;
}

/**
 * A single node in the IFCX data graph.
 *
 * Nodes represent any element in the model: building elements,
 * spatial structures, property sets, geometry, etc.
 *
 * The IFCX model is an Entity-Component system:
 * - `path` is the unique entity identifier (UUID)
 * - `children` defines the spatial/logical hierarchy
 * - `components` attaches typed data (IFC type, properties, geometry, etc.)
 */
export interface IFCXNode {
    /** Unique path/ID for this node. Typically a UUID. */
    path: string;
    /**
     * Named children of this node.
     * Maps a human-readable child name to the child node's path.
     * Example: { "Ground Floor": "uuid-of-storey-node" }
     */
    children?: Record<string, string>;
    /**
     * Components attached to this node.
     * Keys are schema-qualified component names (e.g. "bsi::ifc::v5a::schema::IfcWallType").
     * Values are the component data objects, conforming to the referenced schema.
     * A null value means the component is present but empty (marker component).
     */
    components?: Record<string, unknown>;
}

/**
 * A complete IFCX document.
 *
 * An IFCX document is a self-contained model file consisting of:
 * - A header with metadata
 * - Schema references used by the components in this document
 * - A flat list of nodes forming the model graph
 *
 * The hierarchy is expressed via `children` references in nodes.
 * Multiple IFCX documents can be composed (layered) for federated models.
 */
export interface IFCXDocument {
    header: IFCXHeader;
    /**
     * Schema registry for this document.
     * Maps schema namespace key to its URI or inline definition.
     */
    schemas: Record<string, IFCXSchema>;
    /** All nodes in the model, in no particular order. */
    data: IFCXNode[];
}

/** File extension for IFCX files */
export const IFCX_FILE_EXTENSION = ".ifcx";

/** MIME type for IFCX files */
export const IFCX_MIME_TYPE = "application/json";
