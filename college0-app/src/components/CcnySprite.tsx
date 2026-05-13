type SpriteId =
  | 'ccny-gothic-arch'
  | 'ccny-towers'
  | 'ccny-book'
  | 'ccny-torch'
  | 'ccny-paw'
  | 'ccny-stone-band'

type CcnySpriteProps = {
  id: SpriteId
  className?: string
  title?: string
}

/** References `/ccny-sprites.svg` symbols (CCNY-inspired decorative sprites). */
export function CcnySprite({ id, className = '', title }: CcnySpriteProps) {
  return (
    <svg className={className} role={title ? 'img' : 'presentation'} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <use href={`/ccny-sprites.svg#${id}`} />
    </svg>
  )
}
