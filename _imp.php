<?php
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use Illuminate\Support\Facades\DB;

$sql = file_get_contents(__DIR__ . '/import_pdo.sql');
try {
    DB::connection()->getPdo()->exec($sql);
    echo "IMPORT OK\n";
    echo "tables=" . count(DB::select('SHOW TABLES')) . "\n";
    echo "products=" . DB::table('customer_products')->count() . "\n";
    echo "settings=" . DB::table('business_settings')->count() . "\n";
} catch (\Throwable $e) {
    echo "ERR: " . $e->getMessage() . "\n";
}
