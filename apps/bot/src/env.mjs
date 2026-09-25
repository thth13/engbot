import { loadEnvFile } from "node:process";

// Existing environment variables (including Railway secrets) take priority.
// Load the most specific file first: loadEnvFile preserves existing values.
for (const relativePath of [
  "../.env.local",
  "../.env",
  "../../../.env.local",
  "../../../.env",
]) {
  try {
    loadEnvFile(new URL(relativePath, import.meta.url));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
