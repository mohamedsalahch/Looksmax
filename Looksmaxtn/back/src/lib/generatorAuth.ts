import { getRequiredSecret } from "@/lib/env";

export function getGeneratorAuthHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getRequiredSecret("GENERATOR_API_KEY")}`,
  };
}
