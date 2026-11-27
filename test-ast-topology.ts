#!/usr/bin/env bun

/**
 * Generate AST Topology Map for any project
 * Usage: bun test-ast-topology.ts [project-path]
 */

import { AstIndexer } from "./packages/cli/src/lib/ast-indexer";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";

const targetPath = process.argv[2] || process.cwd();
const absoluteTargetPath = path.resolve(targetPath);
const outputFile = path.join(absoluteTargetPath, "ast-topology-output.html");

console.log("🔍 Scanning project:", absoluteTargetPath);
console.log("⏳ Building AST topology...\n");

// Build the topology
const topology = AstIndexer.buildTopology(absoluteTargetPath, 50);

const fileCount = Object.keys(topology.files).length;
const symbolCount = Object.keys(topology.symbolIndex).length;
const totalImports = Object.values(topology.files).reduce(
  (sum, file) => sum + file.imports.length,
  0
);
const totalExports = Object.values(topology.files).reduce(
  (sum, file) => sum + file.exports.length,
  0
);

console.log("📊 Analysis Complete:");
console.log(`   Files indexed: ${fileCount}`);
console.log(`   Exported symbols: ${symbolCount}`);
console.log(`   Total imports: ${totalImports}`);
console.log(`   Total exports: ${totalExports}\n`);

// Generate HTML visualization
const html = generateVisualization(topology, absoluteTargetPath);
fs.writeFileSync(outputFile, html);

console.log(`✅ HTML visualization saved to: ${outputFile}`);
console.log(`🌐 Opening in browser...\n`);

// Open the HTML file in default browser
openInBrowser(outputFile);

// Also print compact summary
console.log("📋 Compact AST Summary (used in prompts):");
console.log(AstIndexer.getCompactTopologySummary(absoluteTargetPath, 20));

/**
 * Open file in default browser (cross-platform)
 */
function openInBrowser(filePath: string) {
  const platform = process.platform;
  let command: string;

  if (platform === 'win32') {
    // Windows
    command = `start "" "${filePath}"`;
  } else if (platform === 'darwin') {
    // macOS
    command = `open "${filePath}"`;
  } else {
    // Linux and others
    command = `xdg-open "${filePath}"`;
  }

  exec(command, (error) => {
    if (error) {
      console.error(`⚠️  Could not auto-open browser: ${error.message}`);
      console.log(`   Please open manually: ${filePath}`);
    } else {
      console.log(`✅ Browser opened successfully!`);
    }
  });
}

