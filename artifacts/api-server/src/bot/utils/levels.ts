export const LEVEL_ROLES: { level: number; name: string; color: number }[] = [
  { level: 5,  name: "🌱 Rookie",         color: 0x2ecc71 },
  { level: 10, name: "⭐ Regular",         color: 0x3498db },
  { level: 20, name: "🔥 Active Member",   color: 0xe67e22 },
  { level: 30, name: "💎 Veteran",         color: 0x9b59b6 },
  { level: 50, name: "👑 Legend",          color: 0xf1c40f },
];

export function xpForLevel(level: number): number {
  return 5 * level * level + 50 * level + 100;
}

export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let i = 0; i < level; i++) total += xpForLevel(i);
  return total;
}

export function levelFromXp(xp: number): number {
  let level = 0;
  while (xp >= totalXpForLevel(level + 1)) level++;
  return level;
}

export function xpProgress(xp: number, level: number): { current: number; needed: number } {
  const base = totalXpForLevel(level);
  return { current: xp - base, needed: xpForLevel(level) };
}

export function randomXp(): number {
  return Math.floor(Math.random() * 11) + 15;
}
