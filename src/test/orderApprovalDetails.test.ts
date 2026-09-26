import { describe, expect, it } from "vitest";
import {
  getMissingOrderApprovalFields,
  getOrderApprovalDetailsError,
} from "../../server/orderApprovalDetails.js";

describe("order approval customer details", () => {
  it("accepts a complete name, phone, and address", () => {
    expect(getMissingOrderApprovalFields({
      customer_name: "Ayesha Rahman",
      phone: "01712345678",
      address: "Dhanmondi, Dhaka",
    })).toEqual([]);
  });

  it("lists missing or whitespace-only customer fields", () => {
    expect(getMissingOrderApprovalFields({
      customer_name: "   ",
      phone: "",
      address: null,
    })).toEqual(["customer name", "phone number", "delivery address"]);
  });

  it("uses contact_name when customer_name is blank", () => {
    expect(getMissingOrderApprovalFields({
      customer_name: " ",
      contact_name: "Ayesha Rahman",
      phone: "01712345678",
      address: "Dhanmondi, Dhaka",
    })).toEqual([]);
  });

  it("treats non-text values as missing customer details", () => {
    expect(getMissingOrderApprovalFields({
      customer_name: 123,
      phone: 1712345678,
      address: { line1: "Dhanmondi" },
    })).toEqual(["customer name", "phone number", "delivery address"]);
  });

  it("builds a validation response listing missing fields", () => {
    expect(getOrderApprovalDetailsError({
      customer_name: " ",
      phone: "01712345678",
      address: "",
    })).toEqual({
      error: "Add the customer name and delivery address before approving this order.",
      code: "approval_customer_details_required",
      missing_fields: ["customer name", "delivery address"],
    });
  });

  it("returns no validation error when all fields are present", () => {
    expect(getOrderApprovalDetailsError({
      customer_name: "Ayesha Rahman",
      phone: "01712345678",
      address: "Dhanmondi, Dhaka",
    })).toBeNull();
  });
});
