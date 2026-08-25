<?php
/**
 * Plugin Name:       AccessProof page images
 * Description:       Puts the five screenshots the AccessProof pages reference into the media library, once. Delete this plugin afterwards.
 * Version:           1.0.0
 * Requires at least: 6.4
 * Requires PHP:      7.4
 * Author:            Rcube
 * License:           GPL-2.0-or-later
 *
 * The WordPress importer can only bring in media it is able to download, and these
 * screenshots have no public URL to download from — which is why importing the pages
 * left five broken images.
 *
 * Rather than asking someone to upload five files and paste five URLs, this carries
 * the images and registers them where the pages already point.
 *
 * The files land in the uploads root rather than the usual year/month folder,
 * because the pages reference /wp-content/uploads/accessproof-screenshot-1.png and
 * a month folder would change that URL for every site depending on when it ran.
 *
 * @package AccessProof
 */

namespace AccessProof\Page_Images;

defined( 'ABSPATH' ) || exit;

const SLUGS  = array( 1, 2, 3, 4, 5 );
const PREFIX = 'accessproof-screenshot-';
const DONE   = 'accessproof_page_images_done';

/**
 * Descriptions, so the media library entries are not five untitled files.
 *
 * Alt text is already written into the pages themselves; this is the library-side
 * title and caption.
 *
 * @return array<int,string>
 */
function titles() {
	return array(
		1 => 'AccessProof dashboard after a scan',
		2 => 'Colour changes that fix the most failing elements',
		3 => 'Findings grouped by page and origin',
		4 => 'A finding expanded, with the fix and the measured colours',
		5 => 'The How to use screen',
	);
}

/**
 * Copies the images in and registers them as attachments.
 *
 * @return array{added:int,existing:int,failed:array<int,string>}
 */
function install() {
	require_once ABSPATH . 'wp-admin/includes/image.php';

	$uploads = wp_upload_dir();
	$titles  = titles();

	$added    = 0;
	$existing = 0;
	$failed   = array();

	foreach ( SLUGS as $n ) {
		$name   = PREFIX . $n . '.png';
		$source = __DIR__ . '/images/' . $name;
		$target = trailingslashit( $uploads['basedir'] ) . $name;
		$url    = trailingslashit( $uploads['baseurl'] ) . $name;

		if ( ! file_exists( $source ) ) {
			$failed[ $n ] = 'missing from the plugin';
			continue;
		}

		// Already registered: leave it alone rather than making a second copy.
		$known = attachment_url_to_postid( $url );

		if ( $known ) {
			++$existing;
			continue;
		}

		if ( ! copy( $source, $target ) ) {
			$failed[ $n ] = 'could not write to the uploads folder';
			continue;
		}

		$id = wp_insert_attachment(
			array(
				'guid'           => $url,
				'post_mime_type' => 'image/png',
				'post_title'     => isset( $titles[ $n ] ) ? $titles[ $n ] : $name,
				'post_content'   => '',
				'post_status'    => 'inherit',
			),
			$target
		);

		if ( is_wp_error( $id ) || ! $id ) {
			$failed[ $n ] = 'attachment could not be created';
			continue;
		}

		wp_update_attachment_metadata( $id, wp_generate_attachment_metadata( $id, $target ) );

		/*
		 * The pages carry their own alt text on each image block, but a screen reader
		 * user meeting the file in the library should get something too.
		 */
		update_post_meta( $id, '_wp_attachment_image_alt', isset( $titles[ $n ] ) ? $titles[ $n ] : '' );

		++$added;
	}

	update_option( DONE, array( 'added' => $added, 'existing' => $existing, 'failed' => $failed ), false );

	return array( 'added' => $added, 'existing' => $existing, 'failed' => $failed );
}

register_activation_hook( __FILE__, __NAMESPACE__ . '\\install' );

/**
 * Reports what happened, once, on the next admin screen.
 *
 * @return void
 */
function notice() {
	$result = get_option( DONE );

	if ( ! is_array( $result ) ) {
		return;
	}

	delete_option( DONE );

	$uploads = wp_upload_dir();

	$message = sprintf(
		/* translators: 1: images added, 2: images already present. */
		_n(
			'%1$d screenshot added to your media library (%2$d were already there).',
			'%1$d screenshots added to your media library (%2$d were already there).',
			(int) $result['added'],
			'default'
		),
		(int) $result['added'],
		(int) $result['existing']
	);

	$message .= ' ' . sprintf(
		/* translators: %s: uploads URL. */
		__( 'The AccessProof pages point at %s and should now show their images. You can delete this plugin.', 'default' ),
		'<code>' . esc_html( trailingslashit( $uploads['baseurl'] ) . PREFIX . 'N.png' ) . '</code>'
	);

	printf(
		'<div class="notice notice-%s is-dismissible"><p>%s</p></div>',
		empty( $result['failed'] ) ? 'success' : 'warning',
		wp_kses_post( $message )
	);

	foreach ( (array) $result['failed'] as $n => $why ) {
		printf(
			'<div class="notice notice-error"><p>%s</p></div>',
			esc_html( sprintf( 'Screenshot %d was not added: %s', $n, $why ) )
		);
	}
}

add_action( 'admin_notices', __NAMESPACE__ . '\\notice' );
