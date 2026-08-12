type MarkdownNode = {
  type: string
  depth?: number
}

type MarkdownRoot = {
  children: MarkdownNode[]
}

type VFile = {
  path?: string
}

export const remarkRemoveArticleHeader = () => {
  return (tree: MarkdownRoot, file: VFile) => {
    const path = file.path?.replaceAll('\\', '/')
    if (!path?.includes('/content/libraries/')) return

    const headingIndex = tree.children.findIndex(
      (node) => node.type === 'heading' && node.depth === 1,
    )
    if (headingIndex < 0) return

    const removeCount =
      tree.children[headingIndex + 1]?.type === 'blockquote' ? 2 : 1
    tree.children.splice(headingIndex, removeCount)
  }
}
