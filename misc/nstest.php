<?php
namespace Foo\Bar;
function go() {
    try {
        throw new \Exception('boom from global Exception');
    } catch ( Exception $e ) {   // resolves to Foo\Bar\Exception (nonexistent)
        echo "CAUGHT locally: " . $e->getMessage() . PHP_EOL;
        return 'caught';
    }
}
try {
    $r = go();
    echo "returned: $r" . PHP_EOL;
} catch ( \Throwable $t ) {
    echo "PROPAGATED to caller: " . $t->getMessage() . PHP_EOL;
}
