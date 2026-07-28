type Props = {
  title: string
  intent: string
  items?: string[]
}

export function PagePlaceholder({ title, intent, items }: Props) {
  return (
    <div className="placeholder">
      <h2>{title}</h2>
      <p>{intent}</p>
      {items && items.length > 0 && (
        <ul className="placeholder-list">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
