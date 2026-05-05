import { cadaide } from "@cadaide/plugin";
import { TypeScriptPackageManager } from "./pm/TypeScriptPackageManager";

cadaide.events.on("frontend.initialized", async () => {
  cadaide.packageManager.provide(TypeScriptPackageManager);
});
