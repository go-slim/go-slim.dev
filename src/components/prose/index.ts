import A from "./A.astro";
import Abbr from "./Abbr.astro";
import Blockquote from "./Blockquote.astro";
import Code from "./Code.astro";
import Figure from "./Figure.astro";
import H2 from "./H2.astro";
import H3 from "./H3.astro";
import H4 from "./H4.astro";
import H5 from "./H5.astro";
import H6 from "./H6.astro";
import Hr from "./Hr.astro";
import Li from "./Li.astro";
import Ol from "./Ol.astro";
import P from "./P.astro";
import Pre from "./Pre.astro";
import Strong from "./Strong.astro";
import Table from "./Table.astro";
import Td from "./Td.astro";
import Th from "./Th.astro";
import Ul from "./Ul.astro";

/**
 * MDX component mapping for documentation and blog content.
 * Applies Tailwind classes directly on each rendered tag instead of
 * relying on global `.prose-doc` CSS, so styles stay scoped to MDX
 * output and never leak into islands or example renderings.
 */
export const proseComponents = {
  a: A,
  abbr: Abbr,
  blockquote: Blockquote,
  code: Code,
  figure: Figure,
  h2: H2,
  h3: H3,
  h4: H4,
  h5: H5,
  h6: H6,
  hr: Hr,
  li: Li,
  ol: Ol,
  p: P,
  pre: Pre,
  strong: Strong,
  table: Table,
  td: Td,
  th: Th,
  ul: Ul,
};
