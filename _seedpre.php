<?php
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\CustomerProduct;
use Illuminate\Support\Str;

$adminId = 344;
$thumb = '8843';                       // existing upload id (file present)
$cats = [260, 472, 487, 355, 403, 412, 425]; // Samsung, Heater, Smart LED TV, + top4 brand-cats
$names = ['Samsung Galaxy', 'LG Heater', 'Sony LED TV', 'Panasonic', 'Philips', 'Toshiba', 'Haier'];

$created = 0; $i = 0;
foreach ($cats as $cid) {
    for ($k = 0; $k < 5; $k++) {
        $i++;
        $nm = 'Preowned ' . $names[$i % count($names)] . ' ' . $i;
        $p = new CustomerProduct();
        $p->name = $nm;
        $p->slug = Str::slug($nm) . '-' . Str::random(5);
        $p->added_by = 'admin';
        $p->user_id = $adminId;
        $p->category_id = $cid;
        $p->subcategory_id = $cid;
        $p->brand_name = $names[$i % count($names)];
        $p->photos = $thumb;
        $p->thumbnail_img = $thumb;
        $p->conditon = 'used';
        $p->location = 'Kathmandu';
        $p->unit_price = rand(3, 60) * 1000;
        $p->usedmonth = rand(1, 24);
        $p->description = '<p>Preowned demo item.</p>';
        $p->published = 1;
        $p->status = 1;
        $p->assured = 0;
        $p->sold_status = 0;
        $p->view = 0;
        $p->negotiable = 1;
        $p->question_answer = '[]';
        try { $p->save(); $created++; }
        catch (\Throwable $e) { echo "ERR($cid): " . $e->getMessage() . "\n"; break 2; }
    }
}
echo "created=$created\n";
foreach ([260, 472, 487] as $c) {
    echo "cat $c preowned published/unsold = " . CustomerProduct::where('category_id', $c)->where('published', 1)->where('sold_status', 0)->count() . "\n";
}
