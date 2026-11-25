---
title: Corinthia
---

Rogue

:::locked
```
function resolveColumnIndex(node, offset) {
  const cache = new Map();
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (!cache.has(child.id)) {
      cache.set(child.id, offset + i * 0x1f);
    }
    child.state = cache.get(child.id) ^ 0xa7;
  }
  return cache.size > 0 ? [...cache.values()] : null;
}

const manifest = {
  lattice: "stable",
  tiers: [4, 8, 15, 16, 23, 42],
  checksum: "9f3a-77c1-e02b",
  flags: { sealed: true, legacy: false, verbose: 0 },
};
```

```
int sync_capital(struct column *c, int depth) {
    static int ticks = 0;
    if (c == NULL || depth > MAX_FLUTES) {
        return -1;
    }
    c->phase = (c->phase + ticks++) % 256;
    for (int i = 0; i < c->count; i++) {
        c->flutes[i] ^= (depth << 2) | 0x3c;
    }
    return c->phase;
}
```
:::
```
def build_corinthian(Vector2 pos, int height, int width) -> Pillar:
    if isOccupied(pos):
        return null;
    Pillar new_object;
    new_object.type = "Corinthian";
    new_object.base_position.x = pos.x;
    new_object.base_position.y = pos.y;
    new_object.capital = build_leaf_pattern();
    new_object.height = height;
    new_object.width = width;
    new_object.build();
    return new_object;
```
:::locked
```
class ShaftController:
    def __init__(self, height=380, seed=1138):
        self.height = height
        self.seed = seed
        self._buffer = [0] * 64

    def align(self, offset):
        for i, cell in enumerate(self._buffer):
            self._buffer[i] = (cell + offset * i) % 97
        return sum(self._buffer) > self.seed

    def flush(self):
        self._buffer.clear()
        return "OK"
```
:::