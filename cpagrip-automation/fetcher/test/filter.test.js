/**
 * Offline check of the filter/rank logic against a feed sample that mixes the
 * field-name variants CPAGrip has been seen to return.
 *
 *   node fetcher/test/filter.test.js
 */

'use strict';

const assert = require('node:assert/strict');
const { normalize, selectOffers, extractOffers, matchesCountry, matchesType } = require('../fetch_offers.js');

const FEED = {
  offers: [
    // Highest EPC, should rank first even though its payout is not the largest.
    { offerid: '1', title: 'Win a $100 Gift Card', payout: '1.10', epc: '0.42', offertype: 'Email/Zip Submit', country: 'US', tracking_link: 'https://t/1' },
    // Largest payout but weaker EPC.
    { offer_id: '2', offer_name: 'Grocery Rebate', amount: '2.40', net_epc: '0.19', offer_type: 'Email Submit', countries: 'US,CA', trackinglink: 'https://t/2' },
    // Below the $0.50 payout floor.
    { offerid: '3', title: 'Penny Zip', payout: '0.25', epc: '0.90', offertype: 'Email/Zip Submit', country: 'US', tracking_link: 'https://t/3' },
    // Wrong country.
    { offerid: '4', title: 'UK Only Draw', payout: '3.00', epc: '0.80', offertype: 'Email/Zip Submit', country: 'GB', tracking_link: 'https://t/4' },
    // Wrong offer type.
    { offerid: '5', title: 'Install This App', payout: '1.80', epc: '0.75', offertype: 'Mobile Install', country: 'US', tracking_link: 'https://t/5' },
    // No EPC reported, so payout stands in as the score.
    { offerid: '6', title: 'Coupon Pack', payout: '0.90', offertype: 'Email/Zip Submit', country: 'US', tracking_link: 'https://t/6' },
    // No tracking link, useless to the landing page.
    { offerid: '7', title: 'Broken Link Offer', payout: '5.00', epc: '9.00', offertype: 'Email/Zip Submit', country: 'US' },
  ],
};

assert.equal(extractOffers(FEED).length, 7);
assert.equal(extractOffers(FEED.offers).length, 7, 'a bare array feed is also accepted');

// Field aliases resolve to one shape.
const two = normalize(FEED.offers[1]);
assert.equal(two.id, '2');
assert.equal(two.title, 'Grocery Rebate');
assert.equal(two.payout, 2.4);
assert.equal(two.epc, 0.19);
assert.equal(two.link, 'https://t/2');

assert.equal(matchesCountry({ country: 'US,CA' }, 'US'), true);
assert.equal(matchesCountry({ country: 'GB' }, 'US'), false);
assert.equal(matchesType({ offer_type: 'Email Submit' }, 'Email/Zip Submit'), true, 'punctuation differences must not exclude an offer');
assert.equal(matchesType({ offer_type: 'Mobile Install' }, 'Email/Zip Submit'), false);

const { filtered, top } = selectOffers(FEED.offers);
const ids = top.map((o) => o.id);
assert.deepEqual(ids, ['1', '2', '6'], 'EPC-rated offers rank first by EPC; unrated offers fall below, sorted by payout');
assert.equal(filtered.length, 3, 'low payout, wrong geo, wrong type, and linkless offers are all dropped');
assert.ok(!ids.includes('7'), 'an offer with no tracking link cannot be shown');

console.log('filter: all assertions passed');
