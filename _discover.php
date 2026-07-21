<?php
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

echo "product cols: " . implode(',', Schema::getColumnListing('products')) . "\n\n";

$admin = App\User::where('user_type', 'admin')->first();
echo "admin id=" . ($admin->id ?? 'none') . "\n";

$thumb = App\CustomerProduct::whereNotNull('thumbnail_img')->where('thumbnail_img', '!=', '')->value('thumbnail_img');
echo "sample thumb upload id=" . $thumb . "\n";

$samsung = App\Brand::where('name', 'like', '%Samsung%')->first();
echo "Samsung brand id=" . ($samsung->id ?? 'none') . "\n";

echo "\n-- categories matching heater/tv/led --\n";
foreach (App\Category::where('name', 'like', '%Heater%')->orWhere('name', 'like', '%TV%')->orWhere('name', 'like', '%LED%')->get() as $c) {
    echo "  {$c->id} = {$c->name}\n";
}
echo "\n-- home settings --\n";
foreach (['top4_bar','home_top4_bar','best_selling','top3_bar','home_categories','top10_brands','top10_categories'] as $t) {
    $v = App\BusinessSetting::where('type', $t)->value('value');
    echo "  $t = " . (is_string($v) ? substr($v, 0, 120) : json_encode($v)) . "\n";
}
echo "\n-- all brands (first 15) --\n";
foreach (App\Brand::limit(15)->get() as $b) echo "  {$b->id}={$b->name}\n";
