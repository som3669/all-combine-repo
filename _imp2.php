<?php
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use Illuminate\Support\Facades\DB;

// reset: drop all existing tables (partial import)
$pdo = DB::connection()->getPdo();
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');
foreach (DB::select('SHOW TABLES') as $t) {
    $name = array_values((array) $t)[0];
    $pdo->exec("DROP TABLE IF EXISTS `$name`");
}
$pdo->exec('SET FOREIGN_KEY_CHECKS=1');
echo "reset done, tables now=" . count(DB::select('SHOW TABLES')) . "\n";

// import fixed dump
$sql = file_get_contents(__DIR__ . '/import_pdo2.sql');
try {
    $pdo->exec($sql);
    echo "IMPORT OK\n";
    echo "tables=" . count(DB::select('SHOW TABLES')) . "\n";
    echo "customer_products=" . DB::table('customer_products')->count() . "\n";
    echo "business_settings=" . DB::table('business_settings')->count() . "\n";
    echo "users=" . DB::table('users')->count() . "\n";
} catch (\Throwable $e) {
    echo "ERR: " . $e->getMessage() . "\n";
}
