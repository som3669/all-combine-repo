/**
 * Builds a standalone preview of the block pages.
 *
 * Block markup is HTML with comments around it, so stripping the comments leaves
 * something a browser can render. What it does not leave is WordPress's block
 * stylesheet, which is what makes columns sit side by side and a striped table
 * stripe — so a small shim supplies only those structural rules. Colours, spacing
 * and type all come from the block attributes themselves, exactly as they will on
 * the site.
 *
 * This is a preview, not a deliverable. The pages that get imported carry no CSS
 * of their own.
 *
 * @package AccessProof site
 */

/** The parts of core's block stylesheet these pages actually rely on. */
const SHIM = `
	body { margin: 0; background: #ffffff; }

	.wp-block-group.alignfull { width: 100%; }

	/* A constrained group centres its children at the content width. Core does this
	   with a :where() rule generated from the layout attribute. */
	.wp-block-group > * { max-width: 68rem; margin-inline: auto; }
	.wp-block-group > .wp-block-group { max-width: none; }

	.wp-block-columns { display: flex; flex-wrap: wrap; gap: 2rem 3rem; align-items: center; }
	.wp-block-column { flex-grow: 1; flex-basis: 0; min-width: 18rem; }
	.wp-block-column > * + * { margin-top: 0.9rem; }

	.wp-block-buttons { display: flex; flex-wrap: wrap; gap: 0.75rem; }
	.wp-block-button__link { display: inline-block; text-decoration: none; }

	.wp-block-image img { display: block; width: 100%; height: auto; }
	.wp-block-image { margin: 0; }

	.wp-block-table { margin: 0; overflow-x: auto; }
	.wp-block-table table { width: 100%; border-collapse: collapse; }
	.wp-block-table th, .wp-block-table td { padding: 0.8rem 1rem; text-align: left; vertical-align: top; border-bottom: 1px solid #e6eef0; }
	.wp-block-table th[scope="row"] { width: 15rem; font-weight: 650; }
	.wp-block-table.is-style-stripes tbody tr:nth-child(odd) { background: rgba(15, 23, 42, .035); }
	.wp-block-table figcaption, .wp-element-caption { margin-top: 0.6rem; font-size: 0.9rem; color: #55646b; }

	.wp-block-details { border: 1px solid #e6eef0; border-radius: 4px; background: #fff; padding: 0.35rem 0; }
	.wp-block-details + .wp-block-details { margin-top: 0.5rem; }
	.wp-block-details summary { padding: 0.75rem 1.1rem; font-weight: 650; cursor: pointer; }
	.wp-block-details p { padding: 0 1.1rem 0.9rem; }

	.wp-block-list { padding-left: 1.2rem; }
	.wp-block-list li + li { margin-top: 0.55rem; }

	/* Sibling spacing inside a band. Core emits this from the blockGap attribute. */
	.wp-block-group.alignfull > * + * { margin-top: 1.15rem; }

	/* Stand-in for the two faces the live theme loads. */
	body { font-family: Inter, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
`;

/**
 * Turns block markup into a renderable page.
 *
 * @param {object} pages free and pro block markup.
 * @param {Function} shot Given a screenshot number, a data URI for the preview.
 * @param {Function} liveShot The URL used in the real pages, to swap out.
 * @returns {string}
 */
function buildPreview( pages, shot, liveShot ) {
	const render = ( markup ) => {
		let html = markup.replace( /<!-- \/?wp:[\s\S]*?-->/g, '' );

		// Point the images at inlined copies so the preview is one openable file.
		for ( let n = 1; n <= 5; n++ ) {
			html = html.split( liveShot( n ) ).join( shot( n ) );
		}

		return html;
	};

	return [
		'<title>AccessProof Site Pages</title>',
		'<style>' + SHIM + '</style>',
		'',
		'<!-- Rendered from the block markup that goes into WordPress, with a shim for',
		'     the parts of core\'s block stylesheet these pages depend on. -->',
		render( pages.free ),
		render( pages.pro ),
		'',
	].join( '\n' );
}

module.exports = { buildPreview };
