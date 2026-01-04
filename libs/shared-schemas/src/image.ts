import { z } from "zod";

export const ImageSchema = z.object({
  imageId: z.string(),
  owner: z.string(),
  title: z.string(),
  originalFileName: z.string(),
  dimensions: z.string().optional(),
  fileSize: z.number().optional(),
  devName: z.string(),
  uploadTime: z.string(),
  s3Key: z.string(),
  publicUrl: z.string().url(),
  status: z.string().optional(),
});

export type Image = z.infer<typeof ImageSchema>;

export const ListImagesQuerySchema = z.object({
  owner: z.string().optional(),
  devName: z.string().optional(),
  prefix: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
  cursor: z.string().optional(),
});

export type ListImagesQuery = z.infer<typeof ListImagesQuerySchema>;
