<?php
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\BusinessSetting;

$n = 0;
foreach (BusinessSetting::all() as $s) {
    if ($s->value && (strpos($s->value, 'Analogue') !== false || strpos($s->value, 'analoguemall.com') !== false)) {
        $v = str_replace(['Analogue', 'analoguemall.com'], ['Klippet', 'klippet.com'], $s->value);
        if ($v !== $s->value) { $s->value = $v; $s->save(); $n++; }
    }
}
echo "DB settings updated: $n\n";
