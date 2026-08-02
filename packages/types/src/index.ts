import { z } from "zod";

export const planCodeSchema = z.enum(["free", "lifetime", "monthly"]);
export const platformCodeSchema = z.enum(["reddit", "hackernews"]);
export const opportunityStatusSchema = z.enum([
  "new",
  "drafted",
  "posted",
  "skipped",
]);

export const userProfileSchema = z.object({
  id: z.string().uuid(),
  plan: planCodeSchema,
  entitlement_status: z.enum(["active", "inactive", "past_due", "refunded"]),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
export type PlanCode = z.infer<typeof planCodeSchema>;
export type PlatformCode = z.infer<typeof platformCodeSchema>;
export type OpportunityStatus = z.infer<typeof opportunityStatusSchema>;

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    request_id: string;
    details: Record<string, unknown>;
  };
}
