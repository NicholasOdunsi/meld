import { z } from "zod";

export type ProjectSummary = {
  id: string;
  workspaceId: string;
  name: string;
  createdBy: string;
};

export const ProjectNameSchema = z.string().trim().min(1).max(120);

export const WorkspaceProjectReferenceSchema = z.object({
  workspaceId: z.string().uuid(),
});

export const CreateProjectInputSchema =
  WorkspaceProjectReferenceSchema.extend({
    name: ProjectNameSchema,
  });

export const ProjectReferenceSchema =
  WorkspaceProjectReferenceSchema.extend({
    projectId: z.string().uuid(),
  });

export const RenameProjectInputSchema = ProjectReferenceSchema.extend({
  name: ProjectNameSchema,
});

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;
export type ProjectReference = z.infer<typeof ProjectReferenceSchema>;
export type RenameProjectInput = z.infer<typeof RenameProjectInputSchema>;
