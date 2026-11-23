import { z } from "zod";
// Zod 4 probes `new Function` to compile fast object parsers. That probe is a
// string-to-code evaluation, which the Content Security Policy forbids. Import
// `z` from here (never from "zod" directly) so the setting is applied before
// any schema is created, in the browser and on the server.
z.config({ jitless: true });
export { z };
