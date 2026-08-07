import { CATEGORY_COLORS } from '../types'

/** Pastel pool for user-created categories; hashed by name so a category keeps its color. */
const CUSTOM_POOL: { bg: string; ink: string }[] = [
  { bg: '#F9CFE4', ink: '#8F2F60' }, // rose
  { bg: '#D4E9BF', ink: '#4E6B24' }, // sage
  { bg: '#FBD8A1', ink: '#7A4E0B' }, // apricot
  { bg: '#C7E3F2', ink: '#2C5E7E' }, // powder blue
  { bg: '#E4D2F4', ink: '#5F3D85' }, // wisteria
  { bg: '#F4E0C9', ink: '#775532' }, // sand
  { bg: '#C9F2DF', ink: '#1F6B4A' }, // seafoam
  { bg: '#F2D3C9', ink: '#7E402D' }, // terracotta mist
]

export function colorForCategory(name: string): { bg: string; ink: string } {
  const fixed = CATEGORY_COLORS[name]
  if (fixed) return fixed
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return CUSTOM_POOL[hash % CUSTOM_POOL.length]
}
