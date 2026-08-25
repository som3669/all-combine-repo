/**
 * The two pages, as block markup.
 *
 * Content lives here as data passed through the block helpers, so the same words
 * produce the editor markup and the import file without being written twice.
 *
 * @package AccessProof site
 */

const { T, band, eyebrow, heading, para, list, image, columns, swatches, buttons, table, faq } = require( './blocks.js' );

/**
 * Builds both pages.
 *
 * @param {object} options
 * @param {Function} options.shot Given a screenshot number, returns its URL.
 * @param {string} options.freeUrl URL of the free page.
 * @param {string} options.proUrl  URL of the Pro page.
 * @returns {{free:string,pro:string}}
 */
function buildPages( { shot, freeUrl, proUrl } ) {
	const free = [
		band( T.tint, [
			eyebrow( 'WooCommerce accessibility &middot; free plugin' ),
			heading( 1, 'AccessProof' ),
			para( 'Scans a WooCommerce store against WCAG 2.1 AA, names the exact change to make in WooCommerce&rsquo;s own vocabulary, and keeps a dated record you can show. Runs in the administrator&rsquo;s browser; nothing leaves the site.', { lead: true } ),
			buttons( [
				{ text: 'Install free', url: 'https://wordpress.org/plugins/accessproof/' },
				{ text: 'What Pro adds', url: proUrl, ghost: true },
			] ),
		] ),

		band( T.paper, [
			columns(
				[ image( shot( 1 ), 'The AccessProof dashboard showing a score of 67 out of 100, counts of critical and serious failures, and a table of previous scans with their dates and scores.' ) ],
				[
					heading( 2, 'The idea' ),
					para( 'The European Accessibility Act has applied since 28 June 2025, and the standard behind it &mdash; EN 301 549 &mdash; points at WCAG 2.1 Level AA. Two questions can now be put to a shop: is it accessible, and can you show what you did about it.' ),
					para( 'Generic scanners answer neither well. They scan a homepage, report a CSS selector, and treat a checkout like a blog post. AccessProof scans the pages that carry the risk &mdash; with a product in the basket, so the real form markup is tested rather than an empty-cart notice &mdash; and writes every finding as an instruction rather than a rule name.' ),
				]
			),
		] ),

		band( T.tint, [
			eyebrow( 'A finding, in full' ),
			heading( 2, 'The colour to paste, not a principle' ),
			para( '&ldquo;Darken the text or lighten the background&rdquo; names no element, no colour and no target. AccessProof measures both colours, the ratio scored, the ratio required, and the nearest shade that passes.' ),
			swatches( [
				{ colour: '#54830c', label: 'Text', hex: '#54830c' },
				{ colour: '#eef7dd', label: 'Background', hex: '#eef7dd' },
				{ colour: '#4f7b0b', label: 'Change text to', hex: '#4f7b0b' },
			] ),
			para( '<strong>Measured 4.1:1, needs 4.5:1.</strong> After the change: 4.6:1.', { size: '0.95rem' } ),
			para( 'Findings are then grouped by the colour pair behind them, because one colour is reused across a site. On a real store, five colour changes cleared fifty-five failing elements.', { size: '0.95rem', colour: T.muted } ),
		] ),

		band( T.paper, [
			columns(
				[
					heading( 2, 'Which problems are actually yours' ),
					para( 'A scan reports plenty that is not your markup at all: WooCommerce&rsquo;s own block templates, a theme&rsquo;s mini-cart, WordPress core block output. On that same store, <strong>eight of seventeen findings were third-party code</strong>.' ),
					para( 'Every finding carries its origin, and one checkbox narrows the list to work you can actually do. For the rest you get the advice that helps: report it upstream and record it as a known limitation, which is defensible in a way an unexplained failure is not.' ),
				],
				[ image( shot( 3 ), 'Findings grouped by page, each row tagged with who can fix it — yours to fix, WooCommerce, or theme — alongside a filter that hides the ones you cannot change.' ) ]
			),
		] ),

		band( T.tint, [
			eyebrow( 'What is in it' ),
			heading( 2, 'What the free plugin does' ),
			list( [
				'<strong>Risk-ordered scanning</strong> &mdash; home, shop, product, cart, checkout, account and blog, with cart and checkout tested with a product in the basket',
				'<strong>Findings in WooCommerce language</strong> &mdash; the component named, and the filter or setting to change, rather than a CSS selector',
				'<strong>Exact contrast fixes</strong> &mdash; both colours measured, the ratio required, and the nearest passing shade, grouped by colour pair',
				'<strong>Origin labelling</strong> &mdash; yours, your theme, WooCommerce, WordPress core, or an installed overlay, with a filter for what you can fix',
				'<strong>Overlay detection</strong> &mdash; finds accessiBe, UserWay, Ally, EqualWeb and AudioEye, and reports what the widget has and has not changed',
				'<strong>Purchase-path ranking</strong> &mdash; a failure that blocks a sale outranks the same failure on a marketing page',
				'<strong>Dated scan history</strong> &mdash; every scan with its score and severity counts, which is the record an auditor asks for',
				'<strong>A How to use screen</strong> &mdash; what gets scanned, how to read severity, and plainly what automation cannot check',
			] ),
		] ),

		band( T.paper, [
			columns(
				[ image( shot( 4 ), 'An expanded finding for the add-to-cart button showing the fix to make, the WCAG criterion, the measured colours with swatches, and the element HTML.' ) ],
				[
					heading( 2, 'Every finding opens' ),
					para( 'The WooCommerce-specific fix, the criterion it fails, the measured colours, the failing element&rsquo;s own markup, and a link to the technical reference. No working out which button a selector meant.' ),
				]
			),
		] ),

		band( T.tint, [
			eyebrow( 'Not an overlay' ),
			heading( 2, 'Nothing is added for visitors' ),
			columns(
				[
					heading( 3, 'What an overlay does' ),
					list( [
						'Adds a floating button and a script from a third-party server.',
						'Changes the page only for visitors who find that button and switch something on.',
						'Leaves the markup a regulator or auditor tests exactly as it was.',
						'In January 2025 the US Federal Trade Commission fined one vendor <strong>$1,000,000</strong> for claiming otherwise.',
					] ),
				],
				[
					heading( 3, 'What AccessProof does' ),
					list( [
						'Finds the failures in your actual source markup.',
						'Names where to change them, in WooCommerce&rsquo;s own vocabulary.',
						'Adds nothing to the front end &mdash; visitors never load a byte of it.',
						'Detects an installed overlay and reports what it has and has not fixed.',
					] ),
				]
			),
			para( 'Measured on a store with an overlay running and its script loaded: the home page still failed thirteen contrast elements and a focus trap, and one further failure came from the widget itself. Those are attributed to the vendor, because you cannot edit markup a remote script generates.', { size: '0.95rem', colour: T.muted } ),
		] ),

		band( T.paper, [
			eyebrow( 'Specification' ),
			heading( 2, 'Specification' ),
			table( 'AccessProof, free plugin', [
				[ 'Standard tested', 'WCAG 2.1 Level AA, referenced by EN 301 549 and the European Accessibility Act' ],
				[ 'Rule engine', 'axe-core 4.13.0 by Deque Systems, Mozilla Public License 2.0, bundled unmodified' ],
				[ 'Pages scanned', 'Home, shop, product, cart, checkout, account, blog. No page limit.' ],
				[ 'Where it runs', 'The administrator&rsquo;s own browser. No outbound connections, no page content sent anywhere.' ],
				[ 'Front-end footprint', 'None. Nothing is enqueued for visitors.' ],
				[ 'Requires', 'WordPress 6.4 or later, PHP 7.4 or later. WooCommerce optional, but most of the value is there.' ],
				[ 'Coverage honesty', 'Automated testing reaches roughly a third of WCAG. Reading order, keyboard traps and meaningful alt text need a person, and the plugin says so.' ],
				[ 'Licence', 'GPL-2.0-or-later' ],
			] ),
		] ),

		band( T.tint, [
			eyebrow( 'Questions' ),
			heading( 2, 'Asked before installing' ),
			faq( 'Does this make my store legally compliant?', 'No tool can promise that, and you should distrust any that does. It finds the machine-detectable failures, tells you how to fix them, and records what you did.' ),
			faq( 'Does it slow my site down?', 'No. Nothing is added to the front end for visitors. The scan runs only when you click the button, in your own browser.' ),
			faq( 'Where does my scan data go?', 'Your own database. The plugin makes no outbound connections at all, and page content is never sent anywhere.' ),
			faq( 'Does it work without WooCommerce?', 'Yes, but the store-specific checks are skipped and you lose most of the value.' ),
		] ),

		band( T.dark, [
			eyebrow( 'Get started', T.greenLight ),
			heading( 2, 'Scan your store in about a minute', '#ffffff' ),
			para( 'Install it, click Scan my store, read the list. Free, no account, nothing leaving your site.', { colour: '#e8ecf1' } ),
			buttons( [
				{ text: 'Install free', url: 'https://wordpress.org/plugins/accessproof/', onDark: true },
				{ text: 'What Pro adds', url: proUrl, ghost: true, onDark: true },
			] ),
		], { text: '#e8ecf1' } ),
	].join( '\n\n' );

	const pro = [
		band( T.tint, [
			eyebrow( 'Add-on &middot; licence key' ),
			heading( 1, 'AccessProof Pro' ),
			para( 'Free finds the problems. Pro tests the buying process: it submits your checkout empty to see whether the errors are announced, checks a customer can buy using only a keyboard, watches every week, and turns the record into a document you can hand to a client.', { lead: true } ),
			buttons( [
				{ text: 'See pricing', url: '#pricing' },
				{ text: 'Start with the free plugin', url: freeUrl, ghost: true },
			] ),
		] ),

		band( T.paper, [
			eyebrow( 'The idea' ),
			heading( 2, 'Some criteria only exist after a click' ),
			para( 'WCAG 3.3.1 and 3.3.3 describe error messages that must be announced, marked on the failing field, and specific enough to act on. Those states do not exist until a customer submits a form &mdash; so no static scan reaches them, at any price, however many rules it ships.' ),
			para( 'Because the scan drives a real browser, Pro can perform the interaction first and then check the result. That is the difference between testing a shop and scanning a page, and it is the reason this add-on exists.' ),
			para( '<strong>No order is ever created.</strong> The checkout is emptied before submission and the emptiness is then verified; if any required field still holds a value, the check aborts rather than clicking Place Order.', { size: '0.95rem', colour: T.muted } ),
		] ),

		band( T.tint, [
			eyebrow( 'Before you pay' ),
			heading( 2, 'What the free plugin already does' ),
			para( 'So you know exactly what you are buying: every page type scanned with no limit, findings written in WooCommerce terms, exact replacement colours for contrast failures, origin labelling so third-party defects are not blamed on you, overlay detection, and a dated scan history.' ),
			para( 'That is enough to find and fix a store. Pro is for the part after that.' ),
		] ),

		band( T.paper, [
			eyebrow( 'What is in it' ),
			heading( 2, 'What Pro adds' ),
			list( [
				'<strong>Checkout error testing</strong> &mdash; submits the form empty and checks the errors are announced to a screen reader, marked on the failing fields, linked to them, and specific enough to act on',
				'<strong>Keyboard purchase path</strong> &mdash; add to cart, proceed to checkout and place order each reachable and operable with no mouse, with focus visibly obvious',
				'<strong>Add-to-cart feedback</strong> &mdash; whether adding a product from the keyboard tells the customer it worked',
				'<strong>Full-store coverage</strong> &mdash; up to 50 products, categories, pages and posts each, with products sampled across categories rather than by date',
				'<strong>Template grouping</strong> &mdash; the same missing label on 400 product pages is one theme fix, and the report leads with whichever fix repairs the most pages',
				'<strong>Scheduled scans</strong> &mdash; daily, weekly or monthly, with an email when something gets worse',
				'<strong>Scan comparison</strong> &mdash; fixed, newly detected and unchanged since last time, because regressions arrive through updates rather than anything you did',
				'<strong>A dated audit report</strong> &mdash; standard tested, tool versions, priority fixes, findings by page, exclusions with reasons, testing history, signature block; print-optimised for PDF',
				'<strong>An accessibility statement</strong> &mdash; published following the EU model structure, its known-limitations section built from your latest scan so it stays true',
				'<strong>An ignore log</strong> &mdash; record findings you assessed and chose not to act on, with a mandatory reason, printed in the report',
				'<strong>Bulk alt text</strong> &mdash; every image missing alt text in one screen, with the page it is attached to as a hint; nothing written for you',
			] ),
		] ),

		band( T.tint, [
			eyebrow( 'Honesty' ),
			heading( 2, 'What it is not' ),
			para( 'The audit report is a <strong>self-evaluation using automated testing</strong>, and it says so on its own face. That is real evidence of diligence, and it is usually what a client or an insurer wants to see.' ),
			para( 'It is <strong>not</strong> an independent audit and not a conformance certificate. If you need one of those you need a qualified human evaluator, and no plugin at any price changes that. Automated testing reaches about a third of WCAG; Pro reaches more of it than free does, and documents the rest.' ),
		] ),

		band( T.paper, [
			eyebrow( 'Pricing' ),
			heading( 2, 'One store, or twenty-five' ),
			columns(
				[
					heading( 3, 'Single store' ),
					para( '<strong style="font-size:1.9rem">TODO</strong> per year, 1 site' ),
					list( [ 'Everything on this page', 'One year of updates', 'Email support' ] ),
					buttons( [ { text: 'Buy for one store', url: '#buy', ghost: true } ] ),
				],
				[
					heading( 3, 'Agency &mdash; 25 sites' ),
					para( '<strong style="font-size:1.9rem">TODO</strong> per year, 25 sites' ),
					list( [ 'Everything on this page, across 25 client sites', 'A report per client, from each site&rsquo;s own dashboard', 'One year of updates and priority support' ] ),
					buttons( [ { text: 'Buy for 25 sites', url: '#buy' } ] ),
				]
			),
			para( 'Licences move between sites &mdash; deactivate on the old one to free the seat. Your scan history, ignore log and settings stay on your server whether the licence is active or not.', { size: '0.95rem', colour: T.muted } ),
		] ),

		band( T.tint, [
			eyebrow( 'Specification' ),
			heading( 2, 'Specification' ),
			table( 'AccessProof Pro add-on', [
				[ 'Requires', 'The free AccessProof plugin, WordPress 6.4 or later, PHP 7.4 or later' ],
				[ 'Coverage', 'Up to 50 products, categories, pages and posts each, sampled across categories' ],
				[ 'Interaction tests', 'Checkout error handling, keyboard purchase path, add-to-cart announcement' ],
				[ 'Order safety', 'No order can be created; the checkout is verified empty before submission or the check aborts' ],
				[ 'Scheduling', 'Daily, weekly or monthly, with regression email' ],
				[ 'Documents', 'Dated audit report for print or PDF, EU-model accessibility statement, ignore log with reasons' ],
				[ 'Compatibility', 'Checked against an extension API version rather than matching version numbers; pauses with a notice instead of failing' ],
				[ 'On expiry', 'Paid features stop unlocking. Scan history, ignore log and settings are left untouched.' ],
				[ 'Distribution', 'Not on WordPress.org. Licence key, one year of updates.' ],
			] ),
		] ),

		band( T.paper, [
			eyebrow( 'Questions' ),
			heading( 2, 'Asked before buying' ),
			faq( 'What happens when my licence expires?', 'Paid features stop unlocking. Your scan history, ignore log and settings are left completely alone &mdash; that record is your evidence and it stays yours.' ),
			faq( 'Does it replace the free plugin?', 'No, it requires it. The free plugin owns the scanner and the database; Pro extends it through documented hooks.' ),
			faq( 'Will the checkout test create test orders?', 'No. The form is emptied and the emptiness verified before anything is submitted; if a required field still holds a value the check aborts rather than placing an order.' ),
			faq( 'Will it break when the free plugin updates?', 'The two update independently and are checked against an extension API version rather than matching version numbers. If they are ever incompatible, Pro pauses with an admin notice rather than causing a fatal error.' ),
			faq( 'Do you offer refunds?', 'TODO &mdash; 30 days is the norm in this market.' ),
		] ),

		band( T.dark, [
			eyebrow( 'Get started', T.greenLight ),
			heading( 2, 'Start free, add Pro when someone asks for the paperwork', '#ffffff' ),
			para( 'The free plugin finds and fixes. Pro tests the checkout, watches for regressions, and produces the document.', { colour: '#e8ecf1' } ),
			buttons( [
				{ text: 'Buy a licence', url: '#buy', onDark: true },
				{ text: 'Get the free plugin first', url: freeUrl, ghost: true, onDark: true },
			] ),
		], { text: '#e8ecf1' } ),
	].join( '\n\n' );

	return { free, pro };
}

module.exports = { buildPages };
