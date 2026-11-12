import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SymbolInfo {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "variable" | "enum" | "export";
  exported: boolean;
}

export interface FileTopology {
  filePath: string; // relative to project root
  exports: string[];
  imports: string[];
  symbols: SymbolInfo[];
}

export interface ProjectTopology {
  files: Record<string, FileTopology>;
  symbolIndex: Record<string, { definedIn: string; kind: string }>;
  dependencyGraph: Record<string, string[]>; // file -> imported files
}

export interface SymbolQueryResult {
  found: boolean;
  symbol?: string;
  file?: string;
  details?: {
    definedIn?: string;
    kind?: string;
    exportedBy?: string[];
    importedBy?: string[];
    fileExports?: string[];
    fileImports?: string[];
  };
  summary: string;
}

// ---------------------------------------------------------------------------
// AST Parser Helper
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".cache",
]);

const SUPPORTED_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const modifiers = ts.getModifiers(node);
  return Boolean(
    modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
  );
}

/**
 * Parse a single TypeScript / JavaScript source file into symbol and import topology.
 */
export function parseSourceFileTopology(
  code: string,
  relativePath: string,
): FileTopology {
  const sourceFile = ts.createSourceFile(
    relativePath,
    code,
    ts.ScriptTarget.Latest,
    true, // setParentNodes
  );

  const exports: string[] = [];
  const imports: string[] = [];
  const symbols: SymbolInfo[] = [];

  function visit(node: ts.Node) {
    // 1. Imports
    if (ts.isImportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        imports.push(node.moduleSpecifier.text);
      }
    }

    // 2. Export declarations: export { a, b }
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          const exportName = element.name.text;
          exports.push(exportName);
          symbols.push({ name: exportName, kind: "export", exported: true });
        }
      }
    }

    // 3. Functions
    if (ts.isFunctionDeclaration(node) && node.name) {
      const isExported = hasExportModifier(node);
      const name = node.name.text;
      if (isExported) exports.push(name);
      symbols.push({ name, kind: "function", exported: isExported });
    }

    // 4. Classes
    if (ts.isClassDeclaration(node) && node.name) {
      const isExported = hasExportModifier(node);
      const name = node.name.text;
      if (isExported) exports.push(name);
      symbols.push({ name, kind: "class", exported: isExported });
    }

    // 5. Interfaces
    if (ts.isInterfaceDeclaration(node)) {
      const isExported = hasExportModifier(node);
      const name = node.name.text;
      if (isExported) exports.push(name);
      symbols.push({ name, kind: "interface", exported: isExported });
    }

    // 6. Type Aliases
    if (ts.isTypeAliasDeclaration(node)) {
      const isExported = hasExportModifier(node);
      const name = node.name.text;
      if (isExported) exports.push(name);
      symbols.push({ name, kind: "type", exported: isExported });
    }

    // 7. Enums
    if (ts.isEnumDeclaration(node)) {
      const isExported = hasExportModifier(node);
      const name = node.name.text;
      if (isExported) exports.push(name);
      symbols.push({ name, kind: "enum", exported: isExported });
    }

    // 8. Variables / consts
    if (ts.isVariableStatement(node)) {
      const isExported = hasExportModifier(node);
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const name = decl.name.text;
          if (isExported) exports.push(name);
          symbols.push({ name, kind: "variable", exported: isExported });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    filePath: relativePath.replace(/\\/g, "/"),
    exports: Array.from(new Set(exports)),
    imports: Array.from(new Set(imports)),
    symbols,
  };
}

// ---------------------------------------------------------------------------
// Project Topology Indexer
// ---------------------------------------------------------------------------

export class AstIndexer {
  private static cachedTopology: ProjectTopology | null = null;
  private static lastIndexedCwd: string | null = null;

