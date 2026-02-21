// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

export const IFC_FILE_EXTENSIONS = ".ifc,.ifczip";
export const IFC_PRIMARY_FILE_EXTENSION = ".ifc";

export interface IIfcLiteEntity {
    id: number;
    type: string;
    args: string[];
    raw: string;
}

export interface IIfcLiteDocument {
    header: string;
    schemas: string[];
    entities: IIfcLiteEntity[];
}
