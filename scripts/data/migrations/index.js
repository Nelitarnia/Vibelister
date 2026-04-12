import { SCHEMA_VERSION } from "../constants.js";
import { migrateToSchemaV1 } from "./v1.js";

const MIGRATIONS_BY_TARGET_VERSION = Object.freeze({
  1: migrateToSchemaV1,
});

function readSchemaVersion(model) {
  const raw = model?.meta?.schema;
  const schema = Number(raw);
  if (!Number.isFinite(schema)) return 0;
  return Math.max(0, Math.floor(schema));
}

export function runProjectMigrationsInPlace(model) {
  const fromVersion = readSchemaVersion(model);
  if (fromVersion > SCHEMA_VERSION) {
    throw new Error(
      `Project schema ${fromVersion} is newer than supported schema ${SCHEMA_VERSION}.`,
    );
  }

  const applied = [];
  for (let version = fromVersion + 1; version <= SCHEMA_VERSION; version += 1) {
    const migrate = MIGRATIONS_BY_TARGET_VERSION[version];
    if (typeof migrate !== "function") {
      throw new Error(`Missing migration path to schema ${version}.`);
    }
    migrate(model);
    applied.push(version);
  }

  if (!model.meta || typeof model.meta !== "object") model.meta = {};
  model.meta.schema = SCHEMA_VERSION;

  return { fromVersion, toVersion: SCHEMA_VERSION, applied };
}
