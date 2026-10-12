import fs from 'node:fs';
import path from 'node:path';
import { assembleWorld, type StaticWorld } from '../../data/static';

let cached: StaticWorld | null = null;
export function loadWorldFromDisk(): StaticWorld {
  if (cached) return cached;
  const dir = path.resolve(__dirname, '../../../public/data');
  const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  cached = assembleWorld({
    world: read('world.json'), topo: read('regions.topo.json'), borders: read('borders.json'), seaRoutes: read('searoutes.json'),
    roads: read('roads.json'), rails: read('rails.json'), ocean: read('ocean.json'),
  });
  return cached;
}