  /**
   * Scan project source files and construct the full AST topology graph.
   */
  static buildTopology(cwd: string = process.cwd(), maxFiles = 100): ProjectTopology {
    const normCwd = path.resolve(cwd);
    if (this.cachedTopology && this.lastIndexedCwd === normCwd) {
      return this.cachedTopology;
    }

    const files: Record<string, FileTopology> = {};
    const symbolIndex: Record<string, { definedIn: string; kind: string }> = {};
    const dependencyGraph: Record<string, string[]> = {};

    let count = 0;

    function walk(dir: string) {
      if (count >= maxFiles) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (count >= maxFiles) break;
        if (entry.name.startsWith(".") && entry.name !== ".mastercode") continue;
        if (SKIP_DIRS.has(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (SUPPORTED_EXTS.has(ext)) {
            try {
              const code = fs.readFileSync(fullPath, "utf8");
              const relPath = path.relative(normCwd, fullPath).replace(/\\/g, "/");
              const fileTop = parseSourceFileTopology(code, relPath);

              files[relPath] = fileTop;
              dependencyGraph[relPath] = fileTop.imports;

              for (const sym of fileTop.symbols) {
                if (sym.exported) {
                  symbolIndex[sym.name] = { definedIn: relPath, kind: sym.kind };
                }
              }
              count++;
            } catch {
              // skip unreadable files
            }
          }
        }
      }
    }

    walk(normCwd);

    const result: ProjectTopology = {
      files,
      symbolIndex,
      dependencyGraph,
    };

    this.cachedTopology = result;
    this.lastIndexedCwd = normCwd;

    return result;
  }

  /**
   * Query the AST topology for a specific symbol or file.
   */
  static query(
    query: { symbol?: string; file?: string },
    cwd: string = process.cwd(),
  ): SymbolQueryResult {
    const topology = this.buildTopology(cwd);

    // Query by Symbol
    if (query.symbol) {
      const cleanSym = query.symbol.trim();
      const match = topology.symbolIndex[cleanSym];
      if (match) {
        const importedBy: string[] = [];
        const targetBase = path.basename(match.definedIn).replace(/\.[^.]+$/, "");

        for (const [filePath, fTop] of Object.entries(topology.files)) {
          if (
            fTop.imports.some(
              (imp) =>
                imp.includes(targetBase) ||
                imp.endsWith(`/${targetBase}`) ||
                imp === `./${targetBase}`,
            )
          ) {
            importedBy.push(filePath);
          }
        }

        return {
          found: true,
          symbol: cleanSym,
          file: match.definedIn,
          details: {
            definedIn: match.definedIn,
            kind: match.kind,
            importedBy,
          },
          summary: `Symbol '${cleanSym}' (${match.kind}) is defined and exported in ${match.definedIn}. Imported by: ${importedBy.length > 0 ? importedBy.join(", ") : "none"}.`,
        };
      }

      return {
        found: false,
        symbol: cleanSym,
        summary: `Symbol '${cleanSym}' not found in project AST index.`,
      };
    }

    // Query by File
    if (query.file) {
      const normFile = query.file.replace(/\\/g, "/");
      const matchedKey = Object.keys(topology.files).find(
        (f) => f === normFile || f.endsWith(`/${normFile}`),
      );

      if (matchedKey) {
        const fTop = topology.files[matchedKey]!;
        return {
          found: true,
          file: matchedKey,
          details: {
            fileExports: fTop.exports,
            fileImports: fTop.imports,
          },
          summary: `File '${matchedKey}': Exports [${fTop.exports.join(", ") || "none"}], Imports [${fTop.imports.join(", ") || "none"}].`,
        };
      }

      return {
        found: false,
        file: query.file,
        summary: `File '${query.file}' not found in project index.`,
      };
    }

    // General Summary
    const totalFiles = Object.keys(topology.files).length;
    const totalSymbols = Object.keys(topology.symbolIndex).length;
    return {
      found: true,
      summary: `Project AST Topology: ${totalFiles} source files indexed, ${totalSymbols} exported symbols found.`,
    };
  }

  /**
   * Generate a compact summary block of exported symbols across the project.
   */
  static getCompactTopologySummary(cwd: string = process.cwd(), limit = 15): string {
    const topology = this.buildTopology(cwd);
    const fileEntries = Object.entries(topology.files)
      .filter(([, fTop]) => fTop.exports.length > 0)
      .slice(0, limit);

    if (fileEntries.length === 0) return "";

    const lines = fileEntries.map(
      ([filePath, fTop]) => `- ${filePath}: exports [${fTop.exports.slice(0, 5).join(", ")}${fTop.exports.length > 5 ? ", ..." : ""}]`,
    );

    return `<project_ast_topology>\n${lines.join("\n")}\n</project_ast_topology>`;
  }

  static clear(): void {
    this.cachedTopology = null;
    this.lastIndexedCwd = null;
  }
}

