// Product display no longer invokes AI. Keep the old regression entrypoint
// running the replacement behavior rather than asserting obsolete AI writes.
require('./test-display-direct.cjs');
