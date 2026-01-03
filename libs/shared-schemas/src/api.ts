import { z } from "zod";

export const PresignUploadInput = z.object({
  contentType: z.string().min(1),
  fileName: z.string().min(1),
  title: z.string().min(1),
  dimensions: z.string().optional(),
  fileSize: z.number().optional(),
});
export type PresignUploadInput = z.infer<typeof PresignUploadInput>;

export const PresignUploadOutput = z.object({
  uploadUrl: z.string().url(),
  objectKey: z.string().min(1),
  publicUrl: z.string().url(),
  imageId: z.string().min(1),
});
export type PresignUploadOutput = z.infer<typeof PresignUploadOutput>;

export const ConfirmUploadInput = z.object({
  imageId: z.string().min(1),
});
export type ConfirmUploadInput = z.infer<typeof ConfirmUploadInput>;

export const ErrorResponse = z.object({
  error: z.string(),
  details: z.any().optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;
