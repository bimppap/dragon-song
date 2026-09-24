/**
 * 기술 설명 자리표시자. 설명을 한 번만 쓰고 depth마다 그 depth의 값으로 채운다
 * (예: "{기술 위력} 피해" → "150% 피해"). 서버(crud.py의 _skill_node_description)와 같은 규칙이라 함께 바꾼다.
 */
const TOKEN_PATTERN = /\{([^{}]+)\}/g;

/** 자리표시자를 값으로 채운다. 모르는 이름은 그대로 둔다. */
export function fillDescription(text: string, values: Record<string, string>): string {
  return text.replace(TOKEN_PATTERN, (token, name: string) => values[name.trim()] ?? token);
}

/** 채울 수 없는(이름을 잘못 쓴) 자리표시자 이름. */
export function unknownDescriptionTokens(text: string, names: readonly string[]): string[] {
  const used = new Set([...text.matchAll(TOKEN_PATTERN)].map((match) => match[1].trim()));
  return [...used].filter((name) => !names.includes(name));
}
