import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CourierPanel } from "../../src/components/overview/CourierPanel";
import { SocialInboxPanel } from "../../src/components/overview/SocialInboxPanel";
import { RetentionPanel } from "../../src/components/overview/RetentionPanel";

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
});
