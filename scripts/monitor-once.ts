import { runMonitorOnce } from "../lib/monitor";

const result = await runMonitorOnce();
console.log(JSON.stringify(result, null, 2));
