import type { Room } from './document.js';
export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}
const CHUNK = 32;
export function intersects(a: Area, b: Area): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
/** Index immutable room snapshots; replacing a room naturally invalidates its cache. */
const cache = new WeakMap<Room, TileIndex>();
class TileIndex {
  private cells = new Map<string, Room['tiles'][number]>();
  private chunks = new Map<string, Room['tiles']>();
  constructor(room: Room) {
    for (const tile of room.tiles) {
      this.cells.set(tile.x + ',' + tile.y, tile);
      const key = Math.floor(tile.x / CHUNK) + ',' + Math.floor(tile.y / CHUNK);
      const chunk = this.chunks.get(key) ?? [];
      chunk.push(tile);
      this.chunks.set(key, chunk);
    }
  }
  at(x: number, y: number) {
    return this.cells.get(x + ',' + y);
  }
  query(area: Area): Room['tiles'] {
    if (area.width <= 0 || area.height <= 0) return [];
    const result: Room['tiles'] = [];
    for (
      let y = Math.floor(area.y / CHUNK);
      y <= Math.floor((area.y + area.height - 1e-9) / CHUNK);
      y++
    )
      for (
        let x = Math.floor(area.x / CHUNK);
        x <= Math.floor((area.x + area.width - 1e-9) / CHUNK);
        x++
      )
        for (const tile of this.chunks.get(x + ',' + y) ?? [])
          if (intersects(area, { ...tile, width: 1, height: 1 })) result.push(tile);
    return result;
  }
}
export function roomIndex(room: Room): TileIndex {
  let index = cache.get(room);
  if (!index) {
    index = new TileIndex(room);
    cache.set(room, index);
  }
  return index;
}
