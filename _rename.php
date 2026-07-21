<?php
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\BusinessSetting;

$n = 0;
foreach (BusinessSetting::all() as $s) {
    if ($s->value && (stripos($s->value, 'Analogue Mall') !== false || stripos($s->value, 'Analogue mall') !== false)) {
        $s->value = str_ireplace(['Analogue Mall', 'Analogue mall'], 'Klippet', $s->value);
        $s->save();
        $n++;
    }
}
echo "DB settings updated: $n\n";
echo "site_name=" . App\BusinessSetting::where('type', 'site_name')->value('value') . "\n";
