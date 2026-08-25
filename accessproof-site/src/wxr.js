/**
 * Builds a WordPress eXtended RSS file from the composed pages.
 *
 * Imported through Tools -> Import -> WordPress, this creates both pages, their
 * slugs and their parent relationship, so the URLs the pages link to each other
 * with are the URLs they actually get.
 *
 * Page content is Gutenberg block markup, imported as-is. An earlier version
 * wrapped it in a wp:html block; that survived editing but arrived as one opaque
 * HTML box, so nothing on the page could be changed without reading markup.
 *
 * @package AccessProof site
 */

/** WXR wants RFC 2822 for pubDate and MySQL datetime for the wp: fields. */
function stamps( date ) {
	const pad = ( n ) => String( n ).padStart( 2, '0' );
	const mysql = date.getUTCFullYear() + '-' + pad( date.getUTCMonth() + 1 ) + '-' + pad( date.getUTCDate() ) +
		' ' + pad( date.getUTCHours() ) + ':' + pad( date.getUTCMinutes() ) + ':' + pad( date.getUTCSeconds() );

	return { rfc: date.toUTCString(), mysql };
}

/**
 * Escapes text for an XML text node or attribute.
 *
 * @param {string} value Raw text.
 * @returns {string}
 */
function xml( value ) {
	return String( value )
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' )
		.replace( /"/g, '&quot;' );
}

/**
 * Wraps content in CDATA, splitting any sequence that would close it early.
 *
 * A literal ]]> inside the payload ends the section and the rest of the page
 * becomes malformed XML that the importer rejects with a parse error and no useful
 * message. Splitting it across two sections is the standard escape.
 *
 * @param {string} value Raw content.
 * @returns {string}
 */
function cdata( value ) {
	return '<![CDATA[' + String( value ).split( ']]>' ).join( ']]]]><![CDATA[>' ) + ']]>';
}

/**
 * Builds the WXR document.
 *
 * @param {object}  options
 * @param {string}  options.siteUrl  Site the pages are destined for.
 * @param {string}  options.author    Username recorded as the author.
 * @param {object[]} options.pages    id, parent, title, slug, order, html.
 * @returns {string}
 */
function buildWxr( { siteUrl, author, pages } ) {
	const now = stamps( new Date() );

	const items = pages.map( ( page ) => {
		const link = siteUrl.replace( /\/$/, '' ) + '/' + ( page.parentSlug ? page.parentSlug + '/' : '' ) + page.slug + '/';

		return [
			'	<item>',
			'		<title>' + cdata( page.title ) + '</title>',
			'		<link>' + xml( link ) + '</link>',
			'		<pubDate>' + now.rfc + '</pubDate>',
			'		<dc:creator>' + cdata( author ) + '</dc:creator>',
			'		<guid isPermaLink="false">' + xml( link ) + '</guid>',
			'		<description></description>',
			/*
			 * Block markup goes in exactly as built. It used to be wrapped in a
			 * wp:html block, which made the whole page a single uneditable HTML box
			 * in the editor — correct output, useless to work with.
			 */
			'		<content:encoded>' + cdata( page.html ) + '</content:encoded>',
			'		<excerpt:encoded>' + cdata( '' ) + '</excerpt:encoded>',
			'		<wp:post_id>' + page.id + '</wp:post_id>',
			'		<wp:post_date>' + cdata( now.mysql ) + '</wp:post_date>',
			'		<wp:post_date_gmt>' + cdata( now.mysql ) + '</wp:post_date_gmt>',
			'		<wp:comment_status>' + cdata( 'closed' ) + '</wp:comment_status>',
			'		<wp:ping_status>' + cdata( 'closed' ) + '</wp:ping_status>',
			'		<wp:post_name>' + cdata( page.slug ) + '</wp:post_name>',
			'		<wp:status>' + cdata( 'publish' ) + '</wp:status>',
			'		<wp:post_parent>' + ( page.parent || 0 ) + '</wp:post_parent>',
			'		<wp:menu_order>' + ( page.order || 0 ) + '</wp:menu_order>',
			'		<wp:post_type>' + cdata( 'page' ) + '</wp:post_type>',
			'		<wp:post_password>' + cdata( '' ) + '</wp:post_password>',
			'		<wp:is_sticky>0</wp:is_sticky>',
			'	</item>',
		].join( '\n' );
	} );

	return [
		'<?xml version="1.0" encoding="UTF-8" ?>',
		'<!--',
		'\tAccessProof site pages, for the WordPress importer.',
		'',
		'\tWordPress admin -> Tools -> Import -> WordPress -> Run Importer, upload this',
		'\tfile, assign the posts to yourself, and import.',
		'',
		'\tCreates two pages: "AccessProof" and "AccessProof Pro" as its child, so the',
		'\tsecond lives at /accessproof/pro/ and the cross-links between them resolve.',
		'-->',
		'<rss version="2.0"',
		'\txmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"',
		'\txmlns:content="http://purl.org/rss/1.0/modules/content/"',
		'\txmlns:wfw="http://wellformedweb.org/CommentAPI/"',
		'\txmlns:dc="http://purl.org/dc/elements/1.1/"',
		'\txmlns:wp="http://wordpress.org/export/1.2/">',
		'<channel>',
		'	<title>AccessProof</title>',
		'	<link>' + xml( siteUrl ) + '</link>',
		'	<description>Site pages for the AccessProof plugin</description>',
		'	<pubDate>' + now.rfc + '</pubDate>',
		'	<language>en-GB</language>',
		'	<wp:wxr_version>1.2</wp:wxr_version>',
		'	<wp:base_site_url>' + xml( siteUrl ) + '</wp:base_site_url>',
		'	<wp:base_blog_url>' + xml( siteUrl ) + '</wp:base_blog_url>',
		'	<wp:author>',
		'		<wp:author_id>1</wp:author_id>',
		'		<wp:author_login>' + cdata( author ) + '</wp:author_login>',
		'		<wp:author_email>' + cdata( '' ) + '</wp:author_email>',
		'		<wp:author_display_name>' + cdata( author ) + '</wp:author_display_name>',
		'		<wp:author_first_name>' + cdata( '' ) + '</wp:author_first_name>',
		'		<wp:author_last_name>' + cdata( '' ) + '</wp:author_last_name>',
		'	</wp:author>',
		'	<generator>https://rcube.thulo.eu.org/</generator>',
		...items,
		'</channel>',
		'</rss>',
		'',
	].join( '\n' );
}

module.exports = { buildWxr };
