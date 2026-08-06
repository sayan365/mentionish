import console from "node:console";
import { probeLocalConnectors } from "./connectors.js";

const diagnostics = await probeLocalConnectors();
console.log(JSON.stringify({ diagnostics }, null, 2));
