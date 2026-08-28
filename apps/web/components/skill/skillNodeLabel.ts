interface SkillNodeNameSource {
  id: number;
  default_name: string;
  tier: number;
}

function romanize(value: number) {
  const numerals: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];

  let remaining = Math.max(0, Math.trunc(value));
  let result = "";
  for (const [amount, glyph] of numerals) {
    while (remaining >= amount) {
      result += glyph;
      remaining -= amount;
    }
  }
  return result;
}

export function buildSkillNodeDepthLabels<T extends SkillNodeNameSource>(nodes: T[]) {
  const labels: Record<number, string> = Object.fromEntries(
    nodes.map((node) => [node.id, node.default_name]),
  );
  const groups = new Map<string, T[]>();

  for (const node of nodes) {
    if (node.tier <= 0) continue;
    const group = groups.get(node.default_name);
    if (group) group.push(node);
    else groups.set(node.default_name, [node]);
  }

  for (const [name, sameNameNodes] of groups) {
    if (sameNameNodes.length <= 1) continue;
    for (const node of sameNameNodes.toSorted((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      return a.id - b.id;
    })) {
      labels[node.id] = `${name} ${romanize(node.tier)}`;
    }
  }

  return labels;
}
