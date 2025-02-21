import { environment } from "@raycast/api";
import { serverManager } from "./server/index";

// Start server when extension loads
export async function onExtensionLoad() {
  if (environment.isDevelopment) {
    console.log("Starting server in development mode...");
  }
  try {
    await serverManager.start();
    console.log("Server started successfully");
  } catch (error) {
    console.error("Failed to start server:", error);
  }
}

// Stop server when extension unloads
export async function onExtensionUnload() {
  if (environment.isDevelopment) {
    console.log("Stopping server...");
  }
  try {
    await serverManager.stop();
    console.log("Server stopped successfully");
  } catch (error) {
    console.error("Failed to stop server:", error);
  }
} 