function generateVisualization(topology: any, projectPath: string): string {
  const fileEntries = Object.entries(topology.files).slice(0, 50);
  
  // Generate nodes and edges for the graph
  const nodes = fileEntries.map(([filePath]: [string, any], index: number) => {
    const fileName = path.basename(filePath);
    const dir = path.dirname(filePath);
    return {
      id: filePath,
      label: fileName,
      group: dir.split('/')[0] || 'root',
    };
  });

  const edges: any[] = [];
  Object.entries(topology.dependencyGraph).forEach(([source, targets]: [string, any]) => {
    targets.forEach((target: string) => {
      // Try to resolve the import to an actual file
      const matchedFile = Object.keys(topology.files).find(file => {
        const baseName = path.basename(file, path.extname(file));
        return target.includes(baseName) || target.endsWith(`/${baseName}`);
      });
      
      if (matchedFile && nodes.find(n => n.id === source) && nodes.find(n => n.id === matchedFile)) {
        edges.push({ from: source, to: matchedFile });
      }
    });
  });

  // Create detailed file info cards
  const fileInfoHtml = fileEntries
    .map(([filePath, fileData]: [string, any]) => {
      const fileName = path.basename(filePath);
      const exportsList = fileData.exports
        .map((exp: string) => {
          const symbol = fileData.symbols.find((s: any) => s.name === exp);
          const kind = symbol?.kind || 'export';
          return `<div class="list-item"><span class="arrow">→</span>${exp}<span class="kind-badge">${kind}</span></div>`;
        })
        .join('');

      const importsList = fileData.imports.length
        ? fileData.imports.map((imp: string) => 
            `<div class="list-item"><span class="arrow">←</span>${imp}</div>`
          ).join('')
        : '<div class="empty">No imports</div>';

      return `
        <div class="file-info" data-file="${filePath}">
          <div class="file-header">
            <div class="file-name">${fileName}</div>
            <div class="file-path">${filePath}</div>
          </div>
          <div class="info-section">
            <div class="section-label">Exports (${fileData.exports.length})</div>
            ${exportsList || '<div class="empty">No exports</div>'}
          </div>
          <div class="info-section">
            <div class="section-label">Imports (${fileData.imports.length})</div>
            ${importsList}
          </div>
        </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AST Topology Graph - ${path.basename(projectPath)}</title>
    <script src="https://unpkg.com/vis-network@9.1.9/dist/vis-network.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', 'Roboto Mono', monospace;
            background: #1e1e1e;
            color: #d4d4d4;
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        
        /* Header */
        .header {
            background: #252526;
            border-bottom: 1px solid #3e3e42;
            padding: 16px 24px;
            flex-shrink: 0;
        }
        .header h1 {
            font-size: 16px;
            color: #cccccc;
            font-weight: 600;
            margin-bottom: 4px;
        }
        .header p {
            font-size: 12px;
            color: #858585;
        }
        
        /* Stats Bar */
        .stats {
            display: flex;
            background: #252526;
            border-bottom: 1px solid #3e3e42;
            flex-shrink: 0;
        }
        .stat {
            flex: 1;
            padding: 12px 24px;
            border-right: 1px solid #3e3e42;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .stat:last-child { border-right: none; }
        .stat-number {
            font-size: 20px;
            font-weight: 600;
            color: #4fc3f7;
        }
        .stat-label {
            font-size: 11px;
            color: #858585;
        }
        
        /* Main Layout */
        .main {
            flex: 1;
            display: flex;
            overflow: hidden;
        }
        
        /* Graph Container */
        .graph-container {
            flex: 1;
            position: relative;
            background: #1e1e1e;
        }
        #network {
            width: 100%;
            height: 100%;
        }
        
        /* Controls */
        .controls {
            position: absolute;
            top: 16px;
            right: 16px;
            display: flex;
            gap: 8px;
            z-index: 10;
        }
        .btn {
            background: #252526;
            border: 1px solid #3e3e42;
            color: #cccccc;
            padding: 8px 16px;
            font-size: 12px;
            cursor: pointer;
            font-family: inherit;
        }
        .btn:hover {
            background: #2d2d30;
            border-color: #007acc;
        }
        
        /* Sidebar */
        .sidebar {
            width: 400px;
            background: #252526;
            border-left: 1px solid #3e3e42;
            overflow-y: auto;
            flex-shrink: 0;
        }
        .sidebar-header {
            padding: 16px;
            border-bottom: 1px solid #3e3e42;
            position: sticky;
            top: 0;
            background: #252526;
            z-index: 5;
        }
        .sidebar-title {
            font-size: 13px;
            color: #cccccc;
            font-weight: 600;
        }
        
        /* File Info */
        .file-info {
            padding: 16px;
            border-bottom: 1px solid #3e3e42;
            display: none;
        }
        .file-info.active {
            display: block;
        }
        .file-header {
            margin-bottom: 16px;
        }
        .file-name {
            font-size: 14px;
            color: #4ec9b0;
            font-weight: 600;
            margin-bottom: 4px;
        }
        .file-path {
            font-size: 11px;
            color: #858585;
        }
        .info-section {
            margin-bottom: 16px;
        }
        .section-label {
            font-size: 10px;
            text-transform: uppercase;
            color: #6a6a6a;
            letter-spacing: 1px;
            margin-bottom: 8px;
            font-weight: 600;
        }
        .list-item {
            font-size: 11px;
            padding: 4px 0;
            color: #d4d4d4;
            display: flex;
            align-items: center;
        }
        .arrow {
            color: #007acc;
            margin-right: 8px;
            font-weight: bold;
        }
        .kind-badge {
            margin-left: 8px;
            color: #858585;
            font-size: 10px;
            font-style: italic;
        }
        .empty {
            font-size: 11px;
            color: #6a6a6a;
            font-style: italic;
        }
        
        /* Legend */
        .legend {
            padding: 16px;
            border-top: 1px solid #3e3e42;
            background: #252526;
        }
        .legend-title {
            font-size: 11px;
            color: #858585;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
            font-size: 11px;
        }
        .legend-color {
            width: 16px;
            height: 16px;
            border: 1px solid #3e3e42;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>AST Dependency Graph - ${path.basename(projectPath)}</h1>
        <p>Generated by MasterCode • ${new Date().toLocaleString()}</p>
    </div>
    
    <div class="stats">
        <div class="stat">
            <span class="stat-number">${Object.keys(topology.files).length}</span>
            <span class="stat-label">Files</span>
        </div>
        <div class="stat">
            <span class="stat-number">${Object.keys(topology.symbolIndex).length}</span>
            <span class="stat-label">Symbols</span>
        </div>
        <div class="stat">
            <span class="stat-number">${edges.length}</span>
            <span class="stat-label">Dependencies</span>
        </div>
        <div class="stat">
            <span class="stat-number">${Object.keys(topology.files).reduce((sum, key) => sum + topology.files[key].exports.length, 0)}</span>
            <span class="stat-label">Exports</span>
        </div>
    </div>
    
    <div class="main">
        <div class="graph-container">
            <div class="controls">
                <button class="btn" onclick="network.fit()">Fit View</button>
                <button class="btn" onclick="resetGraph()">Reset</button>
            </div>
            <div id="network"></div>
        </div>
        
        <div class="sidebar">
            <div class="sidebar-header">
                <div class="sidebar-title">File Details</div>
            </div>
            <div id="file-details">
                ${fileInfoHtml}
            </div>
            <div class="legend">
                <div class="legend-title">Legend</div>
                <div class="legend-item">
                    <div class="legend-color" style="background: #4fc3f7;"></div>
                    <span>packages/cli</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background: #81c784;"></div>
                    <span>packages/shared</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background: #ffb74d;"></div>
                    <span>Other modules</span>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        const nodes = new vis.DataSet(${JSON.stringify(nodes)});
        const edges = new vis.DataSet(${JSON.stringify(edges)});
        
        const container = document.getElementById('network');
        const data = { nodes, edges };
        
        const options = {
            nodes: {
                shape: 'dot',
                size: 16,
                font: {
                    size: 12,
                    color: '#d4d4d4',
                    face: 'SF Mono, Roboto Mono, monospace'
                },
                borderWidth: 2,
                borderWidthSelected: 3,
                color: {
                    border: '#3e3e42',
                    background: '#4fc3f7',
                    highlight: {
                        border: '#007acc',
                        background: '#007acc'
                    }
                }
            },
            edges: {
                width: 1,
                color: {
                    color: '#3e3e42',
                    highlight: '#007acc'
                },
                arrows: {
                    to: {
                        enabled: true,
                        scaleFactor: 0.5
                    }
                },
                smooth: {
                    type: 'continuous',
                    roundness: 0.5
                }
            },
            physics: {
                stabilization: {
                    iterations: 200
                },
                barnesHut: {
                    gravitationalConstant: -8000,
                    centralGravity: 0.3,
                    springLength: 150,
                    springConstant: 0.04,
                    damping: 0.09,
                    avoidOverlap: 0.5
                }
            },
            interaction: {
                hover: true,
                tooltipDelay: 100,
                hideEdgesOnDrag: true,
                hideEdgesOnZoom: true
            },
            layout: {
                improvedLayout: true
            }
        };
        
        const network = new vis.Network(container, data, options);
        
        // Show file details on node click
        network.on('selectNode', function(params) {
            const nodeId = params.nodes[0];
            document.querySelectorAll('.file-info').forEach(el => el.classList.remove('active'));
            const fileInfo = document.querySelector(\`[data-file="\${nodeId}"]\`);
            if (fileInfo) {
                fileInfo.classList.add('active');
                fileInfo.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
        
        // Highlight connected nodes on hover
        network.on('hoverNode', function(params) {
            const nodeId = params.node;
            const connectedNodes = network.getConnectedNodes(nodeId);
            const connectedEdges = network.getConnectedEdges(nodeId);
            
            // Highlight logic here if needed
        });
        
        function resetGraph() {
            network.fit();
            document.querySelectorAll('.file-info').forEach(el => el.classList.remove('active'));
        }
        
        // Initial fit
        setTimeout(() => network.fit(), 500);
    </script>
</body>
</html>`;
}
