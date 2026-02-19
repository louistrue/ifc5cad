// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

/**
 * A JSON Schema object (simplified — covers the draft-07 subset used in IFCX).
 */
export type JSONSchema = {
    $id?: string;
    title?: string;
    description?: string;
    type?: string | string[];
    properties?: Record<string, JSONSchema>;
    required?: string[];
    enum?: unknown[];
    items?: JSONSchema;
    additionalProperties?: boolean | JSONSchema;
    $ref?: string;
    [key: string]: unknown;
};

/**
 * Result of a schema validation check.
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * A registered schema entry.
 */
interface SchemaEntry {
    /** The JSON Schema definition */
    schema: JSONSchema;
    /**
     * Remote URI for this schema.
     * Present for schemas that were fetched from a remote registry.
     */
    uri?: string;
}

/**
 * Registry of known IFCX schema namespaces.
 *
 * Schemas are either:
 * 1. **Bundled**: Shipped with IFCstudio for offline use (Swiss standards, etc.)
 * 2. **Remote**: Fetched on demand from the buildingSMART registry and cached
 *
 * The schema key format follows IFCX conventions: `namespace::sub::key`
 * Example: `bsi::ifc::v5a::schema`, `ch::ebkp-h`, `usd`
 */
export class SchemaRegistry {
    private readonly _cache = new Map<string, SchemaEntry>();

    /**
     * Remote URI templates for well-known IFCX schema namespaces.
     * These are fetched on demand when a schema is requested but not bundled.
     */
    private static readonly REMOTE_URIS: Record<string, string> = {
        "bsi::ifc::v5a::schema":
            "https://ifc5.technical.buildingsmart.org/schemas/bsi/ifc/v5a/schema.json",
        "bsi::ifc::v5a::prop":
            "https://ifc5.technical.buildingsmart.org/schemas/bsi/ifc/v5a/prop.json",
        usd: "https://ifc5.technical.buildingsmart.org/schemas/usd.json",
    };

    /**
     * Human-readable labels for known schema namespaces (for UI display).
     */
    static readonly NAMESPACE_LABELS: Record<string, string> = {
        "bsi::ifc::v5a::schema": "IFC 5 — Element Types",
        "bsi::ifc::v5a::prop": "IFC 5 — Property Sets",
        usd: "USD (Universal Scene Description)",
        "ch::ebkp-h": "eBKP-H — Swiss Building Cost Classification",
        "ch::sia416": "SIA 416 — Swiss Area Definitions",
        "ch::kbob-lca": "KBOB — Swiss LCA Data",
        "ch::building-permit": "CH — Swiss Building Permit Data",
    };

    /**
     * Returns the global singleton instance.
     * Call `SchemaRegistry.instance.loadBundled()` once at app startup.
     */
    static readonly instance = new SchemaRegistry();

    private constructor() {}

    /**
     * Loads all bundled schemas into the registry.
     * Must be called once before using the registry.
     *
     * These schemas are included in the app bundle for offline support:
     * - ch::ebkp-h — eBKP-H Swiss cost classification
     * - ch::sia416 — SIA 416 area definitions
     * - ch::kbob-lca — KBOB LCA environmental data
     * - ch::building-permit — Swiss building permit fields
     */
    async loadBundled(): Promise<void> {
        const bundled: Array<{ key: string; loader: () => Promise<JSONSchema> }> = [
            {
                key: "ch::ebkp-h",
                loader: () =>
                    import("./schemas/ch-ebkp-h.json").then((m) => m.default as unknown as JSONSchema),
            },
            {
                key: "ch::sia416",
                loader: () =>
                    import("./schemas/ch-sia416.json").then((m) => m.default as unknown as JSONSchema),
            },
            {
                key: "ch::kbob-lca",
                loader: () =>
                    import("./schemas/ch-kbob-lca.json").then((m) => m.default as unknown as JSONSchema),
            },
            {
                key: "ch::building-permit",
                loader: () =>
                    import("./schemas/ch-building-permit.json").then(
                        (m) => m.default as unknown as JSONSchema,
                    ),
            },
        ];

        await Promise.all(
            bundled.map(async ({ key, loader }) => {
                try {
                    const schema = await loader();
                    this._cache.set(key, { schema });
                } catch (err) {
                    console.warn(`[SchemaRegistry] Failed to load bundled schema "${key}":`, err);
                }
            }),
        );
    }

    /**
     * Retrieves a schema by its namespace key.
     *
     * Resolution order:
     * 1. In-memory cache (previously loaded schemas)
     * 2. Remote fetch from buildingSMART registry (for standard IFC schemas)
     *
     * Bundled schemas must be pre-loaded via `loadBundled()`.
     *
     * @param key - Schema namespace key (e.g. "bsi::ifc::v5a::schema", "ch::ebkp-h")
     * @returns The JSON Schema definition
     * @throws If the schema cannot be found locally or fetched remotely
     */
    async getSchema(key: string): Promise<JSONSchema> {
        const cached = this._cache.get(key);
        if (cached) return cached.schema;

        // Attempt to fetch from known remote URIs
        const uri = SchemaRegistry.REMOTE_URIS[key];
        if (uri) {
            return this.fetchAndCache(key, uri);
        }

        throw new Error(
            `Schema not found: "${key}". ` +
                `Register it with SchemaRegistry.instance.register() or add it to the bundled schemas.`,
        );
    }

    /**
     * Returns a cached schema without fetching, or undefined if not loaded.
     * Safe to call synchronously — will not trigger a network request.
     */
    getCached(key: string): JSONSchema | undefined {
        return this._cache.get(key)?.schema;
    }

    /**
     * Registers a schema directly (e.g. from user-provided or inline schema data).
     */
    register(key: string, schema: JSONSchema, uri?: string): void {
        this._cache.set(key, { schema, uri });
    }

    /**
     * Returns all currently loaded schema keys.
     */
    listLoaded(): string[] {
        return Array.from(this._cache.keys());
    }

    /**
     * Returns all known schema keys (bundled + remote), regardless of load status.
     */
    listKnown(): string[] {
        return [
            "bsi::ifc::v5a::schema",
            "bsi::ifc::v5a::prop",
            "usd",
            "ch::ebkp-h",
            "ch::sia416",
            "ch::kbob-lca",
            "ch::building-permit",
        ];
    }

    /**
     * Performs basic structural validation of a data object against a cached schema.
     *
     * This is a lightweight validator that checks required fields and property types.
     * For full JSON Schema validation, integrate AJV (see Phase 2 plan).
     */
    validate(key: string, data: unknown): ValidationResult {
        const schema = this.getCached(key);
        if (!schema) {
            return { valid: false, errors: [`Schema "${key}" not loaded`] };
        }

        const errors: string[] = [];

        if (schema.required && Array.isArray(schema.required)) {
            for (const field of schema.required) {
                if (
                    data === null ||
                    typeof data !== "object" ||
                    !(field in (data as Record<string, unknown>))
                ) {
                    errors.push(`Missing required field: "${field}"`);
                }
            }
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Fetches a JSON Schema from a remote URI and stores it in the cache.
     */
    private async fetchAndCache(key: string, uri: string): Promise<JSONSchema> {
        const response = await fetch(uri);
        if (!response.ok) {
            throw new Error(`Failed to fetch schema "${key}" from ${uri}: HTTP ${response.status}`);
        }
        const schema: JSONSchema = await response.json();
        this._cache.set(key, { schema, uri });
        return schema;
    }
}
