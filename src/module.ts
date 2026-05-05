import { cadaide } from "@cadaide/plugin";

cadaide.events.on("frontend.initialized", async () => {
  cadaide.notifications.warning("Test");
});
