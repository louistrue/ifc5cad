// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// IFCX (IFC5) document type definitions.
// Aligned with the buildingSMART IFC5 TypeSpec specification:
// https://github.com/buildingSMART/IFC5-development

/**
 * The IFCX format version string.
 * Currently in alpha — schema may change as IFC5 is standardized.
 */
export type IFCXVersion = "ifcx_alpha";

/**
 * Document header with authoring metadata.
 * Matches IfcxHeader from the buildingSMART TypeSpec.
 */
export interface IFCXHeader {
    /** Identifier of the dataset, e.g. "project-name@v1.ifcx" */
    id: string;
    /** IFCX format version, e.g. "ifcx_alpha" */
    ifcxVersion: IFCXVersion;
    /** Dataset version, e.g. "1.0.0" */
    dataVersion: string;
    /** Author or authoring application, e.g. "IFCstudio" */
    author: string;
    /** ISO 8601 datetime of creation/modification */
    timestamp: string;
}

/**
 * A reference to an external IFCX document to compose/layer into this one.
 * Matches ImportNode from the buildingSMART TypeSpec.
 */
export interface IFCXImport {
    /** URI of the imported IFCX document */
    uri: string;
    /** Optional subresource integrity hash */
    integrity?: string;
}

/**
 * A schema reference within an IFCX document.
 * Matches IfcxSchema from the buildingSMART TypeSpec.
 * Schemas are identified by a qualified key (e.g. "bsi::ifc::v5a::schema").
 */
export interface IFCXSchema {
    /** URI to the JSON Schema / schema definition */
    uri?: string;
    /** Inline schema value (alternative to uri) */
    value?: Record<string, unknown>;
}

/**
 * A single node in the IFCX data graph.
 * Matches IfcxNode from the buildingSMART TypeSpec.
 *
 * The IFCX model is an Entity-Component system:
 * - `path` is the unique entity identifier
 * - `children` defines the spatial/logical hierarchy
 * - `inherits` references prototype nodes whose attributes are inherited
 * - `attributes` attaches typed data (IFC type, properties, geometry, etc.)
 */
export interface IFCXNode {
    /** Unique path/ID for this node. */
    path: string;
    /**
     * Named children of this node.
     * Maps a human-readable child name to the child node's path (or null).
     */
    children?: Record<string, string | null>;
    /**
     * Named prototype references for attribute inheritance.
     * Maps a name to the prototype node's path (or null to break inheritance).
     */
    inherits?: Record<string, string | null>;
    /**
     * Attributes attached to this node.
     * Keys are schema-qualified attribute names (e.g. "bsi::ifc::v5a::schema::IfcWallType").
     * Values are the attribute data objects conforming to the referenced schema.
     * A null value means the attribute is present but empty (marker attribute).
     */
    attributes?: Record<string, unknown>;
}

/**
 * A complete IFCX file.
 * Matches IfcxFile from the buildingSMART TypeSpec.
 */
export interface IFCXDocument {
    header: IFCXHeader;
    /** External IFCX documents to compose into this one (federated models). */
    imports: IFCXImport[];
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
