// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type IFCDocument,
    type IFCEntity,
    IFC_SCHEMA_VERSIONS,
    type IFCSchemaVersion,
} from "./IFCLiteDocument";

const DATA_ENTITY_REGEX = /#(\d+)\s*=\s*([A-Z0-9_]+)\s*\((.*)\)\s*;/is;

export class IFCLiteSerializer {
    static parse(text: string): IFCDocument {
        const schema = IFCLiteSerializer.parseSchema(text);
        const entities = IFCLiteSerializer.parseEntities(text);
        return { schema, entities, source: text };
    }

    static stringify(doc: IFCDocument): string {
        const lines: string[] = [];
        lines.push("ISO-10303-21;");
        lines.push("HEADER;");
        lines.push("FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');");
        lines.push("FILE_NAME('ifc5cad-export.ifc','2026-01-01T00:00:00',('ifc5cad'),('ifc5cad'),'ifc-lite','ifc5cad','');");
        lines.push(`FILE_SCHEMA(('${doc.schema}'));`);
        lines.push("ENDSEC;");
        lines.push("DATA;");
        for (const entity of doc.entities) {
            lines.push(`#${entity.id}=${entity.type}(${entity.args.join(",")});`);
        }
        lines.push("ENDSEC;");
        lines.push("END-ISO-10303-21;");
        return lines.join("\n");
    }

    static decodeString(value: string | undefined, fallback: string): string {
        if (!value || value === "$" || value.length < 2) return fallback;
        if (!(value.startsWith("'") && value.endsWith("'"))) return fallback;
        return value.slice(1, -1).replace(/''/g, "'");
    }

    static firstRef(value: string | undefined): number | undefined {
        if (!value) return undefined;
        const match = value.match(/#(\d+)/);
        return match ? Number(match[1]) : undefined;
    }

    static listRefs(value: string | undefined): number[] {
        if (!value) return [];
        return [...value.matchAll(/#(\d+)/g)].map((x) => Number(x[1]));
    }

    static quote(value: string): string {
        return `'${value.replace(/'/g, "''")}'`;
    }

    static makeEntity(id: number, type: string, ...args: string[]): IFCEntity {
        return { id, type, args };
    }

    private static parseSchema(text: string): IFCSchemaVersion {
        const match = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'\s*\)\s*\)\s*;/i);
        const schema = (match?.[1]?.toUpperCase() ?? "IFC4") as IFCSchemaVersion;
        return IFC_SCHEMA_VERSIONS.includes(schema) ? schema : "IFC4";
    }

    private static parseEntities(text: string): IFCEntity[] {
        const dataStart = text.indexOf("DATA;");
        if (dataStart < 0) return [];
        const dataEnd = text.indexOf("ENDSEC;", dataStart);
        const dataSection = text.slice(dataStart + 5, dataEnd >= 0 ? dataEnd : text.length);
        const chunks = dataSection
            .split(";")
            .map((x) => x.trim())
            .filter((x) => x.length > 0);

        const entities: IFCEntity[] = [];
        for (const chunk of chunks) {
            const entity = `${chunk};`;
            const match = DATA_ENTITY_REGEX.exec(entity);
            if (!match) continue;
            entities.push({
                id: Number(match[1]),
                type: match[2].toUpperCase(),
                args: IFCLiteSerializer.splitArgs(match[3]),
            });
        }
        return entities;
    }

    private static splitArgs(input: string): string[] {
        const result: string[] = [];
        let depth = 0;
        let inString = false;
        let current = "";

        for (let i = 0; i < input.length; i++) {
            const char = input[i];
            const next = input[i + 1];

            if (char === "'" && inString && next === "'") {
                current += "''";
                i++;
                continue;
            }

            if (char === "'") {
                inString = !inString;
                current += char;
                continue;
            }

            if (!inString) {
                if (char === "(") depth++;
                if (char === ")") depth--;
                if (char === "," && depth === 0) {
                    result.push(current.trim());
                    current = "";
                    continue;
                }
            }

            current += char;
        }

        if (current.trim().length > 0) {
            result.push(current.trim());
        }

        return result;
    }
}
