import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CourierPanel } from "../../src/components/overview/CourierPanel";
import { SocialInboxPanel } from "../../src/components/overview/SocialInboxPanel";
import { RetentionPanel } from "../../src/components/overview/RetentionPanel";
import { StaffPerformancePanel } from "../../src/components/overview/StaffPerformancePanel";

describe("CourierPanel", () => {
  const data = {
    steadfast: { delivered: 180, in_transit: 20, failed: 12, pending: 8 },
    pathao: { delivered: 95, in_transit: 8, failed: 5, pending: 3 },
  };

  it("renders courier names", () => {
    render(<CourierPanel data={data} />);
    expect(screen.getByText("Steadfast")).toBeInTheDocument();
    expect(screen.getByText("Pathao")).toBeInTheDocument();
  });

  it("shows overall delivery success rate", () => {
    render(<CourierPanel data={data} />);
    expect(screen.getByText(/87\.3%/)).toBeInTheDocument();
  });

  it("shows detailed shipment totals and status counts", () => {
    render(<CourierPanel data={data} />);
    expect(screen.getByTestId("courier-total-shipments")).toHaveTextContent("331");
    expect(screen.getByTestId("courier-total-in-transit")).toHaveTextContent("28");
    expect(screen.getByTestId("courier-total-pending")).toHaveTextContent("11");
    expect(screen.getByTestId("courier-total-failed")).toHaveTextContent("17");
    expect(screen.getByTestId("courier-steadfast-details")).toHaveTextContent("8 pending");
    expect(screen.getByTestId("courier-pathao-details")).toHaveTextContent("3 pending");
  });

  it("shows a delivery pipeline breakdown", () => {
    render(<CourierPanel data={data} />);
    expect(screen.getByText("Delivery pipeline")).toBeInTheDocument();
    expect(screen.getByTestId("courier-pipeline-delivered")).toHaveTextContent("275 shipments");
    expect(screen.getByTestId("courier-pipeline-pending")).toHaveTextContent("11 shipments");
    expect(screen.getByTestId("courier-pipeline-failed")).toHaveTextContent("17 shipments");
  });

  it("fills the shared lower-panel row height", () => {
    render(<CourierPanel data={data} />);
    expect(screen.getByTestId("overview-courier-panel")).toHaveClass("h-full");
    expect(screen.getByTestId("courier-delivery-pipeline")).toHaveClass("mt-auto");
  });
});

describe("SocialInboxPanel", () => {
  const data = {
    unread: 12,
    avgResponseTimeMinutes: 45,
    conversationsToday: 28,
    byChannel: { facebook: 18, instagram: 7, whatsapp: 3 },
  };

  it("renders unread count", () => {
    render(<SocialInboxPanel data={data} />);
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders channel breakdown", () => {
    render(<SocialInboxPanel data={data} />);
    expect(screen.getByText("Facebook")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
  });
});

describe("RetentionPanel", () => {
  const data = {
    repeatRate: 34.2,
    repeatCustomers: 84,
    totalCustomers: 245,
    averageOrdersPerCustomer: 1.4,
    averageCustomerValue: 2450,
    topCustomers: [
      { name: "Ayesha", phone: "01711111111", orderCount: 12, totalSpent: 45200 },
    ],
  };

  it("renders repeat rate", () => {
    render(<RetentionPanel data={data} />);
    expect(screen.getByText("34.2%")).toBeInTheDocument();
  });

  it("renders top customer", () => {
    render(<RetentionPanel data={data} />);
    expect(screen.getByText("Ayesha")).toBeInTheDocument();
  });

  it("renders customer value and frequency metrics", () => {
    render(<RetentionPanel data={data} />);
    expect(screen.getByTestId("retention-average-orders")).toHaveTextContent("1.4");
    expect(screen.getByTestId("retention-average-value")).toHaveTextContent("৳2,450");
  });

  it("fills the shared lower-panel row height", () => {
    render(<RetentionPanel data={data} />);
    expect(screen.getByTestId("overview-retention-panel")).toHaveClass("h-full");
  });
});

describe("StaffPerformancePanel", () => {
  const data = {
    assignedCount: 28,
    confirmedCount: 22,
    confirmedValue: 58200,
    confirmationRate: 22 / 28,
    deliveredRate: 0.75,
    topStaff: [
      {
        userId: "staff-1",
        name: "Ayesha",
        confirmedCount: 12,
        confirmedValue: 34200,
        deliveredRate: 0.8,
      },
    ],
  };

  it("renders summary metrics and top staff", () => {
    render(<StaffPerformancePanel data={data} />);
    expect(screen.getByText("Staff Performance")).toBeInTheDocument();
    expect(screen.getByTestId("overview-staff-confirmed-value")).toHaveTextContent("৳58,200");
    expect(screen.getByTestId("overview-staff-confirmed-orders")).toHaveTextContent("22");
    expect(screen.getByTestId("overview-staff-delivered-rate")).toHaveTextContent("75%");
    expect(screen.getByText("Ayesha")).toBeInTheDocument();
    expect(screen.getByText("৳34,200")).toBeInTheDocument();
  });

  it("shows an empty state without attributed staff activity", () => {
    render(<StaffPerformancePanel data={{ ...data, topStaff: [] }} />);
    expect(screen.getByText("No staff-attributed activity")).toBeInTheDocument();
  });

  it("fills the shared lower-panel row height", () => {
    render(<StaffPerformancePanel data={data} />);
    expect(screen.getByTestId("overview-staff-performance")).toHaveClass("h-full");
    expect(screen.getByTestId("overview-staff-top-section")).toHaveClass("mt-auto");
  });
});
