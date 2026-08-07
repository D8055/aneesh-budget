import { colorForCategory } from '../lib/categoryColors'

/** Small rounded square with the category's initial, in its pastel color. */
export default function CategoryChip({ category, size = 36 }: { category: string; size?: number }) {
  const colors = colorForCategory(category)
  return (
    <div
      className="cat-chip"
      style={{ background: colors.bg, color: colors.ink, width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {category.slice(0, 1)}
    </div>
  )
}
