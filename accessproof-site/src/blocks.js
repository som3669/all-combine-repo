/**
 * Emits Gutenberg block markup rather than a Custom HTML blob.
 *
 * The first version wrapped the whole page in one wp:html block. It rendered
 * correctly and was useless to edit: the block editor showed a single opaque
 * rectangle, so changing a price meant reading HTML. Everything below is a real
 * core block, so each heading, paragraph, column, image and table is selectable
 * and editable in the editor.
 *
 * Styling therefore moves out of a stylesheet and into block attributes. That is
 * the trade: a group's background and padding, a heading's font family, a button's
 * radius all have to be expressed as attributes, which is more verbose here but
 * means the page needs no custom CSS at all and survives being edited.
 *
 * Values are read off the existing pattern at rcube.thulo.eu.org/unishop6/ —
 * tint #edfbe2, ink rgb(47,59,64) with #16232a headings, green #377a00 eyebrows,
 * dark #0f172a uppercase buttons at 4px radius, IBM Plex Serif over Inter.
 *
 * @package AccessProof site
 */

const T = {
	tint: '#edfbe2',
	paper: '#ffffff',
	dark: '#0f172a',
	ink: '#2f3b40',
	inkStrong: '#16232a',
	muted: '#55646b',
	green: '#377a00',
	greenDeep: '#2b5f00',
	greenLight: '#9ede6a',
	fail: '#a8410a',
	serif: '"IBM Plex Serif", "Iowan Old Style", Palatino, Georgia, serif',
	sans: 'Inter, Figtree, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
	mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
	content: '68rem',
};

/** Serialises block attributes, omitting the braces when there are none. */
function attrs( object ) {
	const json = JSON.stringify( object );
	return '{}' === json ? '' : ' ' + json;
}

/**
 * Escapes a value going into an HTML attribute.
 *
 * The font stacks contain double quotes — font-family:"IBM Plex Serif" — and
 * writing those raw into a double-quoted style attribute ends the attribute early
 * and produces broken markup. It also made the editor reject every heading as
 * invalid content, which is how it was found.
 *
 * @param {string} value Raw attribute value.
 * @returns {string}
 */
