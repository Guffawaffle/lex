const POSTGRES_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;
const POSTGRES_SYSTEM_SCHEMA_PATTERN = /^(?:information_schema|pg_.+)$/;

export interface PostgresSchemaTargetV1 {
  readonly schema: string;
  readonly quotedSchema: string;
  relation(name: string): string;
  function(name: string): string;
}

function requirePostgresIdentifier(value: string, name: string): string {
  if (!POSTGRES_IDENTIFIER_PATTERN.test(value)) {
    throw new TypeError(
      `${name} must be a lower-case PostgreSQL identifier containing at most 63 ASCII characters.`
    );
  }
  return value;
}

function quotePostgresIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/**
 * Bind PostgreSQL object names to one explicit, non-system schema.
 *
 * Relation and function names are also validated even though Lex supplies them
 * internally, keeping every generated identifier safe by construction.
 */
export function createPostgresSchemaTarget(schema: string): PostgresSchemaTargetV1 {
  const validatedSchema = requirePostgresIdentifier(schema, "PostgreSQL schema");
  if (POSTGRES_SYSTEM_SCHEMA_PATTERN.test(validatedSchema)) {
    throw new TypeError("PostgreSQL schema must not name a system schema.");
  }
  const qualify = (name: string, kind: "relation" | "function"): string => {
    const validatedName = requirePostgresIdentifier(name, `PostgreSQL ${kind}`);
    return `${quotePostgresIdentifier(validatedSchema)}.${quotePostgresIdentifier(validatedName)}`;
  };
  return Object.freeze({
    schema: validatedSchema,
    quotedSchema: quotePostgresIdentifier(validatedSchema),
    relation: (name: string) => qualify(name, "relation"),
    function: (name: string) => qualify(name, "function"),
  });
}
