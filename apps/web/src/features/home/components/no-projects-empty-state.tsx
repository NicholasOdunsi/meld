import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

// Home renders StartingPoints only when the Workspace has a Project to file a
// new Room under, and `deleteProject` refuses only *non-empty* Projects -- so
// an admin who deletes the sole empty Project leaves a Home page that is a
// heading plus "You're all caught up", and a rail whose only affordance is the
// admin-only "Create project". A member in that Workspace previously had no
// route forward and no explanation of why.
//
// An empty state rather than a last-Project deletion guard: this also covers
// the Workspaces that already have zero Projects (the same "Admins can delete
// organization products" policy could have emptied them long before this
// branch), which a guard on future deletions cannot reach. And the guard would
// belong in the database -- PostgreSQL is this product's lifecycle authority,
// and a check that lives only in the Server Action is both racy and exactly
// the client-side gating the design forbids.
//
// The copy is deliberately role-neutral: an administrator reads it as the
// instruction, and a member reads it as the explanation of who to ask.
export function NoProjectsEmptyState() {
  return (
    <Section
      variant="transparent"
      padding={0}
      width="100%"
      data-testid="no-projects-empty-state"
    >
      <VStack gap={1} width="100%">
        <Text type="label">No projects yet</Text>
        <Text color="secondary">
          Rooms live inside a project. A workspace administrator can create
          the first one from Projects in the sidebar.
        </Text>
      </VStack>
    </Section>
  );
}
