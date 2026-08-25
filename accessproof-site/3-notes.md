# AccessProof site pages

Two WordPress pages, as native block markup.

## Import

WordPress admin, **Tools -> Import -> WordPress**, upload `accessproof-import.xml`,
assign the posts to yourself, import.

It creates two published pages: **AccessProof** at `/accessproof/` and
**AccessProof Pro** as its child at `/accessproof/pro/`, which are the URLs the two
pages already use to link to each other.

Then, and this catches everyone: **Settings -> Permalinks -> Save Changes**.
Imported pages 404 until the rewrite rules are flushed, and nothing tells you that
is why.

Prefer pasting? `1-accessproof-free-page.html` and `2-accessproof-pro-page.html`
hold the same block markup. Editor -> options menu -> Code editor -> paste ->
switch back.

## Real blocks, not an HTML box

Every element is a core block, so it is editable in the editor rather than being one
opaque rectangle:

```
free page   102 blocks   group 13  heading 12  paragraph 28  columns 5
                         column 11  list 3  list-item 16  image 3
                         table 1  details 4  buttons 2  button 4
pro page     85 blocks   group 9   heading 11  paragraph 26  columns 1
                         column 2  list 3  list-item 17  table 1
                         details 5  buttons 4  button 6
```

`core/html` blocks: **zero**.

Verified by importing into a real WordPress 7.0 and opening both pages in the block
editor: 105 and 85 blocks mounted, **no "unexpected or invalid content" warnings**,
no console errors.

## Two things to do after importing

**Upload the screenshots.** The image blocks point at
`/wp-content/uploads/accessproof-screenshot-1.png` and siblings. Upload the five
PNGs from `src/` with those names, or click each image and use Replace. The alt text
is already written.

**Hide the page title, or drop the h1.** Each page opens with its own `h1` in the
first band, the way `/unishop6/` does. If your template also prints the page title
you get two `h1`s: either hide the title (as that page does) or delete the heading
block from the first band.

Use a full-width page template so the tinted bands run edge to edge.

## Still to fill in

Three `TODO` markers in the Pro page: the single-store price, the agency price, and
the refund line. For reference, the nearest comparable plugin charges $190 a year
for one site, $750 for five, $2,250 for twenty-five.

## Editing

```
node build-pages.js
```

Content is in `src/pages.js`; the block helpers and every colour and font value are
in `src/blocks.js`; `src/wxr.js` writes the importer file. Nothing is written twice —
one source produces both the paste files and the XML.

The palette and type were read off `https://rcube.thulo.eu.org/unishop6/` rather
than invented: tint `#edfbe2`, ink `rgb(47,59,64)`, headings `#16232a`, green
eyebrows `#377a00`, dark `#0f172a` uppercase buttons at 4px, IBM Plex Serif over
Inter. Your theme already loads both faces.

### If you edit the markup by hand

The editor validates saved block markup against what each block's own `save()`
would produce, and rejects anything different as invalid content. Two things caused
that here and are worth not reintroducing:

- **Quotes inside a style attribute.** `font-family:"IBM Plex Serif"` ends the
  attribute early. It has to be `&quot;IBM Plex Serif&quot;`.
- **Shorthand where core writes longhand.** A button needs
  `padding-top/right/bottom/left` separately, and the `has-custom-font-size` class
  whenever a font size is set.

## Claims worth keeping accurate

Every number in the copy was measured, not estimated, and each will drift:

| Claim | Source |
| --- | --- |
| 5 colour changes cleared 55 failing elements | a real store scan |
| 8 of 17 findings were third-party code | the same store |
| an overlay left 13 contrast failures and a focus trap | measured with accessiBe active and its script loaded |
| the FTC fined an overlay vendor $1,000,000, January 2025 | public record |
| the EAA has applied since 28 June 2025 | the Act |
| automated testing reaches about a third of WCAG | industry figure, and what the plugin itself says |

Re-scan and the numbers change; change them here too. The copy is persuasive
because the numbers are real, and that only holds while they are.
