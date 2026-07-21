<?php
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use Illuminate\Support\Facades\DB;

try { echo "PDO SELECT 1 => " . DB::connection()->getPdo()->query('SELECT 1')->fetchColumn() . "\n"; }
catch (\Throwable $e) { echo "DB ERR: " . $e->getMessage() . "\n"; }

try { echo "business_settings count => " . DB::table('business_settings')->count() . "\n"; }
catch (\Throwable $e) { echo "QUERY ERR: " . $e->getMessage() . "\n"; }

// simulate the home request and surface the exception
try {
    $req = Illuminate\Http\Request::create('/', 'GET', [], [], [], ['HTTP_HOST' => 'hspa.se']);
    $kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);
    $resp = $kernel->handle($req);
    echo "HTTP status => " . $resp->getStatusCode() . "\n";
} catch (\Throwable $e) {
    echo "REQ ERR: " . get_class($e) . ": " . $e->getMessage() . " @ " . $e->getFile() . ":" . $e->getLine() . "\n";
}
