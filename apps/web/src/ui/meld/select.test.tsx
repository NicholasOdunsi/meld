// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MeldSelect } from "./select";

afterEach(cleanup);

const ROLES = [
  { value: "engineer", label: "Engineer" },
  { value: "stakeholder", label: "Stakeholder" },
];

it("associates the label with the select", () => {
  render(<MeldSelect label="Role" options={ROLES} value="" onChange={() => {}} />);

  expect(screen.getByLabelText("Role")).toBeInTheDocument();
});

it("keeps the label for assistive tech when hidden", () => {
  render(
    <MeldSelect label="Role" hideLabel options={ROLES} value="" onChange={() => {}} />,
  );

  // Hidden visually, still the accessible name -- an onboarding row has no
  // room for visible labels but must stay navigable.
  expect(screen.getByLabelText("Role")).toBeInTheDocument();
});

it("renders the placeholder as the empty option", () => {
  render(
    <MeldSelect
      label="Role"
      placeholder="Role"
      options={ROLES}
      value=""
      onChange={() => {}}
    />,
  );

  const select = screen.getByLabelText("Role");
  expect(select).toHaveAttribute("data-empty", "true");
  expect(screen.getByRole("option", { name: "Role" })).toHaveValue("");
});

it("drops the empty marker once a value is chosen", () => {
  render(
    <MeldSelect label="Role" options={ROLES} value="engineer" onChange={() => {}} />,
  );

  expect(screen.getByLabelText("Role")).not.toHaveAttribute("data-empty");
});

it("reports the chosen value", async () => {
  const onChange = vi.fn();
  render(
    <MeldSelect label="Role" options={ROLES} value="" onChange={onChange} />,
  );

  await userEvent.selectOptions(screen.getByLabelText("Role"), "stakeholder");

  expect(onChange).toHaveBeenCalledOnce();
});

it("marks itself invalid and describes the error", () => {
  render(
    <MeldSelect
      label="Role"
      options={ROLES}
      value=""
      onChange={() => {}}
      errorMessage="Pick a role."
    />,
  );

  const select = screen.getByLabelText("Role");
  expect(select).toHaveAttribute("aria-invalid", "true");
  expect(select).toHaveAccessibleDescription("Pick a role.");
});

it("renders every option", () => {
  render(<MeldSelect label="Role" options={ROLES} value="" onChange={() => {}} />);

  expect(screen.getAllByRole("option")).toHaveLength(ROLES.length);
});
