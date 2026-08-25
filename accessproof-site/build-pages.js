/**
 * Builds the AccessProof site pages as Gutenberg block markup.
 *
 *   node build-pages.js
 *
 * The pages were a Custom HTML blob first. That rendered correctly and could not
 * be edited: the block editor showed one opaque rectangle, so changing a price
 * meant reading HTML. Everything is now core blocks — group, heading, paragraph,
 * list, image, columns, table, details, buttons — so each piece is selectable in
 * the editor, and styling lives in block attributes rather than a stylesheet.
 *
 * Outputs:
 *   accessproof-import.xml               Tools -> Import -> WordPress. Both pages,
 *                                        their slugs, and Pro as a child of free.
 *   1-accessproof-free-page.html         Block markup to paste into the editor's
 *   2-accessproof-pro-page.html          code view, if you would rather not import.
 */

const fs = require( 'fs' );
const path = require( 'path' );
const { buildPages } = require( './src/pages.js' );
const { buildWxr } = require( './src/wxr.js' );
const { buildPreview } = require( './src/preview.js' );

const HERE = __dirname;
/*
 * Overridable so the whole thing can be built against a test host and imported
 * there — which is how the image path was verified rather than assumed:
 *
 *   SITE=http://mas.test node build-pages.js
 */
const SITE = process.env.SITE || 'https://rcube.thulo.eu.org';

/*
 * Slugs, and the parent relationship. The importer creates the pages with exactly
 * these, so the URLs the pages use to link to each other are the URLs they get.
 */
const SLUGS = { free: 'accessproof', pro: 'pro' };
const URLS = {
	free: SITE + '/' + SLUGS.free + '/',
	pro: SITE + '/' + SLUGS.free + '/' + SLUGS.pro + '/',
};

/*
 * Screenshots are referenced by URL, not embedded.
 *
 * An image block wants a real src. Base64 in post content cannot be resized,
 * cannot be cached separately, and is not in the media library, so the editor
 * cannot swap it. Placeholders leave five obvious things to replace, and replacing
 * them is two clicks each in the editor.
 */
const SHOT = ( n ) => SITE + '/wp-content/uploads/accessproof-screenshot-' + n + '.png';

/*
 * Deliberately the uploads root, not a year/month folder. WordPress files uploads
 * under /uploads/2026/08/ by default, so a URL written here would be wrong for any
 * site that installed the images in a different month. The helper plugin in helper/
 * writes them to the root so this path is true everywhere.
 */

const pages = buildPages( { shot: SHOT, freeUrl: URLS.free, proUrl: URLS.pro } );

const NOTE = [
	'<!--',
	'\tAccessProof — PAGE-NAME, as WordPress blocks.',
	'',
	'\tPASTE: editor → ⋮ Options → Code editor → paste → switch back. Everything',
	'\tarrives as real, editable blocks rather than one HTML box.',
	'',
	'\tSCREENSHOTS: the image blocks point at',
	'\t' + SHOT( 1 ),
	'\tand siblings. Upload the five PNGs from src/ to the media library with those',
	'\tfile names, or click each image in the editor and use Replace.',
	'',
	'\tTEMPLATE: use a full-width page template so the tinted bands run edge to edge.',
	'',
	'\tGenerated. Edit src/pages.js and run `node build-pages.js`.',
	'-->',
	'',
].join( '\n' );

fs.writeFileSync(
	path.join( HERE, '1-accessproof-free-page.html' ),
	NOTE.replace( 'PAGE-NAME', 'free plugin page' ) + pages.free + '\n'
);

fs.writeFileSync(
	path.join( HERE, '2-accessproof-pro-page.html' ),
	NOTE.replace( 'PAGE-NAME', 'Pro page' ) + pages.pro + '\n'
);

fs.writeFileSync(
	path.join( HERE, 'accessproof-import.xml' ),
	buildWxr( {
		siteUrl: SITE,
		author: 'admin',
		pages: [
			{ id: 4001, title: 'AccessProof', slug: SLUGS.free, order: 0, html: pages.free },
			{ id: 4002, title: 'AccessProof Pro', slug: SLUGS.pro, parent: 4001, parentSlug: SLUGS.free, order: 1, html: pages.pro },
		],
	} )
);

/*
 * A viewable version. The imported pages carry no stylesheet of their own, so this
 * exists only so the design can be looked at before it goes near the site.
 */
const dataUri = ( n ) => 'data:image/png;base64,' +
	fs.readFileSync( path.join( HERE, 'src', 'screenshot-' + n + '.png' ) ).toString( 'base64' );

fs.writeFileSync( path.join( HERE, 'site-preview.html' ), buildPreview( pages, dataUri, SHOT ) );

const counts = ( markup ) => ( markup.match( /<!-- wp:[a-z-]+/g ) || [] ).length;

console.log( '  1-accessproof-free-page.html   ' + counts( pages.free ) + ' blocks' );
console.log( '  2-accessproof-pro-page.html    ' + counts( pages.pro ) + ' blocks' );

for ( const file of [ '1-accessproof-free-page.html', '2-accessproof-pro-page.html', 'accessproof-import.xml', 'site-preview.html' ] ) {
	console.log( '  ' + file.padEnd( 32 ) + Math.round( fs.statSync( path.join( HERE, file ) ).size / 1024 ) + ' KB' );
}
