// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

export const IFC_FILE_EXTENSION = ".ifc";

export const IFC_SCHEMA_VERSIONS = ["IFC2X3", "IFC4", "IFC4X1", "IFC4X2", "IFC4X3"] as const;

export type IFCSchemaVersion = (typeof IFC_SCHEMA_VERSIONS)[number];

export interface IFCEntity {
    id: number;
    type: string;
    args: string[];
}

export interface IFCDocument {
    schema: IFCSchemaVersion;
    entities: IFCEntity[];
    source?: string;
}
