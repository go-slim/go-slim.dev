import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

const locales = ['en-US', 'zh-Hans'] as const
const localizedText = z.union([
  z.string(),
  z.partialRecord(z.enum(locales), z.string()),
])
const abbreviations = z.record(z.string(), z.string())
const localizedAbbreviations = z.partialRecord(
  z.enum(locales),
  abbreviations,
)
const llms = z.object({
  repository: z.string(),
  ref: z.string().default('main'),
  files: z.array(z.enum(['llms.txt', 'llms-full.txt'])).min(1),
  skillDescription: z.string().optional(),
})

const libraryMetadata = defineCollection({
  loader: glob({
    base: './content/libraries',
    pattern: '**/_meta.{yml,yaml,json}',
  }),
  schema: z.object({
    title: localizedText.optional(),
    description: localizedText.optional(),
    status: z
      .enum(['design', 'experimental', 'stable', 'deprecated'])
      .optional(),
    icon: z.string().optional(),
    sidebarIcons: z.record(z.string(), z.string()).default({}),
    llms: llms.optional(),
    abbr: localizedAbbreviations.default({}),
    showInNavigation: z.boolean().default(true),
  }),
})

const libraries = defineCollection({
  loader: glob({ base: './content/libraries', pattern: '**/*.mdx' }),
  schema: z.object({
    title: z.string(),
    sidebarTitle: z.string().optional(),
    description: z.string().default(''),
    icon: z.string().optional(),
    abbr: abbreviations.default({}),
  }),
})

const blog = defineCollection({
  loader: glob({ base: './content/blog', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    description: z.string().default(''),
    publishedAt: z.union([z.string(), z.date()]).transform((value) =>
      value instanceof Date ? value.toISOString().slice(0, 10) : value
    ),
    updatedAt: z
      .union([z.string(), z.date()])
      .transform((value) =>
        value instanceof Date ? value.toISOString().slice(0, 10) : value
      )
      .optional(),
    author: z.string().default('go-slim'),
    tags: z.array(z.string()).default([]),
    image: z.string().optional(),
    draft: z.boolean().default(false),
    abbr: abbreviations.default({}),
  }),
})

export const collections = { libraryMetadata, libraries, blog }