function esc( value ) {
	return String( value ).replace( /&/g, '&amp;' ).replace( /"/g, '&quot;' );
}

/**
 * A full-width band with a background colour, the page's basic unit.
 *
 * @param {string} background Band colour.
 * @param {string[]} inner    Block markup for the contents.
 * @param {object}  [options] extra: dark inverts the text colour.
 * @returns {string}
 */
function band( background, inner, options = {} ) {
	const a = {
		align: 'full',
		style: {
			color: { background },
			spacing: {
				padding: { top: '4.5rem', bottom: '4.5rem', left: '1.5rem', right: '1.5rem' },
				blockGap: '1.15rem',
			},
		},
		layout: { type: 'constrained', contentSize: T.content },
	};

	if ( options.text ) {
		a.style.color.text = options.text;
	}

	const classes = 'wp-block-group alignfull has-background' + ( options.text ? ' has-text-color' : '' );
	const style = 'background-color:' + background + ( options.text ? ';color:' + options.text : '' ) +
		';padding-top:4.5rem;padding-right:1.5rem;padding-bottom:4.5rem;padding-left:1.5rem';

	return [
		'<!-- wp:group' + attrs( a ) + ' -->',
		'<div class="' + classes + '" style="' + style + '">',
		...inner,
		'</div>',
		'<!-- /wp:group -->',
	].join( '\n' );
}

/** The green uppercase section label the pattern opens each band with. */
function eyebrow( text, colour = T.green ) {
	const a = {
		style: {
			typography: { fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase', lineHeight: '1.4' },
			color: { text: colour },
		},
	};

	return [
		'<!-- wp:paragraph' + attrs( a ) + ' -->',
		'<p class="has-text-color" style="color:' + colour + ';font-size:0.75rem;font-weight:700;letter-spacing:0.12em;line-height:1.4;text-transform:uppercase">' + text + '</p>',
		'<!-- /wp:paragraph -->',
	].join( '\n' );
}

/**
 * A serif heading.
 *
 * @param {number} level   1 to 3.
 * @param {string} text    Heading text.
 * @param {string} [colour] Override for a dark band.
 * @returns {string}
 */
function heading( level, text, colour = T.inkStrong ) {
	const sizes = { 1: '3rem', 2: '2rem', 3: '1.0625rem' };
	const serif = 3 !== level;

	const a = {
		level,
		style: {
			typography: {
				fontSize: sizes[ level ],
				fontFamily: serif ? T.serif : T.sans,
				fontWeight: serif ? '600' : '650',
				lineHeight: serif ? '1.12' : '1.4',
				letterSpacing: serif ? '-0.02em' : '0',
			},
			color: { text: colour },
		},
	};

	/*
	 * Declaration order follows core's own save output — colour, then typography
	 * alphabetically. The editor compares saved markup against what save() would
	 * produce, so a different order is reported as invalid content.
	 */
	const style = esc(
		'color:' + colour + ';font-family:' + ( serif ? T.serif : T.sans ) +
		';font-size:' + sizes[ level ] + ';font-weight:' + ( serif ? '600' : '650' ) +
		';letter-spacing:' + ( serif ? '-0.02em' : '0' ) + ';line-height:' + ( serif ? '1.12' : '1.4' )
	);

	return [
		'<!-- wp:heading' + attrs( a ) + ' -->',
		'<h' + level + ' class="wp-block-heading has-text-color" style="' + style + '">' + text + '</h' + level + '>',
		'<!-- /wp:heading -->',
	].join( '\n' );
}

/**
 * A paragraph.
 *
 * @param {string} html      Inline content.
 * @param {object} [options] size, colour, lead for the standfirst.
 * @returns {string}
 */
function para( html, options = {} ) {
	const size = options.size || ( options.lead ? '1.125rem' : '1.0625rem' );
	const colour = options.colour || T.ink;

	const a = {
		style: {
			typography: { fontSize: size, lineHeight: '1.62' },
			color: { text: colour },
		},
	};

	return [
		'<!-- wp:paragraph' + attrs( a ) + ' -->',
		'<p class="has-text-color" style="color:' + colour + ';font-size:' + size + ';line-height:1.62">' + html + '</p>',
		'<!-- /wp:paragraph -->',
	].join( '\n' );
}

/**
 * A bullet list, each item allowed inline markup.
 *
 * @param {string[]} items Inline content per item.
 * @returns {string}
 */
function list( items ) {
	const a = { style: { typography: { fontSize: '1.0625rem', lineHeight: '1.62' }, spacing: { blockGap: '0.55rem' } } };

	return [
		'<!-- wp:list' + attrs( a ) + ' -->',
		'<ul class="wp-block-list" style="font-size:1.0625rem;line-height:1.62">',
		...items.map( ( item ) => '<!-- wp:list-item -->\n<li>' + item + '</li>\n<!-- /wp:list-item -->' ),
		'</ul>',
		'<!-- /wp:list -->',
	].join( '\n' );
}

/**
 * An image, as a real image block so it can be swapped in the editor.
 *
 * @param {string} src Image URL.
 * @param {string} alt Alternative text.
 * @returns {string}
 */
function image( src, alt ) {
	const a = { sizeSlug: 'large', style: { border: { radius: '4px' } } };

	return [
		'<!-- wp:image' + attrs( a ) + ' -->',
		'<figure class="wp-block-image size-large has-custom-border">' +
			'<img src="' + src + '" alt="' + alt + '" style="border-radius:4px"/></figure>',
		'<!-- /wp:image -->',
	].join( '\n' );
}

/**
 * Two columns: text beside an image.
 *
 * @param {string[]} left  Blocks for the first column.
 * @param {string[]} right Blocks for the second.
 * @returns {string}
 */
function columns( left, right ) {
	const wrap = ( inner, width ) => [
		'<!-- wp:column' + attrs( { width } ) + ' -->',
		'<div class="wp-block-column" style="flex-basis:' + width + '">',
		...inner,
		'</div>',
		'<!-- /wp:column -->',
	].join( '\n' );

	return [
		'<!-- wp:columns' + attrs( { style: { spacing: { blockGap: { top: '2rem', left: '3rem' } } } } ) + ' -->',
		'<div class="wp-block-columns">',
		wrap( left, '50%' ),
		wrap( right, '50%' ),
		'</div>',
		'<!-- /wp:columns -->',
	].join( '\n' );
}

/**
 * A row of colour swatches, as the pattern uses for a palette.
 *
 * Built from real blocks — a coloured group above two paragraphs — so a colour can
 * be changed in the editor by clicking it.
 *
 * @param {Array<{colour:string,label:string,hex:string}>} items Swatches.
 * @returns {string}
 */
function swatches( items ) {
	const one = ( { colour, label, hex } ) => [
		'<!-- wp:column' + attrs( { width: '33.33%' } ) + ' -->',
		'<div class="wp-block-column" style="flex-basis:33.33%">',
		'<!-- wp:group' + attrs( {
			style: {
				color: { background: colour },
				spacing: { padding: { top: '1.75rem', bottom: '1.75rem' } },
				border: { radius: '3px', width: '1px', color: '#d5e3c8' },
			},
			layout: { type: 'constrained' },
		} ) + ' -->',
		'<div class="wp-block-group has-background has-border-color" style="border-color:#d5e3c8;border-width:1px;border-radius:3px;background-color:' + colour + ';padding-top:1.75rem;padding-bottom:1.75rem"></div>',
		'<!-- /wp:group -->',
		para( '<strong>' + label + '</strong>', { size: '0.85rem' } ),
		para( '<code>' + hex + '</code>', { size: '0.85rem', colour: T.muted } ),
		'</div>',
		'<!-- /wp:column -->',
	].join( '\n' );

	return [
		'<!-- wp:columns' + attrs( { style: { spacing: { blockGap: { top: '1rem', left: '1.5rem' } } } } ) + ' -->',
		'<div class="wp-block-columns">',
		...items.map( one ),
		'</div>',
		'<!-- /wp:columns -->',
	].join( '\n' );
}

/**
 * Buttons.
 *
 * @param {Array<{text:string,url:string,ghost?:boolean,onDark?:boolean}>} items Buttons.
 * @returns {string}
 */
function buttons( items ) {
	/*
	 * Every button is a dark fill with white text, and never an outline or a light
	 * fill with dark text.
	 *
	 * Measured on a live page: the theme sets .wp-block-button__link colour with
	 * !important, which beats the inline style a block attribute produces. Every
	 * button therefore rendered with the theme's near-white text — fine on the dark
	 * fill at 13.38:1, and unreadable at 1.24:1 on the outline one, which is a
	 * button that simply is not there for the reader.
	 *
	 * A dark fill reads correctly whichever colour wins, so the page does not depend
	 * on a theme choosing not to interfere. The secondary button is distinguished by
	 * hue rather than by weight of fill, and the border keeps its edge visible
	 * against the band behind it (WCAG 1.4.11).
	 */
	const one = ( { text, url, ghost, onDark } ) => {
		const bg = ghost
			? ( onDark ? '#3a4a63' : T.greenDeep )
			: ( onDark ? T.greenDeep : T.dark );
		const fg = '#ffffff';

		const edge = onDark ? '#ffffff' : bg;

		const a = {
			style: {
				color: { background: bg, text: fg },
				border: { radius: '4px', width: '1px', color: edge },
				typography: { fontSize: '0.8125rem', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase' },
				spacing: { padding: { top: '0.85rem', bottom: '0.85rem', left: '1.4rem', right: '1.4rem' } },
			},
		};

		/*
		 * Matches core's save output exactly: colour before background, padding as
		 * four longhand declarations rather than the shorthand, and the
		 * has-custom-font-size class that a set font size adds.
		 */
		const style = 'border-color:' + edge + ';border-width:1px;border-radius:4px' +
			';color:' + fg + ';background-color:' + bg +
			';padding-top:0.85rem;padding-right:1.4rem;padding-bottom:0.85rem;padding-left:1.4rem' +
			';font-size:0.8125rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase';

		return [
			'<!-- wp:button' + attrs( a ) + ' -->',
			'<div class="wp-block-button"><a class="wp-block-button__link has-text-color has-background has-border-color has-custom-font-size wp-element-button" href="' + url + '" style="' + esc( style ) + '">' + text + '</a></div>',
			'<!-- /wp:button -->',
		].join( '\n' );
	};

	return [
		'<!-- wp:buttons' + attrs( { style: { spacing: { blockGap: '0.75rem', margin: { top: '0.5rem' } } } } ) + ' -->',
		'<div class="wp-block-buttons" style="margin-top:0.5rem">',
		...items.map( one ),
		'</div>',
		'<!-- /wp:buttons -->',
	].join( '\n' );
}

/**
 * A striped specification table, label beside value.
 *
 * @param {string} caption Table caption.
 * @param {Array<[string,string]>} rows Label and value pairs.
 * @returns {string}
 */
function table( caption, rows ) {
	const body = rows
		.map( ( [ label, value ] ) => '<tr><th scope="row">' + label + '</th><td>' + value + '</td></tr>' )
		.join( '' );

	return [
		'<!-- wp:table' + attrs( { className: 'is-style-stripes', hasFixedLayout: false } ) + ' -->',
		'<figure class="wp-block-table is-style-stripes"><table><tbody>' + body + '</tbody></table>' +
			'<figcaption class="wp-element-caption">' + caption + '</figcaption></figure>',
		'<!-- /wp:table -->',
	].join( '\n' );
}

/**
 * A collapsible question, using the core details block.
 *
 * @param {string} summary Question.
 * @param {string} answer  Answer, inline markup allowed.
 * @returns {string}
 */
function faq( summary, answer ) {
	return [
		'<!-- wp:details' + attrs( { summary } ) + ' -->',
		'<details class="wp-block-details"><summary>' + summary + '</summary>',
		para( answer, { colour: T.muted } ),
		'</details>',
		'<!-- /wp:details -->',
	].join( '\n' );
}

module.exports = { T, band, eyebrow, heading, para, list, image, columns, swatches, buttons, table, faq };
