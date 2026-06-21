import { App, TFile } from 'obsidian';
import { ensureVaultFolder, createVaultFile } from './vaultFiles';

/**
 * Generate a canvas mind map from a starting note.
 *
 * @param app Obsidian App instance.
 * @param startPath Path to the markdown file (e.g., 'Folder/Note.md').
 * @param options Optional configuration.
 */
export async function generateCanvasFromNote(
  app: App,
  startPath: string,
  options?: {
    depth?: number;
    direction?: 'lr' | 'rl' | 'tb' | 'bt' | 'radial';
    nodeWidth?: number;
    nodeHeight?: number;
    spacingX?: number;
    spacingY?: number;
    outputFolder?: string;
    filename?: string;
  }
): Promise<TFile> {
  const {
    depth = 2,
    direction = 'lr',
    nodeWidth = 400,
    nodeHeight = 300,
    spacingX = 200,
    spacingY = 150,
    outputFolder = '',
    filename,
  } = options ?? {};

  // ---------- 1. Crawl linked notes ----------
  const visited = new Map<string, number>(); // path -> depth level
  const edges: { from: string; to: string }[] = [];
  const queue: { path: string; level: number }[] = [{ path: startPath, level: 0 }];

  while (queue.length) {
    const { path, level } = queue.shift()!;
    if (visited.has(path)) continue;
    visited.set(path, level);
    if (level >= depth) continue;

    const cache = app.metadataCache.getCache(path);
    const forwardPaths = new Set<string>();

    // 1. Collect from cache directly (handles frontmatter, embeds, wikilinks)
    if (cache) {
      const allLinks = [
        ...(cache.links || []),
        ...(cache.embeds || []),
        ...((cache as any).frontmatterLinks || [])
      ];
      for (const linkCache of allLinks) {
        if (!linkCache.link) continue;
        const dest = app.metadataCache.getFirstLinkpathDest(linkCache.link, path);
        if (dest) forwardPaths.add(dest.path);
      }
    }

    // 2. Collect from resolvedLinks (Obsidian's native robust graph)
    const resolved = app.metadataCache.resolvedLinks || {};
    const pathResolved = resolved[path] || {};
    for (const destPath of Object.keys(pathResolved)) {
      forwardPaths.add(destPath);
    }

    // Process Forward Links
    for (const destPath of forwardPaths) {
      edges.push({ from: path, to: destPath });
      if (!visited.has(destPath)) {
        queue.push({ path: destPath, level: level + 1 });
      }
    }

    // Process Backward Links (incoming links to this note)
    for (const [sourcePath, links] of Object.entries(resolved)) {
      if (links[path]) {
        edges.push({ from: sourcePath, to: path });
        if (!visited.has(sourcePath)) {
          queue.push({ path: sourcePath, level: level + 1 });
        }
      }
    }
  }

  // Deduplicate edges
  const uniqueEdges = new Set<string>();
  const validEdges = [];
  for (const e of edges) {
    const key = `${e.from}:::${e.to}`;
    if (!uniqueEdges.has(key)) {
      uniqueEdges.add(key);
      validEdges.push(e);
    }
  }

  // ---------- 2. Assign node IDs ----------
  const nodeIdMap = new Map<string, string>();
  let idCounter = 1;
  for (const p of visited.keys()) {
    nodeIdMap.set(p, `node${idCounter++}`);
  }

  // ---------- 3. Simple layout (left‑to‑right tree) ----------
  const layers = new Map<number, string[]>();
  for (const [p, lvl] of visited.entries()) {
    if (!layers.has(lvl)) layers.set(lvl, []);
    layers.get(lvl)!.push(p);
  }
  const nodes: any[] = [];
  for (const [lvl, paths] of layers.entries()) {
    const yStart = -((paths.length - 1) * spacingY) / 2;
    
    // Read file contents asynchronously to build text nodes
    const fileContents = await Promise.all(paths.map(async (p) => {
      const file = app.vault.getAbstractFileByPath(p);
      if (file instanceof TFile) {
        let content = await app.vault.read(file);
        // Strip frontmatter
        content = content.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
        // Return a clean text node content with a link to the original file
        return `**[[${file.basename}]]**\n\n${content}`;
      }
      return `[[${p}]]`;
    }));

    paths.forEach((p, idx) => {
      const x = direction === 'lr' ? lvl * spacingX : direction === 'rl' ? -lvl * spacingX : 0;
      const y = yStart + idx * spacingY;
      nodes.push({
        id: nodeIdMap.get(p),
        type: 'text',
        text: fileContents[idx],
        x,
        y,
        width: nodeWidth,
        height: nodeHeight,
      });
    });
  }

  // ---------- 4. Canvas edges ----------
  const canvasEdges = validEdges
    .filter((e) => nodeIdMap.has(e.from) && nodeIdMap.has(e.to))
    .map((e, idx) => ({
      id: `edge${idx + 1}`,
      fromNode: nodeIdMap.get(e.from)!,
      toNode: nodeIdMap.get(e.to)!,
      fromSide: direction === 'lr' ? 'right' : direction === 'rl' ? 'left' : 'bottom',
      toSide: direction === 'lr' ? 'left' : direction === 'rl' ? 'right' : 'top',
    }));

  // ---------- 5. Build canvas JSON ----------
  const canvasData = {
    type: 'canvas',
    nodes,
    edges: canvasEdges,
  };

  // ---------- 6. Write file ----------
  const startFolder = startPath.substring(0, startPath.lastIndexOf('/'));
  const outFolder = outputFolder || startFolder;
  await ensureVaultFolder(app, outFolder);
  const baseName = filename ?? startPath.replace(/\.md$/i, '');
  const canvasFileName = `${baseName} Mind Map.canvas`;
  const content = JSON.stringify(canvasData, null, 2);
  const canvasFile = await createVaultFile(app, outFolder, canvasFileName, content);

  // Open the canvas automatically
  await app.workspace.getLeaf(false).openFile(canvasFile);
  return canvasFile;
}
