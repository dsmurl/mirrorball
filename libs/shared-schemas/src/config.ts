import { z } from "zod";

export const AppConfigSchema = z.object({
  userRestriction: z.string().optional().default(""),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export const defaultAppConfig: AppConfig = {
  userRestriction: "",
};
