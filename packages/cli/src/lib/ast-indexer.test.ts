import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AstIndexer,
  parseSourceFileTopology,
} from "./ast-indexer";

let tempDir: string;

beforeEach(() => {
  AstIndexer.clear();
  tempDir = mkdtempSync(join(tmpdir(), "ast-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("AstIndexer", () => {
  test("parseSourceFileTopology extracts exports, imports, and symbols accurately", () => {
    const code = `
      import { foo } from "./utils";
      import { bar } from "lodash";

      export interface Config {
        port: number;
      }

      export class Server {
        start() {}
      }

      export function createServer(): Server {
        return new Server();
      }

      const internalHelper = () => {};
      export const DEFAULT_PORT = 8080;
    `;

    const topology = parseSourceFileTopology(code, "src/server.ts");

    expect(topology.filePath).toBe("src/server.ts");
    expect(topology.imports).toEqual(["./utils", "lodash"]);
    expect(topology.exports).toContain("Config");
    expect(topology.exports).toContain("Server");
    expect(topology.exports).toContain("createServer");
    expect(topology.exports).toContain("DEFAULT_PORT");
    expect(topology.exports).not.toContain("internalHelper");
  });

  test("buildTopology scans directory and maps dependency relations", () => {
    const srcDir = join(tempDir, "src");
    mkdirSync(srcDir, { recursive: true });

    writeFileSync(
      join(srcDir, "utils.ts"),
      `export function formatDate() { return "now"; }\n`,
      "utf8",
    );

    writeFileSync(
      join(srcDir, "main.ts"),
      `
        import { formatDate } from "./utils";
        export function run() { formatDate(); }
      `,
      "utf8",
    );

    const topology = AstIndexer.buildTopology(tempDir);

    expect(topology.files["src/utils.ts"]).toBeDefined();
    expect(topology.files["src/main.ts"]).toBeDefined();
    expect(topology.symbolIndex["formatDate"]).toEqual({
      definedIn: "src/utils.ts",
      kind: "function",
    });
    expect(topology.symbolIndex["run"]).toEqual({
      definedIn: "src/main.ts",
      kind: "function",
    });
  });

  test("query finds symbols and files with caller dependency mapping", () => {
    const srcDir = join(tempDir, "src");
    mkdirSync(srcDir, { recursive: true });

    writeFileSync(
      join(srcDir, "db.ts"),
      `export class DatabaseConnection { connect() {} }\n`,
      "utf8",
    );

    writeFileSync(
      join(srcDir, "service.ts"),
      `
        import { DatabaseConnection } from "./db";
        export function getService() {}
      `,
      "utf8",
    );

    const querySym = AstIndexer.query({ symbol: "DatabaseConnection" }, tempDir);
    expect(querySym.found).toBe(true);
    expect(querySym.details?.definedIn).toBe("src/db.ts");
    expect(querySym.details?.importedBy).toContain("src/service.ts");

    const queryFile = AstIndexer.query({ file: "src/db.ts" }, tempDir);
    expect(queryFile.found).toBe(true);
    expect(queryFile.details?.fileExports).toContain("DatabaseConnection");
  });

  test("getCompactTopologySummary generates formatted XML block", () => {
    const srcDir = join(tempDir, "src");
    mkdirSync(srcDir, { recursive: true });

    writeFileSync(
      join(srcDir, "api.ts"),
      `export function fetchUser() {} export function saveUser() {}\n`,
      "utf8",
    );

    const summary = AstIndexer.getCompactTopologySummary(tempDir);
    expect(summary).toContain("<project_ast_topology>");
    expect(summary).toContain("src/api.ts");
    expect(summary).toContain("fetchUser");
    expect(summary).toContain("</project_ast_topology>");
  });
});

