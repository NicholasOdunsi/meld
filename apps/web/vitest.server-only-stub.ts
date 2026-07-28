// Stands in for the `server-only` marker package under vitest.
//
// `server-only` ships an exports map whose only non-throwing entry sits
// behind the "react-server" condition. Next sets that condition at build
// time, so the marker still fails the build if a Client Component imports a
// server-only module -- which is the whole point of it. Vitest resolves with
// ["node", "import"] instead, gets the throwing entry, and cannot reach
// ./empty.js because the exports map does not publish that subpath. So tests
// get this empty module instead.
export {};
