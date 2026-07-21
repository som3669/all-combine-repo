<?php
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\Product;
use Illuminate\Support\Str;

$adminId = 344;
$thumb = '8843';                                   // existing upload id (file present)
$cats = [260, 472, 487, 355, 403, 412, 425, 102, 252, 262, 265, 476, 485, 488];
$brands = [213, 254, 255, 256, 138, 147];          // 213 = Samsung
$names = ['Pro', 'Max', 'Ultra', 'Lite', 'Plus', 'Prime', 'Neo', 'Air', 'Edge', 'Go'];

$created = 0; $i = 0;
foreach ($cats as $cid) {
    for ($k = 0; $k < 3; $k++) {
        $i++;
        $brand = $brands[$i % count($brands)];
        $nm = 'Demo Product ' . $names[$i % count($names)] . ' ' . $i;
        $p = new Product();
        $p->name = $nm;
        $p->slug = Str::slug($nm) . '-' . Str::random(5);
        $p->added_by = 'admin';
        $p->user_id = $adminId;
        $p->category_id = $cid;
        $p->brand_id = $brand;
        $p->unit_price = rand(5, 90) * 1000 + 999;
        $p->purchase_price = $p->unit_price - 2000;
        $p->unit = 'pc';
        $p->min_qty = 1;
        $p->current_stock = 25;
        $p->stock_visibility_state = 'quantity';
        $p->published = 1;
        $p->todays_deal = ($i % 2);                // half are Best Deal
        $p->featured = ($i % 3 == 0) ? 1 : 0;
        $p->num_of_sale = rand(0, 50);             // best-selling
        $p->description = '<p>Demo product for homepage sections.</p>';
        $p->thumbnail_img = $thumb;
        $p->photos = $thumb;
        $p->tax = 0; $p->tax_type = 'amount';
        $p->discount = ($i % 4 == 0) ? 10 : 0; $p->discount_type = 'percent';
        $p->colors = '[]';
        $p->choice_options = '[]';
        $p->variations = '[]';
        $p->attributes = '[]';
        $p->shipping_type = 'free';
        $p->shipping_cost = 0;
        $p->digital = 0;
        $p->rating = 0;
        $p->cash_on_delivery = 1;
        $p->meta_title = $nm;
        try { $p->save(); $created++; }
        catch (\Throwable $e) { echo "ERR($cid): " . $e->getMessage() . "\n"; break 2; }
    }
}
echo "created=$created total_products=" . Product::count() . " todays_deal=" . Product::where('todays_deal', 1)->count() . " samsung=" . Product::where('brand_id', 213)->count() . "\n";
